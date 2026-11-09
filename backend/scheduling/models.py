"""Availability and booking storage; writes are governed by booking_services."""
from datetime import timedelta

from django.db import models
from django.utils import timezone

SLOT_DURATION = timedelta(minutes=30)


class InterviewSlotQuerySet(models.QuerySet):
    def available(self):
        return self.filter(start_at__gt=timezone.now(), booking__isnull=True)


class InterviewSlot(models.Model):
    # One owner, derived from job.employer; no separate, potentially stale owner.
    job = models.ForeignKey("jobs.Job", on_delete=models.PROTECT, related_name="interview_slots")
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    objects = InterviewSlotQuerySet.as_manager()

    class Meta:
        ordering = ["start_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_at=models.F("start_at") + SLOT_DURATION),
                name="scheduling_slot_30_minutes",
            ),
        ]
        indexes = [models.Index(fields=["job", "start_at"], name="scheduling_job_start_idx")]

    @property
    def employer_id(self):
        return self.job.employer_id


class Booking(models.Model):
    """One booking per application and per slot, backed by unique constraints.

    The booking service enforces ownership, employer, status and
    future-time eligibility in a transaction; uniqueness is the final guard.
    """
    slot = models.OneToOneField(InterviewSlot, on_delete=models.PROTECT, related_name="booking")
    application = models.OneToOneField(
        "applications.Application", on_delete=models.PROTECT, related_name="booking",
    )
    created_at = models.DateTimeField(auto_now_add=True)
