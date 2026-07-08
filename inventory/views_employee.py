import datetime
import json
import logging

from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.password_validation import validate_password
from django.db.utils import DatabaseError, OperationalError, ProgrammingError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views import View
from django.views.generic import DetailView, ListView, TemplateView

from .access import get_employee_for_user
from .http import parse_request_data
from .models import Asset, Assignment, EmployeeNotification, MaintenanceLog
from .services.employee_notifications import (
    create_employee_notification,
    get_employee_notifications,
    get_employee_unread_notification_count,
    serialize_employee_notification,
)

logger = logging.getLogger(__name__)


class EmployeePortalAccessMixin(LoginRequiredMixin):
    employee_access_denied_message = "You do not have employee access."

    def dispatch(self, request, *args, **kwargs):
        self.employee = get_employee_for_user(request.user)
        if self.employee is None and request.user.is_authenticated:
            messages.error(request, self.employee_access_denied_message)
            return redirect("dashboard")
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(
            {
                "employee": self.employee,
                "employee_notifications": get_employee_notifications(self.employee),
                "recent_notifications": get_employee_notifications(self.employee),
                "unread_notifications": get_employee_unread_notification_count(
                    self.employee
                ),
            }
        )
        return context


class EmployeePortalJSONAccessMixin(LoginRequiredMixin):
    def dispatch(self, request, *args, **kwargs):
        self.employee = get_employee_for_user(request.user)
        if self.employee is None and request.user.is_authenticated:
            return JsonResponse(
                {"success": False, "message": "Unauthorized"},
                status=403,
            )
        return super().dispatch(request, *args, **kwargs)


class EmployeeDashboardView(EmployeePortalAccessMixin, TemplateView):
    template_name = "inventory/employee/dashboard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        employee = self.employee
        current_hour = timezone.localtime().hour
        if current_hour < 12:
            greeting = "Good Morning"
        elif current_hour < 17:
            greeting = "Good Afternoon"
        else:
            greeting = "Good Evening"

        active_assignments = Assignment.objects.filter(
            employee=employee,
            date_returned__isnull=True,
        ).select_related("asset")
        pending_confirmations = active_assignments.filter(confirmed_by_employee=False)
        due_assets = active_assignments.filter(
            date_assigned__lte=timezone.now() - datetime.timedelta(days=30)
        )
        assignment_history = (
            Assignment.objects.filter(employee=employee)
            .select_related("asset")
            .order_by("-date_assigned")
        )

        context.update(
            {
                "greeting": greeting,
                "active_assets": active_assignments.count(),
                "active_assignments": active_assignments,
                "returnable_assignments": active_assignments,
                "assignment_history": assignment_history,
                "pending_confirmations": pending_confirmations,
                "pending_assets": pending_confirmations.count(),
                "due_assets": due_assets.count(),
                "total_assets": active_assignments.count(),
                "confirmed_assets": active_assignments.filter(
                    confirmed_by_employee=True
                ).count(),
            }
        )
        return context


class EmployeeAssetsView(EmployeePortalAccessMixin, ListView):
    template_name = "inventory/employee/assets.html"
    context_object_name = "assignments"
    paginate_by = 10

    def get_queryset(self):
        return (
            Assignment.objects.filter(employee=self.employee)
            .select_related("asset")
            .order_by("-date_assigned")
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        assignments = self.get_queryset()
        context.update(
            {
                "total_assets": assignments.count(),
                "active_assets": assignments.filter(date_returned__isnull=True).count(),
                "pending_assets": assignments.filter(
                    date_returned__isnull=True,
                    confirmed_by_employee=False,
                ).count(),
                "returned_assets": assignments.filter(
                    date_returned__isnull=False
                ).count(),
            }
        )
        return context


class EmployeeAssetDetailView(EmployeePortalAccessMixin, DetailView):
    template_name = "inventory/employee/asset_detail.html"
    context_object_name = "assignment"

    def get_queryset(self):
        return Assignment.objects.filter(employee=self.employee).select_related("asset")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        assignment = self.get_object()
        context["asset"] = assignment.asset

        if assignment.confirmed_by_employee:
            context["status_display"] = "Confirmed"
            context["status_class"] = "success"
        elif assignment.date_returned:
            context["status_display"] = "Returned"
            context["status_class"] = "secondary"
        else:
            context["status_display"] = "Pending Confirmation"
            context["status_class"] = "warning"

        return context


class EmployeeConfirmAssetView(EmployeePortalJSONAccessMixin, View):
    def post(self, request, pk):
        assignment = get_object_or_404(
            Assignment.objects.filter(employee=self.employee),
            pk=pk,
            date_returned__isnull=True,
        )

        if assignment.confirmed_by_employee:
            return JsonResponse(
                {"success": False, "message": "Asset already confirmed"},
                status=400,
            )

        assignment.confirmed_by_employee = True
        assignment.confirmed_at = timezone.now()
        assignment.save(update_fields=["confirmed_by_employee", "confirmed_at"])
        return JsonResponse({"success": True, "message": "Asset confirmed successfully"})


class EmployeeReportIssueView(EmployeePortalJSONAccessMixin, View):
    def post(self, request, pk):
        assignment = get_object_or_404(
            Assignment.objects.filter(employee=self.employee),
            pk=pk,
        )

        issue_type = request.POST.get("issue_type")
        issue_description = request.POST.get("issue_description")

        MaintenanceLog.objects.create(
            asset=assignment.asset,
            issue_description=(
                f"[Reported by Employee] {issue_type}: {issue_description}"
            ),
            technician=request.user.get_full_name() or request.user.username,
            date=timezone.localdate(),
            resolved=False,
            created_by=request.user,
        )

        messages.success(request, "Issue reported successfully. We will look into it.")
        return redirect("employee_asset_detail", pk=assignment.pk)


class EmployeeMaintenanceRequestView(EmployeePortalJSONAccessMixin, View):
    def post(self, request, pk):
        assignment = get_object_or_404(
            Assignment.objects.filter(employee=self.employee),
            pk=pk,
        )

        payload = parse_request_data(request) or {}
        maintenance_type = payload.get("maintenance_type") or "General"
        description = (
            payload.get("description")
            or "Maintenance requested via employee portal"
        )

        MaintenanceLog.objects.create(
            asset=assignment.asset,
            issue_description=f"[Maintenance Request] {maintenance_type}: {description}",
            technician=request.user.get_full_name() or request.user.username,
            date=timezone.localdate(),
            resolved=False,
            created_by=request.user,
        )

        if request.content_type.startswith("application/json"):
            return JsonResponse(
                {
                    "success": True,
                    "message": "Maintenance request submitted successfully.",
                }
            )

        messages.success(request, "Maintenance request submitted successfully.")
        return redirect("employee_asset_detail", pk=assignment.pk)


class EmployeeReturnRequestView(EmployeePortalJSONAccessMixin, View):
    def post(self, request, pk):
        assignment = get_object_or_404(
            Assignment.objects.filter(employee=self.employee),
            pk=pk,
            date_returned__isnull=True,
        )

        assignment.date_returned = timezone.now()
        assignment.save()

        asset = assignment.asset
        asset.status = Asset.AssetStatus.AVAILABLE
        asset.save(update_fields=["status"])

        messages.success(request, "Asset returned successfully.")
        return JsonResponse({"success": True, "message": "Asset returned successfully"})


class EmployeeMarkNotificationReadView(EmployeePortalJSONAccessMixin, View):
    def post(self, request, pk):
        try:
            notification = get_object_or_404(
                EmployeeNotification,
                pk=pk,
                employee=self.employee,
            )
            notification.read = True
            notification.save(update_fields=["read"])
        except (DatabaseError, OperationalError, ProgrammingError):
            logger.exception(
                "Unable to mark employee notification read for employee_id=%s",
                self.employee.pk,
            )
            return JsonResponse(
                {"success": False, "message": "Notifications are temporarily unavailable."},
                status=503,
            )
        return JsonResponse(
            {
                "success": True,
                "unread_count": get_employee_unread_notification_count(self.employee),
            }
        )


class EmployeeMarkAllNotificationsReadView(EmployeePortalJSONAccessMixin, View):
    def post(self, request):
        try:
            self.employee.notifications.filter(read=False).update(read=True)
        except (DatabaseError, OperationalError, ProgrammingError):
            logger.exception(
                "Unable to mark all employee notifications read for employee_id=%s",
                self.employee.pk,
            )
            return JsonResponse(
                {"success": False, "message": "Notifications are temporarily unavailable."},
                status=503,
            )
        return JsonResponse({"success": True, "unread_count": 0})


class EmployeeSettingsView(EmployeePortalAccessMixin, TemplateView):
    template_name = "inventory/employee/settings.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        assignments = Assignment.objects.filter(employee=self.employee)
        context.update(
            {
                "employee_total_assets": assignments.count(),
                "employee_confirmed_assets": assignments.filter(
                    confirmed_by_employee=True
                ).count(),
                "employee_pending_assets": assignments.filter(
                    date_returned__isnull=True,
                    confirmed_by_employee=False,
                ).count(),
                "employee_returned_assets": assignments.filter(
                    date_returned__isnull=False
                ).count(),
            }
        )
        return context


class EmployeePasswordChangeView(EmployeePortalJSONAccessMixin, View):
    def post(self, request):
        try:
            payload = json.loads(request.body.decode("utf-8")) if request.body else {}
        except json.JSONDecodeError:
            return JsonResponse(
                {"success": False, "message": "Invalid request data."},
                status=400,
            )

        new_password = payload.get("new_password", "")
        confirm_password = payload.get("confirm_password", "")

        if not new_password or not confirm_password:
            return JsonResponse(
                {"success": False, "message": "Enter and confirm your new password."},
                status=400,
            )

        if new_password != confirm_password:
            return JsonResponse(
                {"success": False, "message": "Passwords do not match."},
                status=400,
            )

        try:
            validate_password(new_password, user=request.user)
        except Exception as error:
            messages_list = getattr(error, "messages", [str(error)])
            return JsonResponse(
                {"success": False, "message": " ".join(messages_list)},
                status=400,
            )

        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)
        notification = create_employee_notification(
            self.employee,
            notification_type=EmployeeNotification.NotificationType.SUCCESS,
            title="Password Changed",
            message="Your password was changed successfully.",
        )

        return JsonResponse(
            {
                "success": True,
                "message": "Password changed successfully.",
                "notification": (
                    serialize_employee_notification(notification)
                    if notification is not None
                    else None
                ),
                "unread_count": get_employee_unread_notification_count(self.employee),
            }
        )
