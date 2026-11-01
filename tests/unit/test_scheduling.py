"""FP-SCHED-1: exercise HTTP authorization, persistence and database protection."""
from datetime import datetime, timedelta, timezone as dt_timezone
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.management import call_command, CommandError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.test import APIClient

from applications.models import Application
from jobs.models import Job
from scheduling.models import Booking, InterviewSlot, SLOT_DURATION
from scheduling.services import create_slot, delete_slot, owned_slots

pytestmark = pytest.mark.django_db
NOW = datetime(2030, 1, 1, tzinfo=dt_timezone.utc)


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr('django.utils.timezone.now', lambda: NOW)


@pytest.fixture
def domain():
    User = get_user_model()
    owner = User.objects.create_user(username='owner', email='owner@example.test', role='Employer')
    other = User.objects.create_user(username='other', email='other@example.test', role='Employer')
    candidate = User.objects.create_user(username='candidate', email='candidate@example.test', role='Candidate')
    job = Job.objects.create(employer=owner, title='Developer', description='Build software')
    other_job = Job.objects.create(employer=other, title='Other job', description='Other')
    application = Application.objects.create(job=job, candidate=candidate, status='Interviewing')
    return owner, other, candidate, job, other_job, application


@pytest.fixture
def client(domain):
    api = APIClient(enforce_csrf_checks=True)
    api.force_login(domain[0])
    return api


def write(client, method, path, data=None):
    csrf = client.get('/api/auth/csrf/').json()['data']['csrfToken']
    return getattr(client, method)(path, data=data, format='json', HTTP_X_CSRFTOKEN=csrf)


def payload(domain, **overrides):
    return {'job_id': domain[3].pk, 'start_at': '2030-01-02T09:00:00+08:00',
            'end_at': '2030-01-02T09:30:00+08:00', **overrides}


def make_slot(domain, *, job=None, start=None):
    start = start or NOW + timedelta(days=1)
    return InterviewSlot.objects.create(job=job or domain[3], start_at=start, end_at=start + SLOT_DURATION)


def test_fp_sched_1_slot_creation_timezones_and_deletion(client, domain):
    response = write(client, 'post', '/api/slots/', payload(domain))
    assert response.status_code == 201
    data = response.json()['data']
    assert data == {'id': data['id'], 'job_id': domain[3].pk, 'job_title': 'Developer',
                    'employer_id': domain[0].pk, 'start_at': '2030-01-02T01:00:00Z',
                    'end_at': '2030-01-02T01:30:00Z', 'is_booked': False, 'is_available': True}
    slot = InterviewSlot.objects.get(pk=data['id'])
    assert slot.end_at - slot.start_at == SLOT_DURATION
    path = f'/api/slots/{slot.pk}/'
    assert client.get(path).json()['data'] == data
    assert client.get('/api/slots/').json()['data'] == [data]
    assert write(client, 'delete', path).status_code == 200
    assert not InterviewSlot.objects.exists()


@pytest.mark.parametrize('overrides', [
    {'start_at': '2029-01-02T09:00:00+08:00'},
    {'start_at': '2030-01-01T00:00:00Z', 'end_at': '2030-01-01T00:30:00Z'},
    {'end_at': '2030-01-02T09:29:00+08:00'}, {'end_at': '2030-01-02T09:31:00+08:00'},
    {'end_at': '2030-01-02T09:00:00+08:00'}, {'end_at': '2030-01-02T08:30:00+08:00'},
    {'start_at': '2030-01-02T09:00:00'}, {'end_at': '2030-01-02T09:30:00'},
    {'start_at': '2030-02-30T09:00:00Z'}, {'start_at': 'nonsense'}, {'start_at': None},
    {'start_at': 123}, {'job_id': 0}, {'job_id': '1; DROP TABLE jobs_job;'},
    {'employer_id': 999}, {'is_booked': False},
])
def test_fp_sched_1_invalid_slots(client, domain, overrides):
    response = write(client, 'post', '/api/slots/', payload(domain, **overrides))
    assert response.status_code == 400
    assert response.json()['error']['code'] == 'validation_error'
    assert not InterviewSlot.objects.exists()
    assert Job.objects.count() == 2


@pytest.mark.parametrize('field', ['job_id', 'start_at', 'end_at'])
def test_missing_fields(client, domain, field):
    body = payload(domain)
    del body[field]
    assert write(client, 'post', '/api/slots/', body).status_code == 400
    assert not InterviewSlot.objects.exists()


def test_non_object_body(client):
    assert write(client, 'post', '/api/slots/', []).status_code == 400


def test_mixed_offsets_and_midnight(client, domain):
    response = write(client, 'post', '/api/slots/', payload(domain,
        start_at='2030-01-02T23:45:00-05:00', end_at='2030-01-03T05:15:00Z'))
    assert response.status_code == 201
    assert response.json()['data']['start_at'] == '2030-01-03T04:45:00Z'


@pytest.mark.parametrize('role, status', [('anonymous', 401), ('candidate', 403)])
def test_roles_on_every_endpoint(domain, role, status):
    api = APIClient(enforce_csrf_checks=True)
    if role == 'candidate':
        api.force_login(domain[2])
    slot = make_slot(domain)
    for path in ['/api/slots/', '/api/slots/jobs/', f'/api/slots/{slot.pk}/']:
        assert api.get(path).status_code == status
    assert write(api, 'post', '/api/slots/', payload(domain)).status_code == status
    assert write(api, 'delete', f'/api/slots/{slot.pk}/').status_code == status
    assert InterviewSlot.objects.count() == 1


def test_foreign_and_missing_objects(client, domain):
    foreign = make_slot(domain, job=domain[4])
    assert write(client, 'post', '/api/slots/', payload(domain, job_id=domain[4].pk)).status_code == 403
    assert write(client, 'post', '/api/slots/', payload(domain, job_id=999999)).status_code == 404
    for method in ['get', 'delete']:
        for slot_id, status in [(foreign.pk, 403), (999999, 404)]:
            assert write(client, method, f'/api/slots/{slot_id}/').status_code == status
    assert client.get('/api/slots/').json()['data'] == []
    assert client.get('/api/slots/jobs/').json()['data'] == [{'id': domain[3].pk, 'title': 'Developer'}]
    assert InterviewSlot.objects.count() == 1


def test_writes_require_csrf(client, domain):
    slot = make_slot(domain)
    assert client.post('/api/slots/', payload(domain), format='json').status_code == 403
    assert client.delete(f'/api/slots/{slot.pk}/').status_code == 403
    assert InterviewSlot.objects.count() == 1


def test_booked_excluded_and_deletion_protected(client, domain):
    past = make_slot(domain, start=NOW - timedelta(days=1))
    booked = make_slot(domain)
    free = make_slot(domain, start=NOW + timedelta(days=2))
    make_slot(domain, job=domain[4])
    Booking.objects.create(slot=booked, application=domain[5])
    rows = client.get('/api/slots/').json()['data']
    assert [row['id'] for row in rows] == [past.pk, booked.pk, free.pk]
    assert [(row['is_booked'], row['is_available']) for row in rows] == [(False, False), (True, False), (False, True)]
    assert [row['id'] for row in client.get('/api/slots/?available=true').json()['data']] == [free.pk]
    response = write(client, 'delete', f'/api/slots/{booked.pk}/')
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'slot_booked'
    with pytest.raises(ProtectedError):
        booked.delete()
    assert Booking.objects.count() == 1
    assert InterviewSlot.objects.filter(pk=booked.pk).exists()


@pytest.mark.parametrize('status', ['Pending', 'Rejected', 'Accepted'])
def test_application_status_change_does_not_release_booking(client, domain, status):
    slot = make_slot(domain)
    Booking.objects.create(slot=slot, application=domain[5])
    domain[5].status = status
    domain[5].save()
    assert client.get('/api/slots/?available=true').json()['data'] == []
    assert write(client, 'delete', f'/api/slots/{slot.pk}/').status_code == 409


@pytest.mark.parametrize('start', [NOW, NOW - timedelta(days=1)])
def test_past_slot_cannot_be_deleted(client, domain, start):
    slot = make_slot(domain, start=start)
    response = write(client, 'delete', f'/api/slots/{slot.pk}/')
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'slot_started'
    assert InterviewSlot.objects.filter(pk=slot.pk).exists()


def test_job_with_slot_is_protected(domain):
    domain[5].delete()
    make_slot(domain)
    with pytest.raises(ProtectedError):
        domain[3].delete()
    assert Job.objects.filter(pk=domain[3].pk).exists()


@pytest.mark.parametrize('minutes', [-30, 0, 29, 31, 60])
def test_database_enforces_duration(domain, minutes):
    with pytest.raises(IntegrityError), transaction.atomic():
        InterviewSlot.objects.create(job=domain[3], start_at=NOW, end_at=NOW + timedelta(minutes=minutes))


def test_booking_slot_and_application_uniqueness(domain):
    first, second = make_slot(domain), make_slot(domain, start=NOW + timedelta(days=2))
    other_application = Application.objects.create(job=domain[4], candidate=domain[2])
    Booking.objects.create(slot=first, application=domain[5])
    with pytest.raises(IntegrityError), transaction.atomic():
        Booking.objects.create(slot=first, application=other_application)
    with pytest.raises(IntegrityError), transaction.atomic():
        Booking.objects.create(slot=second, application=domain[5])
    assert Booking.objects.count() == 1


def test_services_enforce_roles_without_http(domain):
    slot = make_slot(domain)
    for user, error in [(AnonymousUser(), NotAuthenticated), (domain[2], PermissionDenied)]:
        with pytest.raises(error):
            create_slot(user, job_id=domain[3].pk, start_at=NOW + timedelta(days=1), end_at=NOW + timedelta(days=1, minutes=30))
        with pytest.raises(error):
            delete_slot(user, slot.pk)
        with pytest.raises(error):
            owned_slots(user)


@pytest.mark.parametrize('query', ['available=maybe', 'employer_id=123'])
def test_invalid_query(client, query):
    assert client.get('/api/slots/?' + query).status_code == 400


def test_demo_seed_is_repeatable_and_preserves_existing(domain):
    existing = make_slot(domain)
    call_command('seed_auth_demo', stdout=StringIO())
    call_command('seed_availability_demo', stdout=StringIO())
    call_command('seed_availability_demo', stdout=StringIO())
    assert InterviewSlot.objects.filter(pk=existing.pk).exists()
    assert InterviewSlot.objects.count() == 3
    assert InterviewSlot.objects.filter(job__employer__username='employer1', start_at__gt=NOW).count() == 2


def test_demo_seed_requires_auth_users():
    with pytest.raises(CommandError):
        call_command('seed_availability_demo', stdout=StringIO())
    assert not InterviewSlot.objects.exists()


def test_fp_sched_2_eligible_booking():
    pytest.skip('C: candidate booking endpoint and eligibility service pending')


def test_fp_sched_2_ineligible_booking():
    pytest.skip('C: candidate booking endpoint and eligibility service pending')


def test_fp_sched_3_conflict_contract():
    pytest.skip('C: transactional booking contention service pending')
