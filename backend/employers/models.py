"""Employer company profile (FP-EMP-1)."""
from django.conf import settings
from django.db import models

from common.constraints import not_blank


class CompanyProfile(models.Model):
    """One company profile per Employer account.

    The primary key is the owning user ID, so no separate profile identifier is
    exposed through URLs and ownership checks compare against ``user_id``
    directly (see ``common.permissions.get_owned_object``).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="company_profile",
    )
    company_name = models.CharField(max_length=200)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "company profile"
        verbose_name_plural = "company profiles"
        constraints = [
            models.CheckConstraint(
                condition=not_blank("company_name"),
                name="employers_company_profile_name_not_blank",
            ),
            models.CheckConstraint(
                condition=not_blank("description"),
                name="employers_company_profile_description_not_blank",
            ),
        ]

    def __str__(self) -> str:
        return self.company_name
