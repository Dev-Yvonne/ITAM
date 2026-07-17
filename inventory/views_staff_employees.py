from django.urls import reverse, reverse_lazy
from django.views.generic import DeleteView, DetailView, ListView, RedirectView, UpdateView

from .access import AdminRequiredMixin
from .forms import EmployeeForm
from .models import Employee


class EmployeeListView(AdminRequiredMixin, ListView):
    model = Employee
    template_name = "inventory/employee_list.html"
    context_object_name = "employees"
    paginate_by = 25


class EmployeeDetailView(AdminRequiredMixin, DetailView):
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


class EmployeeAddRedirectView(RedirectView):
    """Legacy /employees/add/ URL opens the employees list with the add modal."""

    permanent = False

    def get_redirect_url(self, *args, **kwargs):
        return reverse("employee_list") + "?addEmployee=1"


class EmployeeUpdateView(AdminRequiredMixin, UpdateView):
    model = Employee
    form_class = EmployeeForm
    template_name = "inventory/employee_form.html"
    success_url = reverse_lazy("employee_list")


class EmployeeDeleteView(AdminRequiredMixin, DeleteView):
    model = Employee
    template_name = "inventory/employee_confirm_delete.html"
    success_url = reverse_lazy("employee_list")
