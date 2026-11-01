from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from accounts.serializers import StrictSerializer
from .models import InterviewSlot


class ZonedDateTimeField(serializers.DateTimeField):
    def to_internal_value(self, data):
        try:
            parsed = parse_datetime(data) if isinstance(data, str) else None
        except (ValueError, OverflowError):
            parsed = None
        if parsed is None or timezone.is_naive(parsed):
            raise serializers.ValidationError("Use an ISO 8601 timestamp with Z or an explicit UTC offset.")
        return super().to_internal_value(data)


class CreateSlotSerializer(StrictSerializer):
    job_id = serializers.IntegerField(min_value=1)
    start_at = ZonedDateTimeField()
    end_at = ZonedDateTimeField()


class SlotQuerySerializer(StrictSerializer):
    available = serializers.ChoiceField(choices=["true", "false"], default="false")


class SlotSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source="job.title")
    employer_id = serializers.IntegerField(read_only=True)
    is_booked = serializers.SerializerMethodField()
    is_available = serializers.SerializerMethodField()

    class Meta:
        model = InterviewSlot
        fields = ["id", "job_id", "job_title", "employer_id", "start_at", "end_at", "is_booked", "is_available"]
        read_only_fields = fields

    def get_is_booked(self, slot):
        return hasattr(slot, "booking")

    def get_is_available(self, slot):
        now = self.context.get("now") or timezone.now()
        return slot.start_at > now and not self.get_is_booked(slot)
