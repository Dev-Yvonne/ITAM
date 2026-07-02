import datetime
import json

from django.db.models import Count, Exists, Max, OuterRef, Q
from django.db.models.functions import TruncMonth
from django.urls import reverse
from django.utils import timezone

from inventory.models import Asset, Assignment, Employee, MaintenanceLog


def calculate_percentage(value: int, total: int, *, digits: int = 0):
    if not total:
        return 0
    percentage = (value / total) * 100
    return round(percentage, digits) if digits else round(percentage)


def format_ratio(value: int, total: int) -> str:
    return f"{value}/{total}"


def get_asset_counts() -> dict:
    return Asset.objects.aggregate(
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


def get_service_overdue_cutoff():
    return timezone.now() - datetime.timedelta(days=Asset.SERVICE_INTERVAL_DAYS)


def get_overdue_assets_queryset():
    overdue_cutoff = get_service_overdue_cutoff().date()
    created_cutoff = get_service_overdue_cutoff()
    recent_maintenance = MaintenanceLog.objects.filter(
        asset=OuterRef("pk"),
        date__gte=overdue_cutoff,
    )
    return (
        Asset.objects.annotate(
            has_recent_maintenance=Exists(recent_maintenance),
            last_maintenance_date=Max("maintenance_logs__date"),
        )
        .filter(has_recent_maintenance=False)
        .filter(
            Q(last_maintenance_date__lt=overdue_cutoff)
            | Q(last_maintenance_date__isnull=True, date_created__lt=created_cutoff)
        )
        .order_by("name", "serial_number")
    )


def get_dashboard_context() -> dict:
    counts = get_asset_counts()
    total_assets = counts["total_assets"]
    available_assets = counts["available_assets"]
    assigned_assets = counts["assigned_assets"]
    maintenance_assets = counts["maintenance_assets"]
    employee_count = Employee.objects.count()
    overdue_assets = get_overdue_assets_queryset()
    asset_list_url = reverse("asset_list")
    reports = get_reports_context()

    return {
        **counts,
        "employee_count": employee_count,
        "total_employees": employee_count,
        "status_counts": Asset.objects.values("status").annotate(total=Count("id")),
        "asset_summary": counts,
        "overdue_assets": overdue_assets,
        "overdue_assets_count": overdue_assets.count(),
        "overdue_cutoff": get_service_overdue_cutoff().date(),
        "utilization_rate": calculate_percentage(assigned_assets, total_assets),
        "asset_health_rate": calculate_percentage(maintenance_assets, total_assets),
        "total_assignments": reports.get("total_assignments", 0),
        "analytics": {
            "asset_by_status": json.loads(reports["asset_by_status"]),
            "asset_by_type": json.loads(reports["asset_by_type"]),
            "monthly_assets": json.loads(reports["monthly_assets"]),
            "maintenance_by_month": json.loads(reports["maintenance_by_month"]),
            "top_assets": json.loads(reports["top_assets_data"]),
            "department_counts": json.loads(reports["department_counts"]),
        },
        "dashboard_stats": [
            {
                "label": "Total Assets",
                "value": total_assets,
                "trend": "All equipment",
                "css_class": "stat-total",
                "icon": "fa-boxes",
                "data_count": total_assets,
                "animate_count": True,
                "link": asset_list_url,
            },
            {
                "label": "Available",
                "value": format_ratio(available_assets, total_assets),
                "trend": "Ready for assignment",
                "css_class": "stat-available",
                "icon": "fa-check-circle",
                "link": f"{asset_list_url}#available-assets",
            },
            {
                "label": "Assigned",
                "value": format_ratio(assigned_assets, total_assets),
                "trend": "Currently with employees",
                "css_class": "stat-assigned",
                "icon": "fa-user-check",
                "link": f"{asset_list_url}#assigned-assets",
            },
            {
                "label": "Under Maintenance",
                "value": format_ratio(maintenance_assets, total_assets),
                "trend": "In repair shop",
                "css_class": "stat-maintenance",
                "icon": "fa-tools",
                "link": f"{asset_list_url}#maintenance-assets",
            },
        ],
    }


def _month_start(value):
    return value.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _add_months(value, months: int):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return value.replace(year=year, month=month, day=1)


def _last_month_starts(count: int = 6):
    current_month = _month_start(timezone.now())
    return [_add_months(current_month, offset) for offset in range(-(count - 1), 1)]


def _serialize_month_counts(queryset, date_field: str, month_starts: list):
    first_month = month_starts[0]
    next_month = _add_months(month_starts[-1], 1)
    model_field = queryset.model._meta.get_field(date_field)
    if model_field.get_internal_type() == "DateField":
        lower_bound = first_month.date()
        upper_bound = next_month.date()
    else:
        lower_bound = first_month
        upper_bound = next_month
    rows = (
        queryset.filter(**{f"{date_field}__gte": lower_bound, f"{date_field}__lt": upper_bound})
        .annotate(month=TruncMonth(date_field))
        .values("month")
        .annotate(count=Count("id"))
    )
    counts_by_month = {
        row["month"].date() if hasattr(row["month"], "date") else row["month"]: row["count"]
        for row in rows
    }
    return [
        {
            "month": month_start.strftime("%b %Y"),
            "count": counts_by_month.get(month_start.date(), 0),
        }
        for month_start in month_starts
    ]


def get_reports_context() -> dict:
    counts = get_asset_counts()
    total_assets = counts["total_assets"]
    assigned_assets = counts["assigned_assets"]
    maintenance_assets = counts["maintenance_assets"]
    total_employees = Employee.objects.count()

    type_labels = dict(Asset.AssetType.choices)
    asset_by_type = {
        type_labels.get(row["type"], row["type"]): row["total"]
        for row in Asset.objects.values("type").annotate(total=Count("id")).order_by("type")
        if row["total"] > 0
    }
    asset_by_status = {
        "Available": counts["available_assets"],
        "Assigned": assigned_assets,
        "Under Maintenance": maintenance_assets,
    }

    month_starts = _last_month_starts()
    monthly_assets = _serialize_month_counts(Asset.objects.all(), "date_created", month_starts)
    maintenance_by_month = _serialize_month_counts(
        MaintenanceLog.objects.all(),
        "date",
        month_starts,
    )
    top_assets_data = [
        {
            "name": asset.name,
            "assignments": asset.assignment_count,
        }
        for asset in Asset.objects.annotate(
            assignment_count=Count("assignments"),
        ).order_by("-assignment_count", "name")[:5]
    ]
    department_counts = {
        row["department"] or "Unassigned": row["total"]
        for row in Employee.objects.values("department").annotate(total=Count("id")).order_by("department")
    }
    utilization_rate = calculate_percentage(assigned_assets, total_assets, digits=1)
    asset_health_rate = calculate_percentage(maintenance_assets, total_assets)

    return {
        **counts,
        "total_employees": total_employees,
        "asset_by_type": json.dumps(asset_by_type),
        "asset_by_status": json.dumps(asset_by_status),
        "monthly_assets": json.dumps(monthly_assets),
        "maintenance_by_month": json.dumps(maintenance_by_month),
        "top_assets_data": json.dumps(top_assets_data),
        "department_counts": json.dumps(department_counts),
        "utilization_rate": utilization_rate,
        "asset_health_rate": asset_health_rate,
        "overdue_count": get_overdue_assets_queryset().count(),
        "total_assignments": Assignment.objects.count(),
    }
