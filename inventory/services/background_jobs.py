import csv
import io
import logging
import threading
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Max
from django.urls import reverse
from django.utils import timezone

from inventory.models import Asset, BackgroundJob
from inventory.services.assets import get_asset_list_sections
from inventory.services.metrics import get_dashboard_context, get_reports_context
from inventory.services.serial_numbers import build_serial_suggestion_payload

logger = logging.getLogger(__name__)

JOB_HANDLERS = {}


def register_handler(job_type):
    def decorator(func):
        JOB_HANDLERS[job_type] = func
        return func

    return decorator


def _serialize_date(value):
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _serialize_dashboard_result(context: dict) -> dict:
    overdue_assets = []
    for asset in context.get("overdue_assets", []):
        overdue_assets.append(
            {
                "pk": asset.pk,
                "name": asset.name,
                "type": asset.type,
                "serial_number": asset.serial_number,
                "status": asset.status,
                "last_maintenance_date": _serialize_date(
                    getattr(asset, "last_maintenance_date", None)
                ),
                "detail_url": reverse("asset_detail", kwargs={"pk": asset.pk}),
            }
        )

    dashboard_stats = []
    for stat in context.get("dashboard_stats", []):
        dashboard_stats.append(
            {
                "label": stat["label"],
                "value": stat["value"],
                "trend": stat["trend"],
                "css_class": stat["css_class"],
                "icon": stat["icon"],
                "link": stat["link"],
                "data_count": stat.get("data_count"),
                "animate_count": stat.get("animate_count", False),
            }
        )

    return {
        "total_assets": context.get("total_assets", 0),
        "available_assets": context.get("available_assets", 0),
        "assigned_assets": context.get("assigned_assets", 0),
        "maintenance_assets": context.get("maintenance_assets", 0),
        "employee_count": context.get("employee_count", 0),
        "total_employees": context.get("employee_count", 0),
        "utilization_rate": context.get("utilization_rate", 0),
        "asset_health_rate": context.get("asset_health_rate", 0),
        "overdue_assets_count": context.get("overdue_assets_count", 0),
        "overdue_cutoff": _serialize_date(context.get("overdue_cutoff")),
        "total_assignments": context.get("total_assignments", 0),
        "dashboard_stats": dashboard_stats,
        "overdue_assets": overdue_assets,
        "analytics": context.get("analytics", {}),
    }


def _serialize_asset_sections(sections: dict) -> dict:
    def row_dates(row, *keys):
        serialized = dict(row)
        for key in keys:
            if key in serialized:
                serialized[key] = _serialize_date(serialized[key])
        return serialized

    return {
        "assigned_asset_rows": [
            row_dates(row, "date_assigned", "expected_return_date")
            for row in sections["assigned_asset_rows"]
        ],
        "available_asset_rows": sections["available_asset_rows"],
        "maintenance_asset_rows": sections["maintenance_asset_rows"],
        "laptop_rows": sections["laptop_rows"],
        "monitor_rows": sections["monitor_rows"],
        "printer_rows": sections["printer_rows"],
        "router_rows": sections["router_rows"],
    }


@register_handler(BackgroundJob.JobType.DASHBOARD)
def handle_dashboard_job(job: BackgroundJob) -> dict:
    return _serialize_dashboard_result(get_dashboard_context())


@register_handler(BackgroundJob.JobType.REPORTS)
def handle_reports_job(job: BackgroundJob) -> dict:
    return get_reports_context()


@register_handler(BackgroundJob.JobType.ASSET_SECTIONS)
def handle_asset_sections_job(job: BackgroundJob) -> dict:
    return _serialize_asset_sections(get_asset_list_sections())


@register_handler(BackgroundJob.JobType.SERIAL_SUGGESTIONS)
def handle_serial_suggestions(job: BackgroundJob) -> dict:
    per_type = int(job.params.get("per_type", 8))
    return build_serial_suggestion_payload(per_type=per_type)


def _can_write_media_exports() -> bool:
    if getattr(settings, "IS_VERCEL", False):
        return False

    export_dir = settings.MEDIA_ROOT / "exports"
    try:
        export_dir.mkdir(parents=True, exist_ok=True)
        test_file = export_dir / ".write_test"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink()
        return True
    except OSError:
        return False


@register_handler(BackgroundJob.JobType.CSV_EXPORT)
def handle_csv_export_job(job: BackgroundJob) -> dict:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["Name", "Type", "Serial Number", "Status", "Last Maintenance Date"]
    )
    row_count = 0
    queryset = Asset.objects.annotate(
        last_maintenance_date=Max("maintenance_logs__date")
    ).order_by("name", "serial_number")
    for asset in queryset.iterator(chunk_size=2000):
        writer.writerow(
            [
                asset.name,
                asset.type,
                asset.serial_number,
                asset.status,
                asset.last_maintenance_date or "",
            ]
        )
        row_count += 1

    csv_content = buffer.getvalue()
    filename = "itam_asset_report.csv"
    result = {
        "row_count": row_count,
        "filename": filename,
        "download_url": reverse("background_job_download", kwargs={"job_id": job.id}),
    }

    if _can_write_media_exports():
        job.result_file.save(
            f"itam_asset_report_{job.id}.csv",
            ContentFile(csv_content.encode("utf-8")),
            save=False,
        )
    else:
        result["csv_content"] = csv_content

    return result


def get_result_ttl():
    return timedelta(
        seconds=getattr(settings, "BACKGROUND_JOB_RESULT_TTL_SECONDS", 120)
    )


def get_recent_completed_job(user, job_type: str):
    cutoff = timezone.now() - get_result_ttl()
    return (
        BackgroundJob.objects.filter(
            user=user,
            job_type=job_type,
            status=BackgroundJob.Status.COMPLETED,
            completed_at__gte=cutoff,
        )
        .order_by("-completed_at")
        .first()
    )


def get_active_job(user, job_type: str):
    return (
        BackgroundJob.objects.filter(
            user=user,
            job_type=job_type,
            status__in=[
                BackgroundJob.Status.PENDING,
                BackgroundJob.Status.RUNNING,
            ],
        )
        .order_by("-priority", "created_at")
        .first()
    )


def enqueue_job(user, job_type: str, *, params=None, force: bool = False) -> BackgroundJob:
    if job_type not in dict(BackgroundJob.JobType.choices):
        raise ValueError(f"Unknown job type: {job_type}")

    if not force:
        active = get_active_job(user, job_type)
        if active:
            dispatch_job(active)
            return active

        cached = get_recent_completed_job(user, job_type)
        if cached:
            return cached

    priority = BackgroundJob.JOB_PRIORITIES.get(job_type, 50)
    job = BackgroundJob.objects.create(
        user=user,
        job_type=job_type,
        priority=priority,
        params=params or {},
    )
    dispatch_job(job)
    return job


def dispatch_job(job: BackgroundJob):
    if job.status != BackgroundJob.Status.PENDING:
        return
    if getattr(settings, "BACKGROUND_JOBS_USE_THREADS", True):
        thread = threading.Thread(
            target=process_job,
            args=(str(job.id),),
            daemon=True,
            name=f"bgjob-{job.job_type}-{job.id}",
        )
        thread.start()
    else:
        process_job(str(job.id))


def process_job(job_id: str) -> BackgroundJob | None:
    with transaction.atomic():
        job = (
            BackgroundJob.objects.select_for_update(skip_locked=True)
            .filter(id=job_id)
            .first()
        )
        if not job:
            return None
        if job.status not in {
            BackgroundJob.Status.PENDING,
            BackgroundJob.Status.RUNNING,
        }:
            return job
        job.status = BackgroundJob.Status.RUNNING
        job.started_at = timezone.now()
        job.save(update_fields=["status", "started_at"])

    handler = JOB_HANDLERS.get(job.job_type)
    if not handler:
        job.status = BackgroundJob.Status.FAILED
        job.error_message = f"No handler for job type {job.job_type}"
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error_message", "completed_at"])
        return job

    try:
        result = handler(job)
        job.result = result
        job.status = BackgroundJob.Status.COMPLETED
        job.error_message = ""
        job.completed_at = timezone.now()
        update_fields = ["result", "status", "error_message", "completed_at"]
        if job.result_file:
            update_fields.append("result_file")
        job.save(update_fields=update_fields)
    except Exception as exc:
        logger.exception("Background job %s failed", job_id)
        job.status = BackgroundJob.Status.FAILED
        job.error_message = str(exc)
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error_message", "completed_at"])

    return job


def process_pending_jobs(limit: int = 10) -> int:
    processed = 0
    pending_ids = list(
        BackgroundJob.objects.filter(status=BackgroundJob.Status.PENDING)
        .order_by("-priority", "created_at")
        .values_list("id", flat=True)[:limit]
    )
    for job_id in pending_ids:
        process_job(str(job_id))
        processed += 1
    return processed


def serialize_job(job: BackgroundJob) -> dict:
    payload = {
        "id": str(job.id),
        "job_type": job.job_type,
        "status": job.status,
        "priority": job.priority,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }
    if job.status == BackgroundJob.Status.COMPLETED:
        payload["result"] = job.result
        has_download = bool(
            job.result_file or (job.result or {}).get("csv_content")
        )
        if has_download:
            payload["download_url"] = reverse(
                "background_job_download",
                kwargs={"job_id": job.id},
            )
    return payload
