"""Employer job posting endpoints (FP-EMP-2)."""
from django.db import transaction
from django.db.models import ProtectedError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.errors import JobHasDependents
from common.permissions import IsEmployer, get_owned_object
from jobs.models import Job, RequiredSkill
from jobs.serializers import JobPartialWriteSerializer, JobSerializer, JobWriteSerializer


def replace_required_skills(job, names):
    """Replace the posting's skill rows with ``names`` in the given order.

    Names are already trimmed and deduplicated case-insensitively by
    ``SkillListField``; the database unique constraint is the final guard.
    """
    job.required_skills.all().delete()
    RequiredSkill.objects.bulk_create([RequiredSkill(job=job, name=name) for name in names])


def reload_job(job_id):
    return Job.objects.prefetch_related("required_skills").get(pk=job_id)


class JobListCreateView(APIView):
    """List and create postings owned by the signed-in employer.

    The queryset is always filtered by ``request.user``, so another employer's
    postings are never returned, and ``employer`` cannot be supplied by the
    client to create a posting on somebody else's behalf.
    """

    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request):
        jobs = Job.objects.filter(employer=request.user).prefetch_related("required_skills")
        return Response({"data": [JobSerializer(job).data for job in jobs]})

    def post(self, request):
        serializer = JobWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            job = Job.objects.create(
                employer=request.user,
                title=data["title"],
                description=data["description"],
            )
            replace_required_skills(job, data.get("required_skills", []))
        return Response({"data": JobSerializer(reload_job(job.pk)).data}, status=201)


class JobDetailView(APIView):
    """Read, update or delete one posting.

    Ownership is checked with ``get_owned_object`` after the role check, which
    yields ``404`` for a posting that does not exist and ``403`` for a posting
    owned by another employer.
    """

    permission_classes = [IsAuthenticated, IsEmployer]

    def get_job(self, request, job_id):
        return get_owned_object(
            Job.objects.prefetch_related("required_skills"),
            request.user,
            owner_field="employer_id",
            pk=job_id,
        )

    def get(self, request, job_id):
        return Response({"data": JobSerializer(self.get_job(request, job_id)).data})

    def patch(self, request, job_id):
        job = self.get_job(request, job_id)
        serializer = JobPartialWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            for field in ("title", "description"):
                if field in data:
                    setattr(job, field, data[field])
            if data:
                job.save()
            if "required_skills" in data:
                replace_required_skills(job, data["required_skills"])
        return Response({"data": JobSerializer(reload_job(job.pk)).data})

    def delete(self, request, job_id):
        job = self.get_job(request, job_id)
        try:
            with transaction.atomic():
                job.delete()
        except ProtectedError as exc:
            # FP-EMP-2: applications or interview slots still reference this
            # posting. Nothing is deleted; the transaction rolled back.
            raise JobHasDependents() from exc
        return Response({"data": {"deleted": True, "id": job_id}})
