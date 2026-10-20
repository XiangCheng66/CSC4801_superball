from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.db.models.functions import Lower


class AccountManager(UserManager):
    def get_by_natural_key(self, username):
        return self.get(username__iexact=username)

    def create_user(self, username, email=None, password=None, **extra_fields):
        return super().create_user(username.strip(), (email or "").strip().lower(), password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        CANDIDATE = "Candidate", "Candidate"
        EMPLOYER = "Employer", "Employer"

    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=100, blank=True)
    role = models.CharField(max_length=9, choices=Role.choices)
    objects = AccountManager()
    REQUIRED_FIELDS = ["email", "role"]

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("username"), name="accounts_username_ci_unique"),
            models.UniqueConstraint(Lower("email"), name="accounts_email_ci_unique"),
            models.CheckConstraint(condition=models.Q(role__in=["Candidate", "Employer"]), name="accounts_valid_role"),
        ]
