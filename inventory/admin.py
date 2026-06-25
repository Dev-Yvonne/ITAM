from django.contrib import admin

from .models import Asset, Assignment, Employee, MaintenanceLog


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "serial_number", "status", "date_created")
    list_filter = ("type", "status", "date_created")
    search_fields = ("name", "serial_number")


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("name", "department", "email")
    search_fields = ("name", "department", "email")


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "asset",
        "employee",
        "date_assigned",
        "date_returned",
    )
    list_filter = ("date_assigned", "date_returned")
    search_fields = (
        "asset__name",
        "asset__serial_number",
        "employee__name",
        "employee__email",
    )


@admin.register(MaintenanceLog)
class MaintenanceLogAdmin(admin.ModelAdmin):
    list_display = (
        "asset",
        "technician",
        "date",
        "resolved",
    )
    list_filter = ("resolved", "date")
    search_fields = (
        "asset__name",
        "asset__serial_number",
        "issue_description",
        "technician",
    )
