from django.db import models
from django.utils import timezone


class Asset(models.Model):
    SERVICE_INTERVAL_DAYS = 180

    class AssetType(models.TextChoices):
        LAPTOP = "Laptop", "Laptop"
        PRINTER = "Printer", "Printer"
        ROUTER = "Router", "Router"
        MONITOR = "Monitor", "Monitor"

    class AssetStatus(models.TextChoices):
        AVAILABLE = "Available", "Available"
        ASSIGNED = "Assigned", "Assigned"
        UNDER_MAINTENANCE = "Under Maintenance", "Under Maintenance"

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=AssetType.choices)
    serial_number = models.CharField(max_length=100, unique=True)
    status = models.CharField(
        max_length=30,
        choices=AssetStatus.choices,
        default=AssetStatus.AVAILABLE,
    )
    date_created = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["name", "serial_number"]
        indexes = [
            models.Index(fields=["status"], name="asset_status_idx"),
            models.Index(fields=["type"], name="asset_type_idx"),
            models.Index(fields=["date_created"], name="asset_created_idx"),
            models.Index(fields=["status", "type"], name="asset_status_type_idx"),
            models.Index(fields=["name", "serial_number"], name="asset_name_serial_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.serial_number})"


class Employee(models.Model):
    class Department(models.TextChoices):
        TECHNICAL_CORE_PROGRAMME = (
            "Technical & Core Programme Directorates",
            "Technical & Core Programme Directorates",
        )
        CAPACITY_BUILDING_INNOVATION = (
            "Capacity Building & Innovation Directorates",
            "Capacity Building & Innovation Directorates",
        )
        INSTITUTIONAL_SUPPORT_ADVISORY = (
            "Institutional Support & Advisory Operations",
            "Institutional Support & Advisory Operations",
        )

    name = models.CharField(max_length=255)
    department = models.CharField(max_length=255, choices=Department.choices)
    email = models.EmailField() 

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"], name="employee_name_idx"),
            models.Index(fields=["department"], name="employee_department_idx"),
            models.Index(fields=["email"], name="employee_email_idx"),
        ]

    def __str__(self) -> str:
        return self.name


class Assignment(models.Model):
    asset = models.ForeignKey(
        Asset,
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    date_assigned = models.DateTimeField(auto_now_add=True)
    date_returned = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date_assigned", "-id"]
        indexes = [
            models.Index(
                fields=["asset", "date_returned"],
                name="assignment_asset_return_idx",
            ),
            models.Index(
                fields=["employee", "date_returned"],
                name="assignment_emp_return_idx",
            ),
            models.Index(
                fields=["asset", "-date_assigned"],
                name="assignment_asset_date_idx",
            ),
            models.Index(
                fields=["employee", "-date_assigned"],
                name="assignment_emp_date_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.asset} assigned to {self.employee}"


class MaintenanceLog(models.Model):
    asset = models.ForeignKey(
        Asset,
        on_delete=models.CASCADE,
        related_name="maintenance_logs",
    )
    issue_description = models.TextField()
    technician = models.CharField(max_length=255)
    date = models.DateField(default=timezone.now)
    resolved = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date", "-id"]
        indexes = [
            models.Index(fields=["asset", "-date"], name="maintenance_asset_date_idx"),
            models.Index(fields=["date"], name="maintenance_date_idx"),
            models.Index(fields=["resolved", "date"], name="maintenance_resolved_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.asset} maintenance on {self.date}"
