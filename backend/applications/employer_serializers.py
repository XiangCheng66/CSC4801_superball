"""Serializer inputs for the employer applicant workflows (FP-EMP-3)."""
from rest_framework import serializers

from accounts.serializers import StrictSerializer
from applications.models import APPLICATION_STATUSES


class ApplicationStatusInput(StrictSerializer):
    """Only the four course statuses are accepted; nothing else is writable."""

    status = serializers.ChoiceField(choices=APPLICATION_STATUSES)
