from django.db import models
from django.utils import timezone


class Asset(models.Model):
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

    class Meta:
        ordering = ["name", "serial_number"]

    def __str__(self) -> str:
        return f"{self.name} ({self.serial_number})"


class Employee(models.Model):
    name = models.CharField(max_length=255)
    department = models.CharField(max_length=255)
    email = models.EmailField()

    class Meta:
        ordering = ["name"]

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
    date_assigned = models.DateField(auto_now_add=True)
    date_returned = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-date_assigned", "-id"]

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

    def __str__(self) -> str:
        return f"{self.asset} maintenance on {self.date}"
