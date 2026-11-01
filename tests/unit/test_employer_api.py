"""B day 2: employer company profile and job management HTTP contracts.

Covers FP-EMP-1 and FP-EMP-2 end to end through the real URL configuration:
role checks, ownership checks, validation, whitespace handling, skill
normalisation and the 409 conflict when a posting still has dependents.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from applications.models import Application
from employers.models import CompanyProfile
from jobs.models import Job, RequiredSkill

pytestmark = pytest.mark.django_db
User = get_user_model()
PASSWORD = "ReliablePass!4826"

COMPANY = "/api/employer/company/"
JOBS = "/api/employer/jobs/"


def make_user(username, role):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.test",
        password=PASSWORD,
        role=role,
    )


@pytest.fixture
def employer():
    return make_user("employer_main", "Employer")


@pytest.fixture
def other_employer():
    return make_user("employer_other", "Employer")


@pytest.fixture
def candidate():
    return make_user("candidate_main", "Candidate")


@pytest.fixture
def client():
    return APIClient()


def signed_in(client, user):
    client.force_login(user)
    return client


def create_job(employer, title="Backend Engineer", description="Build services.", skills=("Python",)):
    job = Job.objects.create(employer=employer, title=title, description=description)
    for skill in skills:
        RequiredSkill.objects.create(job=job, name=skill)
    return job


def error_code(response):
    return response.json()["error"]["code"]


# --- FP-EMP-1: company profile ------------------------------------------------


def test_fp_emp_1_profile_is_missing_until_created(client, employer):
    response = signed_in(client, employer).get(COMPANY)

    assert response.status_code == 404
    assert error_code(response) == "not_found"


def test_fp_emp_1_employer_creates_and_reads_own_profile(client, employer):
    client = signed_in(client, employer)
    response = client.put(
        COMPANY,
        {"company_name": "Superball Labs", "description": "We build matching tools."},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data"]["company_name"] == "Superball Labs"
    assert "user" not in response.json()["data"]

    read_back = client.get(COMPANY)
    assert read_back.status_code == 200
    assert read_back.json()["data"]["description"] == "We build matching tools."


def test_fp_emp_1_profile_update_replaces_values(client, employer):
    client = signed_in(client, employer)
    client.put(COMPANY, {"company_name": "First", "description": "One."}, format="json")

    response = client.put(
        COMPANY, {"company_name": "Second", "description": "Two."}, format="json"
    )

    assert response.status_code == 200
    assert CompanyProfile.objects.get(user=employer).company_name == "Second"
    assert CompanyProfile.objects.count() == 1


@pytest.mark.parametrize(
    "body",
    [
        {"company_name": "", "description": "Valid"},
        {"company_name": "   ", "description": "Valid"},
        {"company_name": "Valid", "description": ""},
        {"company_name": "Valid", "description": " \t "},
        {"description": "Missing name"},
        {"company_name": "Missing description"},
        {"company_name": "Valid", "description": "Valid", "user": 1},
        {"company_name": "Valid", "description": "Valid", "is_staff": True},
    ],
)
def test_fp_emp_1_invalid_profile_is_rejected(client, employer, body):
    response = signed_in(client, employer).put(COMPANY, body, format="json")

    assert response.status_code == 400
    assert error_code(response) == "validation_error"
    assert CompanyProfile.objects.count() == 0


def test_fp_emp_1_surrounding_whitespace_is_trimmed(client, employer):
    response = signed_in(client, employer).put(
        COMPANY, {"company_name": "  Superball  ", "description": "  Labs.  "}, format="json"
    )

    assert response.status_code == 201
    assert response.json()["data"]["company_name"] == "Superball"
    assert response.json()["data"]["description"] == "Labs."


def test_fp_emp_1_candidate_and_anonymous_cannot_touch_a_company_profile(client, candidate):
    assert client.get(COMPANY).status_code == 401
    assert signed_in(client, candidate).get(COMPANY).status_code == 403
    assert signed_in(client, candidate).put(
        COMPANY, {"company_name": "X", "description": "Y"}, format="json"
    ).status_code == 403


# --- FP-EMP-2: job postings ---------------------------------------------------


def test_fp_emp_2_employer_creates_a_posting_with_skills(client, employer):
    response = signed_in(client, employer).post(
        JOBS,
        {
            "title": "Backend Engineer",
            "description": "Build services.",
            "required_skills": ["Python", "SQL"],
        },
        format="json",
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["title"] == "Backend Engineer"
    assert data["required_skills"] == ["Python", "SQL"]
    assert Job.objects.get(pk=data["id"]).employer_id == employer.pk


def test_fp_emp_2_posting_may_have_no_skills(client, employer):
    response = signed_in(client, employer).post(
        JOBS,
        {"title": "Generalist", "description": "Anything.", "required_skills": []},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data"]["required_skills"] == []


def test_fp_emp_2_posting_without_skills_field_defaults_to_empty(client, employer):
    response = signed_in(client, employer).post(
        JOBS, {"title": "Generalist", "description": "Anything."}, format="json"
    )

    assert response.status_code == 201
    assert response.json()["data"]["required_skills"] == []


def test_fp_emp_2_skills_are_trimmed_and_deduplicated_case_insensitively(client, employer):
    response = signed_in(client, employer).post(
        JOBS,
        {
            "title": "Backend Engineer",
            "description": "Build services.",
            "required_skills": ["Python", " python ", "PYTHON", "", "  ", "SQL"],
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data"]["required_skills"] == ["Python", "SQL"]
    assert RequiredSkill.objects.count() == 2


@pytest.mark.parametrize(
    "body",
    [
        {"title": "", "description": "Valid"},
        {"title": "   ", "description": "Valid"},
        {"title": "Valid", "description": ""},
        {"title": "Valid", "description": "\n\t"},
        {"description": "Missing title"},
        {"title": "Missing description"},
        {"title": "Valid", "description": "Valid", "required_skills": "Python"},
        {"title": "Valid", "description": "Valid", "required_skills": None},
        {"title": "Valid", "description": "Valid", "employer": 2},
        {"title": "Valid", "description": "Valid", "id": 99},
    ],
)
def test_fp_emp_2_invalid_posting_is_rejected(client, employer, body):
    response = signed_in(client, employer).post(JOBS, body, format="json")

    assert response.status_code == 400
    assert error_code(response) == "validation_error"
    assert Job.objects.count() == 0


def test_fp_emp_2_list_returns_only_own_postings(client, employer, other_employer):
    mine = create_job(employer, title="Mine")
    create_job(other_employer, title="Theirs")

    response = signed_in(client, employer).get(JOBS)

    assert response.status_code == 200
    assert [row["id"] for row in response.json()["data"]] == [mine.pk]


def test_fp_emp_2_detail_distinguishes_404_and_403(client, employer, other_employer, candidate):
    job = create_job(employer)

    assert signed_in(client, employer).get(f"{JOBS}{job.pk}/").status_code == 200
    assert signed_in(client, other_employer).get(f"{JOBS}{job.pk}/").status_code == 403
    assert signed_in(client, employer).get(f"{JOBS}999999/").status_code == 404
    assert signed_in(client, candidate).get(f"{JOBS}{job.pk}/").status_code == 403


def test_fp_emp_2_other_employer_cannot_edit_or_delete(client, employer, other_employer):
    job = create_job(employer)
    client = signed_in(client, other_employer)

    assert client.patch(f"{JOBS}{job.pk}/", {"title": "Hijacked"}, format="json").status_code == 403
    assert client.delete(f"{JOBS}{job.pk}/").status_code == 403
    job.refresh_from_db()
    assert job.title == "Backend Engineer"


def test_fp_emp_2_partial_update_changes_only_supplied_fields(client, employer):
    job = create_job(employer, title="Original", description="Keep me.", skills=("Python",))
    client = signed_in(client, employer)

    response = client.patch(f"{JOBS}{job.pk}/", {"title": "Renamed"}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["title"] == "Renamed"
    assert response.json()["data"]["description"] == "Keep me."
    assert response.json()["data"]["required_skills"] == ["Python"]


def test_fp_emp_2_partial_update_replaces_skills_when_supplied(client, employer):
    job = create_job(employer, skills=("Python", "SQL"))

    response = signed_in(client, employer).patch(
        f"{JOBS}{job.pk}/", {"required_skills": ["Go"]}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["data"]["required_skills"] == ["Go"]
    assert RequiredSkill.objects.filter(job=job).count() == 1


def test_fp_emp_2_partial_update_accepts_empty_skill_list(client, employer):
    job = create_job(employer, skills=("Python",))

    response = signed_in(client, employer).patch(
        f"{JOBS}{job.pk}/", {"required_skills": []}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["data"]["required_skills"] == []
    assert RequiredSkill.objects.filter(job=job).count() == 0


@pytest.mark.parametrize("body", [{"title": ""}, {"title": "  "}, {"description": ""}, {"title": None}])
def test_fp_emp_2_partial_update_rejects_blank_values(client, employer, body):
    job = create_job(employer)
    response = signed_in(client, employer).patch(f"{JOBS}{job.pk}/", body, format="json")

    assert response.status_code == 400
    assert error_code(response) == "validation_error"


def test_fp_emp_2_delete_posting_without_dependents_removes_it(client, employer):
    job = create_job(employer, skills=("Python", "SQL"))

    response = signed_in(client, employer).delete(f"{JOBS}{job.pk}/")

    assert response.status_code == 200
    assert response.json()["data"]["deleted"] is True
    assert not Job.objects.filter(pk=job.pk).exists()
    assert RequiredSkill.objects.count() == 0


def test_fp_emp_2_delete_posting_with_applications_returns_409(client, employer, candidate):
    job = create_job(employer)
    application = Application.objects.create(job=job, candidate=candidate)

    response = signed_in(client, employer).delete(f"{JOBS}{job.pk}/")

    assert response.status_code == 409
    assert error_code(response) == "job_has_dependents"
    assert Job.objects.filter(pk=job.pk).exists()
    assert Application.objects.filter(pk=application.pk).exists()


def test_fp_emp_2_delete_missing_posting_returns_404(client, employer):
    assert signed_in(client, employer).delete(f"{JOBS}999999/").status_code == 404


# --- cross-cutting ------------------------------------------------------------


def test_employer_endpoints_require_login(client, employer):
    job = create_job(employer)

    assert client.get(JOBS).status_code == 401
    assert client.post(JOBS, {}, format="json").status_code == 401
    assert client.delete(f"{JOBS}{job.pk}/").status_code == 401


def test_candidate_cannot_use_employer_job_endpoints(client, candidate, employer):
    job = create_job(employer)
    client = signed_in(client, candidate)

    assert client.get(JOBS).status_code == 403
    assert client.post(JOBS, {"title": "X", "description": "Y"}, format="json").status_code == 403
    assert client.patch(f"{JOBS}{job.pk}/", {"title": "X"}, format="json").status_code == 403


def test_employer_writes_require_csrf(employer):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(employer)

    response = client.post(JOBS, {"title": "X", "description": "Y"}, format="json")

    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"
    assert Job.objects.count() == 0


def test_skill_names_are_stored_as_bound_values(client, employer):
    """FP-SEC-2: SQL metacharacters stay data, not executable SQL."""
    payload = "'); DROP TABLE jobs_job; --"
    response = signed_in(client, employer).post(
        JOBS,
        {"title": "Injection", "description": "Check.", "required_skills": [payload]},
        format="json",
    )

    assert response.status_code == 201
    assert RequiredSkill.objects.get(job_id=response.json()["data"]["id"]).name == payload
    assert Job.objects.count() == 1
