import pytest
from candidates.models import CandidateProfile
from employers.models import CompanyProfile

pytestmark = pytest.mark.django_db


def test_fp_can_1_profile_and_private_resume_rules(candidate_client, candidate_user, other_candidate, candidate_put):
    initial = candidate_client.get("/api/candidate/profile/")
    assert initial.json()["data"] == {"user_id": candidate_user.pk, "display_name": "Alice", "skills": []}
    assert candidate_client.get("/api/candidate/resume/").json()["data"]["resume_text"] == ""
    assert not CandidateProfile.objects.exists()  # Reads do not write rows.
    saved = candidate_put(candidate_client, "/api/candidate/profile/", {
        "display_name": "  Alice Updated  ", "skills": [" Python ", "SQL", "python", "", " "],
    })
    assert saved.status_code == 200
    assert saved.json()["data"]["skills"] == ["python", "sql"]
    assert candidate_client.get("/api/auth/me/").json()["data"]["display_name"] == "Alice Updated"
    text = "  My projects\n<script>alert(1)</script>\n中文经历  "
    assert candidate_put(candidate_client, "/api/candidate/resume/", {"resume_text": text}).status_code == 200
    assert candidate_client.get("/api/candidate/resume/").json()["data"]["resume_text"] == text
    assert "resume_text" not in candidate_client.get("/api/candidate/profile/").json()["data"]
    assert candidate_client.get(f"/api/candidate/resumes/{other_candidate.pk}/").status_code == 403
    assert candidate_put(candidate_client, "/api/candidate/profile/", {"display_name": "Alice", "skills": []}).status_code == 200
    profile = CandidateProfile.objects.get(user=candidate_user)
    assert profile.resume_text == text and profile.skills == []
    assert candidate_put(candidate_client, "/api/candidate/resume/", {"resume_text": ""}).status_code == 200
    profile.refresh_from_db()
    assert profile.resume_text == "" and profile.skills == []


def test_fp_can_2_recommendations_preserve_fields_and_rank_all_jobs(candidate_client, candidate_put, employer_user, make_candidate_job):
    CompanyProfile.objects.create(user=employer_user, company_name="Real Company", description="Company description")
    make_candidate_job(title="ALPHA", id=10)
    make_candidate_job(title="alpha", id=2)
    make_candidate_job(title="Open", skills=[], id=7)
    make_candidate_job(title="Rust", skills=["Rust"], id=9)
    candidate_put(candidate_client, "/api/candidate/profile/", {"display_name": "Alice", "skills": ["Python"]})
    response = candidate_client.get("/api/candidate/recommendations/")
    assert response.status_code == 200
    rows = response.json()["data"]
    assert [(row["id"], row["match_score"]) for row in rows] == [(7, 100), (2, 50), (10, 50), (9, 0)]
    assert all(set(row) == {"id", "title", "company", "description", "required_skills", "match_score"} for row in rows)
    assert all(row["company"] == "Real Company" and row["description"] == "Build dependable services." for row in rows)
    assert rows[1]["required_skills"] == ["Python", "SQL"]


def test_fp_can_3_pending_duplicate_and_application_owner():
    pytest.skip("A/B: application implementation pending")


def test_fp_emp_1_company_profile():
    pytest.skip("B: company profile implementation pending")


def test_fp_emp_2_job_validation_and_deletion():
    pytest.skip("B: job management implementation pending")


def test_fp_emp_3_applicant_fields_order_status_and_role():
    pytest.skip("B/C: applicant management implementation pending")
