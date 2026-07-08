from ._helpers import *

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

    def test_logout_route_redirects_to_login(self):
        user = get_user_model().objects.create_user(
            username="logout-user",
            email="logout-user@example.com",
            password="test-pass-12345",
        )
        self.client.force_login(user)

        response = self.client.post(reverse("logout"))

        self.assertRedirects(response, reverse("login"))
        self.assertNotIn("_auth_user_id", self.client.session)

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

    def test_login_without_remember_me_still_uses_persistent_session(self):
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
        self.assertFalse(self.client.session.get_expire_at_browser_close())
        self.assertEqual(
            self.client.session.get_expiry_age(),
            settings.SESSION_COOKIE_AGE,
        )




class PasswordResetFlowTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="reset-user",
            email="reset-user@example.com",
            password="OldPass12345!",
        )

    def test_password_reset_email_step_renders(self):
        response = self.client.get(reverse("password_reset"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "inventory/auth.html")
        self.assertEqual(response.context["page"], "password_reset")

    def test_password_reset_rejects_unknown_email(self):
        response = self.client.post(
            reverse("password_reset"),
            data={"email": "missing@example.com"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "No account found with this email address.")

    def test_password_reset_verify_requires_email_session(self):
        response = self.client.get(reverse("password_reset_verify"))

        self.assertRedirects(response, reverse("password_reset"))

    def test_password_reset_verify_rejects_wrong_answer(self):
        session = self.client.session
        session["password_reset_email"] = self.user.email
        session.save()

        response = self.client.post(
            reverse("password_reset_verify"),
            data={"security_answer": "WrongAnswer"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Incorrect answer")

    def test_password_reset_flow_accepts_eventhub_answer_case_insensitive(self):
        for answer in ("EventHub", "eventhub", "EVENTHUB"):
            with self.subTest(answer=answer):
                client = Client()
                client.post(
                    reverse("password_reset"),
                    data={"email": self.user.email},
                )
                response = client.post(
                    reverse("password_reset_verify"),
                    data={"security_answer": answer},
                )
                self.assertRedirects(response, reverse("password_reset_set"))

    def test_password_reset_set_updates_password_and_redirects_login(self):
        self.client.post(
            reverse("password_reset"),
            data={"email": self.user.email},
        )
        self.client.post(
            reverse("password_reset_verify"),
            data={"security_answer": "EventHub"},
        )

        response = self.client.post(
            reverse("password_reset_set"),
            data={
                "new_password": "NewStrongPass987!",
                "confirm_password": "NewStrongPass987!",
            },
        )

        self.assertRedirects(response, reverse("login"))
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewStrongPass987!"))

        login_response = self.client.post(
            reverse("login"),
            data={
                "username": self.user.email,
                "password": "NewStrongPass987!",
            },
        )
        self.assertRedirects(login_response, reverse("dashboard"))

    def test_password_reset_set_requires_verification(self):
        session = self.client.session
        session["password_reset_email"] = self.user.email
        session.save()

        response = self.client.get(reverse("password_reset_set"))

        self.assertRedirects(response, reverse("password_reset_verify"))




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


