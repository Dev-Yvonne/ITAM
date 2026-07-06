import datetime
import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .forms import AssetForm, AssignmentForm, EmployeeCreateForm, EmployeeForm
from .models import Asset, AssetCatalog, Assignment, BackgroundJob, CatalogAsset, Employee, EmployeeNotification, MaintenanceLog
from .services.background_jobs import enqueue_job
from .services.dates import format_duration_since, format_duration_until
from .services.serial_numbers import build_serial_suggestion_payload, generate_unique_serial_numbers


def future_return_date(days=30):
    return (timezone.localdate() + datetime.timedelta(days=days)).isoformat()


def open_maintenance_payload(**overrides):
    payload = {
        "issue_description": "Screen replacement",
        "technician": "Grace",
        "repair_shop": "TechFix Repairs",
        "worker_contact": "grace@techfix.example",
        "expected_completion_date": future_return_date(14),
        "date": timezone.localdate().isoformat(),
    }
    payload.update(overrides)
    return payload


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

    def test_assignment_form_exposes_assignment_fields(self):
        form = AssignmentForm()

        self.assertEqual(list(form.fields), ["employee", "expected_return_date"])
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
            data={
                "employee": self.employee.pk,
                "expected_return_date": future_return_date(),
            },
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
            data={
                "employee": self.employee.pk,
                "expected_return_date": future_return_date(),
            },
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
        self.assertTrue(response.context["async_dashboard"])
        self.assertContains(response, "data-async-dashboard")
        self.assertContains(response, "Workforce")
        self.assertContains(response, reverse("asset_list"))
        self.assertContains(response, 'class="stat-card stat-card-link stat-total"')

        job = enqueue_job(self.user, BackgroundJob.JobType.DASHBOARD, force=True)
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.Status.COMPLETED)
        data = job.result
        self.assertEqual(data["total_assets"], 3)
        self.assertEqual(data["assigned_assets"], 1)
        self.assertEqual(data["available_assets"], 1)
        self.assertEqual(data["maintenance_assets"], 1)
        self.assertEqual(data["employee_count"], 2)
        self.assertEqual(data["overdue_assets_count"], 0)
        self.assertIn("analytics", data)
        self.assertIn("asset_by_status", data["analytics"])
        self.assertIn("total_assignments", data)
        self.assertIn("overdue_list_url", data)

        response = self.client.get(reverse("dashboard"))
        self.assertContains(response, "Fleet Intelligence")
        self.assertContains(response, "Analytics Canvas")
        self.assertContains(response, "dashStatusChart")

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
        job = enqueue_job(self.user, BackgroundJob.JobType.DASHBOARD, force=True)
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.Status.COMPLETED)
        data = job.result
        self.assertEqual(data["total_assets"], 7)
        self.assertEqual(data["overdue_assets_count"], 2)
        overdue_names = {asset["name"] for asset in data["overdue_assets"]}
        self.assertEqual(overdue_names, {old_asset.name, old_unserviced_asset.name})


class SerialNumberSuggestionTests(TestCase):
    def test_generate_unique_serial_numbers_avoids_existing_values(self):
        Asset.objects.create(
            name="Existing Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="ITAM-LAP-EXISTING",
            status=Asset.AssetStatus.AVAILABLE,
        )

        suggestions = generate_unique_serial_numbers(
            count=3,
            asset_type=Asset.AssetType.LAPTOP,
        )

        self.assertEqual(len(suggestions), 3)
        self.assertTrue(all("ITAM-LAP-" in serial for serial in suggestions))
        self.assertNotIn("ITAM-LAP-EXISTING", suggestions)

    def test_serial_suggestions_background_job_returns_typed_pool(self):
        user = get_user_model().objects.create_user(
            username="serial-suggest-user",
            password="password123",
            is_staff=True,
        )
        job = enqueue_job(
            user,
            BackgroundJob.JobType.SERIAL_SUGGESTIONS,
            params={"per_type": 2},
            force=True,
        )
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.Status.COMPLETED)
        suggestions = job.result["suggestions"]
        self.assertEqual(len(suggestions), 8)
        self.assertTrue(
            any(item["asset_type"] == Asset.AssetType.LAPTOP for item in suggestions)
        )


class BackgroundJobTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="bgjob-user",
            password="password123",
            is_staff=True,
        )
        Asset.objects.create(
            name="Background Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="BG-001",
            status=Asset.AssetStatus.AVAILABLE,
        )

    def test_create_and_process_reports_job(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse("background_job_create"),
            data=json.dumps({"job_type": "reports"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 202)
        job_id = response.json()["id"]
        job = BackgroundJob.objects.get(pk=job_id)
        self.assertEqual(job.status, BackgroundJob.Status.COMPLETED)
        detail = self.client.get(reverse("background_job_detail", kwargs={"job_id": job_id}))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["status"], "completed")
        self.assertIn("total_assets", detail.json()["result"])

    def test_csv_export_job_writes_downloadable_file(self):
        job = enqueue_job(self.user, BackgroundJob.JobType.CSV_EXPORT, force=True)
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.Status.COMPLETED)
        self.assertTrue(job.result_file or job.result.get("csv_content"))
        self.client.force_login(self.user)
        response = self.client.get(
            reverse("background_job_download", kwargs={"job_id": job.id})
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        if hasattr(response, "content"):
            self.assertIn(b"Serial Number", response.content)
        else:
            body = b"".join(response.streaming_content)
            self.assertIn(b"Serial Number", body)

    def test_csv_export_job_uses_inline_storage_when_media_readonly(self):
        from unittest.mock import patch

        with patch(
            "inventory.services.background_jobs._can_write_media_exports",
            return_value=False,
        ):
            job = enqueue_job(self.user, BackgroundJob.JobType.CSV_EXPORT, force=True)

        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.Status.COMPLETED)
        self.assertFalse(job.result_file)
        self.assertIn("csv_content", job.result)
        self.assertIn("Background Laptop", job.result["csv_content"])

        self.client.force_login(self.user)
        response = self.client.get(
            reverse("background_job_download", kwargs={"job_id": job.id})
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Background Laptop", response.content)


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
                "expected_return_date",
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
            (
                "asset",
                "technician",
                "repair_shop",
                "expected_completion_date",
                "date",
                "resolved",
            ),
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
            data={
                "employee": self.employee.pk,
                "expected_return_date": future_return_date(),
            },
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
            },
        )

        self.assertEqual(response.status_code, 302)
        created = Asset.objects.get(serial_number="STAFF-ROUTER-001")
        self.assertEqual(created.status, Asset.AssetStatus.AVAILABLE)

    def test_asset_create_page_includes_serial_suggest_ui(self):
        user = get_user_model().objects.create_user(
            username="staff-ui-user",
            email="staff-ui@example.com",
            password="test-pass-12345",
            is_staff=True,
        )
        self.client.force_login(user)

        response = self.client.get(reverse("asset_add"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.context["async_serial_suggestions"])
        self.assertContains(response, "suggest-serial-btn")
        self.assertNotContains(response, 'name="status"')


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

        response = self.client.post(reverse("logout"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "inventory/auth.html")
        self.assertEqual(response.context["page"], "logout")

    def test_logout_get_does_not_end_active_session(self):
        user = get_user_model().objects.create_user(
            username="stay-logged-in",
            email="stay-logged-in@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(user)

        response = self.client.get(reverse("logout"))

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse("dashboard"))
        self.assertTrue(
            get_user_model().objects.filter(pk=user.pk).exists()
        )
        self.client.get(reverse("dashboard"))
        self.assertEqual(int(self.client.session["_auth_user_id"]), user.pk)

    def test_session_persists_across_requests(self):
        user = get_user_model().objects.create_user(
            username="session-user",
            email="session-user@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(user)

        first = self.client.get(reverse("dashboard"))
        second = self.client.get(reverse("asset_list"))

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(int(self.client.session["_auth_user_id"]), user.pk)

    def test_login_remember_me_sets_persistent_session(self):
        user = get_user_model().objects.create_user(
            username="remember-user",
            email="remember-user@example.com",
            password="test-pass-12345",
        )

        response = self.client.post(
            reverse("login"),
            data={
                "username": "remember-user",
                "password": "test-pass-12345",
                "remember": "on",
            },
        )

        self.assertRedirects(response, reverse("dashboard"))
        self.assertFalse(self.client.session.get_expire_at_browser_close())
        self.assertEqual(
            self.client.session.get_expiry_age(),
            settings.SESSION_COOKIE_AGE,
        )

    def test_login_without_remember_me_uses_browser_session(self):
        user = get_user_model().objects.create_user(
            username="browser-session-user",
            email="browser-session-user@example.com",
            password="test-pass-12345",
        )

        response = self.client.post(
            reverse("login"),
            data={
                "username": "browser-session-user",
                "password": "test-pass-12345",
            },
        )

        self.assertRedirects(response, reverse("dashboard"))
        self.assertTrue(self.client.session.get_expire_at_browser_close())


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


class AssetCSVImportTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            username="import-admin",
            email="import-admin@example.com",
            password="test-pass-12345",
            is_staff=True,
        )
        self.user = get_user_model().objects.create_user(
            username="import-user",
            email="import-user@example.com",
            password="test-pass-12345",
        )
        self.existing = Asset.objects.create(
            name="Existing Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="IMPORT-001",
            status=Asset.AssetStatus.AVAILABLE,
        )

    def _csv_file(self, content: str, name: str = "assets.csv"):
        return SimpleUploadedFile(name, content.encode("utf-8"), content_type="text/csv")

    def test_validate_rejects_non_csv_file(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {"file": self._csv_file("Name\nTest", name="notes.txt")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("not a CSV", response.json()["detail"])

    def test_validate_detects_serial_conflicts(self):
        self.client.force_login(self.admin)
        csv_content = (
            "Name,Type,Serial Number,Status,Last Maintenance Date\n"
            "Uploaded Laptop,Laptop,IMPORT-001,Available,\n"
        )
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {"file": self._csv_file(csv_content)},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["valid_count"], 1)
        self.assertEqual(len(payload["conflicts"]), 1)
        self.assertEqual(payload["conflicts"][0]["existing_name"], "Existing Laptop")

    def test_validate_respects_status_column_when_present(self):
        self.client.force_login(self.admin)
        csv_content = (
            "Name,Type,Serial Number,Status\n"
            "Uploaded Laptop,Laptop,IMPORT-NEW,Assigned\n"
        )
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {"file": self._csv_file(csv_content)},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["valid_count"], 1)
        self.assertEqual(payload["rows"][0]["status"], Asset.AssetStatus.ASSIGNED)

    def test_validate_builds_assignment_reviews_from_csv_employee_column(self):
        employee = Employee.objects.create(
            name="Jane Doe",
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="jane@example.com",
        )
        self.client.force_login(self.admin)
        csv_content = (
            "Name,Type,Serial Number,Status,Employee\n"
            f"Uploaded Laptop,Laptop,IMPORT-ASSIGN,Assigned,{employee.name}\n"
        )
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {"file": self._csv_file(csv_content)},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["has_employee_column"])
        self.assertEqual(len(payload["assignment_reviews"]), 1)
        review = payload["assignment_reviews"][0]
        self.assertEqual(review["suggested_employee_id"], employee.pk)
        self.assertEqual(review["source"], "csv")

    def test_validate_builds_assignment_reviews_from_system_assignment(self):
        employee = Employee.objects.create(
            name="System Assignee",
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="system@example.com",
        )
        asset = Asset.objects.create(
            name="Assigned Asset",
            type=Asset.AssetType.LAPTOP,
            serial_number="SYS-ASSIGN-001",
            status=Asset.AssetStatus.ASSIGNED,
        )
        Assignment.objects.create(asset=asset, employee=employee)
        self.client.force_login(self.admin)
        csv_content = (
            "Name,Type,Serial Number,Status\n"
            "Assigned Asset,Laptop,SYS-ASSIGN-001,Assigned\n"
        )
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {"file": self._csv_file(csv_content)},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["has_employee_column"])
        self.assertEqual(len(payload["assignment_reviews"]), 1)
        self.assertEqual(
            payload["assignment_reviews"][0]["suggested_employee_id"],
            employee.pk,
        )
        self.assertEqual(payload["assignment_reviews"][0]["source"], "system")

    def test_execute_merge_creates_assignment_from_confirmation(self):
        employee = Employee.objects.create(
            name="Import Assignee",
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="import-assignee@example.com",
        )
        self.client.force_login(self.admin)
        rows = [
            {
                "row": 2,
                "name": "New Assigned Laptop",
                "type": Asset.AssetType.LAPTOP,
                "serial_number": "IMPORT-ASSIGN-EXEC",
                "status": Asset.AssetStatus.ASSIGNED,
                "employee_name": "",
                "last_maintenance_date": None,
            }
        ]
        response = self.client.post(
            reverse("import_asset_csv_execute"),
            data=json.dumps(
                {
                    "rows": rows,
                    "mode": "merge",
                    "assignment_confirmations": {
                        "IMPORT-ASSIGN-EXEC": employee.pk,
                    },
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        asset = Asset.objects.get(serial_number="IMPORT-ASSIGN-EXEC")
        self.assertEqual(asset.status, Asset.AssetStatus.ASSIGNED)
        assignment = Assignment.objects.filter(
            asset=asset,
            employee=employee,
            date_returned__isnull=True,
        )
        self.assertTrue(assignment.exists())

    def test_validate_honors_status_when_user_maps_status_column(self):
        self.client.force_login(self.admin)
        csv_content = (
            "Name,Type,Serial Number,Status\n"
            "Uploaded Laptop,Laptop,IMPORT-NEW,Assigned\n"
        )
        mapping = json.dumps(
            {
                "name": "Name",
                "type": "Type",
                "serial_number": "Serial Number",
                "status": "Status",
            }
        )
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {
                "file": self._csv_file(csv_content),
                "column_mapping": mapping,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["rows"][0]["status"], Asset.AssetStatus.ASSIGNED)

    def test_validate_requests_column_mapping_for_nonstandard_headers(self):
        self.client.force_login(self.admin)
        csv_content = (
            "Asset Name,Category,SN,State\n"
            "Uploaded Laptop,Laptop,IMPORT-002,Available\n"
        )
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {"file": self._csv_file(csv_content)},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["needs_column_mapping"])
        self.assertEqual(
            payload["headers"],
            ["Asset Name", "Category", "SN", "State"],
        )
        self.assertEqual(payload["suggested_mapping"]["name"], "Asset Name")
        self.assertEqual(payload["suggested_mapping"]["serial_number"], "SN")

    def test_validate_accepts_user_column_mapping(self):
        self.client.force_login(self.admin)
        csv_content = (
            "Asset Name,Category,SN,State\n"
            "Uploaded Laptop,Laptop,IMPORT-002,Available\n"
        )
        mapping = json.dumps(
            {
                "name": "Asset Name",
                "type": "Category",
                "serial_number": "SN",
                "status": "State",
            }
        )
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {
                "file": self._csv_file(csv_content),
                "column_mapping": mapping,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["valid_count"], 1)
        self.assertEqual(payload["rows"][0]["name"], "Uploaded Laptop")
        self.assertEqual(payload["rows"][0]["serial_number"], "IMPORT-002")

    def test_execute_merge_replace_updates_existing_asset(self):
        self.client.force_login(self.admin)
        rows = [
            {
                "row": 2,
                "name": "Renamed Laptop",
                "type": Asset.AssetType.LAPTOP,
                "serial_number": "IMPORT-001",
                "status": Asset.AssetStatus.ASSIGNED,
                "last_maintenance_date": None,
            }
        ]
        response = self.client.post(
            reverse("import_asset_csv_execute"),
            data=json.dumps(
                {
                    "rows": rows,
                    "mode": "merge",
                    "resolutions": {"IMPORT-001": "replace"},
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.existing.refresh_from_db()
        self.assertEqual(self.existing.name, "Renamed Laptop")
        self.assertEqual(self.existing.status, Asset.AssetStatus.ASSIGNED)
        self.assertEqual(response.json()["updated"], 1)

    def test_execute_catalog_creates_named_directory(self):
        self.client.force_login(self.admin)
        rows = [
            {
                "row": 2,
                "name": "Catalog Laptop",
                "type": Asset.AssetType.LAPTOP,
                "serial_number": "CAT-001",
                "status": Asset.AssetStatus.AVAILABLE,
                "last_maintenance_date": None,
            }
        ]
        response = self.client.post(
            reverse("import_asset_csv_execute"),
            data=json.dumps(
                {
                    "rows": rows,
                    "mode": "catalog",
                    "catalog_name": "Legacy Spreadsheet",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        catalog = AssetCatalog.objects.get(name="Legacy Spreadsheet")
        self.assertEqual(catalog.assets.count(), 1)
        self.assertEqual(CatalogAsset.objects.filter(catalog=catalog).first().name, "Catalog Laptop")
        self.assertEqual(Asset.objects.count(), 1)
        self.assertEqual(payload["catalog"]["name"], "Legacy Spreadsheet")
        self.assertEqual(payload["catalog"]["assets"][0]["name"], "Catalog Laptop")

    def test_asset_list_renders_catalog_tables_above_all_assets(self):
        catalog = AssetCatalog.objects.create(name="Legacy Spreadsheet", created_by=self.admin)
        CatalogAsset.objects.create(
            catalog=catalog,
            name="Catalog Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="CAT-001",
            status=Asset.AssetStatus.AVAILABLE,
        )
        self.client.force_login(self.admin)

        response = self.client.get(reverse("asset_list"))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertIn('id="asset-catalog-sections"', content)
        self.assertIn("Legacy Spreadsheet", content)
        self.assertIn("Catalog Laptop", content)
        self.assertLess(content.index("Legacy Spreadsheet"), content.index("All Assets"))

    def test_import_endpoints_reject_non_admin(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse("import_asset_csv_validate"),
            {"file": self._csv_file("Name,Type,Serial Number\nA,Laptop,S1\n")},
        )
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
        self.assertContains(response, "asset-sections-mount")

        job = enqueue_job(self.user, BackgroundJob.JobType.ASSET_SECTIONS, force=True)
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.Status.COMPLETED)
        sections = job.result
        self.assertIn("assigned_asset_rows", sections)
        self.assertIn("laptop_rows", sections)

    def test_asset_list_sections_include_expected_return_date(self):
        Assignment.objects.create(
            asset=self.asset,
            employee=self.employee,
            expected_return_date=timezone.localdate() + datetime.timedelta(days=21),
        )
        self.asset.status = Asset.AssetStatus.ASSIGNED
        self.asset.save(update_fields=["status"])
        self.client.force_login(self.user)

        response = self.client.get(reverse("asset_list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "asset-sections-mount")

        job = enqueue_job(self.user, BackgroundJob.JobType.ASSET_SECTIONS, force=True)
        job.refresh_from_db()
        self.assertEqual(job.status, BackgroundJob.Status.COMPLETED)
        assigned_rows = job.result["assigned_asset_rows"]
        self.assertEqual(len(assigned_rows), 1)
        self.assertEqual(assigned_rows[0]["assignee"], "API Employee")
        self.assertIsNotNone(assigned_rows[0]["expected_return_date"])

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

    def test_admin_can_create_open_maintenance_log_and_mark_asset_under_maintenance(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("maintenance_log_add", kwargs={"asset_pk": self.asset.pk}),
            data=open_maintenance_payload(),
        )

        self.assertRedirects(response, reverse("asset_detail", kwargs={"pk": self.asset.pk}))
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, Asset.AssetStatus.UNDER_MAINTENANCE)
        log = MaintenanceLog.objects.get(asset=self.asset)
        self.assertEqual(log.repair_shop, "TechFix Repairs")
        self.assertEqual(log.worker_contact, "grace@techfix.example")
        self.assertFalse(log.resolved)

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


class DurationFormattingTests(TestCase):
    def test_format_duration_since_uses_months_and_days(self):
        start = timezone.localdate() - datetime.timedelta(days=337)
        duration = format_duration_since(start)

        self.assertIn("month", duration)
        self.assertTrue("wk" in duration or "day" in duration)

    def test_format_duration_until_returns_due_today_for_same_day(self):
        self.assertEqual(
            format_duration_until(timezone.localdate()),
            "Due today",
        )


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
