"""Employer applicant list and status changes (FP-EMP-3).

The scoring and ordering come from ``matching.rank_applicants`` so candidates
and employers share one implementation. Rows are rendered from an explicit
field whitelist: resumes, emails and password hashes never reach an employer.
"""
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from applications.employer_serializers import ApplicationStatusInput
from applications.models import Application
from common.permissions import IsEmployer, get_owned_object
from jobs.models import Job
from matching import calculate_match_score, rank_applicants


def iso(value):
    return serializers.DateTimeField().to_representation(value)


def display_name(user):
    return user.display_name or user.username


def candidate_skills(user):
    """Reverse OneToOne access raises an AttributeError subclass when missing,
    so ``getattr(..., None)`` is safe for candidates without a profile."""
    profile = getattr(user, "candidate_profile", None)
    return list(profile.skills) if profile else []


def booking_payload(application):
    booking = getattr(application, "booking", None)
    if booking is None:
        return None
    return {
        "id": booking.pk,
        "slot_id": booking.slot_id,
        "start_at": iso(booking.slot.start_at),
        "end_at": iso(booking.slot.end_at),
    }


def applicant_row(application, match_score):
    candidate = application.candidate
    return {
        "id": application.pk,
        "candidate_id": candidate.pk,
        "display_name": display_name(candidate),
        "skills": candidate_skills(candidate),
        "match_score": match_score,
        "status": application.status,
        "booking": booking_payload(application),
        "created_at": iso(application.created_at),
        "updated_at": iso(application.updated_at),
    }


def applications_for(job):
    return list(
        Application.objects.filter(job=job).select_related(
            "candidate__candidate_profile", "booking__slot",
        )
    )


def ranked_rows(job):
    """Rank this posting's applicants highest score first.

    ``rank_applicants`` copies each row and preserves extra keys, so
    ``application_id`` survives ranking and can be mapped back to the ORM row.
    Ties break by case-insensitive display name and then candidate ID, as
    required by FP-EMP-3.
    """
    applications = applications_for(job)
    payload = [
        {
            "candidate_id": application.candidate_id,
            "display_name": display_name(application.candidate),
            "skills": candidate_skills(application.candidate),
            "application_id": application.pk,
        }
        for application in applications
    ]
    by_id = {application.pk: application for application in applications}
    return [
        applicant_row(by_id[row["application_id"]], row["match_score"])
        for row in rank_applicants(job.required_skill_names, payload)
    ]


class JobApplicantsView(APIView):
    """List one owned posting's applicants, highest match score first."""

    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request, job_id):
        job = get_owned_object(
            Job.objects.prefetch_related("required_skills"),
            request.user,
            owner_field="employer_id",
            pk=job_id,
        )
        return Response({"data": ranked_rows(job)})


class ApplicationStatusView(APIView):
    """Change one application's status; only the posting owner may do so.

    Existence is checked before ownership so an unrelated employer gets 403
    for a real application and 404 for an unknown ID, matching FP-AUTH-3.
    """

    permission_classes = [IsAuthenticated, IsEmployer]

    def patch(self, request, application_id):
        serializer = ApplicationStatusInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        application = get_object_or_404(
            Application.objects.select_related(
                "job__employer", "candidate__candidate_profile", "booking__slot",
            ),
            pk=application_id,
        )
        if application.job.employer_id != request.user.pk:
            raise PermissionDenied("You do not own this job.")
        application.status = serializer.validated_data["status"]
        application.save(update_fields=["status", "updated_at"])
        job = Job.objects.prefetch_related("required_skills").get(pk=application.job_id)
        score = calculate_match_score(
            candidate_skills(application.candidate), job.required_skill_names,
        )
        return Response({"data": applicant_row(application, score)})
