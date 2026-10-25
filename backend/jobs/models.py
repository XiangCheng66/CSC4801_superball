"""Employer job postings and their required skills (FP-EMP-2)."""
from django.conf import settings
from django.db import models
from django.db.models.functions import Lower

from common.constraints import not_blank


class Job(models.Model):
    """A job posting owned by exactly one Employer account.

    ``employer`` points at the owning user rather than at ``CompanyProfile`` so
    that ownership checks always compare a user ID (see
    ``common.permissions.get_owned_object``) and a posting can exist even before
    a company profile is edited. The company name shown to candidates is read
    through ``employer.company_profile``.

    Deleting a posting with dependent rows must fail with ``409`` instead of
    cascading; ``applications.Application`` therefore references ``Job`` with
    ``on_delete=PROTECT``. Interview slots are expected to do the same.
    """

    employer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="jobs",
    )
    title = models.CharField(max_length=200)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=not_blank("title"),
                name="jobs_job_title_not_blank",
            ),
            models.CheckConstraint(
                condition=not_blank("description"),
                name="jobs_job_description_not_blank",
            ),
        ]
        indexes = [
            models.Index(fields=["employer", "created_at"], name="jobs_job_employer_created_idx"),
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def required_skill_names(self) -> list[str]:
        """Required skills as plain strings for ``matching.rank_jobs``.

        Callers listing many jobs must ``prefetch_related("required_skills")``
        to avoid one query per posting.
        """
        return [skill.name for skill in self.required_skills.all()]


class RequiredSkill(models.Model):
    """One required skill on a posting. An empty set is a valid posting.

    ``name`` keeps the employer's original casing for display; uniqueness is
    case-insensitive and leading/trailing whitespace is stripped on save, so
    ``Python`` and ``python`` cannot both be stored on the same posting.
    Scoring still normalizes with ``matching.normalize_skills``.
    """

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="required_skills")
    name = models.CharField(max_length=100)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "job",
                name="jobs_required_skill_unique_per_job",
            ),
            models.CheckConstraint(
                condition=not_blank("name"),
                name="jobs_required_skill_name_not_blank",
            ),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        super().save(*args, **kwargs)
