import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from jobs.models import Job, RequiredSkill


@pytest.fixture
def candidate_user():
    return get_user_model().objects.create_user(
        username="profile_alice", email="profile_alice@example.test", role="Candidate", display_name="Alice",
    )


@pytest.fixture
def other_candidate():
    return get_user_model().objects.create_user(
        username="profile_bob", email="profile_bob@example.test", role="Candidate", display_name="Bob",
    )


@pytest.fixture
def employer_user():
    return get_user_model().objects.create_user(
        username="profile_employer", email="profile_employer@example.test", role="Employer", display_name="Hiring Team",
    )


@pytest.fixture
def candidate_client(candidate_user):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(candidate_user)
    return client


@pytest.fixture
def candidate_put():
    def put(client, path, body):
        client.get("/api/auth/csrf/")
        return client.put(path, body, format="json", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
    return put


@pytest.fixture
def make_candidate_job(employer_user):
    def make(title="Backend", skills=("Python", "SQL"), **values):
        employer = values.pop("employer", employer_user)
        job = Job.objects.create(employer=employer, title=title, description="Build dependable services.", **values)
        for skill in skills:
            RequiredSkill.objects.create(job=job, name=skill)
        return job
    return make
