# Superball Installation Guide

[中文](INSTALL.md) | **English**

Use the Docker workflow for verification. For development, run Django and Vite separately. Run commands from the repository root unless a step changes directories.

## Prerequisites and versions

- Containers require Docker Desktop or Docker Engine with Compose support for `docker compose up --wait --wait-timeout`. Use Linux containers. Python, Node.js, and PostgreSQL are supplied by the images.
- The build uses `node:22-bookworm-slim` and `python:3.12-slim-bookworm`. The Compose database uses `postgres:17-bookworm`. These images are declared in [Dockerfile](Dockerfile) and [compose.yaml](compose.yaml).
- Local development requires Python 3.11 or 3.12, Node.js 22.12 through 22.x, npm 10 or 11, and PostgreSQL 17. Dependency versions are pinned in [requirements.lock](requirements.lock) and [frontend/package-lock.json](frontend/package-lock.json).

## Checkout and configuration

Clone the repository. To verify a specific version, run `git checkout --detach <40-character-sha>` in the checkout with the actual commit SHA.

```sh
git clone https://github.com/XiangCheng66/CSC4801_superball.git
cd CSC4801_superball
```

Create local configuration from the example. On Windows PowerShell run `Copy-Item .env.example .env`. On macOS or Linux run `cp .env.example .env`. Keep the existing file if one is present.

In `.env` replace both `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD` placeholders with independently generated random values. The Django key must be at least 50 characters. A password manager can generate both values.

| Variable | Local configuration |
|---|---|
| `DJANGO_SECRET_KEY` | Private local key. A valid value is required with debug off, as in the example. |
| `DJANGO_DEBUG` / `DJANGO_ALLOWED_HOSTS` | For local containers use `0` and `localhost,127.0.0.1`. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` / `DJANGO_SECURE_COOKIES` | The defaults trust both Vite origins on port 5173. Update the list if the Vite origin changes. For local HTTP use `0`. |
| `DATABASE_ENGINE` | The application uses `postgresql`. Compose fixes this value. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Local database, role, and password. The database and role default to `superball`. |
| `POSTGRES_HOST` / `POSTGRES_PORT` | Local connections default to `127.0.0.1:5432`. Compose connects internally to `db:5432`. The port variable controls the host-side mapping in Docker. |
| `APP_PORT` | Application port on the host. Defaults to `8000`. |
| `SEED_AUTH_DEMO` | Keep `0`. Initialize the full demo data set with the command below. |

Django and Compose read the local `.env`. Git and the Docker build context ignore this file.

## Docker build, migrations, and startup

```sh
docker compose pull db
docker compose build app
docker compose up -d --no-build --wait --wait-timeout 120
docker compose ps
```

The build installs locked frontend dependencies, runs Vitest, and compiles assets. The application waits for the database to be healthy. Its entrypoint runs `python manage.py migrate --noinput` and starts Gunicorn.

Once both services are healthy, open [http://127.0.0.1:8000/](http://127.0.0.1:8000/). Check the [database-backed health endpoint](http://127.0.0.1:8000/api/health/).

For an isolated verification environment, use a separate checkout and set `.env` to use free `APP_PORT` and `POSTGRES_PORT`. Pass the same project name to every Compose command, for example `docker compose -p superball-review ps`. Open the browser on the configured application port.

## Reset and seed local demo data

Run one command against the migrated local demo database. It clears business records, resets the reserved demo accounts, and recreates the fixed data set.

```sh
docker compose exec -T app python manage.py seed_demo
```

The equivalent development command is `python manage.py seed_demo`. See the [README](README.en.md) and [demo data guide](docs/DEMO_DATA.md) for credentials and fixtures.

## Run unit tests

The Docker build runs the frontend unit tests. After startup, run the complete PostgreSQL backend suite, including both concurrent booking cases.

```sh
docker compose exec -T -e TEST_DATABASE_ENGINE=postgresql app python -m pytest tests/unit -q -ra -o cache_dir=/tmp/pytest-cache
```

pytest-django creates a separate `test_<POSTGRES_DB>` database and cleans it up afterward. With local dependencies installed, the single command in the README runs both suites non-interactively. For a quick backend check, run `python -m pytest tests/unit -q -ra` with the default SQLite configuration, which skips the two PostgreSQL concurrency cases.

CI uses Python 3.12, PostgreSQL 17, and Node.js 22 for dependency, Django configuration, migration, unit test, and frontend build checks. [CI](.github/workflows/ci.yml)

## Local development

### 1. Set up the database

Choose one database option. Run `docker compose up -d --wait db` to start only PostgreSQL and connect Django using the host port configured in `.env`. For a native PostgreSQL instance, open an administrator session with `psql -U postgres -d postgres`, then run the following once.

```sql
CREATE ROLE superball LOGIN CREATEDB;
\password superball
CREATE DATABASE superball OWNER superball;
```

At the password prompt, use the value from `.env`. If your configuration uses a different database or role, substitute its name.

### 2. Install and start Django

Windows PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate --noinput
.\.venv\Scripts\python.exe manage.py seed_demo
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

macOS or Linux

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000
```

If Python 3.11 is installed, use 3.11 in the virtual environment command. Use a dedicated demo database for the seed step.

### 3. Start Vite

Open a second terminal at the repository root.

```sh
cd frontend
npm ci
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Vite proxies `/api/` to `127.0.0.1:8000`. Set `API_PROXY_TARGET` before starting Vite if the backend address changes. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Browser verification

1. Sign in as `candidate1` and open 岗位推荐 (Recommendations). Verify a score of 100 for `[DEMO-A2] Backend Developer`. In 面试预约 (Interview Booking), book a future slot for an `Interviewing` application.
2. Check the booking time in 我的申请 (My Applications). Sign out and sign in as `employer1` to confirm the same booking in the employer workspace.

Optional Playwright tests require Node.js and Chromium. Start with an isolated, seeded demo database, then run the following in `frontend/`.

```sh
npm ci
npx playwright install chromium
APP_URL=http://127.0.0.1:8000 npm run test:e2e
```

On Windows PowerShell, first run `$env:APP_URL = 'http://127.0.0.1:8000'` and then `npm.cmd run test:e2e`. Use port 5173 for Vite and the configured port for Docker. Reseed the test environment before rerunning.

## Troubleshooting and shutdown

| Symptom | Resolution |
|---|---|
| Docker startup times out | Run `docker compose ps` and `docker compose logs db app` to check database, migration, and secret configuration errors. |
| Port already in use | Set `APP_PORT` or `POSTGRES_PORT` to a free port in `.env`. Recreate the services and use the configured ports. |
| Database connection or authentication fails | Check that PostgreSQL is running and verify the host port, role, and password. Editing `.env` does not change the database password in an initialized volume. |
| Missing tables or failed migrations | Inspect container startup logs. For native development run `python manage.py migrate --noinput`. |
| `403 csrf_failed` | Use the same hostname throughout the session. Choose either `127.0.0.1` or `localhost`. Check the Vite origin and cookie settings. |
| `frontend_not_built` | Open Vite on port 5173 in local development. In Docker, rebuild the app image. |
| npm engine error or npm 10 `edgesOut` | Verify Node.js 22.12 through 22.x. For `edgesOut`, run `npx --yes npm@11 ci` from `frontend/`. |

Stop the containers with `docker compose down`. The database volume is retained.
