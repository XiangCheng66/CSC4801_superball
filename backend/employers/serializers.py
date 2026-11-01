"""Serializers for the employer company profile (FP-EMP-1)."""
from rest_framework import serializers

from accounts.serializers import StrictSerializer
from employers.models import CompanyProfile


class CompanyProfileSerializer(serializers.ModelSerializer):
    """Read model: the owning user is never exposed, only the profile fields."""

    class Meta:
        model = CompanyProfile
        fields = ["company_name", "description", "updated_at"]
        read_only_fields = fields


class CompanyProfileWriteSerializer(StrictSerializer):
    """Write model. ``CharField`` trims whitespace and rejects blank values, so
    ``"   "`` never reaches the database CHECK constraint."""

    company_name = serializers.CharField(max_length=200)
    description = serializers.CharField()

    def validate_company_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Company name must not be blank.")
        return name

    def validate_description(self, value):
        description = value.strip()
        if not description:
            raise serializers.ValidationError("Company description must not be blank.")
        return description
