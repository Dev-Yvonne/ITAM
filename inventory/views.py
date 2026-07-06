import csv
import datetime
import json
import logging

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.views import LoginView, PasswordResetView, PasswordResetDoneView, PasswordResetConfirmView, PasswordResetCompleteView
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Max, OuterRef, Q, Subquery
from django.db.models.deletion import ProtectedError
from django.db.utils import DatabaseError, OperationalError, ProgrammingError
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.views import View
from django.views.decorators.csrf import csrf_protect
from django.views.generic import (
    CreateView,
    DeleteView,
    DetailView,
    FormView,
    ListView,
    TemplateView,
    UpdateView,
)
from django.utils.decorators import method_decorator

from .forms import (
    AssetForm,
    AssignmentForm,
    EmailOrUsernameAuthenticationForm,
    EmployeeCreateForm,
    EmployeeForm,
    MaintenanceLogForm,
)
from .models import Asset, AssetCatalog, Assignment, BackgroundJob, Employee, EmployeeNotification, MaintenanceLog
from .services.assets import get_asset_list_sections
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
from .services.notifications import add_session_notification
from .views_extras import (
    NotificationAPIView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
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


def user_has_admin_access(user) -> bool:
    return user.is_authenticated and (user.is_staff or user.is_superuser)


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


def parse_request_data(request) -> dict:
    if request.content_type.startswith("application/json") and request.body:
        return json.loads(request.body.decode("utf-8"))
    return request.POST.dict()


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


class AuthLoginView(LoginView):
    template_name = "inventory/auth.html"
    authentication_form = EmailOrUsernameAuthenticationForm
    redirect_authenticated_user = True

    def get_success_url(self):
        if user_has_admin_access(self.request.user):
            return reverse("dashboard")
        if get_employee_for_user(self.request.user):
            return reverse("employee_dashboard")
        return reverse("dashboard")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "login"
        context["remember_me"] = bool(self.request.POST.get("remember"))
        return context

    def form_valid(self, form):
        remember_me = self.request.POST.get("remember")
        login(self.request, form.get_user())
        if remember_me:
            self.request.session.set_expiry(settings.SESSION_COOKIE_AGE)
        else:
            self.request.session.set_expiry(0)
        self.request.session.modified = True
        return redirect(self.get_success_url())

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect("dashboard")
        return super().dispatch(request, *args, **kwargs)


class SignUpView(CreateView):
    form_class = UserCreationForm
    template_name = "inventory/auth.html"
    success_url = reverse_lazy("dashboard")

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect("dashboard")
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        response = super().form_valid(form)
        login(self.request, self.object)
        return response

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "signup"
        return context


class AuthLogoutView(View):
    template_name = "inventory/auth.html"

    def post(self, request, *args, **kwargs):
        logout(request)
        return render(request, self.template_name, {"page": "logout"})

    def get(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect("dashboard")
        return render(request, self.template_name, {"page": "logout"})


# ============================================
# PASSWORD RESET VIEWS
# ============================================

class CustomPasswordResetView(PasswordResetView):
    template_name = "inventory/auth.html"
    success_url = reverse_lazy("password_reset_done")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "password_reset"
        return context


class CustomPasswordResetDoneView(PasswordResetDoneView):
    template_name = "inventory/auth.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "password_reset_done"
        return context


class CustomPasswordResetConfirmView(PasswordResetConfirmView):
    template_name = "inventory/auth.html"
    success_url = reverse_lazy("password_reset_complete")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "password_reset_confirm"
        return context


class CustomPasswordResetCompleteView(PasswordResetCompleteView):
    template_name = "inventory/auth.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "password_reset_complete"
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
        context.update(
            {
                "selected_type": self.request.GET.get("type", ""),
                "selected_status": self.request.GET.get("status", ""),
                "overdue_cutoff": get_service_overdue_cutoff().date(),
                "asset_catalogs": [
                    serialize_catalog(catalog)
                    for catalog in AssetCatalog.objects.prefetch_related("assets")
                    .order_by("-created_at", "name")
                ],
                "async_asset_sections": True,
                "assigned_asset_rows": [],
                "available_asset_rows": [],
                "maintenance_asset_rows": [],
                "laptop_rows": [],
                "monitor_rows": [],
                "printer_rows": [],
                "router_rows": [],
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
            add_session_notification(
                request,
                notification_type="info",
                title="Asset Returned",
                message=f'Asset "{asset.name}" has been returned to inventory.',
                link=reverse("asset_detail", kwargs={"pk": asset.pk}),
                source="asset_return",
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

        form = AssetForm(data=normalize_asset_payload(parse_request_data(request)))
        if not form.is_valid():
            return JsonResponse({"errors": form.errors.get_json_data()}, status=400)

        asset = form.save()
        return JsonResponse(serialize_asset(asset), status=201)


class AssetAPIDetailView(LoginRequiredMixin, View):
    def get(self, request, pk):
        asset = get_object_or_404(Asset, pk=pk)
        return JsonResponse(serialize_asset(asset))

    def put(self, request, pk):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        asset = get_object_or_404(Asset, pk=pk)
        form = AssetForm(
            data=normalize_asset_payload(parse_request_data(request)),
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
            )
            asset.status = Asset.AssetStatus.ASSIGNED
            asset.save(update_fields=["status"])
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

            assignment.date_returned = timezone.now()
            assignment.save(update_fields=["date_returned"])
            asset.status = Asset.AssetStatus.AVAILABLE
            asset.save(update_fields=["status"])

        return JsonResponse(serialize_asset(asset))


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

        form = EmployeeCreateForm(data=parse_request_data(request))
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


# ============================================
# SETTINGS VIEW
# ============================================

# ============================================
# EMPLOYEE PORTAL VIEWS
# ============================================

def get_employee_for_user(user):
    if not user.is_authenticated:
        return None
    try:
        return user.employee
    except Employee.DoesNotExist:
        return None


def serialize_employee_notification(notification):
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "link": notification.link,
        "read": notification.read,
        "created_label": "Just now",
    }


def create_employee_notification(
    employee,
    *,
    notification_type,
    title,
    message,
    link="",
):
    try:
        return EmployeeNotification.objects.create(
            employee=employee,
            type=notification_type,
            title=title,
            message=message,
            link=link,
        )
    except (DatabaseError, OperationalError, ProgrammingError):
        logger.exception(
            "Unable to create employee notification for employee_id=%s",
            getattr(employee, "pk", None),
        )
        return None


def get_employee_notifications(employee, limit=5):
    try:
        queryset = employee.notifications.all()
        if limit is not None:
            return list(queryset[:limit])
        return queryset
    except (DatabaseError, OperationalError, ProgrammingError):
        logger.exception(
            "Unable to load employee notifications for employee_id=%s",
            getattr(employee, "pk", None),
        )
        return []


def get_employee_unread_notification_count(employee):
    try:
        return employee.notifications.filter(read=False).count()
    except (DatabaseError, OperationalError, ProgrammingError):
        logger.exception(
            "Unable to count employee notifications for employee_id=%s",
            getattr(employee, "pk", None),
        )
        return 0


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
        notifications = get_employee_notifications(self.employee)
        assignments = Assignment.objects.filter(employee=self.employee).select_related("asset")

        context.update(
            {
                "employee": self.employee,
                "employee_notifications": notifications,
                "recent_notifications": notifications,
                "unread_notifications": get_employee_unread_notification_count(
                    self.employee
                ),
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
    """Employee dashboard showing assigned assets and notifications"""
    template_name = 'inventory/employee/dashboard.html'
    
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
        
        # Get active assignments
        active_assignments = Assignment.objects.filter(
            employee=employee,
            date_returned__isnull=True
        ).select_related('asset')
        
        # Get pending confirmations
        pending_confirmations = active_assignments.filter(
            confirmed_by_employee=False
        )
        
        # Get due assets (optional - assets that are overdue for return)
        due_assets = active_assignments.filter(
            date_assigned__lte=timezone.now() - datetime.timedelta(days=30)
        )

        assignment_history = Assignment.objects.filter(
            employee=employee
        ).select_related("asset").order_by("-date_assigned")
        
        context.update({
            'greeting': greeting,
            'active_assets': active_assignments.count(),
            'active_assignments': active_assignments,
            'returnable_assignments': active_assignments,
            'assignment_history': assignment_history,
            'pending_confirmations': pending_confirmations,
            'pending_assets': pending_confirmations.count(),
            'due_assets': due_assets.count(),
            'total_assets': active_assignments.count(),
            'confirmed_assets': active_assignments.filter(confirmed_by_employee=True).count(),
        })
        return context


class EmployeeAssetsView(EmployeePortalAccessMixin, ListView):
    """List all assets assigned to the logged-in employee"""
    template_name = 'inventory/employee/assets.html'
    context_object_name = 'assignments'
    paginate_by = 10
    
    def get_queryset(self):
        employee = self.employee
        return Assignment.objects.filter(
            employee=employee
        ).select_related('asset').order_by('-date_assigned')
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        assignments = self.get_queryset()
        
        context.update({
            'total_assets': assignments.count(),
            'active_assets': assignments.filter(date_returned__isnull=True).count(),
            'pending_assets': assignments.filter(
                date_returned__isnull=True,
                confirmed_by_employee=False
            ).count(),
            'returned_assets': assignments.filter(date_returned__isnull=False).count(),
        })
        return context


class EmployeeAssetDetailView(EmployeePortalAccessMixin, DetailView):
    """Detail view for a single asset assignment"""
    template_name = 'inventory/employee/asset_detail.html'
    context_object_name = 'assignment'
    
    def get_queryset(self):
        employee = self.employee
        return Assignment.objects.filter(
            employee=employee
        ).select_related('asset')
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        assignment = self.get_object()
        context['asset'] = assignment.asset
        
        # Set status display
        if assignment.confirmed_by_employee:
            context['status_display'] = 'Confirmed'
            context['status_class'] = 'success'
        elif assignment.date_returned:
            context['status_display'] = 'Returned'
            context['status_class'] = 'secondary'
        else:
            context['status_display'] = 'Pending Confirmation'
            context['status_class'] = 'warning'
        
        return context


class EmployeeConfirmAssetView(EmployeePortalJSONAccessMixin, View):
    """Employee confirms receipt of assigned asset"""

    def post(self, request, pk):
        employee = self.employee
        assignment = get_object_or_404(
            Assignment.objects.filter(employee=employee),
            pk=pk,
            date_returned__isnull=True
        )
        
        if assignment.confirmed_by_employee:
            return JsonResponse({'success': False, 'message': 'Asset already confirmed'}, status=400)
        
        assignment.confirmed_by_employee = True
        assignment.confirmed_at = timezone.now()
        assignment.save(update_fields=['confirmed_by_employee', 'confirmed_at'])
        
        return JsonResponse({'success': True, 'message': 'Asset confirmed successfully'})


class EmployeeReportIssueView(EmployeePortalJSONAccessMixin, View):
    """Employee reports an issue with an asset"""

    def post(self, request, pk):
        employee = self.employee
        assignment = get_object_or_404(
            Assignment.objects.filter(employee=employee),
            pk=pk
        )
        
        issue_type = request.POST.get('issue_type')
        issue_description = request.POST.get('issue_description')
        urgency = request.POST.get('urgency', 'medium')
        
        # Create a maintenance log entry
        MaintenanceLog.objects.create(
            asset=assignment.asset,
            issue_description=f"[Reported by Employee] {issue_type}: {issue_description}",
            technician=request.user.get_full_name() or request.user.username,
            date=timezone.localdate(),
            resolved=False,
        )
        
        messages.success(request, 'Issue reported successfully. We will look into it.')
        return redirect('employee_asset_detail', pk=assignment.pk)


class EmployeeMaintenanceRequestView(EmployeePortalJSONAccessMixin, View):
    """Employee requests maintenance for an asset"""

    def post(self, request, pk):
        employee = self.employee
        assignment = get_object_or_404(
            Assignment.objects.filter(employee=employee),
            pk=pk
        )
        
        maintenance_type = request.POST.get('maintenance_type')
        description = request.POST.get('description')
        preferred_date = request.POST.get('preferred_date')
        
        # Create a maintenance log entry
        MaintenanceLog.objects.create(
            asset=assignment.asset,
            issue_description=f"[Maintenance Request] {maintenance_type}: {description}",
            technician=request.user.get_full_name() or request.user.username,
            date=timezone.localdate(),
            resolved=False,
        )
        
        messages.success(request, 'Maintenance request submitted successfully.')
        return redirect('employee_asset_detail', pk=assignment.pk)


class EmployeeReturnRequestView(EmployeePortalJSONAccessMixin, View):
    """Employee requests to return an asset"""

    def post(self, request, pk):
        employee = self.employee
        assignment = get_object_or_404(
            Assignment.objects.filter(employee=employee),
            pk=pk,
            date_returned__isnull=True
        )
        
        # Mark as returned
        assignment.date_returned = timezone.now()
        assignment.save()
        
        # Update asset status
        asset = assignment.asset
        asset.status = Asset.AssetStatus.AVAILABLE
        asset.save(update_fields=['status'])
        
        messages.success(request, 'Asset returned successfully.')
        return JsonResponse({'success': True, 'message': 'Asset returned successfully'})


class EmployeeNotificationsView(EmployeePortalAccessMixin, ListView):
    """List all notifications for the logged-in employee"""
    template_name = 'inventory/employee/notifications.html'
    context_object_name = 'notifications'
    paginate_by = 20
    
    def get_queryset(self):
        return get_employee_notifications(self.employee, limit=None)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['unread_count'] = get_employee_unread_notification_count(self.employee)
        return context


class EmployeeMarkNotificationReadView(EmployeePortalJSONAccessMixin, View):
    """Mark a single notification as read"""
    
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
    """Mark all notifications as read"""
    
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
        return JsonResponse({'success': True, "unread_count": 0})


class EmployeeProfileView(EmployeePortalAccessMixin, TemplateView):
    """Employee profile page"""
    template_name = 'inventory/employee/profile.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        employee = self.employee
        
        # Get asset stats
        assignments = Assignment.objects.filter(employee=employee)
        context.update({
            'total_assets': assignments.count(),
            'confirmed_assets': assignments.filter(confirmed_by_employee=True).count(),
            'pending_assets': assignments.filter(
                date_returned__isnull=True,
                confirmed_by_employee=False
            ).count(),
            'returned_assets': assignments.filter(date_returned__isnull=False).count(),
        })
        return context


class EmployeeSettingsView(EmployeePortalAccessMixin, TemplateView):
    """Employee settings page"""
    template_name = 'inventory/employee/settings.html'


class EmployeePasswordChangeView(EmployeePortalJSONAccessMixin, View):
    """Allow a linked employee to update their own account password."""

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
        unread_count = get_employee_unread_notification_count(self.employee)

        return JsonResponse(
            {
                "success": True,
                "message": "Password changed successfully.",
                "notification": (
                    serialize_employee_notification(notification)
                    if notification is not None
                    else None
                ),
                "unread_count": unread_count,
            }
        )


class EmployeeHistoryView(EmployeePortalAccessMixin, ListView):
    """Employee assignment history"""
    template_name = 'inventory/employee/history.html'
    context_object_name = 'history'
    paginate_by = 20
    
    def get_queryset(self):
        employee = self.employee
        return Assignment.objects.filter(
            employee=employee
        ).select_related('asset').order_by('-date_assigned')


class EmployeeReturnsView(EmployeePortalAccessMixin, ListView):
    """List assets available for return"""
    template_name = 'inventory/employee/returns.html'
    context_object_name = 'active_assignments'
    
    def get_queryset(self):
        employee = self.employee
        return Assignment.objects.filter(
            employee=employee,
            date_returned__isnull=True
        ).select_related('asset')