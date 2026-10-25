import os

from .settings import *  # noqa: F403

# Each pytest run gets a fresh isolated database; never touch local demo data.
if os.getenv("TEST_DATABASE_ENGINE", "sqlite") == "postgresql":
    DATABASES = {"default": {**DATABASES["default"], "TEST": {"NAME": "test_" + DATABASES["default"]["NAME"]}}}
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
MIDDLEWARE = [item for item in MIDDLEWARE if item != "whitenoise.middleware.WhiteNoiseMiddleware"]
