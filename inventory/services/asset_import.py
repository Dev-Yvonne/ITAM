import csv
import io
import uuid
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from inventory.models import (
    Asset,
    AssetCatalog,
    Assignment,
    CatalogAsset,
    Employee,
    MaintenanceLog,
)

CSV_HEADERS = [
    "Name",
    "Type",
    "Serial Number",
    "Status",
    "Last Maintenance Date",
]

HEADER_ALIASES = {
    "name": "name",
    "type": "type",
    "serial number": "serial_number",
    "serial": "serial_number",
    "status": "status",
    "employee": "employee",
    "assigned to": "employee",
    "assigned employee": "employee",
    "assignee": "employee",
    "employee name": "employee",
    "last maintenance date": "last_maintenance_date",
    "last maintenance": "last_maintenance_date",
}

AUTO_MAPPED_FIELDS = frozenset({
    "name",
    "type",
    "serial_number",
    "status",
    "employee",
    "last_maintenance_date",
})

TYPE_TO_MODEL = {
    "laptop": Asset.AssetType.LAPTOP,
    "printer": Asset.AssetType.PRINTER,
    "router": Asset.AssetType.ROUTER,
    "monitor": Asset.AssetType.MONITOR,
}

STATUS_TO_MODEL = {
    "available": Asset.AssetStatus.AVAILABLE,
    "assigned": Asset.AssetStatus.ASSIGNED,
    "maintenance": Asset.AssetStatus.UNDER_MAINTENANCE,
    "under maintenance": Asset.AssetStatus.UNDER_MAINTENANCE,
}


class CSVImportError(Exception):
    def __init__(self, message: str, *, code: str = "invalid_csv"):
        super().__init__(message)
        self.code = code


def is_csv_upload(uploaded_file) -> bool:
    if not uploaded_file or not uploaded_file.name:
        return False
    return uploaded_file.name.lower().endswith(".csv")


def _normalize_header(value: str) -> str:
    return " ".join(str(value or "").strip().lower().replace("_", " ").split())


def _parse_maintenance_date(value: str):
    if not value or not str(value).strip():
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _normalize_type(value: str) -> str:
    normalized = TYPE_TO_MODEL.get(str(value or "").strip().lower())
    if not normalized:
        raise ValueError(f"Unknown asset type: {value}")
    return normalized


def _normalize_status(value: str) -> str:
    if not value or not str(value).strip():
        return Asset.AssetStatus.AVAILABLE
    normalized = STATUS_TO_MODEL.get(str(value).strip().lower())
    if not normalized:
        raise ValueError(f"Unknown status: {value}")
    return normalized


def _read_csv_text(uploaded_file) -> tuple[str, csv.Dialect]:
    if not is_csv_upload(uploaded_file):
        raise CSVImportError(
            "The chosen file was not a CSV, Try again.",
            code="not_csv",
        )

    raw = uploaded_file.read()
    if isinstance(raw, bytes):
        text = None
        for encoding in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            raise CSVImportError("Unable to read the CSV file encoding.")
    else:
        text = raw

    if not text.strip():
        raise CSVImportError("The CSV file is empty.")

    try:
        sample = text[:4096]
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel

    return text, dialect


def _auto_column_map(headers: list[str]) -> dict[str, int]:
    column_map = {}
    for index, header in enumerate(headers):
        key = HEADER_ALIASES.get(_normalize_header(header))
        if key in AUTO_MAPPED_FIELDS and key not in column_map:
            column_map[key] = index
    return column_map


def _fuzzy_suggest_mapping(headers: list[str], column_map: dict[str, int]) -> dict[str, str | None]:
    suggested = {
        "name": None,
        "type": None,
        "serial_number": None,
        "status": None,
        "employee": None,
        "last_maintenance_date": None,
    }
    for field, index in column_map.items():
        if field in suggested and index < len(headers):
            suggested[field] = headers[index]

    fuzzy_rules = {
        "name": ("asset name", "device name", "equipment name", "product name", "item name"),
        "type": ("asset type", "device type", "category", "equipment type"),
        "serial_number": ("serial no", "serial #", "sn", "serial number", "asset tag", "tag"),
        "status": ("asset status",),
        "employee": ("assigned to", "assigned employee", "assignee", "employee name", "owner"),
        "last_maintenance_date": ("last service", "service date", "maintenance date"),
    }
    for header in headers:
        normalized = _normalize_header(header)
        for field, aliases in fuzzy_rules.items():
            if suggested[field]:
                continue
            if normalized == field.replace("_", " ") or normalized in aliases:
                suggested[field] = header
    return suggested


def _column_map_from_user_mapping(headers: list[str], mapping: dict) -> dict[str, int]:
    header_to_index = {header: index for index, header in enumerate(headers)}
    column_map: dict[str, int] = {}
    for field, header_name in mapping.items():
        if field not in HEADER_ALIASES.values() and field not in {
            "name",
            "type",
            "serial_number",
            "status",
            "employee",
            "last_maintenance_date",
        }:
            continue
        if not header_name or not str(header_name).strip():
            continue
        header_label = str(header_name).strip()
        if header_label not in header_to_index:
            raise CSVImportError(f'Column "{header_label}" was not found in the CSV.')
        column_map[field] = header_to_index[header_label]
    return column_map


def _parse_csv_rows(text: str, dialect: csv.Dialect, column_map: dict[str, int]) -> list[dict]:
    reader = csv.reader(io.StringIO(text), dialect)
    next(reader, None)

    rows = []
    for line_number, cells in enumerate(reader, start=2):
        if not any(str(cell).strip() for cell in cells):
            continue

        def cell(field: str) -> str:
            idx = column_map.get(field)
            if idx is None or idx >= len(cells):
                return ""
            return str(cells[idx]).strip()

        name = cell("name")
        serial = cell("serial_number")
        if not name or not serial:
            rows.append(
                {
                    "row": line_number,
                    "error": "Name and Serial Number are required.",
                }
            )
            continue

        try:
            asset_type = _normalize_type(cell("type"))
            status = _normalize_status(cell("status"))
        except ValueError as exc:
            rows.append({"row": line_number, "error": str(exc)})
            continue

        rows.append(
            {
                "row": line_number,
                "name": name,
                "type": asset_type,
                "serial_number": serial,
                "status": status,
                "employee_name": cell("employee"),
                "last_maintenance_date": _parse_maintenance_date(
                    cell("last_maintenance_date")
                ),
            }
        )

    return rows


def validate_csv_upload(uploaded_file, column_mapping: dict | None = None) -> dict:
    text, dialect = _read_csv_text(uploaded_file)
    reader = csv.reader(io.StringIO(text), dialect)
    try:
        header_row = next(reader)
    except StopIteration:
        raise CSVImportError("The CSV file is empty.")

    headers = [str(header).strip() for header in header_row]
    if not headers or not any(headers):
        raise CSVImportError("The CSV file has no column headers.")

    if column_mapping:
        column_map = _column_map_from_user_mapping(headers, column_mapping)
        missing = [
            label
            for field, label in (
                ("name", "Name"),
                ("type", "Type"),
                ("serial_number", "Serial Number"),
            )
            if field not in column_map
        ]
        if missing:
            raise CSVImportError(
                "Please map the required columns: " + ", ".join(missing) + "."
            )
    else:
        column_map = _auto_column_map(headers)
        required = {"name", "type", "serial_number"}
        if not required.issubset(column_map):
            return {
                "needs_column_mapping": True,
                "headers": headers,
                "suggested_mapping": _fuzzy_suggest_mapping(headers, column_map),
            }

    rows = _parse_csv_rows(text, dialect, column_map)
    valid_rows = [row for row in rows if "error" not in row]
    if not valid_rows:
        raise CSVImportError("No valid asset rows were found in the CSV.")

    applied_mapping = {
        field: headers[index]
        for field, index in column_map.items()
        if index < len(headers)
    }
    conflicts = detect_serial_conflicts(rows)
    has_employee_column = "employee" in column_map
    assignment_payload = build_assignment_review_payload(
        rows,
        has_employee_column=has_employee_column,
    )
    return {
        "ready": True,
        "rows": rows,
        "conflicts": conflicts,
        "valid_count": len(valid_rows),
        "error_count": sum(1 for row in rows if "error" in row),
        "column_mapping": applied_mapping,
        "has_employee_column": has_employee_column,
        **assignment_payload,
    }


def parse_csv_upload(uploaded_file, column_mapping: dict | None = None) -> list[dict]:
    result = validate_csv_upload(uploaded_file, column_mapping)
    if result.get("needs_column_mapping"):
        raise CSVImportError(
            "Column mapping is required before this CSV can be imported.",
            code="needs_column_mapping",
        )
    return result["rows"]


def _coerce_row(row: dict) -> dict:
    coerced = dict(row)
    value = coerced.get("last_maintenance_date")
    if isinstance(value, str):
        coerced["last_maintenance_date"] = _parse_maintenance_date(value)
    return coerced


def serialize_import_rows(rows: list[dict]) -> list[dict]:
    serialized = []
    for row in rows:
        payload = dict(row)
        value = payload.get("last_maintenance_date")
        if hasattr(value, "isoformat"):
            payload["last_maintenance_date"] = value.isoformat()
        serialized.append(payload)
    return serialized


def serialize_catalog_asset(asset: CatalogAsset) -> dict:
    return {
        "name": asset.name,
        "type": asset.type,
        "serial_number": asset.serial_number,
        "status": asset.status,
        "last_maintenance_date": (
            asset.last_maintenance_date.isoformat()
            if asset.last_maintenance_date
            else None
        ),
        "imported_at": asset.imported_at.isoformat() if asset.imported_at else None,
    }


def serialize_catalog(catalog: AssetCatalog) -> dict:
    assets = list(catalog.assets.all().order_by("name", "serial_number"))
    return {
        "id": catalog.pk,
        "name": catalog.name,
        "created_at": catalog.created_at.isoformat() if catalog.created_at else None,
        "asset_count": len(assets),
        "assets": [serialize_catalog_asset(asset) for asset in assets],
    }


def detect_serial_conflicts(rows: list[dict]) -> list[dict]:
    conflicts = []
    seen: dict[str, dict] = {}

    for row in rows:
        if "error" in row:
            continue
        serial_key = row["serial_number"].lower()
        if serial_key in seen:
            conflicts.append(
                {
                    "serial": row["serial_number"],
                    "upload_name": row["name"],
                    "conflict_type": "duplicate_in_file",
                    "other_upload_name": seen[serial_key]["name"],
                    "existing_id": None,
                    "existing_name": None,
                }
            )
            continue
        seen[serial_key] = row

        existing = Asset.objects.filter(serial_number__iexact=row["serial_number"]).first()
        if existing:
            conflicts.append(
                {
                    "serial": row["serial_number"],
                    "upload_name": row["name"],
                    "conflict_type": "existing_asset",
                    "existing_id": existing.pk,
                    "existing_name": existing.name,
                }
            )

    deduped = []
    seen_serials = set()
    for conflict in conflicts:
        key = (conflict["serial"].lower(), conflict.get("conflict_type"))
        if key in seen_serials:
            continue
        seen_serials.add(key)
        deduped.append(conflict)
    return deduped


_UNSET = object()


def _employee_lookup() -> tuple[dict[str, Employee], dict[str, Employee]]:
    by_name: dict[str, Employee] = {}
    by_email: dict[str, Employee] = {}
    for employee in Employee.objects.all().order_by("name"):
        by_name[employee.name.strip().lower()] = employee
        by_email[employee.email.strip().lower()] = employee
    return by_name, by_email


def _match_employee(value: str, by_name: dict[str, Employee], by_email: dict[str, Employee]) -> Employee | None:
    if not value or not str(value).strip():
        return None
    key = str(value).strip().lower()
    return by_name.get(key) or by_email.get(key)


def serialize_employees_for_import() -> list[dict]:
    return [
        {
            "id": employee.pk,
            "name": employee.name,
            "email": employee.email,
            "department": employee.department,
        }
        for employee in Employee.objects.all().order_by("name")
    ]


def build_assignment_review_payload(rows: list[dict], *, has_employee_column: bool) -> dict:
    by_name, by_email = _employee_lookup()
    reviews = []

    for row in rows:
        if "error" in row or row.get("status") != Asset.AssetStatus.ASSIGNED:
            continue

        csv_employee_name = (row.get("employee_name") or "").strip()
        suggested_employee = _match_employee(csv_employee_name, by_name, by_email)
        source = "csv" if csv_employee_name else "system"

        if not suggested_employee and not has_employee_column:
            existing = Asset.objects.filter(
                serial_number__iexact=row["serial_number"]
            ).first()
            if existing:
                active_assignment = (
                    Assignment.objects.filter(
                        asset=existing,
                        date_returned__isnull=True,
                    )
                    .select_related("employee")
                    .first()
                )
                if active_assignment:
                    suggested_employee = active_assignment.employee
                    source = "system"

        reviews.append(
            {
                "serial": row["serial_number"],
                "asset_name": row["name"],
                "csv_employee_name": csv_employee_name,
                "suggested_employee_id": (
                    suggested_employee.pk if suggested_employee else None
                ),
                "suggested_employee_name": (
                    suggested_employee.name if suggested_employee else None
                ),
                "source": source if suggested_employee or csv_employee_name else "manual",
            }
        )

    return {
        "assignment_reviews": reviews,
        "employees": serialize_employees_for_import(),
    }


def _unique_serial(serial: str, *, exclude_pk: int | None = None) -> str:
    candidate = serial
    suffix = 1
    while Asset.objects.filter(serial_number__iexact=candidate).exclude(pk=exclude_pk).exists():
        candidate = f"{serial}-import-{suffix}"
        suffix += 1
    return candidate


def _apply_maintenance_date(asset: Asset, maintenance_date):
    if not maintenance_date:
        return
    MaintenanceLog.objects.create(
        asset=asset,
        issue_description="Imported maintenance record",
        technician="CSV Import",
        date=maintenance_date,
        resolved=True,
    )


def _apply_import_assignment(asset: Asset, employee_id: int | None) -> None:
    if not employee_id:
        return

    employee = Employee.objects.filter(pk=employee_id).first()
    if not employee:
        return

    Assignment.objects.filter(
        asset=asset,
        date_returned__isnull=True,
    ).update(date_returned=timezone.now())

    Assignment.objects.create(asset=asset, employee=employee)
    asset.status = Asset.AssetStatus.ASSIGNED
    asset.save(update_fields=["status"])


def _assignment_employee_id(row: dict, assignment_confirmations: dict) -> int | None:
    serial = row["serial_number"]
    confirmation = assignment_confirmations.get(serial, _UNSET)
    if confirmation is _UNSET:
        by_name, by_email = _employee_lookup()
        matched = _match_employee(row.get("employee_name", ""), by_name, by_email)
        return matched.pk if matched else None
    if confirmation in ("", "available", None):
        return None
    try:
        return int(confirmation)
    except (TypeError, ValueError):
        return None


def _resolve_import_status(row: dict, assignment_confirmations: dict, employee_id: int | None) -> str:
    serial = row["serial_number"]
    if row.get("status") != Asset.AssetStatus.ASSIGNED:
        return row["status"]

    confirmation = assignment_confirmations.get(serial, _UNSET)
    if confirmation in ("", "available"):
        return Asset.AssetStatus.AVAILABLE
    if employee_id:
        return Asset.AssetStatus.ASSIGNED
    if confirmation is _UNSET:
        return row["status"]
    return Asset.AssetStatus.AVAILABLE


@transaction.atomic
def execute_import(
    rows: list[dict],
    *,
    mode: str,
    catalog_name: str = "",
    resolutions: dict | None = None,
    assignment_confirmations: dict | None = None,
    user=None,
) -> dict:
    resolutions = resolutions or {}
    assignment_confirmations = assignment_confirmations or {}
    valid_rows = [row for row in rows if "error" not in row]
    created = 0
    updated = 0
    skipped = 0
    errors = []

    if mode == "catalog":
        name = (catalog_name or "").strip()
        if not name:
            raise CSVImportError("A table name is required for a new directory.")
        if AssetCatalog.objects.filter(name__iexact=name).exists():
            raise CSVImportError(f'A directory named "{name}" already exists.')
        catalog = AssetCatalog.objects.create(name=name, created_by=user)
        catalog_serials: set[str] = set()

        for row in valid_rows:
            row = _coerce_row(row)
            serial = row["serial_number"]
            if serial.lower() in catalog_serials:
                serial = f"{serial}-import-{uuid.uuid4().hex[:6]}"
            catalog_serials.add(serial.lower())
            employee_id = _assignment_employee_id(row, assignment_confirmations)
            import_status = _resolve_import_status(row, assignment_confirmations, employee_id)
            CatalogAsset.objects.create(
                catalog=catalog,
                name=row["name"],
                type=row["type"],
                serial_number=serial,
                status=import_status,
                last_maintenance_date=row.get("last_maintenance_date"),
            )
            created += 1

        return {
            "mode": "catalog",
            "catalog_id": catalog.pk,
            "catalog_name": catalog.name,
            "catalog": serialize_catalog(catalog),
            "created": created,
            "updated": 0,
            "skipped": skipped,
            "errors": errors,
        }

    if mode != "merge":
        raise CSVImportError("Invalid import mode.")

    for row in valid_rows:
        row = _coerce_row(row)
        serial = row["serial_number"]
        employee_id = _assignment_employee_id(row, assignment_confirmations)
        import_status = _resolve_import_status(row, assignment_confirmations, employee_id)
        existing = Asset.objects.filter(serial_number__iexact=serial).first()
        resolution = resolutions.get(serial, "add_new")

        if existing and resolution == "replace":
            existing.name = row["name"]
            existing.type = row["type"]
            existing.status = import_status
            existing.save(update_fields=["name", "type", "status"])
            if row.get("last_maintenance_date"):
                _apply_maintenance_date(existing, row["last_maintenance_date"])
            if import_status == Asset.AssetStatus.ASSIGNED:
                _apply_import_assignment(existing, employee_id)
            elif import_status == Asset.AssetStatus.AVAILABLE:
                Assignment.objects.filter(
                    asset=existing,
                    date_returned__isnull=True,
                ).update(date_returned=timezone.now())
            updated += 1
            continue

        if existing and resolution != "replace":
            serial = _unique_serial(serial)

        if Asset.objects.filter(serial_number__iexact=serial).exists():
            errors.append(
                {
                    "row": row["row"],
                    "message": f"Could not import {row['name']}: serial already exists.",
                }
            )
            skipped += 1
            continue

        asset = Asset.objects.create(
            name=row["name"],
            type=row["type"],
            serial_number=serial,
            status=import_status,
        )
        if row.get("last_maintenance_date"):
            _apply_maintenance_date(asset, row["last_maintenance_date"])
        if import_status == Asset.AssetStatus.ASSIGNED:
            _apply_import_assignment(asset, employee_id)
        created += 1

    return {
        "mode": "merge",
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }
