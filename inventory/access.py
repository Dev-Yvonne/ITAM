"""Shared authorization/identity helpers used across view modules."""

from django.urls import reverse

from .models import Employee


def user_has_admin_access(user) -> bool:
    return user.is_authenticated and (user.is_staff or user.is_superuser)


def get_employee_for_user(user):
    if not user.is_authenticated:
        return None
    try:
        return user.employee
    except Employee.DoesNotExist:
        return None


def get_post_auth_redirect_url(user) -> str:
    if user_has_admin_access(user):
        return reverse("dashboard")
    if get_employee_for_user(user):
        return reverse("employee_dashboard")
    return reverse("dashboard")
