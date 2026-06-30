from django.conf import settings
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

    @property
    def type_icon(self) -> str:
        icons = {
            self.AssetType.LAPTOP: "L",
            self.AssetType.PRINTER: "P",
            self.AssetType.ROUTER: "R",
            self.AssetType.MONITOR: "M",
        }
        return icons.get(self.type, "A")


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
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee",
        help_text="User account that can access the employee portal.",
    )
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

    @property
    def department_abbreviation(self) -> str:
        abbreviations = {
            self.Department.TECHNICAL_CORE_PROGRAMME: "TCPD",
            self.Department.CAPACITY_BUILDING_INNOVATION: "CBID",
            self.Department.INSTITUTIONAL_SUPPORT_ADVISORY: "ISAO",
        }
        if self.department in abbreviations:
            return abbreviations[self.department]

        words = str(self.department).replace("&", " ").split()
        return "".join(word[0].upper() for word in words if word) or self.department


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
    confirmed_by_employee = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)

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
            models.Index(
                fields=["employee", "confirmed_by_employee"],
                name="assignment_emp_confirm_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.asset} assigned to {self.employee}"

    @property
    def status_display(self) -> str:
        if self.date_returned:
            return "Returned"
        if self.confirmed_by_employee:
            return "Confirmed"
        return "Pending Confirmation"

    @property
    def status_class(self) -> str:
        if self.date_returned:
            return "secondary"
        if self.confirmed_by_employee:
            return "success"
        return "warning"


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


class EmployeeNotification(models.Model):
    class NotificationType(models.TextChoices):
        INFO = "info", "Info"
        SUCCESS = "success", "Success"
        WARNING = "warning", "Warning"
        ERROR = "error", "Error"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        default=NotificationType.INFO,
    )
    title = models.CharField(max_length=150)
    message = models.TextField()
    link = models.CharField(max_length=255, blank=True)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(
                fields=["employee", "read", "-created_at"],
                name="employee_notif_unread_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} for {self.employee}"
