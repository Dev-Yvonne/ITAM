import csv
import datetime
import json

from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.views import LoginView
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Count, Exists, Max, OuterRef, Q
from django.db.models.deletion import ProtectedError
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse_lazy
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

from .forms import AssetForm, AssignmentForm
from .models import Asset, Assignment, Employee, MaintenanceLog


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


def get_service_overdue_cutoff():
    return timezone.now() - datetime.timedelta(days=Asset.SERVICE_INTERVAL_DAYS)


def get_overdue_assets_queryset():
    overdue_cutoff = get_service_overdue_cutoff().date()
    created_cutoff = get_service_overdue_cutoff()
    recent_maintenance = MaintenanceLog.objects.filter(
        asset=OuterRef("pk"),
        date__gte=overdue_cutoff,
    )
    return (
        Asset.objects.annotate(
            has_recent_maintenance=Exists(recent_maintenance),
            last_maintenance_date=Max("maintenance_logs__date"),
        )
        .filter(has_recent_maintenance=False)
        .filter(
            Q(last_maintenance_date__lt=overdue_cutoff)
            | Q(last_maintenance_date__isnull=True, date_created__lt=created_cutoff)
        )
        .order_by("name", "serial_number")
    )


class DashboardView(LoginRequiredMixin, TemplateView):
    template_name = "inventory/dashboard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        status_counts = Asset.objects.values("status").annotate(total=Count("id"))
        aggregate_counts = Asset.objects.aggregate(
            total_assets=Count("id"),
            available_assets=Count(
                "id",
                filter=Q(status=Asset.AssetStatus.AVAILABLE),
            ),
            assigned_assets=Count(
                "id",
                filter=Q(status=Asset.AssetStatus.ASSIGNED),
            ),
            maintenance_assets=Count(
                "id",
                filter=Q(status=Asset.AssetStatus.UNDER_MAINTENANCE),
            ),
        )
        overdue_cutoff = get_service_overdue_cutoff().date()
        overdue_assets = get_overdue_assets_queryset()

        context.update(
            {
                "total_assets": aggregate_counts["total_assets"],
                "assigned_assets": aggregate_counts["assigned_assets"],
                "available_assets": aggregate_counts["available_assets"],
                "maintenance_assets": aggregate_counts["maintenance_assets"],
                "status_counts": status_counts,
                "asset_summary": aggregate_counts,
                "overdue_assets": overdue_assets,
                "overdue_assets_count": overdue_assets.count(),
                "overdue_cutoff": overdue_cutoff,
            }
        )
        return context


class AuthLoginView(LoginView):
    template_name = "inventory/auth.html"
    redirect_authenticated_user = True

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "login"
        return context

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


class AuthLogoutView(TemplateView):
    template_name = "inventory/auth.html"

    def dispatch(self, request, *args, **kwargs):
        logout(request)
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "logout"
        return context


class AssetListView(LoginRequiredMixin, ListView):
    model = Asset
    template_name = "inventory/asset_list.html"
    context_object_name = "assets"
    paginate_by = 25

    def get_queryset(self):
        queryset = (
            Asset.objects.annotate(
                last_maintenance_date=Max("maintenance_logs__date"),
                last_assigned_date=Max("assignments__date_assigned"),
                last_returned_date=Max("assignments__date_returned"),
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
    fields = ["name", "department", "email"]
    template_name = "inventory/employee_form.html"
    success_url = reverse_lazy("employee_list")

    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()


class EmployeeUpdateView(LoginRequiredMixin, UserPassesTestMixin, UpdateView):
    model = Employee
    fields = ["name", "department", "email"]
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

        messages.success(
            request,
            "Asset returned successfully to inventory storage.",
        )
        return redirect("asset_detail", pk=asset.pk)


class ExportAssetCSVView(LoginRequiredMixin, UserPassesTestMixin, View):
    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def get(self, request):
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

            Assignment.objects.create(asset=asset, employee=employee)
            asset.status = Asset.AssetStatus.ASSIGNED
            asset.save(update_fields=["status"])

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

        employee = Employee.objects.create(**parse_request_data(request))
        return JsonResponse(serialize_employee(employee), status=201)


class EmployeeAPIDetailView(LoginRequiredMixin, View):
    def get(self, request, pk):
        employee = get_object_or_404(Employee, pk=pk)
        return JsonResponse(serialize_employee(employee))

    def put(self, request, pk):
        if not user_has_admin_access(request.user):
            return json_permission_denied()

        employee = get_object_or_404(Employee, pk=pk)
        payload = parse_request_data(request)
        employee.name = payload.get("name", employee.name)
        employee.department = payload.get("department", employee.department)
        employee.email = payload.get("email", employee.email)
        employee.save(update_fields=["name", "department", "email"])
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
class SettingsView(LoginRequiredMixin, TemplateView):
    """
    Settings page view for user preferences and application configuration.
    """
    template_name = "inventory/settings.html"