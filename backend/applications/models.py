"""Candidate applications and their lifecycle (FP-CAN-3, FP-EMP-3)."""
from django.conf import settings
from django.db import models

# Module-level copy of ``Application.Status`` values: a nested ``Meta`` cannot
# reference the enclosing class attributes at class-body evaluation time.
APPLICATION_STATUSES = ("Pending", "Interviewing", "Rejected", "Accepted")


class Application(models.Model):
    """One candidate's application to one posting.

    ``job`` uses ``on_delete=PROTECT`` so that deleting a posting with
    applications raises ``ProtectedError``; the API layer maps that to
    ``409 Conflict`` and leaves every row unchanged (FP-EMP-2).

    A duplicate application is prevented by a database uniqueness constraint,
    not only by a pre-insert check: two concurrent submissions cannot create a
    second row (FP-CAN-3).
    """

    class Status(models.TextChoices):
        PENDING = "Pending", "Pending"
        INTERVIEWING = "Interviewing", "Interviewing"
        REJECTED = "Rejected", "Rejected"
        ACCEPTED = "Accepted", "Accepted"

    job = models.ForeignKey("jobs.Job", on_delete=models.PROTECT, related_name="applications")
    candidate = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="applications",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["job", "candidate"],
                name="applications_unique_job_candidate",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=APPLICATION_STATUSES),
                name="applications_valid_status",
            ),
        ]
        indexes = [
            models.Index(fields=["candidate", "status"], name="app_candidate_status_idx"),
            models.Index(fields=["job", "status"], name="app_job_status_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.candidate_id} -> {self.job_id} ({self.status})"
