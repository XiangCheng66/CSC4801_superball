from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from jobs.models import Job
from scheduling.models import InterviewSlot

pytestmark = pytest.mark.django_db


def test_employer_job_candidate_matching_and_slot_deletion_guard_work_together(candidate_user, candidate_client, candidate_put, employer_user):
    employer = APIClient(enforce_csrf_checks=True)
    employer.force_login(employer_user)
    company = candidate_put(employer, '/api/employer/company/', {'company_name': 'Integrated Company', 'description': 'Across all modules'})
    assert company.status_code == 201
    employer.get('/api/auth/csrf/')
    headers = {'HTTP_X_CSRFTOKEN': employer.cookies['csrftoken'].value}
    created = employer.post('/api/employer/jobs/', {'title': 'Integrated role', 'description': 'Work together', 'required_skills': ['Python', 'SQL']}, format='json', **headers)
    assert created.status_code == 201
    job_id = created.json()['data']['id']
    candidate_put(candidate_client, '/api/candidate/profile/', {'display_name': 'Alice', 'skills': ['Python']})
    row = candidate_client.get('/api/candidate/recommendations/').json()['data'][0]
    assert row['id'] == job_id and row['company'] == 'Integrated Company' and row['match_score'] == 50
    start = timezone.now() + timedelta(days=2)
    slot = employer.post('/api/slots/', {'job_id': job_id, 'start_at': start.isoformat(), 'end_at': (start + timedelta(minutes=30)).isoformat()}, format='json', **headers)
    assert slot.status_code == 201
    slot_id = slot.json()['data']['id']
    blocked = employer.delete(f'/api/employer/jobs/{job_id}/', **headers)
    assert blocked.status_code == 409 and blocked.json()['error']['code'] == 'job_has_dependents'
    assert Job.objects.filter(pk=job_id).exists() and InterviewSlot.objects.filter(pk=slot_id).exists()
    assert candidate_client.get('/api/slots/').status_code == 403
    assert employer.delete(f'/api/slots/{slot_id}/', **headers).status_code == 200
    assert employer.delete(f'/api/employer/jobs/{job_id}/', **headers).status_code == 200
    assert candidate_client.get('/api/candidate/recommendations/').json()['data'] == []
