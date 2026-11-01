"""Serializers for employer job postings (FP-EMP-2)."""
from rest_framework import serializers

from accounts.serializers import StrictSerializer
from jobs.models import Job


class SkillListField(serializers.ListField):
    """A list of skill names, trimmed and deduplicated case-insensitively.

    Blank entries are dropped rather than rejected: FP-MATCH-1 already treats
    empty values as absent, and the database stores one row per distinct skill.
    The first spelling wins, so ``["Python", "python"]`` becomes ``["Python"]``.
    """

    child = serializers.CharField(max_length=100, allow_blank=True)

    def to_internal_value(self, data):
        if isinstance(data, (str, bytes)):
            self.fail("not_a_list", input_type=type(data).__name__)
        items = super().to_internal_value(data)
        cleaned, seen = [], set()
        for item in items:
            name = item.strip()
            if not name:
                continue
            key = name.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(name)
        return cleaned


class JobSerializer(serializers.ModelSerializer):
    """Read model. Callers must ``prefetch_related("required_skills")``."""

    required_skills = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = ["id", "title", "description", "required_skills", "created_at", "updated_at"]
        read_only_fields = fields

    def get_required_skills(self, obj):
        return [skill.name for skill in obj.required_skills.all()]


class JobWriteSerializer(StrictSerializer):
    """Create/update model. ``employer`` is never accepted from the client."""

    title = serializers.CharField(max_length=200)
    description = serializers.CharField()
    required_skills = SkillListField(required=False, default=list)

    def validate_title(self, value):
        title = value.strip()
        if not title:
            raise serializers.ValidationError("Job title must not be blank.")
        return title

    def validate_description(self, value):
        description = value.strip()
        if not description:
            raise serializers.ValidationError("Job description must not be blank.")
        return description


class JobPartialWriteSerializer(JobWriteSerializer):
    """PATCH model: every field optional, but still validated when present."""

    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False)
    required_skills = SkillListField(required=False)
