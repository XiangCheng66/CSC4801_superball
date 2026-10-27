from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from rest_framework.test import APIClient

from candidates.models import CandidateProfile
from jobs.models import Job

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("changes", [
    {"display_name": ""}, {"display_name": "  "}, {"display_name": "x" * 101},
    {"display_name": 123}, {"display_name": True}, {"display_name": None},
    {"skills": "Python"}, {"skills": {}}, {"skills": None}, {"skills": 3},
    {"skills": [1]}, {"skills": [True]}, {"skills": [None]}, {"skills": [[]]},
    {"skills": ["x" * 101]}, {"skills": ["İ" * 100]},
    {"user_id": 99}, {"role": "Employer"}, {"resume_text": "must use private endpoint"},
])
def test_invalid_profile_input_is_atomic(candidate_user, candidate_client, candidate_put, changes):
    original = CandidateProfile.objects.create(user=candidate_user, skills=["rust"], resume_text="PRIVATE ORIGINAL")
    payload = {"display_name": "Changed", "skills": ["Python"], **changes}
    result = candidate_put(candidate_client, "/api/candidate/profile/", payload)
    assert result.status_code == 400 and result.json()["error"]["code"] == "validation_error"
    candidate_user.refresh_from_db()
    original.refresh_from_db()
    assert candidate_user.display_name == "Alice"
    assert original.skills == ["rust"] and original.resume_text == "PRIVATE ORIGINAL"


@pytest.mark.parametrize("value", [None, False, 42, [], {}])
def test_resume_rejects_non_strings_without_writing(candidate_user, candidate_client, candidate_put, value):
    response = candidate_put(candidate_client, "/api/candidate/resume/", {"resume_text": value})
    assert response.status_code == 400
    assert not CandidateProfile.objects.filter(user=candidate_user).exists()


@pytest.mark.parametrize("payload", [{}, {"resume_text": "new", "user_id": 123}])
def test_resume_requires_exact_input_fields(candidate_client, candidate_put, payload):
    assert candidate_put(candidate_client, "/api/candidate/resume/", payload).status_code == 400


@pytest.mark.parametrize("resource,body", [
    ("profile", {"display_name": "Changed", "skills": []}),
    ("resume", {"resume_text": "changed"}),
])
@pytest.mark.parametrize("method", ["get", "put"])
@pytest.mark.parametrize("actor", ["other", "employer"])
def test_other_users_cannot_read_or_replace_private_resources(
    candidate_user, other_candidate, employer_user, candidate_put, resource, body, method, actor,
):
    profile = CandidateProfile.objects.create(user=candidate_user, skills=["rust"], resume_text="PRIVATE SENTINEL")
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(other_candidate if actor == "other" else employer_user)
    path = f"/api/candidate/{resource}s/{candidate_user.pk}/"
    response = client.get(path) if method == "get" else candidate_put(client, path, body)
    assert response.status_code == 403 and response.json()["error"]["code"] == "permission_denied"
    assert "PRIVATE SENTINEL" not in str(response.json())
    profile.refresh_from_db()
    candidate_user.refresh_from_db()
    assert profile.resume_text == "PRIVATE SENTINEL" and profile.skills == ["rust"]
    assert candidate_user.display_name == "Alice"


@pytest.mark.parametrize("path", [
    "/api/candidate/profile/", "/api/candidate/resume/", "/api/candidate/recommendations/",
    "/api/candidate/profiles/999999/", "/api/candidate/resumes/999999/",
])
def test_candidate_endpoints_check_identity_before_objects(employer_user, path):
    client = APIClient(enforce_csrf_checks=True)
    assert client.get(path).status_code == 401
    if "recommendations" not in path:
        assert client.put(path, {}, format="json").status_code == 401
    client.force_login(employer_user)
    assert client.get(path).status_code == 403


@pytest.mark.parametrize("resource,body", [
    ("profile", {"display_name": "Updated", "skills": []}),
    ("resume", {"resume_text": "Updated"}),
])
def test_missing_owner_has_404_and_own_alias_is_equivalent(candidate_user, candidate_client, candidate_put, resource, body):
    missing = f"/api/candidate/{resource}s/999999/"
    assert candidate_client.get(missing).status_code == 404
    assert candidate_put(candidate_client, missing, body).status_code == 404
    alias = f"/api/candidate/{resource}s/{candidate_user.pk}/"
    assert candidate_put(candidate_client, alias, body).status_code == 200
    assert candidate_client.get(alias).json() == candidate_client.get(f"/api/candidate/{resource}/").json()


@pytest.mark.parametrize("resource,body", [
    ("profile", {"display_name": "Updated", "skills": []}),
    ("resume", {"resume_text": "Updated"}),
])
def test_candidate_writes_require_csrf(candidate_user, candidate_client, resource, body):
    response = candidate_client.put(f"/api/candidate/{resource}/", body, format="json")
    assert response.status_code == 403 and response.json()["error"]["code"] == "csrf_failed"
    assert not CandidateProfile.objects.filter(user=candidate_user).exists()
    candidate_user.refresh_from_db()
    assert candidate_user.display_name == "Alice"


def test_resume_first_save_and_large_raw_text_preserve_other_fields(candidate_user, candidate_client, candidate_put):
    text = " \t\n中文 ' \" <script>alert(1)</script>\n" * 4000 + "  "
    response = candidate_put(candidate_client, "/api/candidate/resume/", {"resume_text": text})
    assert response.status_code == 200 and response.json()["data"]["resume_text"] == text
    assert CandidateProfile.objects.get(user=candidate_user).skills == []
    fresh = APIClient()
    fresh.force_login(candidate_user)
    assert fresh.get("/api/candidate/resume/").json()["data"]["resume_text"] == text
    assert fresh.get("/api/candidate/profile/").json()["data"]["skills"] == []


@pytest.mark.parametrize("skills,expected", [
    (["Python", "SQL"], 100), (["Python"], 50), (["Rust"], 0), ([], 0),
])
def test_persisted_skills_feed_shared_matching(candidate_client, candidate_put, make_candidate_job, skills, expected):
    required = make_candidate_job()
    empty = make_candidate_job(title="No requirements", skills=[])
    candidate_put(candidate_client, "/api/candidate/profile/", {"display_name": "Alice", "skills": skills})
    rows = candidate_client.get("/api/candidate/recommendations/").json()["data"]
    scores = {row["id"]: row["match_score"] for row in rows}
    assert scores == {required.pk: expected, empty.pk: 100}


def test_uninitialized_profile_and_company_fallbacks(candidate_user, candidate_client, employer_user, make_candidate_job):
    assert candidate_client.get("/api/candidate/recommendations/").json()["data"] == []
    job = make_candidate_job()
    row = candidate_client.get("/api/candidate/recommendations/").json()["data"][0]
    assert row["id"] == job.pk and row["match_score"] == 0 and row["company"] == "Hiring Team"
    employer_user.display_name = ""
    employer_user.save(update_fields=["display_name"])
    row = candidate_client.get("/api/candidate/recommendations/").json()["data"][0]
    assert row["company"] == employer_user.username
    assert not CandidateProfile.objects.filter(user=candidate_user).exists()


def test_resume_never_leaks_or_changes_recommendations(candidate_client, candidate_put, make_candidate_job):
    make_candidate_job()
    before = candidate_client.get("/api/candidate/recommendations/").json()
    candidate_put(candidate_client, "/api/candidate/resume/", {"resume_text": "PRIVATE Python SQL Rust"})
    assert candidate_client.get("/api/candidate/recommendations/").json() == before
    for path in ["/api/auth/me/", "/api/candidate/profile/", "/api/candidate/recommendations/"]:
        assert "PRIVATE" not in str(candidate_client.get(path).json())


def test_profile_and_resume_sql_metacharacters_stay_bound(candidate_client, candidate_put):
    payload = "' OR 1=1 --"
    calls = []

    def inspect(execute, sql, params, many, context):
        calls.append((sql, params))
        return execute(sql, params, many, context)

    with connection.execute_wrapper(inspect):
        assert candidate_put(candidate_client, "/api/candidate/profile/", {"display_name": payload, "skills": [payload]}).status_code == 200
        assert candidate_put(candidate_client, "/api/candidate/resume/", {"resume_text": payload}).status_code == 200
    assert all(payload not in sql for sql, _ in calls)
    assert any(payload in str(params) for _, params in calls if params)
    assert candidate_client.get("/api/candidate/resume/").json()["data"]["resume_text"] == payload


def test_candidate_demo_is_repeatable_preserves_other_data_and_covers_four_scores():
    output = StringIO()
    call_command("seed_candidate_demo", stdout=output)
    initial_jobs = list(Job.objects.values_list("pk", flat=True))
    users = get_user_model().objects
    extra = users.create_user(username="unrelated", email="unrelated@example.test", role="Candidate")
    CandidateProfile.objects.create(user=extra, skills=["keep"], resume_text="keep unrelated")
    first = CandidateProfile.objects.get(user__username="candidate1")
    first.resume_text = "keep demo resume"
    first.save(update_fields=["resume_text"])
    unrelated_job = Job.objects.create(employer=users.get(username="employer1"), title="Unrelated", description="Keep this posting")
    call_command("seed_candidate_demo", stdout=output)
    assert users.count() == 6 and CandidateProfile.objects.count() == 4
    assert list(Job.objects.exclude(pk=unrelated_job.pk).values_list("pk", flat=True)) == initial_jobs
    assert CandidateProfile.objects.get(user=extra).resume_text == "keep unrelated"
    assert CandidateProfile.objects.get(user__username="candidate1").resume_text == "keep demo resume"
    assert all(user.check_password("LocalDemo!2026") for user in users.exclude(pk=extra.pk))
    for number, expected in [(1, 100), (2, 50), (3, 0)]:
        client = APIClient()
        client.force_login(users.get(username=f"candidate{number}"))
        rows = client.get("/api/candidate/recommendations/").json()["data"]
        scores = {row["title"]: row["match_score"] for row in rows}
        assert scores["[DEMO-A2] Backend Developer"] == expected
        assert scores["[DEMO-A2] Generalist"] == 100
