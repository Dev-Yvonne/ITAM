from ._helpers import *

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
        self.assertIn("ecosystem_map", detail.json()["result"])

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




class EcosystemMapTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            username="map-admin",
            email="map-admin@example.com",
            password="test-pass-12345",
            is_staff=True,
        )
        self.employee = Employee.objects.create(
            name="Map Employee",
            department=Employee.Department.TECHNICAL_CORE_PROGRAMME,
            email="map.employee@example.com",
        )
        self.asset = Asset.objects.create(
            name="Map Laptop",
            type=Asset.AssetType.LAPTOP,
            serial_number="MAP-001",
            status=Asset.AssetStatus.AVAILABLE,
        )

    def test_build_ecosystem_map_includes_core_nodes(self):
        graph = build_ecosystem_map(self.admin)

        node_ids = {node["id"] for node in graph["nodes"]}
        self.assertIn("hub-itam", node_ids)
        self.assertIn("admin-user", node_ids)
        self.assertIn("view-assets", node_ids)
        self.assertIn("table-asset", node_ids)
        self.assertGreaterEqual(len(graph["edges"]), 10)

    def test_build_ecosystem_map_includes_assignment_relationships(self):
        Assignment.objects.create(asset=self.asset, employee=self.employee)
        self.asset.status = Asset.AssetStatus.ASSIGNED
        self.asset.save(update_fields=["status"])

        graph = build_ecosystem_map(self.admin)
        labels = {edge["label"] for edge in graph["edges"]}

        self.assertIn("assigned to", labels)
        self.assertTrue(any(node["id"] == f"employee-{self.employee.pk}" for node in graph["nodes"]))
        self.assertTrue(any(node["id"] == f"asset-{self.asset.pk}" for node in graph["nodes"]))

    def test_reports_job_returns_ecosystem_map(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            reverse("background_job_create"),
            data=json.dumps({"job_type": "reports"}),
            content_type="application/json",
        )
        job_id = response.json()["id"]
        detail = self.client.get(reverse("background_job_detail", kwargs={"job_id": job_id}))
        payload = detail.json()["result"]
        self.assertIn("ecosystem_map", payload)
        graph = json.loads(payload["ecosystem_map"])
        self.assertIn("nodes", graph)
        self.assertIn("edges", graph)

    def test_reports_page_embeds_ecosystem_map(self):
        self.client.force_login(self.admin)
        response = self.client.get(reverse("reports"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "ecosystem-map-root")
        self.assertContains(response, "report-ecosystem-map.js")




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


