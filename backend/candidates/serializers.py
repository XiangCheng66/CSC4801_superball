from rest_framework import serializers

from accounts.serializers import StrictSerializer
from matching import normalize_skills


class StrictTextField(serializers.CharField):
    """DRF CharField otherwise also accepts/coerces numeric JSON values."""

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class ProfileInput(StrictSerializer):
    display_name = StrictTextField(max_length=100)
    skills = serializers.JSONField()

    def validate_skills(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Skills must be an array of strings.")
        # Use the same text validation as display names and resumes, including
        # NUL and unpaired surrogate rejection before any database write.
        skill = StrictTextField(max_length=100, allow_blank=True)
        normalized = sorted(normalize_skills([skill.run_validation(item) for item in value]))
        if any(len(item) > 100 for item in normalized):
            raise serializers.ValidationError("Each normalized skill must have at most 100 characters.")
        return normalized


class ResumeInput(StrictSerializer):
    resume_text = StrictTextField(allow_blank=True, trim_whitespace=False)
