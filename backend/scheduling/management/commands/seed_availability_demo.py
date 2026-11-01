"""Non-destructive local/demo slots for the existing employer1 account."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from jobs.models import Job
from scheduling.models import InterviewSlot, SLOT_DURATION


class Command(BaseCommand):
    help = "Add a reserved demo job and two future slots for employer1; run seed_auth_demo first."

    @transaction.atomic
    def handle(self, *args, **options):
        employer = get_user_model().objects.filter(username="employer1", role="Employer").first()
        if employer is None:
            raise CommandError("Run seed_auth_demo first to create the local/demo employer1 account.")
        job, _ = Job.objects.get_or_create(
            employer=employer, title="[Local demo] Interview availability",
            defaults={"description": "Reserved local/demo job for the interview slot workflow."},
        )
        start = timezone.localtime(timezone.now(), ZoneInfo("Asia/Shanghai")).replace(
            hour=9, minute=0, second=0, microsecond=0,
        ) + timedelta(days=1)
        for offset in (0, 1):
            slot_start = start + offset * SLOT_DURATION
            InterviewSlot.objects.get_or_create(job=job, start_at=slot_start, end_at=slot_start + SLOT_DURATION)
        self.stdout.write(self.style.SUCCESS(
            "Local/demo availability ready for employer1: tomorrow 09:00 and 09:30 Asia/Shanghai. "
            "Existing jobs, slots and bookings were retained."
        ))
