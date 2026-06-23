import csv
from datetime import timedelta

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
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

from .filters import AssetFilterForm
from .forms import AssetForm, AssignmentForm, EmployeeForm
from .models import Asset, Assignment, Employee


class AdminRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    def test_func(self) -> bool:
        return self.request.user.is_staff


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
        self.filter_form = AssetFilterForm(self.request.GET)
        return self.filter_form.filter_queryset(queryset)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        overdue_cutoff = timezone.localdate() - timedelta(days=183)
        context.update(
            {
                "filter_form": self.filter_form,
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


class AssetCreateView(AdminRequiredMixin, CreateView):
    model = Asset
    form_class = AssetForm
    template_name = "inventory/asset_form.html"
    success_url = reverse_lazy("inventory:asset-list")


class AssetUpdateView(AdminRequiredMixin, UpdateView):
    model = Asset
    form_class = AssetForm
    template_name = "inventory/asset_form.html"
    success_url = reverse_lazy("inventory:asset-list")


class AssetDeleteView(AdminRequiredMixin, DeleteView):
    model = Asset
    template_name = "inventory/asset_confirm_delete.html"
    success_url = reverse_lazy("inventory:asset-list")


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


class EmployeeCreateView(AdminRequiredMixin, CreateView):
    model = Employee
    form_class = EmployeeForm
    template_name = "inventory/employee_form.html"
    success_url = reverse_lazy("inventory:employee-list")


class EmployeeUpdateView(AdminRequiredMixin, UpdateView):
    model = Employee
    form_class = EmployeeForm
    template_name = "inventory/employee_form.html"
    success_url = reverse_lazy("inventory:employee-list")


class EmployeeDeleteView(AdminRequiredMixin, DeleteView):
    model = Employee
    template_name = "inventory/employee_confirm_delete.html"
    success_url = reverse_lazy("inventory:employee-list")


class AssignAssetView(AdminRequiredMixin, FormView):
    template_name = "inventory/assign_asset.html"
    form_class = AssignmentForm
    success_url = reverse_lazy("inventory:asset-list")

    def form_valid(self, form):
        with transaction.atomic():
            asset = Asset.objects.select_for_update().get(
                pk=form.cleaned_data["asset"].pk
            )
            employee = form.cleaned_data["employee"]

            has_active_assignment = Assignment.objects.select_for_update().filter(
                asset=asset,
                date_returned__isnull=True,
            ).exists()
            if asset.status != Asset.AssetStatus.AVAILABLE or has_active_assignment:
                form.add_error("asset", "This asset is not available for assignment.")
                return self.form_invalid(form)

            Assignment.objects.create(asset=asset, employee=employee)
            asset.status = Asset.AssetStatus.ASSIGNED
            asset.save(update_fields=["status"])

        messages.success(self.request, "Asset assigned successfully.")
        return super().form_valid(form)


class ReturnAssetView(AdminRequiredMixin, View):
    def post(self, request, pk):
        with transaction.atomic():
            assignment = get_object_or_404(
                Assignment.objects.select_for_update().select_related("asset"),
                pk=pk,
                date_returned__isnull=True,
            )
            assignment.date_returned = timezone.localdate()
            assignment.save(update_fields=["date_returned"])

            asset = Asset.objects.select_for_update().get(pk=assignment.asset_id)
            asset.status = Asset.AssetStatus.AVAILABLE
            asset.save(update_fields=["status"])

        messages.success(request, "Asset returned successfully.")
        return redirect("inventory:asset-detail", pk=assignment.asset_id)


class AssetCSVExportView(AdminRequiredMixin, View):
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
