from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth.models import AnonymousUser
from django.db import IntegrityError, connection
from django.db.models.query import QuerySet
from django.utils import timezone
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.test import APIClient

from applications.models import Application
from applications.services import ApplicationConflict, apply_to_job
from candidates.models import CandidateProfile
from employers.models import CompanyProfile
from jobs.models import Job
from scheduling.models import Booking, InterviewSlot

pytestmark = pytest.mark.django_db


def post(client, data):
    client.get('/api/auth/csrf/')
    return client.post('/api/applications/', data, format='json', HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)


@pytest.mark.parametrize('payload', [
    {}, [], None, {'job_id': None}, {'job_id': True}, {'job_id': False},
    {'job_id': '1'}, {'job_id': 1.0}, {'job_id': []}, {'job_id': {}},
    {'job_id': 0}, {'job_id': -1}, {'job_id': 2**63}, {'job_id': "1 OR 1=1 --"},
    {'job_id': 1, 'candidate_id': 2}, {'job_id': 1, 'status': 'Accepted'},
    {'job_id': 1, 'role': 'Employer'}, {'job_id': 1, 'booking': {}},
])
def test_application_input_is_strict_and_never_partially_writes(candidate_client, make_candidate_job, payload):
    make_candidate_job(id=1)
    response = post(candidate_client, payload)
    assert response.status_code == 400
    assert response.json()['error']['code'] == 'validation_error'
    assert Application.objects.count() == 0


def test_application_creation_does_not_require_a_profile_and_survives_new_session(candidate_client, candidate_user, make_candidate_job):
    job = make_candidate_job()
    assert not CandidateProfile.objects.filter(user=candidate_user).exists()
    response = post(candidate_client, {'job_id': job.pk})
    assert response.status_code == 201
    row = response.json()['data']
    assert row['status'] == 'Pending' and row['booking'] is None
    assert row['job'] == {
        'id': job.pk, 'title': 'Backend', 'employer_id': job.employer_id,
        'company': 'Hiring Team', 'description': 'Build dependable services.',
        'required_skills': ['Python', 'SQL'],
    }
    fresh = APIClient()
    fresh.force_login(candidate_user)
    assert fresh.get(f"/api/applications/{row['id']}/").json()['data'] == row
    assert fresh.get('/api/applications/').json()['data'] == [row]
    assert Application.objects.get(pk=row['id']).candidate == candidate_user


@pytest.mark.parametrize('status', Application.Status.values)
def test_duplicate_is_rejected_for_every_status_without_resetting_it(candidate_client, candidate_user, make_candidate_job, status):
    job = make_candidate_job()
    existing = Application.objects.create(job=job, candidate=candidate_user, status=status)
    response = post(candidate_client, {'job_id': job.pk})
    assert response.status_code == 409 and response.json()['error']['code'] == 'application_conflict'
    assert Application.objects.count() == 1
    existing.refresh_from_db()
    assert existing.status == status


def test_database_duplicate_after_stale_precheck_is_a_conflict(candidate_user, make_candidate_job):
    job = make_candidate_job()
    existing = Application.objects.create(job=job, candidate=candidate_user, status='Accepted')
    # Simulate a stale precheck; the real unique constraint rejects the INSERT.
    with patch.object(QuerySet, 'exists', side_effect=[False, True]):
        with pytest.raises(ApplicationConflict):
            apply_to_job(candidate_user, job.pk)
    assert Application.objects.count() == 1
    existing.refresh_from_db()
    assert existing.status == 'Accepted'


def test_unrelated_database_failure_is_not_misreported_as_duplicate(candidate_user, make_candidate_job):
    job = make_candidate_job()
    with patch('applications.services.Application.objects.create', side_effect=IntegrityError('unrelated write failure')):
        with pytest.raises(IntegrityError, match='unrelated write failure'):
            apply_to_job(candidate_user, job.pk)
    assert Application.objects.count() == 0


@pytest.mark.parametrize('actor', ['anonymous', 'employer'])
def test_application_endpoints_require_candidate_role_before_object_lookup(employer_user, actor):
    client = APIClient(enforce_csrf_checks=True)
    if actor == 'employer':
        client.force_login(employer_user)
    expected = 401 if actor == 'anonymous' else 403
    assert client.get('/api/applications/').status_code == expected
    assert client.get('/api/applications/999999/').status_code == expected
    assert post(client, {'job_id': 999999}).status_code == expected
    assert Application.objects.count() == 0


def test_application_creation_requires_csrf(candidate_client, make_candidate_job):
    job = make_candidate_job()
    response = candidate_client.post('/api/applications/', {'job_id': job.pk}, format='json')
    assert response.status_code == 403 and response.json()['error']['code'] == 'csrf_failed'
    assert Application.objects.count() == 0


@pytest.mark.parametrize('method', ['get', 'patch', 'put', 'delete'])
def test_other_candidate_cannot_access_or_change_an_application(candidate_client, other_candidate, make_candidate_job, method):
    row = Application.objects.create(candidate=other_candidate, job=make_candidate_job(title='PRIVATE APPLICATION JOB'))
    candidate_client.get('/api/auth/csrf/')
    result = getattr(candidate_client, method)(
        f'/api/applications/{row.pk}/', {'status': 'Accepted'} if method != 'get' else {},
        format='json', HTTP_X_CSRFTOKEN=candidate_client.cookies['csrftoken'].value,
    )
    assert result.status_code == 403
    assert 'PRIVATE APPLICATION JOB' not in str(result.json())
    row.refresh_from_db()
    assert row.status == 'Pending' and Application.objects.count() == 1
    assert candidate_client.get('/api/applications/').json()['data'] == []


@pytest.mark.parametrize('method', ['patch', 'put', 'delete'])
def test_candidate_cannot_change_or_withdraw_own_application(candidate_client, candidate_user, make_candidate_job, method):
    row = Application.objects.create(candidate=candidate_user, job=make_candidate_job())
    candidate_client.get('/api/auth/csrf/')
    result = getattr(candidate_client, method)(f'/api/applications/{row.pk}/', {'status': 'Accepted'}, format='json', HTTP_X_CSRFTOKEN=candidate_client.cookies['csrftoken'].value)
    assert result.status_code == 405
    row.refresh_from_db()
    assert row.status == 'Pending'


def test_missing_job_deleted_job_and_missing_application_have_404(candidate_client, make_candidate_job):
    job = make_candidate_job()
    job_id = job.pk
    job.delete()
    assert post(candidate_client, {'job_id': job_id}).status_code == 404
    assert candidate_client.get('/api/applications/999999/').status_code == 404
    assert Application.objects.count() == 0


@pytest.mark.parametrize('query', ['candidate_id=2', 'status=Accepted', 'owner=2'])
def test_client_cannot_choose_application_list_owner(candidate_client, query):
    assert candidate_client.get('/api/applications/?' + query).status_code == 400


def test_own_list_contains_all_statuses_current_jobs_company_and_persisted_booking(
    candidate_client, candidate_user, other_candidate, employer_user, make_candidate_job,
):
    CompanyProfile.objects.create(user=employer_user, company_name='Current Company', description='Company')
    CandidateProfile.objects.create(user=candidate_user, skills=['python'], resume_text='PRIVATE RESUME SENTINEL')
    jobs = [make_candidate_job(title=status) for status in Application.Status.values]
    apps = [Application.objects.create(job=job, candidate=candidate_user, status=status) for job, status in zip(jobs, Application.Status.values)]
    Application.objects.create(job=jobs[0], candidate=other_candidate)
    start = timezone.now() + timedelta(days=2)
    slot = InterviewSlot.objects.create(job=jobs[2], start_at=start, end_at=start + timedelta(minutes=30))
    # Existing booking fixture only: this test does not create a booking API.
    booking = Booking.objects.create(application=apps[2], slot=slot)
    response = candidate_client.get('/api/applications/')
    rows = response.json()['data']
    assert [row['id'] for row in rows] == [row.pk for row in reversed(apps)]
    assert {row['status'] for row in rows} == set(Application.Status.values)
    assert all(row['job']['company'] == 'Current Company' for row in rows)
    booked = next(row for row in rows if row['id'] == apps[2].pk)
    assert booked['status'] == 'Rejected'  # A later status does not hide a booking.
    assert booked['booking']['id'] == booking.pk and booked['booking']['slot_id'] == slot.pk
    assert booked['booking']['start_at'].endswith('Z')
    assert 'PRIVATE RESUME SENTINEL' not in str(response.json())
    assert all(set(row) == {'id', 'job', 'status', 'booking', 'created_at', 'updated_at'} for row in rows)
    job = jobs[0]
    job.title = 'Updated title'
    job.save(update_fields=['title'])
    assert candidate_client.get(f'/api/applications/{apps[0].pk}/').json()['data']['job']['title'] == 'Updated title'


def test_application_protects_posting_and_company_falls_back_to_username(candidate_client, candidate_user, employer_user, make_candidate_job):
    employer_user.display_name = ''
    employer_user.save(update_fields=['display_name'])
    job = make_candidate_job()
    assert post(candidate_client, {'job_id': job.pk}).json()['data']['job']['company'] == employer_user.username
    employer = APIClient(enforce_csrf_checks=True)
    employer.force_login(employer_user)
    employer.get('/api/auth/csrf/')
    response = employer.delete(f'/api/employer/jobs/{job.pk}/', HTTP_X_CSRFTOKEN=employer.cookies['csrftoken'].value)
    assert response.status_code == 409
    assert Job.objects.filter(pk=job.pk).exists() and Application.objects.filter(candidate=candidate_user, job=job).count() == 1


def test_application_sql_metacharacters_are_rejected_before_data_access(candidate_client):
    sql_calls = []

    def inspect(execute, sql, params, many, context):
        sql_calls.append(sql)
        return execute(sql, params, many, context)

    with connection.execute_wrapper(inspect):
        assert post(candidate_client, {'job_id': "1; DROP TABLE applications_application; --"}).status_code == 400
    assert all('DROP TABLE' not in sql for sql in sql_calls)
    assert Application.objects.count() == 0


def test_shared_apply_service_checks_role_for_non_http_callers(employer_user):
    with pytest.raises(NotAuthenticated):
        apply_to_job(AnonymousUser(), 1)
    with pytest.raises(PermissionDenied):
        apply_to_job(employer_user, 1)
