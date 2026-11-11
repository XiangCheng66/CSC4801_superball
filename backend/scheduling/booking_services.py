"""FP-SCHED-2/3. Lock order: application, then slot; never lock nullable joins."""
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, NotAuthenticated, PermissionDenied

from applications.models import Application
from common.permissions import get_owned_object
from .models import Booking, InterviewSlot


class BookingConflict(APIException):
    status_code = 409
    default_code = 'slot_already_booked'
    default_detail = 'Slot already booked'


class ApplicationBooked(APIException):
    status_code = 409
    default_code = 'application_already_booked'
    default_detail = 'Application already has a booking'


class BookingIneligible(APIException):
    status_code = 409
    default_code = 'booking_ineligible'
    default_detail = 'Application must be Interviewing and the slot must be in the future'


def require_candidate(user):
    if not user.is_authenticated:
        raise NotAuthenticated()
    if user.role != 'Candidate':
        raise PermissionDenied('This operation requires the Candidate role.')


def eligible_applications(user):
    require_candidate(user)
    return Application.objects.filter(candidate=user, status='Interviewing', booking__isnull=True).select_related('job').order_by('id')


def available_slots(user, application_id):
    require_candidate(user)
    application = get_owned_object(Application.objects.select_related('job'), user, owner_field='candidate_id', pk=application_id)
    if application.status != 'Interviewing':
        raise BookingIneligible()
    if Booking.objects.filter(application=application).exists():
        raise ApplicationBooked()
    return InterviewSlot.objects.available().filter(job__employer_id=application.job.employer_id).select_related('job', 'booking')


def create_booking(user, *, application_id, slot_id):
    require_candidate(user)
    try:
        with transaction.atomic():
            application = get_owned_object(
                Application.objects.select_related('job').select_for_update(of=('self',)),
                user, owner_field='candidate_id', pk=application_id,
            )
            slot = get_object_or_404(InterviewSlot.objects.select_related('job').select_for_update(of=('self',)), pk=slot_id)
            if application.job.employer_id != slot.job.employer_id:
                raise PermissionDenied('The slot belongs to a different employer.')
            # Check after acquiring both locks; waiting requests see committed bookings.
            if Booking.objects.filter(slot=slot).exists():
                raise BookingConflict()
            if Booking.objects.filter(application=application).exists():
                raise ApplicationBooked()
            if application.status != 'Interviewing' or slot.start_at <= timezone.now():
                raise BookingIneligible()
            return Booking.objects.create(application=application, slot=slot)
    except IntegrityError:
        # The transaction has rolled back. Classify uniqueness races only;
        # unexpected database errors must not be mislabeled as a booking conflict.
        if Booking.objects.filter(slot_id=slot_id).exists():
            raise BookingConflict() from None
        if Booking.objects.filter(application_id=application_id).exists():
            raise ApplicationBooked() from None
        raise


def booking_queryset():
    return Booking.objects.select_related('application__job', 'application__candidate', 'slot__job').order_by('slot__start_at', 'id')


def visible_bookings(user):
    if not user.is_authenticated:
        raise NotAuthenticated()
    if user.role == 'Candidate':
        return booking_queryset().filter(application__candidate=user)
    if user.role == 'Employer':
        return booking_queryset().filter(slot__job__employer=user)
    raise PermissionDenied()


def visible_booking(user, booking_id):
    # Check authentication/role before existence, then preserve 403 vs 404.
    visible_bookings(user)
    booking = get_object_or_404(booking_queryset(), pk=booking_id)
    owner = booking.application.candidate_id if user.role == 'Candidate' else booking.slot.job.employer_id
    if owner != user.pk:
        raise PermissionDenied('You cannot access this booking.')
    return booking
