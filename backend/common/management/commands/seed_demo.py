"""FP-DOC-3: one documented command that resets and seeds the demo data set.

``python manage.py seed_demo`` wipes business rows, restores the five reserved
demo accounts and rebuilds a deterministic data set that satisfies every seed
requirement in the course brief:

- two employers with company profiles and two candidates plus one extra;
- postings whose required skills produce the four mandated match examples
  (100 / 50 / 0 / empty requirement is 100);
- applications covering all four statuses;
- two ``Interviewing`` candidates under the same employer who can race for one
  open slot.

Titles are part of the demo contract because the Playwright suites locate rows
by heading; keep them stable when changing this file.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from accounts.models import User
from applications.models import Application
from candidates.models import CandidateProfile
from employers.models import CompanyProfile
from jobs.models import Job, RequiredSkill
from scheduling.models import Booking, InterviewSlot

DEMO_PASSWORD = "LocalDemo!2026"  # documented local/demo credential, same as the auth seed
SHANGHAI = ZoneInfo("Asia/Shanghai")

ACCOUNTS = [
    ("candidate1", "Candidate", "Demo Candidate 1"),
    ("candidate2", "Candidate", "Demo Candidate 2"),
    ("candidate3", "Candidate", "Demo Candidate 3"),
    ("employer1", "Employer", "Demo Employer 1"),
    ("employer2", "Employer", "Demo Employer 2"),
]

COMPANIES = {
    "employer1": ("Superball Labs", "We build matching tools for small hiring teams."),
    "employer2": ("Northwind Studio", "A product studio hiring data people."),
}

CANDIDATE_SKILLS = {
    "candidate1": ["python", "sql"],
    "candidate2": ["python"],
    "candidate3": ["rust"],
}

# key, owner, title, description, required skills
JOBS = [
    ("availability", "employer1", "[Local demo] Interview availability",
     "Reserved posting used by the availability demo.", []),
    ("backend", "employer1", "[DEMO-A2] Backend Developer",
     "Build reliable services with Python and SQL.", ["Python", "SQL"]),
    ("generalist", "employer1", "[DEMO-A2] Generalist",
     "No fixed skill requirement for this demo posting.", []),
    ("analyst", "employer2", "[Local demo] Data Analyst",
     "Turn product questions into dashboards.", ["Python", "SQL"]),
]

# candidate, job, status — all four statuses plus two Interviewing candidates
# under employer1 so both are eligible for the same slot.
APPLICATIONS = [
    ("candidate1", "backend", "Interviewing"),
    ("candidate3", "backend", "Interviewing"),
    ("candidate2", "generalist", "Pending"),
    ("candidate1", "generalist", "Accepted"),
    ("candidate2", "analyst", "Rejected"),
]

SLOT_TIMES = [(9, 0), (9, 30)]


class Command(BaseCommand):
    help = "Reset and seed the deterministic local/demo dataset (FP-DOC-3)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-reset",
            action="store_true",
            help="Keep existing rows and only upsert the demo dataset.",
        )

    def handle(self, *args, **options):
        with transaction.atomic():
            removed = {} if options["no_reset"] else self._reset()
            self._seed()
        self._report(removed)

    # --- reset ---------------------------------------------------------------

    def _reset(self):
        """Delete business rows in dependency order, then leftover e2e accounts."""
        removed = {
            "bookings": Booking.objects.all().delete()[0],
            "slots": InterviewSlot.objects.all().delete()[0],
            "applications": Application.objects.all().delete()[0],
            "jobs": Job.objects.all().delete()[0],
            "companies": CompanyProfile.objects.all().delete()[0],
            "profiles": CandidateProfile.objects.all().delete()[0],
            "e2e_accounts": User.objects.filter(username__startswith="e2e_").delete()[0],
        }
        return removed

    # --- seed ----------------------------------------------------------------

    def _seed(self):
        users = self._seed_accounts()
        self._seed_companies(users)
        jobs = self._seed_jobs(users)
        self._seed_candidate_profiles(users)
        self._seed_applications(users, jobs)
        self._seed_slots(jobs)
        return jobs

    def _seed_accounts(self):
        users = {}
        for username, role, display_name in ACCOUNTS:
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@example.test", "role": role},
            )
            user.email = f"{username}@example.test"
            user.role = role
            user.display_name = display_name
            user.set_password(DEMO_PASSWORD)
            user.save()
            users[username] = user
        return users

    def _seed_companies(self, users):
        for username, (name, description) in COMPANIES.items():
            CompanyProfile.objects.update_or_create(
                user=users[username],
                defaults={"company_name": name, "description": description},
            )

    def _seed_jobs(self, users):
        jobs = {}
        for key, owner, title, description, skills in JOBS:
            job, _ = Job.objects.update_or_create(
                employer=users[owner],
                title=title,
                defaults={"description": description},
            )
            job.required_skills.all().delete()
            for skill in skills:
                RequiredSkill.objects.create(job=job, name=skill)
            jobs[key] = job
        return jobs

    def _seed_candidate_profiles(self, users):
        for username, skills in CANDIDATE_SKILLS.items():
            CandidateProfile.objects.update_or_create(
                user=users[username],
                defaults={"skills": skills},
            )

    def _seed_applications(self, users, jobs):
        for username, job_key, status in APPLICATIONS:
            Application.objects.update_or_create(
                job=jobs[job_key],
                candidate=users[username],
                defaults={"status": status},
            )

    def _seed_slots(self, jobs):
        tomorrow = timezone.localdate(timezone=SHANGHAI) + timedelta(days=1)
        for hour, minute in SLOT_TIMES:
            start = datetime.combine(tomorrow, time(hour, minute)).replace(tzinfo=SHANGHAI)
            InterviewSlot.objects.update_or_create(
                job=jobs["availability"],
                start_at=start,
                defaults={"end_at": start + timedelta(minutes=30)},
            )

    # --- output --------------------------------------------------------------

    def _report(self, removed):
        if removed:
            summary = ", ".join(f"{name}={count}" for name, count in removed.items() if count)
            self.stdout.write(f"Removed: {summary or 'nothing'}")
        statuses = dict(Application.objects.values_list("status").annotate(total=Count("id")))
        self.stdout.write(self.style.SUCCESS("Local/demo data ready (never production data)."))
        self.stdout.write(f"Accounts: {', '.join(name for name, _, _ in ACCOUNTS)}")
        self.stdout.write(f"Password: {DEMO_PASSWORD}  (email <username>@example.test)")
        self.stdout.write(
            f"Companies: {CompanyProfile.objects.count()} | Jobs: {Job.objects.count()} | "
            f"Skills: {RequiredSkill.objects.count()} | Applications: {Application.objects.count()} {statuses}"
        )
        tomorrow = timezone.localdate(timezone=SHANGHAI) + timedelta(days=1)
        self.stdout.write(
            f"Open slots: {InterviewSlot.objects.filter(booking__isnull=True).count()} "
            f"({tomorrow.isoformat()} 09:00 and 09:30 Asia/Shanghai)"
        )
        self.stdout.write("Match examples: candidate1=100, candidate2=50, candidate3=0, empty requirement=100")
