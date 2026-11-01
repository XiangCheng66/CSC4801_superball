"""Server-enforced employer availability operations (FP-SCHED-1)."""
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.utils import timezone
from rest_framework.exceptions import APIException, NotAuthenticated, PermissionDenied, ValidationError

from common.permissions import get_owned_object
from jobs.models import Job
from .models import Booking, InterviewSlot, SLOT_DURATION


class SlotBooked(APIException):
    status_code = 409
    default_detail = "A booked slot cannot be deleted."
    default_code = "slot_booked"


class SlotStarted(APIException):
    status_code = 409
    default_detail = "A past or started slot cannot be deleted."
    default_code = "slot_started"


def require_employer(user):
    if not user.is_authenticated:
        raise NotAuthenticated()
    if user.role != "Employer":
        raise PermissionDenied("This operation requires the Employer role.")


def owned_slots(user):
    require_employer(user)
    return InterviewSlot.objects.filter(job__employer=user).select_related("job", "booking")


def owned_jobs(user):
    require_employer(user)
    return Job.objects.filter(employer=user).order_by("title", "id")


@transaction.atomic
def create_slot(user, *, job_id, start_at, end_at):
    require_employer(user)
    # Lock the parent so a concurrent job deletion cannot invalidate the insert.
    job = get_owned_object(Job.objects.select_for_update(), user, owner_field="employer_id", pk=job_id)
    if timezone.is_naive(start_at) or timezone.is_naive(end_at):
        raise ValidationError({"start_at": ["Include an explicit timezone in both timestamps."]})
    if start_at <= timezone.now():
        raise ValidationError({"start_at": ["The slot must start in the future."]})
    if end_at - start_at != SLOT_DURATION:
        raise ValidationError({"end_at": ["The slot must last exactly 30 minutes."]})
    return InterviewSlot.objects.create(job=job, start_at=start_at, end_at=end_at)


@transaction.atomic
def delete_slot(user, slot_id):
    require_employer(user)
    # Avoid locking the nullable booking outer join; lock the slot itself.
    slot = get_owned_object(
        InterviewSlot.objects.select_related("job").select_for_update(of=("self",)),
        user, owner_field="employer_id", pk=slot_id,
    )
    if Booking.objects.filter(slot=slot).exists():
        raise SlotBooked()
    if slot.start_at <= timezone.now():
        raise SlotStarted()
    try:
        slot.delete()
    except ProtectedError as exc:
        raise SlotBooked() from exc
