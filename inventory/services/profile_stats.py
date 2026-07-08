from ..models import Asset, Assignment, MaintenanceLog


def user_actor_labels(user) -> list[str]:
    labels = [user.username]
    full_name = user.get_full_name()
    if full_name:
        labels.append(full_name)
    return labels


def get_user_account_statistics(user) -> dict[str, int]:
    if not user or not getattr(user, "is_authenticated", False):
        return {
            "assets_created": 0,
            "assignments_made": 0,
            "maintenance_logs": 0,
        }

    assets_created = Asset.objects.filter(created_by=user).count()
    assignments_made = Assignment.objects.filter(created_by=user).count()
    maintenance_logs = MaintenanceLog.objects.filter(created_by=user).count()

    if maintenance_logs == 0:
        labels = user_actor_labels(user)
        maintenance_logs = MaintenanceLog.objects.filter(technician__in=labels).count()

    return {
        "assets_created": assets_created,
        "assignments_made": assignments_made,
        "maintenance_logs": maintenance_logs,
    }
