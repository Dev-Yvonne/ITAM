import datetime
import json

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from ..forms import AssetForm, AssignmentForm, EmployeeCreateForm, EmployeeForm
from ..models import Asset, AssetCatalog, Assignment, BackgroundJob, CatalogAsset, Employee, EmployeeNotification, MaintenanceLog, UserProfile
from ..services.background_jobs import enqueue_job
from ..services.dates import format_duration_since, format_duration_until
from ..services.ecosystem_map import build_ecosystem_map
from ..services.serial_numbers import build_serial_suggestion_payload, generate_unique_serial_numbers


def future_return_date(days=30):
    return (timezone.localdate() + datetime.timedelta(days=days)).isoformat()


def open_maintenance_payload(**overrides):
    payload = {
        "issue_description": "Screen replacement",
        "technician": "Grace",
        "repair_shop": "TechFix Repairs",
        "worker_contact": "grace@techfix.example",
        "expected_completion_date": future_return_date(14),
        "date": timezone.localdate().isoformat(),
    }
    payload.update(overrides)
    return payload



