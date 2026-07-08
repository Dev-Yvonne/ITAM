import json

from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.serializers.json import DjangoJSONEncoder
from django.http import JsonResponse
from django.views import View
from django.views.generic import TemplateView

from .services.avatars import (
    AvatarStorageError,
    AvatarValidationError,
    get_user_avatar_urls,
    save_user_avatar,
    validate_avatar_upload,
)
from .services.profile_stats import get_user_account_statistics
from .services.notifications import (
    add_session_notification,
    get_display_notifications,
    get_unread_count,
    mark_all_notifications_read,
    mark_notification_read,
)


class NotificationListView(LoginRequiredMixin, TemplateView):
    template_name = "inventory/notifications.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        mark_all_notifications_read(self.request)
        context["notifications"] = get_display_notifications(self.request)
        context["unread_count"] = 0
        return context


class NotificationAPIView(LoginRequiredMixin, View):
    def get(self, request):
        return JsonResponse(
            {
                "notifications": get_display_notifications(request),
                "unread_count": get_unread_count(request),
            },
            safe=False,
            encoder=DjangoJSONEncoder,
        )

    def post(self, request):
        try:
            data = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        notification = add_session_notification(
            request,
            notification_type=data.get("type", "info"),
            title=data.get("title", "Notification"),
            message=data.get("message", ""),
            link=data.get("link"),
            source=data.get("source", "system"),
        )
        return JsonResponse({"success": True, "notification": notification})


class NotificationMarkReadView(LoginRequiredMixin, View):
    def post(self, request, pk):
        mark_notification_read(request, pk)
        return JsonResponse({"success": True})


class NotificationMarkAllReadView(LoginRequiredMixin, View):
    def post(self, request):
        mark_all_notifications_read(request)
        return JsonResponse({"success": True})


class ReportsView(LoginRequiredMixin, TemplateView):
    template_name = "inventory/reports.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["async_reports"] = True
        context.update(
            {
                "total_assets": "—",
                "assigned_assets": "—",
                "available_assets": "—",
                "maintenance_assets": "—",
                "total_employees": "—",
                "utilization_rate": "—",
                "overdue_count": "—",
                "asset_health_rate": "—",
                "total_assignments": "—",
                "asset_avg_age": "—",
                "asset_by_status": "{}",
                "asset_by_type": "{}",
                "monthly_assets": "[]",
                "maintenance_by_month": "[]",
                "top_assets_data": "[]",
                "department_counts": "{}",
            }
        )
        return context


class SettingsView(LoginRequiredMixin, TemplateView):
    template_name = "inventory/settings.html"


class ProfileView(LoginRequiredMixin, TemplateView):
    template_name = "inventory/profile.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["user"] = self.request.user
        context["user_full_name"] = (
            self.request.user.get_full_name() or self.request.user.username
        )
        context["user_email"] = self.request.user.email
        context["user_date_joined"] = self.request.user.date_joined
        context["user_last_login"] = self.request.user.last_login
        context["is_staff"] = self.request.user.is_staff
        context["is_superuser"] = self.request.user.is_superuser
        avatar_urls = get_user_avatar_urls(self.request.user)
        context["user_avatar_url"] = avatar_urls["large"]
        context["account_stats"] = get_user_account_statistics(self.request.user)
        return context


class ProfileAvatarUploadView(LoginRequiredMixin, View):
    def post(self, request):
        uploaded = request.FILES.get("avatar")
        try:
            validate_avatar_upload(uploaded)
            avatar_url = save_user_avatar(request.user, uploaded)
        except AvatarValidationError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
        except AvatarStorageError as exc:
            return JsonResponse({"detail": str(exc)}, status=503)

        if avatar_url.startswith("/"):
            avatar_url = request.build_absolute_uri(avatar_url)
        return JsonResponse({"success": True, "avatar_url": avatar_url})
