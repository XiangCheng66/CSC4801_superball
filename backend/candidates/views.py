from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsCandidate, get_owned_object
from jobs.models import Job
from matching import rank_jobs
from .models import CandidateProfile
from .serializers import ProfileInput, ResumeInput

User = get_user_model()


class CandidateView(APIView):
    permission_classes = [IsAuthenticated, IsCandidate]

    def owner(self, request, user_id=None):
        return get_owned_object(
            User.objects.all(), request.user, owner_field="pk",
            pk=request.user.pk if user_id is None else user_id,
        )


class ProfileView(CandidateView):
    def get(self, request, user_id=None):
        user = self.owner(request, user_id)
        profile = CandidateProfile.objects.filter(user=user).only("skills").first()
        return Response({"data": {
            "user_id": user.pk, "display_name": user.display_name or user.username,
            "skills": profile.skills if profile else [],
        }})

    def put(self, request, user_id=None):
        user = self.owner(request, user_id)
        serializer = ProfileInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            # Lock identity first: profile creation and edits share a stable row.
            user = User.objects.select_for_update().get(pk=user.pk)
            profile, _ = CandidateProfile.objects.get_or_create(user=user)
            user.display_name = values["display_name"]
            user.save(update_fields=["display_name"])
            profile.skills = values["skills"]
            profile.save(update_fields=["skills", "updated_at"])
        return Response({"data": {"user_id": user.pk, **values}})


class ResumeView(CandidateView):
    def get(self, request, user_id=None):
        user = self.owner(request, user_id)
        profile = CandidateProfile.objects.filter(user=user).only("resume_text").first()
        return Response({"data": {
            "user_id": user.pk, "resume_text": profile.resume_text if profile else "",
        }})

    def put(self, request, user_id=None):
        user = self.owner(request, user_id)
        serializer = ResumeInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=user.pk)
            profile, _ = CandidateProfile.objects.get_or_create(user=user)
            profile.resume_text = serializer.validated_data["resume_text"]
            profile.save(update_fields=["resume_text", "updated_at"])
        return Response({"data": {"user_id": user.pk, "resume_text": profile.resume_text}})


class RecommendationsView(CandidateView):
    def get(self, request):
        profile = CandidateProfile.objects.filter(user=request.user).only("skills").first()
        jobs = Job.objects.select_related("employer__company_profile").prefetch_related("required_skills")
        rows = []
        for job in jobs:
            company = getattr(job.employer, "company_profile", None)
            rows.append({
                "id": job.pk, "title": job.title, "description": job.description,
                "company": company.company_name if company else (job.employer.display_name or job.employer.username),
                "required_skills": job.required_skill_names,
            })
        return Response({"data": rank_jobs(profile.skills if profile else [], rows)})
