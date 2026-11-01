"""Reserved local/demo records for A's profile and recommendation workflow."""
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from candidates.models import CandidateProfile
from employers.models import CompanyProfile
from jobs.models import Job, RequiredSkill


class Command(BaseCommand):
    help = "Upsert reserved candidate demo records; does not reset applications/bookings or other data."

    @transaction.atomic
    def handle(self, *args, **options):
        call_command("seed_auth_demo", stdout=self.stdout)
        User = get_user_model()
        third, _ = User.objects.update_or_create(username="candidate3", defaults={
            "email": "candidate3@example.test", "role": "Candidate",
            "display_name": "Demo Candidate 3", "is_active": True,
            "is_staff": False, "is_superuser": False,
        })
        third.set_password("LocalDemo!2026")
        third.save(update_fields=["password"])
        for number, skills in [(1, ["python", "sql"]), (2, ["python"]), (3, ["rust"])]:
            user = User.objects.get(username=f"candidate{number}")
            # Preserve even a demo account's private resume when re-seeding skills.
            profile, _ = CandidateProfile.objects.get_or_create(user=user)
            profile.skills = skills
            profile.save(update_fields=["skills", "updated_at"])
        for number, title, skills in [
            (1, "[DEMO-A2] Backend Developer", ["Python", "SQL"]),
            (2, "[DEMO-A2] Generalist", []),
        ]:
            employer = User.objects.get(username=f"employer{number}")
            CompanyProfile.objects.update_or_create(user=employer, defaults={
                "company_name": f"Demo Company {number}",
                "description": "Local candidate workflow demonstration company.",
            })
            job, _ = Job.objects.update_or_create(employer=employer, title=title, defaults={
                "description": "Build reliable services with Python and SQL." if skills else "Explore a role with no required skills.",
            })
            job.required_skills.exclude(name__in=skills).delete()
            for skill in skills:
                RequiredSkill.objects.get_or_create(job=job, name=skill)
        self.stdout.write(self.style.SUCCESS("Seeded candidate1/2/3 and two [DEMO-A2] jobs (local/demo only)."))
