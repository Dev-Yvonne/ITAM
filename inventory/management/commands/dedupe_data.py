import os
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Count
from inventory.models import (
    Asset,
    Assignment,
    MaintenanceLog,
    EmployeeNotification,
    AdminNotification,
    BackgroundJob,
)


class Command(BaseCommand):
    help = "Go through ITAM data to filter, clean up, and deduplicate redundant data"

    def handle(self, *args, **options):
        self.stdout.write("Starting data filter and deduplication process...")

        # 1. Deduplicate Maintenance Logs
        # Finds logs for the same asset, date, technician, and issue description
        self.deduplicate_maintenance_logs()

        # 2. Deduplicate Notifications
        # Finds duplicate notifications on the same day for same recipient
        self.deduplicate_notifications()

        # 3. Clean/Prune old read notifications (older than 14 days)
        self.prune_notifications()

        # 4. Clean/Prune old background jobs (older than 7 days)
        self.prune_background_jobs()

        self.stdout.write(self.style.SUCCESS("Deduplication and cleanup completed successfully."))

    def deduplicate_maintenance_logs(self):
        self.stdout.write("Scanning for duplicate maintenance logs...")
        duplicates = (
            MaintenanceLog.objects.values("asset_id", "date", "technician", "issue_description")
            .annotate(count=Count("id"))
            .filter(count__gt=1)
        )

        deleted_count = 0
        for dup in duplicates:
            logs = list(
                MaintenanceLog.objects.filter(
                    asset_id=dup["asset_id"],
                    date=dup["date"],
                    technician=dup["technician"],
                    issue_description=dup["issue_description"],
                ).order_by("id")
            )
            # Keep the first log, delete the rest
            keep = logs[0]
            to_delete = logs[1:]
            for log in to_delete:
                log.delete()
                deleted_count += 1

        if deleted_count > 0:
            self.stdout.write(
                self.style.SUCCESS(f"Deduplicated maintenance logs: deleted {deleted_count} redundant records.")
            )
        else:
            self.stdout.write("No duplicate maintenance logs found.")

    def deduplicate_notifications(self):
        self.stdout.write("Scanning for duplicate notifications...")
        
        # Employee Notifications
        emp_dups = (
            EmployeeNotification.objects.values("employee_id", "title", "message")
            .annotate(count=Count("id"))
            .filter(count__gt=1)
        )
        emp_deleted = 0
        for dup in emp_dups:
            notifs = list(
                EmployeeNotification.objects.filter(
                    employee_id=dup["employee_id"],
                    title=dup["title"],
                    message=dup["message"],
                ).order_by("-created_at")
            )
            # Keep the latest notification, delete the rest
            to_delete = notifs[1:]
            for notif in to_delete:
                # Only delete if created on the same calendar day
                if notif.created_at.date() == notifs[0].created_at.date():
                    notif.delete()
                    emp_deleted += 1

        # Admin Notifications
        admin_dups = (
            AdminNotification.objects.values("user_id", "title", "message")
            .annotate(count=Count("id"))
            .filter(count__gt=1)
        )
        admin_deleted = 0
        for dup in admin_dups:
            notifs = list(
                AdminNotification.objects.filter(
                    user_id=dup["user_id"],
                    title=dup["title"],
                    message=dup["message"],
                ).order_by("-created_at")
            )
            # Keep the latest notification, delete the rest
            to_delete = notifs[1:]
            for notif in to_delete:
                if notif.created_at.date() == notifs[0].created_at.date():
                    notif.delete()
                    admin_deleted += 1

        if emp_deleted > 0 or admin_deleted > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Deduplicated notifications: deleted {emp_deleted} employee & {admin_deleted} admin records."
                )
            )
        else:
            self.stdout.write("No duplicate notifications found.")

    def prune_notifications(self):
        self.stdout.write("Pruning read notifications older than 14 days...")
        cutoff = timezone.now() - timedelta(days=14)
        
        emp_pruned, _ = EmployeeNotification.objects.filter(read=True, created_at__lt=cutoff).delete()
        admin_pruned, _ = AdminNotification.objects.filter(read=True, created_at__lt=cutoff).delete()
        
        if emp_pruned > 0 or admin_pruned > 0:
            self.stdout.write(
                self.style.SUCCESS(f"Pruned old read notifications: deleted {emp_pruned} employee & {admin_pruned} admin records.")
            )
        else:
            self.stdout.write("No old read notifications to prune.")

    def prune_background_jobs(self):
        self.stdout.write("Pruning background jobs older than 7 days...")
        cutoff = timezone.now() - timedelta(days=7)
        old_jobs = BackgroundJob.objects.filter(
            status__in=[BackgroundJob.Status.COMPLETED, BackgroundJob.Status.FAILED],
            created_at__lt=cutoff,
        )
        
        job_count = 0
        file_count = 0
        for job in old_jobs:
            if job.result_file:
                try:
                    if os.path.exists(job.result_file.path):
                        os.remove(job.result_file.path)
                        file_count += 1
                except Exception as e:
                    self.stdout.write(
                        self.style.WARNING(f"Could not delete result file for job {job.id}: {e}")
                    )
            job.delete()
            job_count += 1
            
        if job_count > 0:
            self.stdout.write(
                self.style.SUCCESS(f"Pruned background jobs: deleted {job_count} jobs and {file_count} associated export files.")
            )
        else:
            self.stdout.write("No old background jobs to prune.")
