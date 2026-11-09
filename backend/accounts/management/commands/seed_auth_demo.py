from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Create four local/demo accounts. This does not reset or seed B/C's future business data."

    def add_arguments(self, parser):
        parser.add_argument("--missing-only", action="store_true", help="Leave existing accounts and passwords untouched.")

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        for role, prefix in [(User.Role.CANDIDATE, "candidate"), (User.Role.EMPLOYER, "employer")]:
            for number in (1, 2):
                username = f"{prefix}{number}"
                defaults = {
                    "email": f"{username}@example.test", "role": role,
                    "display_name": f"Demo {role} {number}", "is_active": True,
                    "is_staff": False, "is_superuser": False,
                }
                if options["missing_only"]:
                    user, created = User.objects.get_or_create(
                        username__iexact=username, defaults={"username": username, **defaults},
                    )
                    if not created:
                        continue
                else:
                    user, _ = User.objects.update_or_create(username=username, defaults=defaults)
                user.set_password("LocalDemo!2026")
                user.save(update_fields=["password"])
        message = "Ensured local/demo accounts exist; preserved existing accounts." if options["missing_only"] else (
            "Seeded candidate1/candidate2/employer1/employer2 (local/demo only)."
        )
        self.stdout.write(self.style.SUCCESS(message))
