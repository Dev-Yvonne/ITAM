import csv
import datetime
import json
import logging

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Max, OuterRef, Q, Subquery
from django.db.models.deletion import ProtectedError
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.views import View
from django.views.generic import (
    CreateView,
    DeleteView,
    DetailView,
    FormView,
    ListView,
    TemplateView,
    UpdateView,
)

from .access import user_has_admin_access
from .http import parse_request_data
from .forms import (
    AssetForm,
    AssignmentForm,
    EmployeeCreateForm,
    EmployeeForm,
    MaintenanceLogForm,
)
from .models import Asset, AssetCatalog, Assignment, BackgroundJob, Employee, EmployeeNotification, MaintenanceLog
from .services.assets import get_asset_list_sections
from .services.background_jobs import _serialize_asset_sections
from .services.background_jobs import enqueue_job, serialize_job
from .services.asset_import import (
    CSVImportError,
    detect_serial_conflicts,
    execute_import,
    is_csv_upload,
    parse_csv_upload,
    serialize_catalog,
    serialize_import_rows,
    validate_csv_upload,
)
from .services.metrics import (
    get_overdue_assets_queryset,
    get_service_overdue_cutoff,
)
from .services.employee_notifications import create_employee_notification
from .services.notifications import add_session_notification
from .views_auth import (
    AuthLoginView,
    AuthLogoutView,
    ForgotPasswordEmailView,
    ForgotPasswordSetView,
    ForgotPasswordVerifyView,
)
from .views_employee import (
    EmployeeAssetDetailView,
    EmployeeAssetsView,
    EmployeeConfirmAssetView,
    EmployeeDashboardView,
    EmployeeMaintenanceRequestView,
    EmployeeMarkAllNotificationsReadView,
    EmployeeMarkNotificationReadView,
    EmployeePasswordChangeView,
    EmployeeReportIssueView,
    EmployeeReturnRequestView,
    EmployeeSettingsView,
)
from .views_extras import (
    NotificationAPIView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    ProfileAvatarUploadView,
    ProfileView,
    ReportsView,
    SettingsView,
)
from .views_background import (
    BackgroundJobCreateView,
    BackgroundJobDetailView,
    BackgroundJobDownloadView,
)


logger = logging.getLogger(__name__)


def error_bad_request(request, exception=None):
    return render(
        request,
        "inventory/error.html",
        {
            "status_code": 400,
            "title": "Bad Request",
            "message": "The request could not be processed. Please try again.",
        },
        status=400,
    )


def error_permission_denied(request, exception=None):
    return render(
        request,
        "inventory/error.html",
        {
            "status_code": 403,
            "title": "Access Denied",
            "message": "You do not have permission to access this page.",
        },
        status=403,
    )


def error_not_found(request, exception=None):
    return render(
        request,
        "inventory/error.html",
        {
            "status_code": 404,
            "title": "Page Not Found",
            "message": "The page you are looking for does not exist.",
        },
        status=404,
    )


def error_server_error(request):
    return render(
        request,
        "inventory/error.html",
        {
            "status_code": 500,
            "title": "Something Went Wrong",
            "message": "We hit an unexpected issue. Please try again shortly.",
        },
        status=500,
    )


# ============================================
# CUSTOM JSON ENCODER FOR DATETIME
# ============================================

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime.datetime):
            return obj.isoformat()
        return super().default(obj)


STATUS_TO_API = {
    Asset.AssetStatus.AVAILABLE: "available",
    Asset.AssetStatus.ASSIGNED: "assigned",
    Asset.AssetStatus.UNDER_MAINTENANCE: "maintenance",
}

STATUS_TO_MODEL = {
    "available": Asset.AssetStatus.AVAILABLE,
    "assigned": Asset.AssetStatus.ASSIGNED,
    "maintenance": Asset.AssetStatus.UNDER_MAINTENANCE,
    "under maintenance": Asset.AssetStatus.UNDER_MAINTENANCE,
    Asset.AssetStatus.AVAILABLE.lower(): Asset.AssetStatus.AVAILABLE,
    Asset.AssetStatus.ASSIGNED.lower(): Asset.AssetStatus.ASSIGNED,
    Asset.AssetStatus.UNDER_MAINTENANCE.lower(): Asset.AssetStatus.UNDER_MAINTENANCE,
}

TYPE_TO_MODEL = {
    "laptop": Asset.AssetType.LAPTOP,
    "printer": Asset.AssetType.PRINTER,
    "router": Asset.AssetType.ROUTER,
    "monitor": Asset.AssetType.MONITOR,
}


def normalize_asset_payload(payload: dict) -> dict:
    normalized = payload.copy()
    status = normalized.get("status")
    asset_type = normalized.get("type")

    if status:
        normalized["status"] = STATUS_TO_MODEL.get(str(status).lower(), status)
    else:
        normalized["status"] = Asset.AssetStatus.AVAILABLE

    if asset_type:
        normalized["type"] = TYPE_TO_MODEL.get(str(asset_type).lower(), asset_type)

    return normalized


def serialize_employee(employee: Employee) -> dict:
    active_assets = Asset.objects.filter(
        assignments__employee=employee,
        assignments__date_returned__isnull=True,
    ).distinct()
    return {
        "id": employee.id,
        "name": employee.name,
        "department": employee.department,
        "department_abbreviation": employee.department_abbreviation,
        "email": employee.email,
        "assigned_assets_count": active_assets.count(),
        "assigned_assets": [
            {
                "id": asset.id,
                "name": asset.name,
                "type": asset.type,
                "serial_number": asset.serial_number,
                "status": STATUS_TO_API.get(asset.status, asset.status),
                "status_label": asset.status,
            }
            for asset in active_assets
        ],
    }


def serialize_temporal(value):
    if not value:
        return None
    if hasattr(value, "hour"):
        return timezone.localtime(value).isoformat()
    return value.isoformat()


def serialize_asset(asset: Asset) -> dict:
    active_assignment = (
        asset.assignments.select_related("employee")
        .filter(date_returned__isnull=True)
        .first()
    )
    latest_assignment = asset.assignments.select_related("employee").first()
    date_assigned = (
        active_assignment.date_assigned
        if active_assignment
        else getattr(asset, "last_assigned_date", None)
    )
    date_returned = getattr(asset, "last_returned_date", None)

    if latest_assignment:
        date_assigned = latest_assignment.date_assigned
        date_returned = latest_assignment.date_returned

    return {
        "id": asset.id,
        "name": asset.name,
        "type": asset.type,
        "serial_number": asset.serial_number,
        "status": STATUS_TO_API.get(asset.status, asset.status),
        "status_label": asset.status,
        "assigned_employee": (
            serialize_employee(active_assignment.employee) if active_assignment else None
        ),
        "assignment_calendar": {
            "date_assigned": serialize_temporal(date_assigned),
            "date_returned": serialize_temporal(date_returned),
            "currently_assigned": active_assignment is not None,
        },
        "date_created": serialize_temporal(asset.date_created),
        "date_assigned": serialize_temporal(date_assigned),
        "date_returned": serialize_temporal(date_returned),
    }


def json_permission_denied() -> JsonResponse:
    return JsonResponse(
        {"detail": "You do not have permission to perform this action."},
        status=403,
    )


def json_invalid_body() -> JsonResponse:
    return JsonResponse({"detail": "Invalid JSON."}, status=400)


class CSVBuffer:
    def write(self, value):
        return value


class DashboardView(LoginRequiredMixin, TemplateView):
    template_name = "inventory/dashboard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        asset_list_url = reverse("asset_list")
        context["async_dashboard"] = True
        context["dashboard_stats"] = [
            {
                "label": "Total Assets",
                "value": "—",
                "trend": "Loading...",
                "css_class": "stat-total",
                "icon": "fa-boxes",
                "link": asset_list_url,
            },
            {
                "label": "Available",
                "value": "—",
                "trend": "Loading...",
                "css_class": "stat-available",
                "icon": "fa-check-circle",
                "link": f"{asset_list_url}#available-assets",
            },
            {
                "label": "Assigned",
                "value": "—",
                "trend": "Loading...",
                "css_class": "stat-assigned",
                "icon": "fa-user-check",
                "link": f"{asset_list_url}#assigned-assets",
            },
            {
                "label": "Under Maintenance",
                "value": "—",
                "trend": "Loading...",
                "css_class": "stat-maintenance",
                "icon": "fa-tools",
                "link": f"{asset_list_url}#maintenance-assets",
            },
        ]
        context["utilization_rate"] = "—"
        context["employee_count"] = "—"
        context["asset_health_rate"] = "—"
        context["total_assignments"] = "—"
        context["overdue_assets_count"] = "—"
        context["overdue_assets"] = None
        return context


class AssetListView(LoginRequiredMixin, ListView):
    model = Asset
    template_name = "inventory/asset_list.html"
    context_object_name = "assets"
    paginate_by = 25

    def get_queryset(self):
        active_assignee = Assignment.objects.filter(
            asset=OuterRef("pk"),
            date_returned__isnull=True,
        ).values("employee__name")[:1]
        active_assignee_department = Assignment.objects.filter(
            asset=OuterRef("pk"),
            date_returned__isnull=True,
        ).values("employee__department")[:1]
        queryset = (
            Asset.objects.annotate(
                last_maintenance_date=Max("maintenance_logs__date"),
                last_assigned_date=Max("assignments__date_assigned"),
                last_returned_date=Max("assignments__date_returned"),
                assigned_employee_name=Subquery(active_assignee),
                assigned_employee_department=Subquery(active_assignee_department),
            )
            .all()
            .order_by("name", "serial_number")
        )
        asset_type = self.request.GET.get("type")
        status = self.request.GET.get("status")

        if asset_type:
            queryset = queryset.filter(
                type=TYPE_TO_MODEL.get(asset_type.lower(), asset_type)
            )
        if status:
            queryset = queryset.filter(
                status=STATUS_TO_MODEL.get(status.lower(), status)
            )

        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        serial_to_pk = dict(Asset.objects.values_list("serial_number", "pk"))
        context.update(
            {
                "selected_type": self.request.GET.get("type", ""),
                "selected_status": self.request.GET.get("status", ""),
                "overdue_cutoff": get_service_overdue_cutoff().date(),
                "user_is_admin": user_has_admin_access(self.request.user),
                "asset_catalogs": [
                    serialize_catalog(catalog, serial_to_pk=serial_to_pk)
                    for catalog in AssetCatalog.objects.prefetch_related("assets")
                    .order_by("-created_at", "name")
                ],
                "async_asset_sections": True,
                "asset_sections_payload": _serialize_asset_sections(
                    get_asset_list_sections()
                ),
            }
        )
        return context


class AssetDetailView(LoginRequiredMixin, DetailView):
    model = Asset
    template_name = "inventory/asset_detail.html"
    context_object_name = "asset"

    def get_queryset(self):
        return Asset.objects.annotate(
            last_maintenance_date=Max("maintenance_logs__date")
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        active_assignment = (
            self.object.assignments.select_related("employee")
            .filter(date_returned__isnull=True)
            .first()
        )
        context.update(
            {
                "active_assignment": active_assignment,
                "assignment_history": self.object.assignments.select_related(
                    "employee"
                ),
                "maintenance_logs": self.object.maintenance_logs.all(),
                "overdue_cutoff": get_service_overdue_cutoff().date(),
            }
        )
        return context


class AssetCreateView(LoginRequiredMixin, UserPassesTestMixin, CreateView):
    model = Asset
    form_class = AssetForm
    template_name = "inventory/asset_form.html"
    success_url = reverse_lazy("asset_list")

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["async_serial_suggestions"] = True
        return context
    
    def form_valid(self, form):
        response = super().form_valid(form)
        if self.object.created_by_id is None:
            self.object.created_by = self.request.user
            self.object.save(update_fields=["created_by"])
        add_session_notification(
            self.request,
            notification_type="success",
            title="New Asset Added",
            message=f'Asset "{self.object.name}" has been added to inventory.',
            link=reverse("asset_detail", kwargs={"pk": self.object.pk}),
            source="asset_creation",
        )
        
        messages.success(self.request, "Asset created successfully.")
        return response


class AssetUpdateView(LoginRequiredMixin, UserPassesTestMixin, UpdateView):
    model = Asset
    form_class = AssetForm
    template_name = "inventory/asset_form.html"
    success_url = reverse_lazy("asset_list")

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()
    
    def form_valid(self, form):
        response = super().form_valid(form)
        add_session_notification(
            self.request,
            notification_type="info",
            title="Asset Updated",
            message=f'Asset "{self.object.name}" has been updated.',
            link=reverse("asset_detail", kwargs={"pk": self.object.pk}),
            source="asset_update",
        )
        
        messages.success(self.request, "Asset updated successfully.")
        return response


class AssetDeleteView(LoginRequiredMixin, UserPassesTestMixin, DeleteView):
    model = Asset
    template_name = "inventory/asset_confirm_delete.html"
    success_url = reverse_lazy("asset_list")

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()


class EmployeeListView(LoginRequiredMixin, ListView):
    model = Employee
    template_name = "inventory/employee_list.html"
    context_object_name = "employees"
    paginate_by = 25


class EmployeeDetailView(LoginRequiredMixin, DetailView):
    model = Employee
    template_name = "inventory/employee_detail.html"
    context_object_name = "employee"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(
            {
                "active_assignments": self.object.assignments.select_related(
                    "asset"
                ).filter(date_returned__isnull=True),
                "assignment_history": self.object.assignments.select_related("asset"),
            }
        )
        return context


class EmployeeCreateView(LoginRequiredMixin, UserPassesTestMixin, CreateView):
    model = Employee
    form_class = EmployeeCreateForm
    template_name = "inventory/employee_form.html"
    success_url = reverse_lazy("employee_list")

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs.pop("instance", None)
        return kwargs
    
    def form_valid(self, form):
        self.object = form.save()
        add_session_notification(
            self.request,
            notification_type="success",
            title="New Employee Added",
            message=f'Employee "{self.object.name}" has been added to the system.',
            link=reverse("employee_list"),
            source="employee_creation",
        )
        
        messages.success(self.request, "Employee created successfully.")
        return redirect(self.get_success_url())


class EmployeeUpdateView(LoginRequiredMixin, UserPassesTestMixin, UpdateView):
    model = Employee
    form_class = EmployeeForm
    template_name = "inventory/employee_form.html"
    success_url = reverse_lazy("employee_list")

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()


class EmployeeDeleteView(LoginRequiredMixin, UserPassesTestMixin, DeleteView):
    model = Employee
    template_name = "inventory/employee_confirm_delete.html"
    success_url = reverse_lazy("employee_list")

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()


class AssignAssetView(LoginRequiredMixin, UserPassesTestMixin, FormView):
    template_name = "inventory/assign_asset.html"
    form_class = AssignmentForm
    success_url = reverse_lazy("asset_list")

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def dispatch(self, request, *args, **kwargs):
        self.asset = get_object_or_404(Asset, pk=kwargs["pk"])
        has_active_assignment = Assignment.objects.filter(
            asset=self.asset,
            date_returned__isnull=True,
        ).exists()
        if self.asset.status != Asset.AssetStatus.AVAILABLE or has_active_assignment:
            messages.error(
                request,
                "This asset is not available for assignment.",
            )
            return redirect("asset_detail", pk=self.asset.pk)
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["asset"] = self.asset
        return context

    def form_valid(self, form):
        with transaction.atomic():
            asset = Asset.objects.select_for_update().get(pk=self.asset.pk)

            has_active_assignment = Assignment.objects.select_for_update().filter(
                asset=asset,
                date_returned__isnull=True,
            ).exists()
            if asset.status != Asset.AssetStatus.AVAILABLE or has_active_assignment:
                form.add_error(None, "This asset is not available for assignment.")
                return self.form_invalid(form)

            assignment = form.save(commit=False)
            assignment.asset = asset
            assignment.created_by = self.request.user
            assignment.save()

            asset.status = Asset.AssetStatus.ASSIGNED
            asset.save(update_fields=["status"])
            add_session_notification(
                self.request,
                notification_type="success",
                title="Asset Assigned",
                message=(
                    f'Asset "{asset.name}" has been assigned to '
                    f"{assignment.employee.name}."
                ),
                link=reverse("asset_detail", kwargs={"pk": asset.pk}),
                source="asset_assignment",
            )
            create_employee_notification(
                assignment.employee,
                notification_type=EmployeeNotification.NotificationType.INFO,
                title="Asset Assigned",
                message=f'You have been assigned "{asset.name}". Please confirm receipt.',
                link=reverse("employee_dashboard"),
            )

        messages.success(self.request, "Asset assigned successfully.")
        return super().form_valid(form)


class ReturnAssetView(LoginRequiredMixin, UserPassesTestMixin, View):
    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def post(self, request, pk):
        with transaction.atomic():
            asset = get_object_or_404(Asset.objects.select_for_update(), pk=pk)
            assignment = (
                Assignment.objects.select_for_update()
                .filter(asset=asset, date_returned__isnull=True)
                .first()
            )

            if assignment is None:
                messages.error(request, "This asset does not have an active assignment.")
                return redirect("asset_detail", pk=asset.pk)

            assignment.date_returned = timezone.now()
            assignment.save(update_fields=["date_returned"])

            asset.status = Asset.AssetStatus.AVAILABLE
            asset.save(update_fields=["status"])
            employee = assignment.employee
            add_session_notification(
                request,
                notification_type="info",
                title="Asset Returned",
                message=f'Asset "{asset.name}" has been returned to inventory.',
                link=reverse("asset_detail", kwargs={"pk": asset.pk}),
                source="asset_return",
            )
            create_employee_notification(
                employee,
                notification_type=EmployeeNotification.NotificationType.INFO,
                title="Asset Returned",
                message=(
                    f'"{asset.name}" has been returned to inventory and '
                    "removed from your assigned assets."
                ),
                link=reverse("employee_dashboard"),
            )

        messages.success(
            request,
            "Asset returned successfully to inventory storage.",
        )
        return redirect("asset_detail", pk=asset.pk)


class CompleteMaintenanceView(LoginRequiredMixin, UserPassesTestMixin, View):
    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def post(self, request, pk):
        with transaction.atomic():
            asset = get_object_or_404(Asset.objects.select_for_update(), pk=pk)

            if asset.status != Asset.AssetStatus.UNDER_MAINTENANCE:
                messages.error(
                    request,
                    "Only assets under maintenance can be marked as maintenance done.",
                )
                return redirect("asset_detail", pk=asset.pk)

            technician = request.user.get_full_name() or request.user.username
            MaintenanceLog.objects.create(
                asset=asset,
                issue_description=(
                    "Maintenance completed and asset returned to available status."
                ),
                technician=technician,
                date=timezone.localdate(),
                resolved=True,
                created_by=request.user,
            )

            asset.status = Asset.AssetStatus.AVAILABLE
            asset.save(update_fields=["status"])
            add_session_notification(
                request,
                notification_type="success",
                title="Maintenance Completed",
                message=f'Maintenance for asset "{asset.name}" has been completed.',
                link=reverse("asset_detail", kwargs={"pk": asset.pk}),
                source="maintenance_complete",
            )

        messages.success(
            request,
            "Maintenance marked as done. Asset is now available.",
        )
        return redirect("asset_detail", pk=asset.pk)


class MaintenanceLogCreateView(LoginRequiredMixin, UserPassesTestMixin, CreateView):
    model = MaintenanceLog
    form_class = MaintenanceLogForm
    template_name = "inventory/maintenance_log_form.html"

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def dispatch(self, request, *args, **kwargs):
        self.asset = get_object_or_404(Asset, pk=kwargs["asset_pk"])
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["asset"] = self.asset
        context["page_title"] = "Add Maintenance Log"
        return context

    def form_valid(self, form):
        form.instance.asset = self.asset
        form.instance.created_by = self.request.user
        response = super().form_valid(form)
        if not form.instance.resolved:
            self.asset.status = Asset.AssetStatus.UNDER_MAINTENANCE
            self.asset.save(update_fields=["status"])
        messages.success(self.request, "Maintenance log added successfully.")
        return response

    def get_success_url(self):
        return reverse("asset_detail", kwargs={"pk": self.asset.pk})


class MaintenanceLogUpdateView(LoginRequiredMixin, UserPassesTestMixin, UpdateView):
    model = MaintenanceLog
    form_class = MaintenanceLogForm
    template_name = "inventory/maintenance_log_form.html"

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def get_queryset(self):
        return MaintenanceLog.objects.select_related("asset")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["asset"] = self.object.asset
        context["page_title"] = "Edit Maintenance Log"
        return context

    def form_valid(self, form):
        messages.success(self.request, "Maintenance log updated successfully.")
        return super().form_valid(form)

    def get_success_url(self):
        return reverse("asset_detail", kwargs={"pk": self.object.asset.pk})


class MaintenanceLogDeleteView(LoginRequiredMixin, UserPassesTestMixin, DeleteView):
    model = MaintenanceLog
    template_name = "inventory/maintenance_log_confirm_delete.html"

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def get_queryset(self):
        return MaintenanceLog.objects.select_related("asset")

    def form_valid(self, form):
        self.asset_pk = self.object.asset.pk
        messages.success(self.request, "Maintenance log deleted successfully.")
        return super().form_valid(form)

    def get_success_url(self):
        return reverse("asset_detail", kwargs={"pk": self.asset_pk})


class ExportAssetCSVView(LoginRequiredMixin, UserPassesTestMixin, View):
    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def get(self, request):
        threshold = getattr(settings, "BACKGROUND_JOB_CSV_ASYNC_MIN_ASSETS", 100)
        wants_async = request.GET.get("async") == "1"
        asset_count = Asset.objects.count()

        if wants_async or asset_count >= threshold:
            job = enqueue_job(
                request.user,
                BackgroundJob.JobType.CSV_EXPORT,
                force=request.GET.get("force") == "1",
            )
            if "application/json" in request.headers.get("Accept", ""):
                return JsonResponse(serialize_job(job), status=202)
            return JsonResponse(
                {
                    "detail": "Export started in background",
                    "job": serialize_job(job),
                },
                status=202,
            )

        response = StreamingHttpResponse(
            self.stream_asset_rows(),
            content_type="text/csv",
        )
        response["Content-Disposition"] = (
            'attachment; filename="itam_asset_report.csv"'
        )
        return response

    def stream_asset_rows(self):
        writer = csv.writer(CSVBuffer())
        yield writer.writerow(
            ["Name", "Type", "Serial Number", "Status", "Last Maintenance Date"]
        )

        queryset = Asset.objects.annotate(
            last_maintenance_date=Max("maintenance_logs__date")
        ).order_by("name", "serial_number")
        for asset in queryset.iterator(chunk_size=2000):
            yield writer.writerow(
                [
                    asset.name,
                    asset.type,
                    asset.serial_number,
                    asset.status,
                    asset.last_maintenance_date or "",
                ]
            )


AssetCSVExportView = ExportAssetCSVView


class ImportAssetCSVValidateView(LoginRequiredMixin, UserPassesTestMixin, View):
    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return JsonResponse({"detail": "No file uploaded."}, status=400)
        if not is_csv_upload(uploaded):
            return JsonResponse(
                {"detail": "The chosen file was not a CSV, Try again.", "code": "not_csv"},
                status=400,
            )
        try:
            column_mapping = None
            mapping_raw = request.POST.get("column_mapping")
            if mapping_raw:
                column_mapping = json.loads(mapping_raw)

            result = validate_csv_upload(uploaded, column_mapping)
            if result.get("needs_column_mapping"):
                return JsonResponse(result)

            return JsonResponse(
                {
                    "rows": serialize_import_rows(result["rows"]),
                    "conflicts": result["conflicts"],
                    "valid_count": result["valid_count"],
                    "error_count": result["error_count"],
                    "column_mapping": result.get("column_mapping", {}),
                    "has_employee_column": result.get("has_employee_column", False),
                    "assignment_reviews": result.get("assignment_reviews", []),
                    "employees": result.get("employees", []),
                }
            )
        except json.JSONDecodeError:
            return JsonResponse({"detail": "Invalid column mapping."}, status=400)
        except CSVImportError as exc:
            return JsonResponse({"detail": str(exc), "code": exc.code}, status=400)


class ImportAssetCSVExecuteView(LoginRequiredMixin, UserPassesTestMixin, View):
    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def post(self, request):
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "Invalid JSON"}, status=400)

        rows = data.get("rows") or []
        mode = data.get("mode")
        catalog_name = data.get("catalog_name", "")
        resolutions = data.get("resolutions") or {}
        assignment_confirmations = data.get("assignment_confirmations") or {}

        if mode not in {"merge", "catalog"}:
            return JsonResponse({"detail": "Import mode is required."}, status=400)
        if not rows:
            return JsonResponse({"detail": "No rows to import."}, status=400)

        try:
            result = execute_import(
                rows,
                mode=mode,
                catalog_name=catalog_name,
                resolutions=resolutions,
                assignment_confirmations=assignment_confirmations,
                user=request.user,
            )
            return JsonResponse(result)
        except CSVImportError as exc:
            return JsonResponse({"detail": str(exc), "code": exc.code}, status=400)


class AssetAPIListView(LoginRequiredMixin, View):
    def get(self, request):
        queryset = Asset.objects.annotate(
            last_assigned_date=Max("assignments__date_assigned"),
            last_returned_date=Max("assignments__date_returned"),
        ).order_by("name", "serial_number")
        asset_type = request.GET.get("type")
        status = request.GET.get("status")

        if asset_type:
            queryset = queryset.filter(
                type=TYPE_TO_MODEL.get(asset_type.lower(), asset_type)
            )
        if status:
            queryset = queryset.filter(
                status=STATUS_TO_MODEL.get(status.lower(), status)
            )

        return JsonResponse([serialize_asset(asset) for asset in queryset], safe=False)

    def post(self, request):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        payload = parse_request_data(request)
        if payload is None:
            return json_invalid_body()

        form = AssetForm(data=normalize_asset_payload(payload))
        if not form.is_valid():
            return JsonResponse({"errors": form.errors.get_json_data()}, status=400)

        asset = form.save()
        if asset.created_by_id is None:
            asset.created_by = request.user
            asset.save(update_fields=["created_by"])
        return JsonResponse(serialize_asset(asset), status=201)


class AssetAPIDetailView(LoginRequiredMixin, View):
    def get(self, request, pk):
        asset = get_object_or_404(Asset, pk=pk)
        return JsonResponse(serialize_asset(asset))

    def put(self, request, pk):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        asset = get_object_or_404(Asset, pk=pk)
        payload = parse_request_data(request)
        if payload is None:
            return json_invalid_body()

        form = AssetForm(
            data=normalize_asset_payload(payload),
            instance=asset,
        )
        if not form.is_valid():
            return JsonResponse({"errors": form.errors.get_json_data()}, status=400)

        asset = form.save()
        return JsonResponse(serialize_asset(asset))

    def delete(self, request, pk):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        asset = get_object_or_404(Asset, pk=pk)
        try:
            asset.delete()
        except ProtectedError:
            return JsonResponse(
                {
                    "detail": (
                        "This asset cannot be deleted because it has assignment "
                        "history."
                    )
                },
                status=400,
            )
        return JsonResponse({"deleted": True})


class AssetAssignAPIView(LoginRequiredMixin, View):
    def post(self, request, pk):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        payload = parse_request_data(request)
        if payload is None:
            return json_invalid_body()

        employee_id = payload.get("employee_id") or payload.get("employee")
        if not employee_id:
            return JsonResponse({"employee_id": ["This field is required."]}, status=400)

        with transaction.atomic():
            asset = get_object_or_404(Asset.objects.select_for_update(), pk=pk)
            employee = get_object_or_404(Employee, pk=employee_id)
            has_active_assignment = Assignment.objects.select_for_update().filter(
                asset=asset,
                date_returned__isnull=True,
            ).exists()

            if asset.status != Asset.AssetStatus.AVAILABLE or has_active_assignment:
                return JsonResponse(
                    {"detail": "This asset is not available for assignment."},
                    status=400,
                )

            expected_return_date = payload.get("expected_return_date")
            if expected_return_date:
                try:
                    expected_return_date = datetime.date.fromisoformat(
                        str(expected_return_date)
                    )
                except ValueError:
                    return JsonResponse(
                        {
                            "expected_return_date": [
                                "Enter a valid date in YYYY-MM-DD format."
                            ]
                        },
                        status=400,
                    )
                if expected_return_date < timezone.localdate():
                    return JsonResponse(
                        {
                            "expected_return_date": [
                                "Expected return date cannot be in the past."
                            ]
                        },
                        status=400,
                    )
            else:
                expected_return_date = None

            Assignment.objects.create(
                asset=asset,
                employee=employee,
                expected_return_date=expected_return_date,
                created_by=request.user,
            )
            asset.status = Asset.AssetStatus.ASSIGNED
            asset.save(update_fields=["status"])
            add_session_notification(
                request,
                notification_type="success",
                title="Asset Assigned",
                message=(
                    f'Asset "{asset.name}" has been assigned to '
                    f"{employee.name}."
                ),
                link=reverse("asset_list"),
                source="asset_assignment",
            )
            create_employee_notification(
                employee,
                notification_type=EmployeeNotification.NotificationType.INFO,
                title="Asset Assigned",
                message=f'You have been assigned "{asset.name}". Please confirm receipt.',
                link=reverse("employee_dashboard"),
            )

        return JsonResponse(serialize_asset(asset))


class AssetReturnAPIView(LoginRequiredMixin, View):
    def post(self, request, pk):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        with transaction.atomic():
            asset = get_object_or_404(Asset.objects.select_for_update(), pk=pk)
            assignment = (
                Assignment.objects.select_for_update()
                .filter(asset=asset, date_returned__isnull=True)
                .first()
            )
            if assignment is None:
                return JsonResponse(
                    {"detail": "This asset does not have an active assignment."},
                    status=400,
                )

            employee = assignment.employee
            assignment.date_returned = timezone.now()
            assignment.save(update_fields=["date_returned"])
            asset.status = Asset.AssetStatus.AVAILABLE
            asset.save(update_fields=["status"])
            add_session_notification(
                request,
                notification_type="info",
                title="Asset Returned",
                message=(
                    f'Asset "{asset.name}" has been returned from '
                    f"{employee.name}."
                ),
                link=reverse("asset_list"),
                source="asset_return",
            )
            create_employee_notification(
                employee,
                notification_type=EmployeeNotification.NotificationType.INFO,
                title="Asset Returned",
                message=(
                    f'"{asset.name}" has been returned to inventory and '
                    "removed from your assigned assets."
                ),
                link=reverse("employee_dashboard"),
            )

        return JsonResponse(serialize_asset(asset))


class AssetBulkDeleteAPIView(LoginRequiredMixin, View):
    def post(self, request):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        payload = parse_request_data(request)
        if payload is None:
            return json_invalid_body()

        raw_ids = payload.get("ids") or []
        if not isinstance(raw_ids, list) or not raw_ids:
            return JsonResponse(
                {"detail": "Provide at least one asset id in ids."},
                status=400,
            )

        deleted = []
        failed = []
        seen = set()

        for raw_id in raw_ids:
            try:
                asset_id = int(raw_id)
            except (TypeError, ValueError):
                failed.append({"id": raw_id, "detail": "Invalid asset id."})
                continue

            if asset_id in seen:
                continue
            seen.add(asset_id)

            asset = Asset.objects.filter(pk=asset_id).first()
            if asset is None:
                failed.append({"id": asset_id, "detail": "Asset not found."})
                continue

            try:
                asset.delete()
            except ProtectedError:
                failed.append(
                    {
                        "id": asset_id,
                        "detail": (
                            "This asset cannot be deleted because it has "
                            "assignment history."
                        ),
                    }
                )
                continue

            deleted.append(asset_id)

        if deleted:
            add_session_notification(
                request,
                notification_type="info",
                title="Assets Deleted",
                message=(
                    f"{len(deleted)} asset{'s' if len(deleted) != 1 else ''} "
                    "removed from inventory."
                ),
                link=reverse("asset_list"),
                source="asset_bulk_delete",
            )

        return JsonResponse(
            {
                "success": True,
                "deleted": deleted,
                "failed": failed,
            }
        )


class EmployeeAPIListView(LoginRequiredMixin, View):
    def get(self, request):
        queryset = Employee.objects.all().order_by("name")
        search = request.GET.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(department__icontains=search)
                | Q(email__icontains=search)
            )
        return JsonResponse(
            [serialize_employee(employee) for employee in queryset],
            safe=False,
        )

    def post(self, request):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        payload = parse_request_data(request)
        if payload is None:
            return json_invalid_body()

        form = EmployeeCreateForm(data=payload)
        if not form.is_valid():
            return JsonResponse({"errors": form.errors.get_json_data()}, status=400)

        employee = form.save()
        add_session_notification(
            request,
            notification_type="success",
            title="New Employee Added",
            message=f'Employee "{employee.name}" has been added to the system.',
            link=reverse("employee_list"),
            source="employee_creation",
        )
        return JsonResponse(serialize_employee(employee), status=201)


class EmployeeAPIDetailView(LoginRequiredMixin, View):
    def get(self, request, pk):
        employee = get_object_or_404(Employee, pk=pk)
        return JsonResponse(serialize_employee(employee))

    def put(self, request, pk):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        payload = parse_request_data(request)
        if payload is None:
            return json_invalid_body()

        employee = get_object_or_404(Employee, pk=pk)
        user_value = payload.get("user", employee.user_id or "")
        form = EmployeeForm(
            data={
                "name": payload.get("name", employee.name),
                "user": user_value,
                "department": payload.get("department", employee.department),
                "email": payload.get("email", employee.email),
            },
            instance=employee,
        )
        if not form.is_valid():
            return JsonResponse({"errors": form.errors.get_json_data()}, status=400)

        employee = form.save()
        return JsonResponse(serialize_employee(employee))

    def delete(self, request, pk):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        employee = get_object_or_404(Employee, pk=pk)
        try:
            employee.delete()
        except ProtectedError:
            return JsonResponse(
                {
                    "detail": (
                        "This employee cannot be deleted because they have "
                        "assignment history."
                    )
                },
                status=400,
            )
        return JsonResponse({"deleted": True})
