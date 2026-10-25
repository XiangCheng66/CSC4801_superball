#!/bin/sh
set -eu

python manage.py migrate --noinput
if [ "${SEED_AUTH_DEMO:-0}" = "1" ]; then
    python manage.py seed_auth_demo
fi
exec gunicorn --chdir backend config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --access-logfile -
