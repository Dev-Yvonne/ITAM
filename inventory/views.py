import csv
from datetime import timedelta

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Count, Max, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse_lazy
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

from .forms import AssetForm, AssignmentForm
from .models import Asset, Assignment, Employee


def user_has_admin_access(user) -> bool:
    return user.is_authenticated and (user.is_staff or user.is_superuser)


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
        overdue_cutoff = timezone.localdate() - timedelta(days=183)
        overdue_assets = (
            Asset.objects.annotate(last_maintenance_date=Max("maintenance_logs__date"))
            .filter(
                Q(last_maintenance_date__lt=overdue_cutoff)
                | Q(last_maintenance_date__isnull=True)
            )
            .order_by("name")
        )

        context.update(
            {
                "total_assets": aggregate_counts["total_assets"],
                "assigned_assets": aggregate_counts["assigned_assets"],
                "available_assets": aggregate_counts["available_assets"],
                "maintenance_assets": aggregate_counts["maintenance_assets"],
                "status_counts": status_counts,
                "asset_summary": aggregate_counts,
                "overdue_assets": overdue_assets,
                "overdue_cutoff": overdue_cutoff,
            }
        )
        return context


class AssetListView(LoginRequiredMixin, ListView):
    model = Asset
    template_name = "inventory/asset_list.html"
    context_object_name = "assets"
    paginate_by = 25

    def get_queryset(self):
        queryset = (
            Asset.objects.annotate(last_maintenance_date=Max("maintenance_logs__date"))
            .all()
            .order_by("name", "serial_number")
        )
        asset_type = self.request.GET.get("type")
        status = self.request.GET.get("status")

        if asset_type:
            queryset = queryset.filter(type=asset_type)
        if status:
            queryset = queryset.filter(status=status)

        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        overdue_cutoff = timezone.localdate() - timedelta(days=183)
        context.update(
            {
                "selected_type": self.request.GET.get("type", ""),
                "selected_status": self.request.GET.get("status", ""),
                "overdue_cutoff": overdue_cutoff,
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
                "overdue_cutoff": timezone.localdate() - timedelta(days=183),
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

            assignment.date_returned = timezone.now().date()
            assignment.save(update_fields=["date_returned"])

            asset.status = Asset.AssetStatus.AVAILABLE
            asset.save(update_fields=["status"])

        messages.success(
            request,
            "Asset returned successfully to inventory storage.",
        )
        return redirect("asset_detail", pk=asset.pk)


class AssetCSVExportView(LoginRequiredMixin, UserPassesTestMixin, View):
    def test_func(self) -> bool:
        return user_has_admin_access(self.request.user)

    def handle_no_permission(self):
        if self.request.user.is_authenticated:
            raise PermissionDenied
        return super().handle_no_permission()

    def get(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="assets.csv"'

        writer = csv.writer(response)
        writer.writerow(["Name", "Type", "Serial Number", "Status"])

        for asset in Asset.objects.order_by("name", "serial_number").iterator():
            writer.writerow(
                [
                    asset.name,
                    asset.type,
                    asset.serial_number,
                    asset.status,
                ]
            )

        return response
    # can we use constant instead repeated maintance interval logic so that If management changes maintenance schedules to 90 or 365 days, you only update one place.
    #add audit logging
