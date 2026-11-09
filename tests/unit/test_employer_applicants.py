"""B day 3: employer applicant list and status changes (FP-EMP-3).

Covers the ranking contract (shared with the candidate dashboard), the field
whitelist shown to an employer, ownership boundaries on both endpoints and the
rule that an existing booking stays visible after the application leaves
``Interviewing``.
"""
from datetime import datetime, time, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from applications.models import Application
from candidates.models import CandidateProfile
from jobs.models import Job, RequiredSkill
from scheduling.models import Booking, InterviewSlot

pytestmark = pytest.mark.django_db
User = get_user_model()
PASSWORD = "ReliablePass!4826"
SHANGHAI = ZoneInfo("Asia/Shanghai")


def make_user(username, role, display_name=""):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.test",
        password=PASSWORD,
        role=role,
        display_name=display_name or username,
    )


def make_job(employer, title="Backend Engineer", skills=("Python", "SQL")):
    job = Job.objects.create(employer=employer, title=title, description="Build services.")
    for skill in skills:
        RequiredSkill.objects.create(job=job, name=skill)
    return job


def make_candidate(username, display_name, skills):
    user = make_user(username, "Candidate", display_name)
    CandidateProfile.objects.update_or_create(user=user, defaults={"skills": skills})
    return user


def make_application(job, candidate, status=Application.Status.PENDING):
    return Application.objects.create(job=job, candidate=candidate, status=status)


@pytest.fixture
def employer():
    return make_user("employer_owner", "Employer", "Owner Co")


@pytest.fixture
def other_employer():
    return make_user("employer_other", "Employer", "Other Co")


@pytest.fixture
def client():
    return APIClient()


def signed_in(client, user):
    client.force_login(user)
    return client


def applicants_url(job):
    return f"/api/employer/jobs/{job.pk}/applicants/"


def status_url(application):
    return f"/api/employer/applications/{application.pk}/status/"


def error_code(response):
    return response.json()["error"]["code"]


# --- ranking ------------------------------------------------------------------


def test_fp_emp_3_applicants_are_ranked_by_match_score_descending(client, employer):
    job = make_job(employer, skills=("Python", "SQL"))
    high = make_candidate("cand_high", "High", ["python", "sql"])
    zero = make_candidate("cand_zero", "Zero", ["rust"])
    make_application(job, high)
    make_application(job, zero)

    rows = signed_in(client, employer).get(applicants_url(job)).json()["data"]

    assert [(row["display_name"], row["match_score"]) for row in rows] == [("High", 100), ("Zero", 0)]


def test_fp_emp_3_ties_break_by_display_name_then_candidate_id(client, employer):
    job = make_job(employer, skills=("Python", "SQL"))
    zed = make_candidate("cand_zed", "Zed", ["python"])
    amy = make_candidate("cand_amy", "amy", ["python"])
    twin_a = make_candidate("cand_twin_a", "Same", ["python"])
    twin_b = make_candidate("cand_twin_b", "Same", ["python"])
    for candidate in (zed, amy, twin_a, twin_b):
        make_application(job, candidate)

    rows = signed_in(client, employer).get(applicants_url(job)).json()["data"]

    assert [row["display_name"] for row in rows] == ["amy", "Same", "Same", "Zed"]
    # The two "Same" rows are equal on score and name, so the stable candidate ID decides.
    same_rows = [row for row in rows if row["display_name"] == "Same"]
    assert [row["candidate_id"] for row in same_rows] == sorted([twin_a.pk, twin_b.pk])


def test_fp_emp_3_posting_without_skills_scores_everyone_100(client, employer):
    job = make_job(employer, skills=())
    make_application(job, make_candidate("cand_one", "One", []))
    make_application(job, make_candidate("cand_two", "Two", ["python"]))

    rows = signed_in(client, employer).get(applicants_url(job)).json()["data"]

    assert [row["match_score"] for row in rows] == [100, 100]


def test_fp_emp_3_each_row_carries_identity_skills_score_status_and_booking(client, employer):
    job = make_job(employer)
    candidate = make_candidate("cand_full", "Full Name", ["python", "sql"])
    application = make_application(job, candidate, Application.Status.INTERVIEWING)

    rows = signed_in(client, employer).get(applicants_url(job)).json()["data"]

    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == application.pk
    assert row["candidate_id"] == candidate.pk
    assert row["display_name"] == "Full Name"
    assert row["skills"] == ["python", "sql"]
    assert row["match_score"] == 100
    assert row["status"] == "Interviewing"
    assert row["booking"] is None
    assert set(row) == {
        "id", "candidate_id", "display_name", "skills", "match_score",
        "status", "booking", "created_at", "updated_at",
    }


def test_fp_emp_3_employer_never_sees_resume_or_account_secrets(client, employer):
    job = make_job(employer)
    candidate = make_candidate("cand_private", "Private", ["python"])
    candidate.candidate_profile.resume_text = "Secret resume body"
    candidate.candidate_profile.save()
    make_application(job, candidate)

    response = signed_in(client, employer).get(applicants_url(job))

    body = response.content.decode()
    assert "Secret resume body" not in body
    assert "cand_private@example.test" not in body
    assert "password" not in body


def test_fp_emp_3_list_is_empty_without_applications(client, employer):
    job = make_job(employer)

    response = signed_in(client, employer).get(applicants_url(job))

    assert response.status_code == 200
    assert response.json()["data"] == []


# --- applicant list boundaries ------------------------------------------------


def test_fp_emp_3_applicant_list_enforces_role_and_ownership(client, employer, other_employer):
    job = make_job(employer)

    assert client.get(applicants_url(job)).status_code == 401
    assert error_code(client.get(applicants_url(job))) == "not_authenticated"

    candidate_user = make_user("cand_role", "Candidate")
    assert signed_in(client, candidate_user).get(applicants_url(job)).status_code == 403

    other = signed_in(client, other_employer).get(applicants_url(job))
    assert other.status_code == 403
    assert error_code(other) == "permission_denied"

    missing = signed_in(client, employer).get("/api/employer/jobs/999999/applicants/")
    assert missing.status_code == 404


# --- status changes -----------------------------------------------------------


@pytest.mark.parametrize(
    "status",
    ["Pending", "Interviewing", "Rejected", "Accepted"],
)
def test_fp_emp_3_owner_sets_each_allowed_status(client, employer, status):
    job = make_job(employer)
    application = make_application(job, make_candidate("cand_status", "Status", ["python"]))

    response = signed_in(client, employer).patch(status_url(application), {"status": status}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == status
    application.refresh_from_db()
    assert application.status == status


def test_fp_emp_3_status_change_returns_the_full_ranked_row(client, employer):
    job = make_job(employer, skills=("Python", "SQL"))
    application = make_application(job, make_candidate("cand_row", "Row", ["python"]))

    data = signed_in(client, employer).patch(
        status_url(application), {"status": "Interviewing"}, format="json"
    ).json()["data"]

    assert data["match_score"] == 50
    assert data["display_name"] == "Row"
    assert data["skills"] == ["python"]


@pytest.mark.parametrize("body", [{"status": "Hired"}, {"status": ""}, {}, {"status": "Pending", "id": 1}])
def test_fp_emp_3_invalid_status_input_is_rejected(client, employer, body):
    job = make_job(employer)
    application = make_application(job, make_candidate("cand_bad", "Bad", []))

    response = signed_in(client, employer).patch(status_url(application), body, format="json")

    assert response.status_code == 400
    assert error_code(response) == "validation_error"
    application.refresh_from_db()
    assert application.status == "Pending"


def test_fp_emp_3_other_employer_cannot_change_status(client, employer, other_employer):
    job = make_job(employer)
    application = make_application(job, make_candidate("cand_guard", "Guard", []))

    response = signed_in(client, other_employer).patch(
        status_url(application), {"status": "Accepted"}, format="json"
    )

    assert response.status_code == 403
    application.refresh_from_db()
    assert application.status == "Pending"


def test_fp_emp_3_candidate_cannot_change_status(client, employer):
    job = make_job(employer)
    candidate = make_candidate("cand_self", "Self", [])
    application = make_application(job, candidate)

    response = signed_in(client, candidate).patch(
        status_url(application), {"status": "Accepted"}, format="json"
    )

    assert response.status_code == 403
    application.refresh_from_db()
    assert application.status == "Pending"

    anonymous = APIClient().patch(status_url(application), {"status": "Accepted"}, format="json")
    assert anonymous.status_code == 401


def test_fp_emp_3_unknown_application_returns_404(client, employer):
    response = signed_in(client, employer).patch(
        "/api/employer/applications/999999/status/", {"status": "Accepted"}, format="json"
    )

    assert response.status_code == 404


def test_fp_emp_3_status_change_does_not_touch_other_applications(client, employer):
    job = make_job(employer)
    first = make_application(job, make_candidate("cand_first", "First", []))
    second = make_application(job, make_candidate("cand_second", "Second", []))

    signed_in(client, employer).patch(status_url(first), {"status": "Rejected"}, format="json")

    second.refresh_from_db()
    assert second.status == "Pending"


# --- booking visibility -------------------------------------------------------


def test_fp_emp_3_booking_is_visible_and_survives_leaving_interviewing(client, employer):
    job = make_job(employer)
    candidate = make_candidate("cand_booked", "Booked", ["python"])
    application = make_application(job, candidate, Application.Status.INTERVIEWING)
    tomorrow = timezone.localdate(timezone=SHANGHAI) + timedelta(days=1)
    start = datetime.combine(tomorrow, time(9, 0)).replace(tzinfo=SHANGHAI)
    slot = InterviewSlot.objects.create(job=job, start_at=start, end_at=start + timedelta(minutes=30))
    Booking.objects.create(slot=slot, application=application)

    client = signed_in(client, employer)
    row = client.get(applicants_url(job)).json()["data"][0]
    assert row["booking"]["slot_id"] == slot.pk
    # API timestamps are UTC; the page converts them for display.
    assert row["booking"]["start_at"] == slot.start_at.astimezone(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    client.patch(status_url(application), {"status": "Rejected"}, format="json")

    after = client.get(applicants_url(job)).json()["data"][0]
    assert after["status"] == "Rejected"
    assert after["booking"]["slot_id"] == slot.pk, "a booking must not disappear when the status changes"
