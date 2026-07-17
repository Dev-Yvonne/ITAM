from ._helpers import *

class FrontendAPIBridgeTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="api-viewer",
            email="api-viewer@example.com",
            password="test-pass-12345",
            is_staff=True,
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

    def test_asset_api_list_rejects_non_admin_user(self):
        non_admin = get_user_model().objects.create_user(
            username="api-non-admin",
            email="api-non-admin@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(non_admin)

        response = self.client.get(reverse("api_asset_list"))

        self.assertEqual(response.status_code, 403)

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
        from inventory.models import AdminNotification
        self.assertTrue(
            AdminNotification.objects.filter(
                user=self.admin,
                title="New Asset Added",
            ).exists()
        )

    def test_asset_api_rejects_invalid_json_body(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("api_asset_list"),
            data="{not valid json",
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Invalid JSON.")

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
        notification = EmployeeNotification.objects.get(employee=self.employee)
        self.assertEqual(notification.title, "Asset Returned")
        self.assertFalse(notification.read)
        from inventory.models import AdminNotification
        self.assertTrue(AdminNotification.objects.filter(user=self.admin, title="Asset Returned").exists())

    def test_asset_api_assign_notifies_admin_and_employee(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("api_asset_assign", kwargs={"pk": self.asset.pk}),
            data={"employee_id": self.employee.pk},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        notification = EmployeeNotification.objects.get(employee=self.employee)
        self.assertEqual(notification.title, "Asset Assigned")
        from inventory.models import AdminNotification
        self.assertTrue(AdminNotification.objects.filter(user=self.admin, title="Asset Assigned").exists())

    def test_notification_api_returns_session_notifications_after_assign(self):
        self.client.force_login(self.admin)

        self.client.post(
            reverse("api_asset_assign", kwargs={"pk": self.asset.pk}),
            data={"employee_id": self.employee.pk},
            content_type="application/json",
        )

        response = self.client.get(reverse("api_notifications"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertGreaterEqual(payload["unread_count"], 1)
        self.assertTrue(any(item["title"] == "Asset Assigned" for item in payload["notifications"]))

    def test_bulk_delete_api_deletes_assets(self):
        second_asset = Asset.objects.create(
            name="Bulk Delete Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="BULK-DEL-1",
            status=Asset.AssetStatus.AVAILABLE,
        )
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("api_asset_bulk_delete"),
            data={"ids": [self.asset.pk, second_asset.pk]},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(set(payload["deleted"]), {self.asset.pk, second_asset.pk})
        self.assertEqual(payload["failed"], [])
        self.assertFalse(Asset.objects.filter(pk__in=[self.asset.pk, second_asset.pk]).exists())

    def test_bulk_delete_api_rejects_non_admin(self):
        non_admin = get_user_model().objects.create_user(
            username="bulk-delete-non-admin",
            email="bulk-delete-non-admin@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(non_admin)

        response = self.client.post(
            reverse("api_asset_bulk_delete"),
            data={"ids": [self.asset.pk]},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(Asset.objects.filter(pk=self.asset.pk).exists())

    def test_bulk_delete_api_reports_protected_assets(self):
        Assignment.objects.create(asset=self.asset, employee=self.employee)
        self.client.force_login(self.admin)

        response = self.client.post(
            reverse("api_asset_bulk_delete"),
            data={"ids": [self.asset.pk]},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["deleted"], [])
        self.assertEqual(len(payload["failed"]), 1)
        self.assertEqual(payload["failed"][0]["id"], self.asset.pk)
        self.assertIn("assignment history", payload["failed"][0]["detail"])
        self.assertTrue(Asset.objects.filter(pk=self.asset.pk).exists())

    def test_asset_list_shows_bulk_select_for_admin(self):
        self.client.force_login(self.admin)

        response = self.client.get(reverse("asset_list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'class="asset-bulk-checkbox"')
        self.assertContains(response, 'id="asset-bulk-action-bar"', count=0)
        self.assertContains(response, "asset-bulk-select.js")
        self.assertContains(response, "asset-row-menu.js")
        self.assertContains(response, "fa-ellipsis-v")
        self.assertContains(response, 'class="actions-col"')
        self.assertContains(response, 'data-action="view"')

    def test_employee_list_shows_row_actions_menu(self):
        self.client.force_login(self.admin)

        response = self.client.get(reverse("employee_list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "table-row-menu.js")
        self.assertContains(response, "fa-ellipsis-v")
        self.assertContains(response, 'class="table-row-menu"')
        self.assertContains(response, 'data-menu-type="employee"')
        self.assertContains(response, 'data-action="edit"')
        self.assertContains(response, 'data-action="delete"')
        self.assertNotContains(response, 'btn btn-sm btn-danger">Delete</a>')

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
        from inventory.models import AdminNotification
        self.assertTrue(
            AdminNotification.objects.filter(
                user=self.admin,
                title="New Employee Added",
            ).exists()
        )

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


