from ._helpers import *

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

    def test_employee_can_mark_notification_read(self):
        notification = EmployeeNotification.objects.create(
            employee=self.employee,
            type=EmployeeNotification.NotificationType.INFO,
            title="Asset Assigned",
            message="Please confirm receipt.",
            link=reverse("employee_dashboard"),
        )
        self.client.force_login(self.employee_user)

        response = self.client.post(
            reverse(
                "employee_mark_notification_read",
                kwargs={"pk": notification.pk},
            )
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertEqual(response.json()["unread_count"], 0)
        notification.refresh_from_db()
        self.assertTrue(notification.read)

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

    def test_employee_maintenance_request_returns_json(self):
        self.client.force_login(self.employee_user)

        response = self.client.post(
            reverse("employee_maintenance_request", kwargs={"pk": self.assignment.pk}),
            data=json.dumps(
                {
                    "maintenance_type": "Hardware",
                    "description": "Keyboard is sticking.",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertIn("submitted", payload["message"].lower())
        self.assertEqual(MaintenanceLog.objects.filter(asset=self.asset).count(), 1)


MINIMAL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\x00\x01\x00\x00\x05\x00"
    b"\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@override_settings(
    MEDIA_ROOT=settings.BASE_DIR / "test_media",
    SUPABASE_URL="",
    SUPABASE_SERVICE_ROLE_KEY="",
    IS_VERCEL=False,
)


class ProfileAvatarUploadTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="avatar-user",
            email="avatar@example.com",
            password="test-pass-12345",
            first_name="Avatar",
        )
        self.client.force_login(self.user)

    def test_upload_avatar_persists_and_returns_url(self):
        image = SimpleUploadedFile("avatar.png", MINIMAL_PNG, content_type="image/png")

        response = self.client.post(
            reverse("api_profile_avatar"),
            data={"avatar": image},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertIn("/media/avatars/", payload["avatar_url"])

        profile = UserProfile.objects.get(user=self.user)
        self.assertEqual(profile.avatar_url, "/media/avatars/user_{}.png".format(self.user.id))
        self.assertTrue((settings.BASE_DIR / "test_media" / "avatars" / f"user_{self.user.id}.png").exists())

    def test_upload_rejects_non_image_content_type(self):
        document = SimpleUploadedFile(
            "notes.txt",
            b"not an image",
            content_type="text/plain",
        )

        response = self.client.post(
            reverse("api_profile_avatar"),
            data={"avatar": document},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("JPEG", response.json()["detail"])

    def test_profile_page_uses_uploaded_avatar(self):
        profile = UserProfile.objects.create(
            user=self.user,
            avatar_url="/media/avatars/user_{}.png".format(self.user.id),
        )

        response = self.client.get(reverse("profile"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, profile.avatar_url)

    def test_upload_requires_supabase_configuration_on_vercel(self):
        image = SimpleUploadedFile("avatar.png", MINIMAL_PNG, content_type="image/png")

        with override_settings(IS_VERCEL=True, SUPABASE_URL="", SUPABASE_SERVICE_ROLE_KEY=""):
            response = self.client.post(
                reverse("api_profile_avatar"),
                data={"avatar": image},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("SUPABASE_URL", response.json()["detail"])

    def test_upload_uses_supabase_when_configured(self):
        image = SimpleUploadedFile("avatar.png", MINIMAL_PNG, content_type="image/png")
        supabase_url = "https://example.supabase.co/storage/v1/object/public/avatars/user_{}.png".format(
            self.user.id
        )

        with override_settings(
            SUPABASE_URL="https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY="test-service-role",
            IS_VERCEL=False,
        ):
            with self.settings(SUPABASE_AVATAR_BUCKET="avatars"):
                from unittest.mock import patch

                with patch(
                    "inventory.services.avatars.supabase_storage.upload_avatar",
                    return_value=supabase_url,
                ) as upload_mock:
                    response = self.client.post(
                        reverse("api_profile_avatar"),
                        data={"avatar": image},
                    )

        self.assertEqual(response.status_code, 200)
        upload_mock.assert_called_once()
        self.assertTrue(response.json()["avatar_url"].startswith(supabase_url))
        profile = UserProfile.objects.get(user=self.user)
        self.assertEqual(profile.avatar_url, supabase_url)

    def test_upload_requires_authentication(self):
        self.client.logout()
        image = SimpleUploadedFile("avatar.png", MINIMAL_PNG, content_type="image/png")

        response = self.client.post(
            reverse("api_profile_avatar"),
            data={"avatar": image},
        )

        self.assertEqual(response.status_code, 302)
        self.assertIn("/login/", response.url)
