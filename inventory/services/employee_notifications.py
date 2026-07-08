import logging

from django.db.utils import DatabaseError, OperationalError, ProgrammingError

from ..models import EmployeeNotification

logger = logging.getLogger(__name__)


def serialize_employee_notification(notification):
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "link": notification.link,
        "read": notification.read,
        "created_label": "Just now",
    }


def create_employee_notification(
    employee,
    *,
    notification_type,
    title,
    message,
    link="",
):
    try:
        return EmployeeNotification.objects.create(
            employee=employee,
            type=notification_type,
            title=title,
            message=message,
            link=link,
        )
    except (DatabaseError, OperationalError, ProgrammingError):
        logger.exception(
            "Unable to create employee notification for employee_id=%s",
            getattr(employee, "pk", None),
        )
        return None


def get_employee_notifications(employee, limit=5):
    try:
        queryset = employee.notifications.all()
        if limit is not None:
            return list(queryset[:limit])
        return queryset
    except (DatabaseError, OperationalError, ProgrammingError):
        logger.exception(
            "Unable to load employee notifications for employee_id=%s",
            getattr(employee, "pk", None),
        )
        return []


def get_employee_unread_notification_count(employee):
    try:
        return employee.notifications.filter(read=False).count()
    except (DatabaseError, OperationalError, ProgrammingError):
        logger.exception(
            "Unable to count employee notifications for employee_id=%s",
            getattr(employee, "pk", None),
        )
        return 0
