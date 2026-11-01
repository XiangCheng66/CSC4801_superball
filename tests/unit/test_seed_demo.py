"""FP-DOC-3: the single reset-and-seed command produces the mandated demo data."""
from datetime import timedelta
from io import StringIO
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command
from django.utils import timezone as dj_timezone

from accounts.models import User
from applications.models import Application
from employers.models import CompanyProfile
from jobs.models import Job
from matching import calculate_match_score
from scheduling.models import Booking, InterviewSlot

pytestmark = pytest.mark.django_db
SHANGHAI = ZoneInfo("Asia/Shanghai")


def seed(*args):
    out = StringIO()
    call_command("seed_demo", *args, stdout=out)
    return out.getvalue()


def skills_of(username):
    return User.objects.get(username=username).candidate_profile.skills


def required_of(title):
    job = Job.objects.get(title=title)
    return [skill.name for skill in job.required_skills.all()]


def test_seed_demo_builds_the_documented_dataset():
    seed()

    assert User.objects.filter(role__in=["Candidate", "Employer"]).count() == 5
    assert CompanyProfile.objects.count() == 2
    assert Job.objects.count() == 4
    assert set(Job.objects.values_list("title", flat=True)) == {
        "[Local demo] Interview availability",
        "[DEMO-A2] Backend Developer",
        "[DEMO-A2] Generalist",
        "[Local demo] Data Analyst",
    }
    assert Application.objects.count() == 5
    assert set(Application.objects.values_list("status", flat=True)) == {
        "Pending", "Interviewing", "Rejected", "Accepted",
    }


def test_seed_demo_reproduces_all_four_match_examples():
    seed()
    required = required_of("[DEMO-A2] Backend Developer")
    empty = required_of("[DEMO-A2] Generalist")

    assert required == ["Python", "SQL"]
    assert empty == []
    assert calculate_match_score(skills_of("candidate1"), required) == 100
    assert calculate_match_score(skills_of("candidate2"), required) == 50
    assert calculate_match_score(skills_of("candidate3"), required) == 0
    assert calculate_match_score(skills_of("candidate3"), empty) == 100


def test_seed_demo_supplies_two_interviewing_candidates_for_one_slot():
    seed()
    slot = InterviewSlot.objects.order_by("start_at").first()

    interviewing = Application.objects.filter(status="Interviewing").select_related("job")
    assert interviewing.count() == 2
    assert {app.job.employer_id for app in interviewing} == {slot.job.employer_id}
    assert not Booking.objects.filter(slot=slot).exists()


def test_seed_demo_creates_future_thirty_minute_slots_in_beijing_time():
    seed()
    slots = list(InterviewSlot.objects.order_by("start_at"))

    assert len(slots) == 2
    local = [dj_timezone.localtime(slot.start_at, SHANGHAI) for slot in slots]
    assert [(item.hour, item.minute) for item in local] == [(9, 0), (9, 30)]
    for slot in slots:
        assert slot.start_at > dj_timezone.now()
        assert slot.end_at - slot.start_at == timedelta(minutes=30)


def test_seed_demo_is_repeatable_and_resets_business_rows():
    seed()
    Job.objects.create(
        employer=User.objects.get(username="employer1"),
        title="Leftover row",
        description="Should be removed by the next reset.",
    )

    seed()

    assert Job.objects.count() == 4
    assert Application.objects.count() == 5
    assert not Job.objects.filter(title="Leftover row").exists()


def test_seed_demo_removes_temporary_e2e_accounts():
    seed()
    User.objects.create_user(
        username="e2e_candidate_tmp", email="e2e_candidate_tmp@example.test",
        password="TempPass!2026", role="Candidate",
    )

    seed()

    assert not User.objects.filter(username__startswith="e2e_").exists()


def test_seed_demo_no_reset_keeps_unrelated_rows():
    seed()
    extra = Job.objects.create(
        employer=User.objects.get(username="employer2"),
        title="Kept row",
        description="Survives an incremental seed.",
    )

    seed("--no-reset")

    assert Job.objects.filter(pk=extra.pk).exists()
    assert Job.objects.count() == 5
