import datetime
import json

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .forms import AssetForm, AssignmentForm, EmployeeCreateForm, EmployeeForm
from .models import Asset, Assignment, Employee, EmployeeNotification, MaintenanceLog


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


class ErrorPageTests(TestCase):
    @override_settings(DEBUG=False, ALLOWED_HOSTS=["testserver"])
    def test_missing_page_uses_graceful_error_template(self):
        response = self.client.get("/missing-page/")

        self.assertEqual(response.status_code, 404)
        self.assertTemplateUsed(response, "inventory/error.html")
        self.assertContains(response, "Page Not Found", status_code=404)


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
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="eugene@example.com",
        )

    def test_assignment_form_only_exposes_employee_field(self):
        form = AssignmentForm()

        self.assertEqual(list(form.fields), ["employee"])
        self.assertEqual(
            list(form.fields["employee"].queryset),
            list(Employee.objects.order_by("name")),
        )

    def test_employee_form_limits_department_to_approved_choices(self):
        form = EmployeeForm()

        self.assertEqual(
            list(form.fields["department"].choices),
            [
                ("", "Select a department"),
                (
                    Employee.Department.TECHNICAL_CORE_PROGRAMME.value,
                    "Technical & Core Programme Directorates",
                ),
                (
                    Employee.Department.CAPACITY_BUILDING_INNOVATION.value,
                    "Capacity Building & Innovation Directorates",
                ),
                (
                    Employee.Department.INSTITUTIONAL_SUPPORT_ADVISORY.value,
                    "Institutional Support & Advisory Operations",
                ),
            ],
        )

    def test_employee_create_form_creates_linked_user_with_hashed_password(self):
        form = EmployeeCreateForm(
            data={
                "username": "new.employee",
                "email": "new.employee@example.com",
                "department": Employee.Department.TECHNICAL_CORE_PROGRAMME,
                "password": "StrongPass123!",
                "confirm_password": "StrongPass123!",
            }
        )

        self.assertTrue(form.is_valid(), form.errors)
        employee = form.save()
        self.assertEqual(employee.name, "new.employee")
        self.assertEqual(employee.email, "new.employee@example.com")
        self.assertEqual(employee.user.username, "new.employee")
        self.assertTrue(employee.user.check_password("StrongPass123!"))

    def test_employee_create_form_requires_matching_passwords(self):
        form = EmployeeCreateForm(
            data={
                "username": "mismatch.employee",
                "email": "mismatch.employee@example.com",
                "department": Employee.Department.TECHNICAL_CORE_PROGRAMME,
                "password": "StrongPass123!",
                "confirm_password": "DifferentPass123!",
            }
        )

        self.assertFalse(form.is_valid())
        self.assertIn("confirm_password", form.errors)

    def test_employee_department_abbreviation_supports_legacy_departments(self):
        employee = Employee(name="Legacy Employee", department="IT Operations")

        self.assertEqual(employee.department_abbreviation, "IO")

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
        notification = EmployeeNotification.objects.get(employee=self.employee)
        self.assertEqual(notification.title, "Asset Assigned")
        self.assertFalse(notification.read)

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

    def test_asset_detail_shows_maintenance_done_button_for_maintenance_asset(self):
        self.asset.status = Asset.AssetStatus.UNDER_MAINTENANCE
        self.asset.save(update_fields=["status"])

        response = self.client.get(reverse("asset_detail", kwargs={"pk": self.asset.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Maintenance Done")
        self.assertContains(response, reverse("maintenance_done", kwargs={"pk": self.asset.pk}))

    def test_maintenance_done_marks_asset_available_and_logs_completion(self):
        self.asset.status = Asset.AssetStatus.UNDER_MAINTENANCE
        self.asset.save(update_fields=["status"])

        response = self.client.post(
            reverse("maintenance_done", kwargs={"pk": self.asset.pk})
        )

        self.assertRedirects(
            response,
            reverse("asset_detail", kwargs={"pk": self.asset.pk}),
        )
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, Asset.AssetStatus.AVAILABLE)
        log = MaintenanceLog.objects.get(asset=self.asset)
        self.assertTrue(log.resolved)
        self.assertEqual(log.date, timezone.localdate())
        self.assertEqual(log.technician, self.user.username)
        self.assertEqual(
            log.issue_description,
            "Maintenance completed and asset returned to available status.",
        )

    def test_maintenance_done_rejects_assets_not_under_maintenance(self):
        response = self.client.post(
            reverse("maintenance_done", kwargs={"pk": self.asset.pk})
        )

        self.assertRedirects(
            response,
            reverse("asset_detail", kwargs={"pk": self.asset.pk}),
        )
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, Asset.AssetStatus.AVAILABLE)
        self.assertFalse(MaintenanceLog.objects.filter(asset=self.asset).exists())


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
        Employee.objects.create(
            name="Dashboard Employee One",
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="dashboard.one@example.com",
        )
        Employee.objects.create(
            name="Dashboard Employee Two",
            department=Employee.Department.INSTITUTIONAL_SUPPORT_ADVISORY,
            email="dashboard.two@example.com",
        )

    def test_dashboard_context_exposes_frontend_metric_keys(self):
        response = self.client.get(reverse("dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["total_assets"], 3)
        self.assertEqual(response.context["assigned_assets"], 1)
        self.assertEqual(response.context["available_assets"], 1)
        self.assertEqual(response.context["maintenance_assets"], 1)
        self.assertEqual(response.context["employee_count"], 2)
        self.assertEqual(response.context["total_employees"], 2)
        self.assertEqual(response.context["overdue_assets_count"], 0)
        self.assertContains(response, "Total Employees")
        self.assertContains(response, '<span class="quick-stat-value">2</span>', html=True)

    def test_dashboard_overdue_count_uses_creation_or_recent_maintenance_date(self):
        recent_asset = Asset.objects.create(
            name="Recently Serviced Monitor",
            type=Asset.AssetType.MONITOR,
            serial_number="DASH-RECENT",
            status=Asset.AssetStatus.AVAILABLE,
            date_created=timezone.now() - datetime.timedelta(days=300),
        )
        old_asset = Asset.objects.create(
            name="Oldly Serviced Router",
            type=Asset.AssetType.ROUTER,
            serial_number="DASH-OLD",
            status=Asset.AssetStatus.AVAILABLE,
            date_created=timezone.now() - datetime.timedelta(days=300),
        )
        old_unserviced_asset = Asset.objects.create(
            name="Old Unserviced Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="DASH-OLD-UNSERVICED",
            status=Asset.AssetStatus.AVAILABLE,
            date_created=timezone.now() - datetime.timedelta(days=181),
        )
        new_unserviced_asset = Asset.objects.create(
            name="New Unserviced Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="DASH-NEW-UNSERVICED",
            status=Asset.AssetStatus.AVAILABLE,
            date_created=timezone.now(),
        )
        self.assertIsNotNone(old_unserviced_asset.pk)
        self.assertIsNotNone(new_unserviced_asset.pk)
        MaintenanceLog.objects.create(
            asset=recent_asset,
            issue_description="Preventive service",
            technician="Nelson",
            date=timezone.now().date() - datetime.timedelta(days=30),
            resolved=True,
        )
        MaintenanceLog.objects.create(
            asset=old_asset,
            issue_description="Old service",
            technician="Nelson",
            date=timezone.now().date() - datetime.timedelta(days=181),
            resolved=True,
        )

        response = self.client.get(reverse("dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["total_assets"], 7)
        self.assertEqual(response.context["overdue_assets_count"], 2)
        self.assertQuerySetEqual(
            response.context["overdue_assets"],
            [old_asset, old_unserviced_asset],
            transform=lambda asset: asset,
            ordered=False,
        )


class InventoryAdminConfigurationTests(TestCase):
    def test_asset_admin_configuration(self):
        model_admin = admin.site._registry[Asset]

        self.assertEqual(
            model_admin.list_display,
            ("name", "type", "serial_number", "status", "date_created"),
        )
        self.assertEqual(model_admin.list_filter, ("type", "status", "date_created"))
        self.assertEqual(model_admin.search_fields, ("name", "serial_number"))

    def test_employee_admin_configuration(self):
        model_admin = admin.site._registry[Employee]

        self.assertEqual(model_admin.list_display, ("name", "user", "department", "email"))
        self.assertEqual(model_admin.list_filter, ("department",))
        self.assertEqual(
            model_admin.search_fields,
            ("name", "user__username", "user__email", "department", "email"),
        )

    def test_assignment_admin_configuration(self):
        model_admin = admin.site._registry[Assignment]

        self.assertEqual(
            model_admin.list_display,
            (
                "asset",
                "employee",
                "confirmed_by_employee",
                "date_assigned",
                "date_returned",
            ),
        )
        self.assertEqual(
            model_admin.list_filter,
            ("confirmed_by_employee", "date_assigned", "date_returned"),
        )
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
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="security@example.com",
        )

    def test_anonymous_user_blocked_from_crud(self):
        response = self.client.get(reverse("asset_add"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/login/", response["Location"])
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


class AuthRoutingTests(TestCase):
    def test_login_route_renders_auth_template(self):
        response = self.client.get(reverse("login"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "inventory/auth.html")
        self.assertEqual(response.context["page"], "login")

    def test_protected_page_redirects_to_auth_template_login(self):
        response = self.client.get(reverse("dashboard"))

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("/login/"))
        self.assertIn("next=", response["Location"])

    def test_logout_route_renders_auth_template(self):
        user = get_user_model().objects.create_user(
            username="logout-user",
            email="logout-user@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(user)

        response = self.client.get(reverse("logout"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "inventory/auth.html")
        self.assertEqual(response.context["page"], "logout")


class AssetCSVExportTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            username="export-admin",
            email="export-admin@example.com",
            password="test-pass-12345",
            is_staff=True,
        )
        self.user = get_user_model().objects.create_user(
            username="export-user",
            email="export-user@example.com",
            password="test-pass-12345",
        )
        self.asset = Asset.objects.create(
            name="Export Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="EXPORT-001",
            status=Asset.AssetStatus.AVAILABLE,
        )
        self.maintenance_date = timezone.now().date() - datetime.timedelta(days=10)
        MaintenanceLog.objects.create(
            asset=self.asset,
            issue_description="Routine check",
            technician="Yvonne",
            date=self.maintenance_date,
            resolved=True,
        )

    def test_export_asset_csv_streams_expected_columns(self):
        self.client.force_login(self.admin)

        response = self.client.get(reverse("export_asset_csv"))
        content = b"".join(response.streaming_content).decode()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertEqual(
            response["Content-Disposition"],
            'attachment; filename="itam_asset_report.csv"',
        )
        self.assertIn("Name,Type,Serial Number,Status,Last Maintenance Date", content)
        self.assertIn("Export Laptop,Laptop,EXPORT-001,Available", content)
        self.assertIn(str(self.maintenance_date), content)

    def test_export_asset_csv_rejects_non_admin_user(self):
        self.client.force_login(self.user)

        response = self.client.get(reverse("export_asset_csv"))

        self.assertEqual(response.status_code, 403)


class FrontendAPIBridgeTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="api-viewer",
            email="api-viewer@example.com",
            password="test-pass-12345",
        )
        self.admin = get_user_model().objects.create_user(
            username="api-admin",
            email="api-admin@example.com",
            password="test-pass-12345",
            is_staff=True,
        )
        self.employee = Employee.objects.create(
            name="API Employee",
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="api.employee@example.com",
        )
        self.asset = Asset.objects.create(
            name="API Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="API-12345",
            status=Asset.AssetStatus.AVAILABLE,
        )

    def test_asset_api_list_returns_frontend_status_values(self):
        self.client.force_login(self.user)

        response = self.client.get(reverse("api_asset_list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["status"], "available")
        self.assertEqual(response.json()[0]["status_label"], "Available")

    def test_asset_api_list_returns_assigned_employee(self):
        Assignment.objects.create(asset=self.asset, employee=self.employee)
        self.asset.status = Asset.AssetStatus.ASSIGNED
        self.asset.save(update_fields=["status"])
        self.client.force_login(self.user)

        response = self.client.get(reverse("api_asset_list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["assigned_employee"]["name"], "API Employee")
        self.assertEqual(
            response.json()[0]["assigned_employee"]["department_abbreviation"],
            "TCPD",
        )

    def test_asset_list_table_displays_assigned_employee(self):
        Assignment.objects.create(asset=self.asset, employee=self.employee)
        self.asset.status = Asset.AssetStatus.ASSIGNED
        self.asset.save(update_fields=["status"])
        self.client.force_login(self.user)

        response = self.client.get(reverse("asset_list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Assignee")
        self.assertContains(response, "API Employee")
        self.assertContains(response, "TCPD")

    def test_asset_api_assignment_updates_state(self):
        self.client.force_login(self.admin)
        today = timezone.localdate().isoformat()

        response = self.client.post(
            reverse("api_asset_assign", kwargs={"pk": self.asset.pk}),
            data={"employee_id": self.employee.pk},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, Asset.AssetStatus.ASSIGNED)
        self.assertEqual(response.json()["status"], "assigned")
        self.assertTrue(response.json()["date_assigned"].startswith(today))
        self.assertIsNone(response.json()["date_returned"])
        self.assertTrue(
            response.json()["assignment_calendar"]["date_assigned"].startswith(today)
        )
        self.assertTrue(response.json()["assignment_calendar"]["currently_assigned"])

    def test_asset_api_create_defaults_status_to_available(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("api_asset_list"),
            data={
                "name": "Created Without Status",
                "type": "laptop",
                "serial_number": "API-NO-STATUS",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        asset = Asset.objects.get(serial_number="API-NO-STATUS")
        self.assertEqual(asset.status, Asset.AssetStatus.AVAILABLE)
        self.assertEqual(response.json()["status"], "available")
        self.assertEqual(response.json()["status_label"], "Available")
        self.assertTrue(response.json()["date_created"].startswith(timezone.localdate().isoformat()))

    @override_settings(TIME_ZONE="Africa/Nairobi")
    def test_asset_api_serializes_created_timestamp_in_local_timezone(self):
        self.client.force_login(self.user)
        created_at = datetime.datetime(
            2026,
            6,
            25,
            8,
            0,
            tzinfo=datetime.timezone.utc,
        )
        self.asset.date_created = created_at
        self.asset.save(update_fields=["date_created"])

        response = self.client.get(reverse("api_asset_detail", kwargs={"pk": self.asset.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["date_created"], "2026-06-25T11:00:00+03:00")

    def test_asset_api_return_updates_calendar_dates(self):
        self.client.force_login(self.admin)
        assignment = Assignment.objects.create(asset=self.asset, employee=self.employee)
        self.asset.status = Asset.AssetStatus.ASSIGNED
        self.asset.save(update_fields=["status"])
        today = timezone.localdate().isoformat()

        response = self.client.post(reverse("api_asset_return", kwargs={"pk": self.asset.pk}))

        self.assertEqual(response.status_code, 200)
        self.asset.refresh_from_db()
        assignment.refresh_from_db()
        self.assertEqual(self.asset.status, Asset.AssetStatus.AVAILABLE)
        self.assertEqual(timezone.localtime(assignment.date_returned).date().isoformat(), today)
        self.assertEqual(
            response.json()["date_assigned"],
            timezone.localtime(assignment.date_assigned).isoformat(),
        )
        self.assertTrue(response.json()["date_returned"].startswith(today))
        self.assertFalse(response.json()["assignment_calendar"]["currently_assigned"])

    def test_employee_api_list_returns_assigned_asset_counts(self):
        Assignment.objects.create(asset=self.asset, employee=self.employee)
        self.client.force_login(self.user)

        response = self.client.get(reverse("api_employee_list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["assigned_assets_count"], 1)

    def test_employee_api_create_adds_employee(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("api_employee_list"),
            data={
                "username": "created.employee",
                "department": Employee.Department.CAPACITY_BUILDING_INNOVATION,
                "email": "created.employee@example.com",
                "password": "StrongPass123!",
                "confirm_password": "StrongPass123!",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        employee = Employee.objects.get(email="created.employee@example.com")
        self.assertEqual(employee.user.username, "created.employee")
        self.assertTrue(employee.user.check_password("StrongPass123!"))
        self.assertEqual(response.json()["name"], "created.employee")

    def test_employee_api_rejects_unknown_department(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("api_employee_list"),
            data={
                "name": "Invalid Department Employee",
                "department": "Support",
                "email": "invalid.department@example.com",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("department", response.json()["errors"])
        self.assertFalse(
            Employee.objects.filter(email="invalid.department@example.com").exists()
        )


class MaintenanceLogCRUDTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            username="maintenance-admin",
            email="maintenance-admin@example.com",
            password="test-pass-12345",
            is_staff=True,
        )
        self.user = get_user_model().objects.create_user(
            username="maintenance-viewer",
            email="maintenance-viewer@example.com",
            password="test-pass-12345",
        )
        self.asset = Asset.objects.create(
            name="Maintenance Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="MAINT-CRUD-001",
            status=Asset.AssetStatus.AVAILABLE,
        )

    def test_asset_detail_links_to_maintenance_log_crud_for_admins(self):
        log = MaintenanceLog.objects.create(
            asset=self.asset,
            issue_description="Battery replacement",
            technician="Ada",
            date=timezone.localdate(),
            resolved=False,
        )
        self.client.force_login(self.admin)

        response = self.client.get(reverse("asset_detail", kwargs={"pk": self.asset.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, reverse("maintenance_log_add", kwargs={"asset_pk": self.asset.pk}))
        self.assertContains(response, reverse("maintenance_log_edit", kwargs={"pk": log.pk}))
        self.assertContains(response, reverse("maintenance_log_delete", kwargs={"pk": log.pk}))

    def test_admin_can_create_maintenance_log_for_asset(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("maintenance_log_add", kwargs={"asset_pk": self.asset.pk}),
            data={
                "issue_description": "Keyboard repair",
                "technician": "Grace",
                "date": timezone.localdate().isoformat(),
                "resolved": "on",
            },
        )

        self.assertRedirects(response, reverse("asset_detail", kwargs={"pk": self.asset.pk}))
        log = MaintenanceLog.objects.get(asset=self.asset)
        self.assertEqual(log.issue_description, "Keyboard repair")
        self.assertEqual(log.technician, "Grace")
        self.assertTrue(log.resolved)

    def test_admin_can_update_maintenance_log(self):
        log = MaintenanceLog.objects.create(
            asset=self.asset,
            issue_description="Initial diagnosis",
            technician="Ada",
            date=timezone.localdate(),
            resolved=False,
        )
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("maintenance_log_edit", kwargs={"pk": log.pk}),
            data={
                "issue_description": "Initial diagnosis completed",
                "technician": "Ada",
                "date": timezone.localdate().isoformat(),
                "resolved": "on",
            },
        )

        self.assertRedirects(response, reverse("asset_detail", kwargs={"pk": self.asset.pk}))
        log.refresh_from_db()
        self.assertEqual(log.issue_description, "Initial diagnosis completed")
        self.assertTrue(log.resolved)

    def test_admin_can_delete_maintenance_log(self):
        log = MaintenanceLog.objects.create(
            asset=self.asset,
            issue_description="Old log",
            technician="Ada",
            date=timezone.localdate(),
            resolved=True,
        )
        self.client.force_login(self.admin)

        response = self.client.post(reverse("maintenance_log_delete", kwargs={"pk": log.pk}))

        self.assertRedirects(response, reverse("asset_detail", kwargs={"pk": self.asset.pk}))
        self.assertFalse(MaintenanceLog.objects.filter(pk=log.pk).exists())

    def test_non_admin_cannot_create_maintenance_log(self):
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("maintenance_log_add", kwargs={"asset_pk": self.asset.pk}),
            data={
                "issue_description": "Unauthorized",
                "technician": "Viewer",
                "date": timezone.localdate().isoformat(),
                "resolved": "on",
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(MaintenanceLog.objects.filter(asset=self.asset).exists())


class EmployeePortalTests(TestCase):
    def setUp(self):
        self.employee_user = get_user_model().objects.create_user(
            username="portal-user",
            email="portal-user@example.com",
            password="test-pass-12345",
        )
        self.other_user = get_user_model().objects.create_user(
            username="other-portal-user",
            email="other-portal-user@example.com",
            password="test-pass-12345",
        )
        self.employee = Employee.objects.create(
            user=self.employee_user,
            name="Portal Employee",
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="portal.employee@example.com",
        )
        self.other_employee = Employee.objects.create(
            user=self.other_user,
            name="Other Portal Employee",
            department=Employee.Department.CAPACITY_BUILDING_INNOVATION,
            email="other.portal.employee@example.com",
        )
        self.asset = Asset.objects.create(
            name="Portal Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="PORTAL-001",
            status=Asset.AssetStatus.ASSIGNED,
        )
        self.assignment = Assignment.objects.create(
            asset=self.asset,
            employee=self.employee,
        )

    def test_employee_login_redirects_to_employee_dashboard(self):
        response = self.client.post(
            reverse("login"),
            data={
                "username": "portal-user",
                "password": "test-pass-12345",
            },
        )

        self.assertRedirects(response, reverse("employee_dashboard"))

    def test_employee_can_login_with_email_to_employee_dashboard(self):
        response = self.client.post(
            reverse("login"),
            data={
                "username": "portal-user@example.com",
                "password": "test-pass-12345",
            },
        )

        self.assertRedirects(response, reverse("employee_dashboard"))

    def test_admin_create_employee_creates_linked_user_and_notification(self):
        admin_user = get_user_model().objects.create_user(
            username="employee-admin",
            email="employee-admin@example.com",
            password="test-pass-12345",
            is_staff=True,
        )
        self.client.force_login(admin_user)

        response = self.client.post(
            reverse("employee_add"),
            data={
                "username": "created.employee",
                "email": "created.employee@example.com",
                "department": Employee.Department.INSTITUTIONAL_SUPPORT_ADVISORY,
                "password": "StrongPass123!",
                "confirm_password": "StrongPass123!",
            },
        )

        self.assertRedirects(response, reverse("employee_list"))
        employee = Employee.objects.get(email="created.employee@example.com")
        self.assertEqual(employee.name, "created.employee")
        self.assertEqual(employee.user.username, "created.employee")
        self.assertTrue(employee.user.check_password("StrongPass123!"))
        notifications = self.client.session.get("notifications", [])
        self.assertEqual(notifications[0]["title"], "New Employee Added")

    def test_linked_employee_can_open_portal_dashboard(self):
        self.client.force_login(self.employee_user)

        response = self.client.get(reverse("employee_dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "inventory/employee/dashboard.html")
        self.assertEqual(response.context["active_assets"], 1)
        self.assertEqual(response.context["pending_assets"], 1)
        self.assertEqual(list(response.context["assignment_history"]), [self.assignment])

    def test_removed_employee_pages_redirect_to_consolidated_destinations(self):
        self.client.force_login(self.employee_user)

        redirects = {
            "employee_notifications": reverse("employee_dashboard"),
            "employee_history": reverse("employee_dashboard"),
            "employee_returns": reverse("employee_dashboard"),
            "employee_profile": reverse("employee_settings"),
        }

        for route_name, destination in redirects.items():
            with self.subTest(route_name=route_name):
                response = self.client.get(reverse(route_name))
                self.assertRedirects(response, destination)

    def test_employee_can_change_password_from_settings(self):
        self.client.force_login(self.employee_user)

        response = self.client.post(
            reverse("employee_password_change"),
            data=json.dumps(
                {
                    "new_password": "VeryStrongNewPass987!",
                    "confirm_password": "VeryStrongNewPass987!",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["success"], True)
        self.employee_user.refresh_from_db()
        self.assertTrue(self.employee_user.check_password("VeryStrongNewPass987!"))
        notification = EmployeeNotification.objects.get(employee=self.employee)
        self.assertEqual(notification.title, "Password Changed")
        self.assertFalse(notification.read)
        self.assertEqual(response.json()["notification"]["title"], "Password Changed")
        self.assertEqual(response.json()["unread_count"], 1)

        self.client.logout()
        self.assertFalse(
            self.client.login(username="portal-user", password="test-pass-12345")
        )
        self.assertTrue(
            self.client.login(
                username="portal-user",
                password="VeryStrongNewPass987!",
            )
        )

    def test_employee_password_change_requires_matching_passwords(self):
        self.client.force_login(self.employee_user)

        response = self.client.post(
            reverse("employee_password_change"),
            data=json.dumps(
                {
                    "new_password": "VeryStrongNewPass987!",
                    "confirm_password": "DifferentStrongPass987!",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["success"], False)
        self.employee_user.refresh_from_db()
        self.assertTrue(self.employee_user.check_password("test-pass-12345"))

    def test_unlinked_user_is_redirected_from_employee_portal(self):
        unlinked_user = get_user_model().objects.create_user(
            username="unlinked-portal-user",
            email="unlinked@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(unlinked_user)

        response = self.client.get(reverse("employee_dashboard"))

        self.assertRedirects(response, reverse("dashboard"))

    def test_employee_can_confirm_own_assigned_asset(self):
        self.client.force_login(self.employee_user)

        response = self.client.post(
            reverse("employee_confirm_asset", kwargs={"pk": self.assignment.pk})
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["success"], True)
        self.assignment.refresh_from_db()
        self.assertTrue(self.assignment.confirmed_by_employee)
        self.assertIsNotNone(self.assignment.confirmed_at)

    def test_employee_cannot_confirm_another_employee_assignment(self):
        self.client.force_login(self.other_user)

        response = self.client.post(
            reverse("employee_confirm_asset", kwargs={"pk": self.assignment.pk})
        )

        self.assertEqual(response.status_code, 404)
        self.assignment.refresh_from_db()
        self.assertFalse(self.assignment.confirmed_by_employee)
