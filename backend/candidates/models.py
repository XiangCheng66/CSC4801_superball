"""Candidate skills and private raw resume; identity stays on accounts.User."""
from django.conf import settings
from django.db import models


class CandidateProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        primary_key=True, related_name="candidate_profile",
    )
    skills = models.JSONField(default=list, blank=True)
    resume_text = models.TextField(default="", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
