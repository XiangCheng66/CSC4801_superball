"""B day 1: company / job / application domain model contracts.

These tests exercise real database constraints, not serializer logic. They are
the evidence that the 403/409 behaviour required by FP-EMP-1..3 and FP-CAN-3 has
a database-level foundation instead of an in-process check.
"""
import pytest
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from accounts.models import User
from applications.models import APPLICATION_STATUSES, Application
from employers.models import CompanyProfile
from jobs.models import Job, RequiredSkill

pytestmark = pytest.mark.django_db


def make_user(username, role, password="LocalDemo!2026"):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.test",
        password=password,
        role=role,
    )


def make_company(user, name="Superball Labs", description="A demo employer."):
    return CompanyProfile.objects.create(user=user, company_name=name, description=description)


def make_job(employer, title="Backend Engineer", description="Build services.", skills=()):
    job = Job.objects.create(employer=employer, title=title, description=description)
    for skill in skills:
        RequiredSkill.objects.create(job=job, name=skill)
    return job


def assert_rejected_by_database(write):
    """Run ``write`` inside a savepoint and assert the database refuses it."""
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            write()


def test_fp_emp_1_company_profile_is_one_per_employer():
    employer = make_user("employer_a", "Employer")
    make_company(employer)

    assert employer.company_profile.company_name == "Superball Labs"
    assert CompanyProfile.objects.filter(user=employer).count() == 1

    assert_rejected_by_database(
        lambda: CompanyProfile.objects.create(
            user=employer, company_name="Second", description="Duplicate profile."
        )
    )


@pytest.mark.parametrize("name", ["", "   ", "\n\t "])
def test_fp_emp_1_company_name_must_not_be_blank(name):
    # Every test runs in its own rolled-back transaction, so the username can repeat.
    employer = make_user("employer_blank_name", "Employer")
    assert_rejected_by_database(lambda: make_company(employer, name=name))


@pytest.mark.parametrize("description", ["", "  "])
def test_fp_emp_1_company_description_must_not_be_blank(description):
    employer = make_user("employer_blank_description", "Employer")
    assert_rejected_by_database(lambda: make_company(employer, description=description))


@pytest.mark.parametrize(
    "field,value",
    [("title", ""), ("title", "   "), ("description", ""), ("description", "\t")],
)
def test_fp_emp_2_job_text_fields_must_not_be_blank(field, value):
    employer = make_user("employer_blank_job", "Employer")
    payload = {"employer": employer, "title": "Backend Engineer", "description": "Build services."}
    payload[field] = value
    assert_rejected_by_database(lambda: Job.objects.create(**payload))


def test_fp_emp_2_job_may_have_no_required_skills():
    employer = make_user("employer_empty", "Employer")
    job = make_job(employer, skills=())

    assert job.required_skills.count() == 0
    assert job.required_skill_names == []


def test_fp_emp_2_required_skills_are_case_insensitive_unique_per_job():
    employer = make_user("employer_skills", "Employer")
    job = make_job(employer, skills=["Python"])
    other = make_job(employer, title="Data Engineer", description="Pipelines.", skills=["Python"])

    assert_rejected_by_database(lambda: RequiredSkill.objects.create(job=job, name="python"))
    # The same skill on a different posting is a separate row.
    assert other.required_skills.get().name == "Python"


def test_fp_emp_2_required_skill_trims_surrounding_whitespace():
    employer = make_user("employer_trim", "Employer")
    job = make_job(employer)
    skill = RequiredSkill.objects.create(job=job, name="  PostgreSQL  ")

    skill.refresh_from_db()
    assert skill.name == "PostgreSQL"
    assert job.required_skill_names == ["PostgreSQL"]


def test_fp_emp_2_job_listing_exposes_required_skills_as_plain_strings():
    employer = make_user("employer_listing", "Employer")
    job = make_job(employer, skills=["Python", "SQL"])

    assert sorted(job.required_skill_names) == ["Python", "SQL"]


def test_fp_emp_2_delete_job_with_applications_is_protected():
    employer = make_user("employer_protect", "Employer")
    candidate = make_user("candidate_protect", "Candidate")
    job = make_job(employer, skills=["Python"])
    application = Application.objects.create(job=job, candidate=candidate)

    with pytest.raises(ProtectedError):
        job.delete()

    assert Job.objects.filter(pk=job.pk).exists()
    assert Application.objects.filter(pk=application.pk).exists()


def test_fp_emp_2_delete_job_without_dependents_removes_required_skills():
    employer = make_user("employer_delete", "Employer")
    job = make_job(employer, skills=["Python", "SQL"])

    job.delete()

    assert not Job.objects.filter(pk=job.pk).exists()
    assert RequiredSkill.objects.count() == 0


def test_fp_can_3_new_application_defaults_to_pending():
    employer = make_user("employer_default", "Employer")
    candidate = make_user("candidate_default", "Candidate")
    job = make_job(employer)

    application = Application.objects.create(job=job, candidate=candidate)

    assert application.status == Application.Status.PENDING
    assert application.status == "Pending"


def test_fp_can_3_duplicate_application_is_rejected_by_the_database():
    employer = make_user("employer_dup", "Employer")
    candidate = make_user("candidate_dup", "Candidate")
    job = make_job(employer)
    Application.objects.create(job=job, candidate=candidate)

    assert_rejected_by_database(lambda: Application.objects.create(job=job, candidate=candidate))
    assert Application.objects.filter(job=job, candidate=candidate).count() == 1


@pytest.mark.parametrize("status", APPLICATION_STATUSES)
def test_fp_emp_3_all_four_statuses_are_storable(status):
    employer = make_user(f"employer_{status.lower()}", "Employer")
    candidate = make_user(f"candidate_{status.lower()}", "Candidate")
    job = make_job(employer)

    application = Application.objects.create(job=job, candidate=candidate, status=status)

    assert application.status == status


def test_fp_emp_3_unknown_status_is_rejected_by_the_database():
    employer = make_user("employer_bad_status", "Employer")
    candidate = make_user("candidate_bad_status", "Candidate")
    job = make_job(employer)

    assert_rejected_by_database(
        lambda: Application.objects.create(job=job, candidate=candidate, status="Hired")
    )


def test_fp_emp_3_status_choices_match_the_course_contract():
    assert APPLICATION_STATUSES == ("Pending", "Interviewing", "Rejected", "Accepted")
    assert tuple(Application.Status.values) == APPLICATION_STATUSES


def test_job_owns_only_its_own_applications():
    employer_a = make_user("employer_owner_a", "Employer")
    employer_b = make_user("employer_owner_b", "Employer")
    candidate = make_user("candidate_owner", "Candidate")
    job_a = make_job(employer_a, title="A")
    job_b = make_job(employer_b, title="B")
    Application.objects.create(job=job_a, candidate=candidate)

    assert list(job_a.applications.values_list("job_id", flat=True)) == [job_a.pk]
    assert job_b.applications.count() == 0
    assert job_a.employer_id == employer_a.pk
