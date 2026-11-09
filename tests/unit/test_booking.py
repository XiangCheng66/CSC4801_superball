from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db import IntegrityError, close_old_connections, connection
from django.utils import timezone
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.test import APIClient

from applications.models import Application
from jobs.models import Job
from scheduling.booking_services import BookingConflict, ApplicationBooked, create_booking
from scheduling.models import Booking, InterviewSlot

pytestmark = pytest.mark.django_db


@pytest.fixture
def case(candidate_user, other_candidate, employer_user):
    other_employer = get_user_model().objects.create_user(username='other_hiring', email='other_hiring@example.test', role='Employer')
    job = Job.objects.create(employer=employer_user, title='Application job', description='A')
    slot_job = Job.objects.create(employer=employer_user, title='Different slot job', description='B')
    foreign_job = Job.objects.create(employer=other_employer, title='Foreign job', description='C')
    apps = [Application.objects.create(job=job, candidate=user, status='Interviewing') for user in (candidate_user, other_candidate)]
    start = timezone.now() + timedelta(days=1)
    slots = [InterviewSlot.objects.create(job=j, start_at=start, end_at=start + timedelta(minutes=30)) for j in (slot_job, slot_job, foreign_job)]
    return {'candidate': candidate_user, 'other': other_candidate, 'employer': employer_user, 'foreign': other_employer, 'apps': apps, 'slots': slots}


def client(user=None):
    api = APIClient(enforce_csrf_checks=True)
    if user:
        api.force_login(user)
    return api


def post(api, body):
    api.get('/api/auth/csrf/')
    return api.post('/api/bookings/', body, format='json', HTTP_X_CSRFTOKEN=api.cookies['csrftoken'].value)


def body(case, **kwargs):
    return {'application_id': case['apps'][0].pk, 'slot_id': case['slots'][0].pk, **kwargs}


def test_fp_sched_2_eligible_booking(case):
    api = client(case['candidate'])
    assert api.get('/api/booking-applications/').json()['data'] == [{'id': case['apps'][0].pk, 'job_id': case['apps'][0].job_id, 'job_title': 'Application job'}]
    path = f"/api/booking-applications/{case['apps'][0].pk}/slots/"
    assert [x['id'] for x in api.get(path).json()['data']] == [x.pk for x in case['slots'][:2]]
    response = post(api, body(case))
    assert response.status_code == 201
    data = response.json()['data']
    assert set(data) == {'id', 'application_id', 'slot_id', 'job_id', 'job_title', 'candidate_name', 'employer_id', 'start_at', 'end_at', 'created_at'}
    assert data['slot_id'] == case['slots'][0].pk
    assert data['job_id'] != case['slots'][0].job_id  # same employer, different job is valid
    assert Booking.objects.count() == 1
    for user in [case['candidate'], case['employer']]:
        assert client(user).get('/api/bookings/').json()['data'] == [data]
        assert client(user).get(f"/api/bookings/{data['id']}/").json()['data'] == data
    assert api.get('/api/booking-applications/').json()['data'] == []
    assert api.get(path).status_code == 409
    assert [x['id'] for x in client(case['employer']).get('/api/slots/?available=true').json()['data']] == [case['slots'][1].pk]


@pytest.mark.parametrize('status', ['Pending', 'Accepted', 'Rejected'])
def test_fp_sched_2_ineligible_booking(case, status):
    app = case['apps'][0]
    app.status = status
    app.save()
    api = client(case['candidate'])
    assert post(api, body(case)).status_code == 409
    assert api.get(f'/api/booking-applications/{app.pk}/slots/').status_code == 409
    assert api.get('/api/booking-applications/').json()['data'] == []
    assert not Booking.objects.exists()


@pytest.mark.parametrize('offset', [-1, 0])
def test_past_and_started_rejected(case, offset):
    slot = case['slots'][0]
    now = timezone.now()
    slot.start_at = now + timedelta(seconds=offset)
    slot.end_at = slot.start_at + timedelta(minutes=30)
    slot.save()
    with patch('scheduling.booking_services.timezone.now', return_value=now):
        assert post(client(case['candidate']), body(case)).status_code == 409
    assert not Booking.objects.exists()


def test_fp_sched_3_conflict_contract(case):
    first = post(client(case['candidate']), body(case))
    assert first.status_code == 201
    second = post(client(case['other']), body(case, application_id=case['apps'][1].pk))
    assert second.status_code == 409
    assert second.json()['error'] == {'code': 'slot_already_booked', 'message': 'Slot already booked'}
    duplicate = post(client(case['candidate']), body(case, slot_id=case['slots'][1].pk))
    assert duplicate.status_code == 409
    assert duplicate.json()['error']['code'] == 'application_already_booked'
    assert Booking.objects.count() == 1
    assert not Booking.objects.filter(application=case['apps'][1]).exists()
    assert not Booking.objects.filter(slot=case['slots'][1]).exists()


def test_permissions_missing_records_and_list_isolation(case):
    b = Booking.objects.create(application=case['apps'][0], slot=case['slots'][0])
    for user in [case['other'], case['foreign']]:
        api = client(user)
        assert api.get('/api/bookings/').json()['data'] == []
        assert api.get(f'/api/bookings/{b.pk}/').status_code == 403
        assert api.get('/api/bookings/999999/').status_code == 404
    api = client(case['candidate'])
    assert post(api, body(case, application_id=case['apps'][1].pk)).status_code == 403
    assert post(api, body(case, slot_id=case['slots'][2].pk)).status_code == 403
    assert post(api, body(case, application_id=999999)).status_code == 404
    assert post(api, body(case, slot_id=999999)).status_code == 404
    assert api.get(f"/api/booking-applications/{case['apps'][1].pk}/slots/").status_code == 403
    assert api.get('/api/booking-applications/999999/slots/').status_code == 404
    assert Booking.objects.count() == 1


@pytest.mark.parametrize('who,status', [(None, 401), ('employer', 403)])
def test_role_boundary(case, who, status):
    api = client(case[who] if who else None)
    assert post(api, body(case)).status_code == status
    for url in ['/api/booking-applications/', f"/api/booking-applications/{case['apps'][0].pk}/slots/"]:
        assert api.get(url).status_code == status
    if who is None:
        assert api.get('/api/bookings/').status_code == 401
        assert api.get('/api/bookings/1/').status_code == 401
    assert not Booking.objects.exists()


@pytest.mark.parametrize('field', ['application_id', 'slot_id'])
@pytest.mark.parametrize('value', [None, True, 1.5, '1', 0, -1, 2**63, [], {}])
def test_strict_ids(case, field, value):
    assert post(client(case['candidate']), body(case, **{field: value})).status_code == 400
    assert not Booking.objects.exists()


@pytest.mark.parametrize('data', [{}, [], {'candidate_id': 1}, {'application_id': 1}])
def test_invalid_bodies(case, data):
    assert post(client(case['candidate']), data).status_code == 400
    assert not Booking.objects.exists()


def test_csrf_query_and_unknown_fields(case):
    api = client(case['candidate'])
    assert api.post('/api/bookings/', body(case), format='json').status_code == 403
    assert post(api, body(case, candidate_id=case['other'].pk)).status_code == 400
    for url in ['/api/bookings/', '/api/booking-applications/', f"/api/booking-applications/{case['apps'][0].pk}/slots/"]:
        assert api.get(url + '?candidate_id=1').status_code == 400
    assert not Booking.objects.exists()


@pytest.mark.parametrize('status', ['Pending', 'Rejected', 'Accepted'])
def test_status_change_keeps_booking_visible_and_slot_protected(case, status):
    record = create_booking(case['candidate'], **body(case))
    Application.objects.filter(pk=case['apps'][0].pk).update(status=status)
    for user in [case['candidate'], case['employer']]:
        assert client(user).get('/api/bookings/').json()['data'][0]['id'] == record.pk
    assert not InterviewSlot.objects.available().filter(pk=record.slot_id).exists()
    api = client(case['employer'])
    api.get('/api/auth/csrf/')
    response = api.delete(f'/api/slots/{record.slot_id}/', HTTP_X_CSRFTOKEN=api.cookies['csrftoken'].value)
    assert response.status_code == 409
    assert Booking.objects.count() == 1


def test_service_permissions_and_unexpected_integrity_error(case):
    for user, error in [(AnonymousUser(), NotAuthenticated), (case['employer'], PermissionDenied)]:
        with pytest.raises(error):
            create_booking(user, **body(case))
    with patch('scheduling.booking_services.Booking.objects.create', side_effect=IntegrityError('unrelated')):
        with pytest.raises(IntegrityError, match='unrelated'):
            create_booking(case['candidate'], **body(case))
    assert not Booking.objects.exists()


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('same_application', [False, True])
def test_postgres_concurrent_bookings(case, same_application):
    if connection.vendor != 'postgresql':
        pytest.skip('Requires PostgreSQL row locks and independent connections')
    barrier = Barrier(2)
    def attempt(index):
        close_old_connections()
        try:
            user = get_user_model().objects.get(pk=case['candidate' if same_application or index == 0 else 'other'].pk)
            app = case['apps'][0 if same_application else index]
            slot = case['slots'][index if same_application else 0]
            barrier.wait(timeout=10)
            try:
                create_booking(user, application_id=app.pk, slot_id=slot.pk)
                return 'success'
            except (BookingConflict, ApplicationBooked) as exc:
                return str(exc.detail)
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(attempt, i) for i in range(2)]
        outcomes = [future.result(timeout=20) for future in futures]
    assert sorted(outcomes) == sorted(['success', 'Application already has a booking' if same_application else 'Slot already booked'])
    assert Booking.objects.count() == 1
