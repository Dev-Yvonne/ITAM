from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .forms import AssetForm, AssignmentForm
from .models import Asset, Assignment, Employee, MaintenanceLog


class AssetFormSerialNumberValidationTests(TestCase):
    def setUp(self):
        self.asset = Asset.objects.create(
            name="Engineering Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="SN-12345",
            status=Asset.AssetStatus.AVAILABLE,
        )

    def test_duplicate_serial_number_blocked(self):
        form = AssetForm(
            data={
                "name": "Finance Laptop",
                "type": Asset.AssetType.LAPTOP,
                "serial_number": "SN-12345",
                "status": Asset.AssetStatus.AVAILABLE,
            }
        )

        self.assertFalse(form.is_valid())
        self.assertIn("serial_number", form.errors)
        self.assertIn(
            "An asset with this serial number already exists in the system.",
            form.errors["serial_number"],
        )

    def test_case_insensitive_duplication_blocked(self):
        for serial_number in ["sn-12345", "Sn-12345"]:
            with self.subTest(serial_number=serial_number):
                form = AssetForm(
                    data={
                        "name": "Replacement Laptop",
                        "type": Asset.AssetType.LAPTOP,
                        "serial_number": serial_number,
                        "status": Asset.AssetStatus.AVAILABLE,
                    }
                )

                self.assertFalse(form.is_valid())
                self.assertIn("serial_number", form.errors)
                self.assertIn(
                    "An asset with this serial number already exists in the system.",
                    form.errors["serial_number"],
                )

    def test_asset_update_allows_own_serial_number(self):
        form = AssetForm(
            data={
                "name": "Engineering Laptop - Updated",
                "type": Asset.AssetType.LAPTOP,
                "serial_number": "SN-12345",
                "status": Asset.AssetStatus.AVAILABLE,
            },
            instance=self.asset,
        )

        self.assertTrue(form.is_valid())


class AssignmentStateMachineViewTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(self.user)
        self.asset = Asset.objects.create(
            name="Operations Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="OPS-12345",
            status=Asset.AssetStatus.AVAILABLE,
        )
        self.employee = Employee.objects.create(
            name="Eugene Tester",
            department="IT Operations",
            email="eugene@example.com",
        )

    def test_assignment_form_only_exposes_employee_field(self):
        form = AssignmentForm()

        self.assertEqual(list(form.fields), ["employee"])
        self.assertEqual(
            list(form.fields["employee"].queryset),
            list(Employee.objects.order_by("name")),
        )

    def test_assign_asset_creates_assignment_and_marks_asset_assigned(self):
        response = self.client.post(
            reverse("assign_asset", kwargs={"pk": self.asset.pk}),
            data={"employee": self.employee.pk},
        )

        self.assertRedirects(response, reverse("asset_list"))
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, Asset.AssetStatus.ASSIGNED)
        self.assertTrue(
            Assignment.objects.filter(
                asset=self.asset,
                employee=self.employee,
                date_returned__isnull=True,
            ).exists()
        )

    def test_assign_asset_blocks_unavailable_asset(self):
        self.asset.status = Asset.AssetStatus.UNDER_MAINTENANCE
        self.asset.save(update_fields=["status"])

        response = self.client.post(
            reverse("assign_asset", kwargs={"pk": self.asset.pk}),
            data={"employee": self.employee.pk},
        )

        self.assertRedirects(
            response,
            reverse("asset_detail", kwargs={"pk": self.asset.pk}),
        )
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, Asset.AssetStatus.UNDER_MAINTENANCE)
        self.assertFalse(Assignment.objects.filter(asset=self.asset).exists())

    def test_return_asset_closes_assignment_and_marks_asset_available(self):
        Assignment.objects.create(asset=self.asset, employee=self.employee)
        self.asset.status = Asset.AssetStatus.ASSIGNED
        self.asset.save(update_fields=["status"])

        response = self.client.post(reverse("return_asset", kwargs={"pk": self.asset.pk}))

        self.assertRedirects(
            response,
            reverse("asset_detail", kwargs={"pk": self.asset.pk}),
        )
        self.asset.refresh_from_db()
        assignment = Assignment.objects.get(asset=self.asset)
        self.assertEqual(self.asset.status, Asset.AssetStatus.AVAILABLE)
        self.assertIsNotNone(assignment.date_returned)


class DashboardContextTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="viewer",
            email="viewer@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(self.user)
        Asset.objects.create(
            name="Available Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="DASH-AVAILABLE",
            status=Asset.AssetStatus.AVAILABLE,
        )
        Asset.objects.create(
            name="Assigned Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="DASH-ASSIGNED",
            status=Asset.AssetStatus.ASSIGNED,
        )
        Asset.objects.create(
            name="Maintenance Printer",
            type=Asset.AssetType.PRINTER,
            serial_number="DASH-MAINTENANCE",
            status=Asset.AssetStatus.UNDER_MAINTENANCE,
        )

    def test_dashboard_context_exposes_frontend_metric_keys(self):
        response = self.client.get(reverse("dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["total_assets"], 3)
        self.assertEqual(response.context["assigned_assets"], 1)
        self.assertEqual(response.context["available_assets"], 1)
        self.assertEqual(response.context["maintenance_assets"], 1)


class InventoryAdminConfigurationTests(TestCase):
    def test_asset_admin_configuration(self):
        model_admin = admin.site._registry[Asset]

        self.assertEqual(
            model_admin.list_display,
            ("name", "type", "serial_number", "status"),
        )
        self.assertEqual(model_admin.list_filter, ("type", "status"))
        self.assertEqual(model_admin.search_fields, ("name", "serial_number"))

    def test_employee_admin_configuration(self):
        model_admin = admin.site._registry[Employee]

        self.assertEqual(model_admin.list_display, ("name", "department", "email"))
        self.assertEqual(model_admin.search_fields, ("name", "department", "email"))

    def test_assignment_admin_configuration(self):
        model_admin = admin.site._registry[Assignment]

        self.assertEqual(
            model_admin.list_display,
            ("asset", "employee", "date_assigned", "date_returned"),
        )
        self.assertEqual(model_admin.list_filter, ("date_assigned", "date_returned"))
        self.assertIn("asset__name", model_admin.search_fields)
        self.assertIn("asset__serial_number", model_admin.search_fields)
        self.assertIn("employee__name", model_admin.search_fields)
        self.assertIn("employee__email", model_admin.search_fields)

    def test_maintenance_log_admin_configuration(self):
        model_admin = admin.site._registry[MaintenanceLog]

        self.assertEqual(
            model_admin.list_display,
            ("asset", "technician", "date", "resolved"),
        )
        self.assertEqual(model_admin.list_filter, ("resolved", "date"))
        self.assertIn("issue_description", model_admin.search_fields)


class ManagementViewSecurityTests(TestCase):
    def setUp(self):
        self.asset = Asset.objects.create(
            name="Security Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="SEC-12345",
            status=Asset.AssetStatus.AVAILABLE,
        )
        self.employee = Employee.objects.create(
            name="Security Tester",
            department="IT Operations",
            email="security@example.com",
        )

    def test_anonymous_user_blocked_from_crud(self):
        response = self.client.get(reverse("asset_add"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response["Location"])
        self.assertIn("next=", response["Location"])

    def test_non_admin_employee_user_forbidden(self):
        user = get_user_model().objects.create_user(
            username="employee-user",
            email="employee-user@example.com",
            password="test-pass-12345",
            is_staff=False,
        )
        self.client.force_login(user)

        response = self.client.post(
            reverse("assign_asset", kwargs={"pk": self.asset.pk}),
            data={"employee": self.employee.pk},
        )

        self.assertEqual(response.status_code, 403)
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, Asset.AssetStatus.AVAILABLE)
        self.assertFalse(Assignment.objects.filter(asset=self.asset).exists())

    def test_authorized_admin_allowed_crud(self):
        user = get_user_model().objects.create_user(
            username="staff-user",
            email="staff-user@example.com",
            password="test-pass-12345",
            is_staff=True,
        )
        self.client.force_login(user)

        response = self.client.post(
            reverse("asset_add"),
            data={
                "name": "Staff Created Router",
                "type": Asset.AssetType.ROUTER,
                "serial_number": "STAFF-ROUTER-001",
                "status": Asset.AssetStatus.AVAILABLE,
            },
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            Asset.objects.filter(serial_number="STAFF-ROUTER-001").exists()
        )
