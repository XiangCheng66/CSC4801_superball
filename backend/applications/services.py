"""Single application-write boundary for the candidate UI and later B workflows."""
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, NotAuthenticated, PermissionDenied

from jobs.models import Job
from .models import Application


class ApplicationConflict(APIException):
    status_code = 409
    default_detail = "You have already applied to this job."
    default_code = "application_conflict"


def apply_to_job(candidate, job_id):
    """Apply as the authenticated candidate, with a database duplicate guard.

    Locking the posting serializes creation with other cooperating writers and
    deletion on PostgreSQL. The existing unique(job, candidate) constraint is
    the final guard, including callers which do not acquire that lock.
    """
    if not candidate.is_authenticated:
        raise NotAuthenticated()
    if candidate.role != "Candidate":
        raise PermissionDenied("This operation requires the Candidate role.")
    try:
        with transaction.atomic():
            job = get_object_or_404(Job.objects.select_for_update(), pk=job_id)
            if Application.objects.filter(job=job, candidate=candidate).exists():
                raise ApplicationConflict()
            return Application.objects.create(job=job, candidate=candidate)
    except IntegrityError as exc:
        # Catch outside atomic so the connection can safely query after rollback.
        # Do not turn unrelated database errors into a duplicate response.
        if Application.objects.filter(job_id=job_id, candidate=candidate).exists():
            raise ApplicationConflict() from exc
        raise
