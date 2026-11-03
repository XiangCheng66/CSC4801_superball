from rest_framework import serializers

from accounts.serializers import StrictSerializer
from scheduling.models import Booking
from .models import Application


class JobIDField(serializers.IntegerField):
    def to_internal_value(self, value):
        if isinstance(value, bool) or not isinstance(value, int):
            self.fail("invalid")
        return super().to_internal_value(value)


class ApplyInput(StrictSerializer):
    job_id = JobIDField(min_value=1, max_value=2**63 - 1)


class ApplicationBookingSerializer(serializers.ModelSerializer):
    start_at = serializers.DateTimeField(source="slot.start_at", read_only=True)
    end_at = serializers.DateTimeField(source="slot.end_at", read_only=True)

    class Meta:
        model = Booking
        fields = ["id", "slot_id", "start_at", "end_at"]
        read_only_fields = fields


class ApplicationSerializer(serializers.ModelSerializer):
    job = serializers.SerializerMethodField()
    booking = ApplicationBookingSerializer(read_only=True)

    class Meta:
        model = Application
        fields = ["id", "job", "status", "booking", "created_at", "updated_at"]
        read_only_fields = fields

    def get_job(self, application):
        job = application.job
        employer = job.employer
        company = getattr(employer, "company_profile", None)
        return {
            "id": job.pk, "title": job.title,
            "employer_id": employer.pk,
            "company": company.company_name if company else (employer.display_name or employer.username),
            "description": job.description, "required_skills": job.required_skill_names,
        }
