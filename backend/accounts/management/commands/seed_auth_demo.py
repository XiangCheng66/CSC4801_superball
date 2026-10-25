from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Create four local/demo accounts. This does not reset or seed B/C's future business data."

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        for role, prefix in [(User.Role.CANDIDATE, "candidate"), (User.Role.EMPLOYER, "employer")]:
            for number in (1, 2):
                username = f"{prefix}{number}"
                user, _ = User.objects.update_or_create(username=username, defaults={
                    "email": f"{username}@example.test", "role": role,
                    "display_name": f"Demo {role} {number}", "is_active": True,
                    "is_staff": False, "is_superuser": False,
                })
                user.set_password("LocalDemo!2026")
                user.save(update_fields=["password"])
        self.stdout.write(self.style.SUCCESS("Seeded candidate1/candidate2/employer1/employer2 (local/demo only)."))
