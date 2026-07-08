from django.conf import settings
from django.db import models
from django.utils import timezone
import uuid


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
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assets_created",
    )

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
    expected_return_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expected date the asset should be returned.",
    )
    date_returned = models.DateTimeField(null=True, blank=True)
    confirmed_by_employee = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignments_created",
    )

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
    repair_shop = models.CharField(max_length=255, blank=True, default="")
    worker_contact = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Phone number or email for the maintenance worker.",
    )
    expected_completion_date = models.DateField(
        null=True,
        blank=True,
        help_text="Estimated date when maintenance will be completed.",
    )
    date = models.DateField(default=timezone.now)
    resolved = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_logs_created",
    )

    class Meta:
        ordering = ["-date", "-id"]
        indexes = [
            models.Index(fields=["asset", "-date"], name="maintenance_asset_date_idx"),
            models.Index(fields=["date"], name="maintenance_date_idx"),
            models.Index(fields=["resolved", "date"], name="maintenance_resolved_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.asset} maintenance on {self.date}"


class AssetCatalog(models.Model):
    """Named import directory — a separate asset table for transitional workflows."""

    name = models.CharField(max_length=255, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="asset_catalogs",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CatalogAsset(models.Model):
    catalog = models.ForeignKey(
        AssetCatalog,
        on_delete=models.CASCADE,
        related_name="assets",
    )
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=Asset.AssetType.choices)
    serial_number = models.CharField(max_length=100)
    status = models.CharField(
        max_length=30,
        choices=Asset.AssetStatus.choices,
        default=Asset.AssetStatus.AVAILABLE,
    )
    last_maintenance_date = models.DateField(null=True, blank=True)
    imported_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["name", "serial_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["catalog", "serial_number"],
                name="catalog_asset_serial_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.serial_number})"


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


class BackgroundJob(models.Model):
    """Database-backed async job for slow operations (3s+)."""

    class JobType(models.TextChoices):
        REPORTS = "reports", "Reports analytics"
        ASSET_SECTIONS = "asset_sections", "Asset list sections"
        DASHBOARD = "dashboard", "Dashboard metrics"
        CSV_EXPORT = "csv_export", "Asset CSV export"
        SERIAL_SUGGESTIONS = "serial_suggestions", "Asset serial number suggestions"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    JOB_PRIORITIES = {
        JobType.REPORTS: 100,
        JobType.ASSET_SECTIONS: 90,
        JobType.DASHBOARD: 80,
        JobType.SERIAL_SUGGESTIONS: 75,
        JobType.CSV_EXPORT: 70,
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job_type = models.CharField(max_length=32, choices=JobType.choices)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    priority = models.PositiveSmallIntegerField(default=50)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="background_jobs",
    )
    params = models.JSONField(default=dict, blank=True)
    result = models.JSONField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    result_file = models.FileField(upload_to="exports/", null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-priority", "created_at"]
        indexes = [
            models.Index(fields=["status", "-priority", "created_at"], name="bgjob_status_prio_idx"),
            models.Index(fields=["user", "job_type", "-created_at"], name="bgjob_user_type_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.job_type} ({self.status})"


class UserProfile(models.Model):
    class AvatarStorageBackend(models.TextChoices):
        LOCAL = "local", "Local"
        SUPABASE = "supabase", "Supabase"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    avatar_url = models.URLField(max_length=500, blank=True)
    avatar_storage_key = models.CharField(max_length=255, blank=True)
    avatar_storage_backend = models.CharField(
        max_length=20,
        choices=AvatarStorageBackend.choices,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User profile"
        verbose_name_plural = "User profiles"

    def __str__(self) -> str:
        return f"Profile for {self.user}"
