# CSC4801 Superball · Recruiting and Candidate Matching

[中文](README.md) | **English**

Superball is a CSC4801 final project. Candidates maintain their skills and private text resumes, review ranked jobs, apply, and book interviews. Employers maintain their company and job postings, review ranked applicants, update application statuses, and manage interview availability.

## Architecture

React provides the browser workspace. The Django API uses session cookies to identify users, checks CSRF on writes, and enforces roles, ownership, and business rules. PostgreSQL stores business data. Candidate recommendations and employer applicant lists share the skill-matching module. Booking transactions and database uniqueness constraints resolve concurrent requests. Docker Compose starts the application and database.

The team is XiangCheng66 (project foundation, authentication, and candidate workflow), Isochiot (employer, job, and application management), and JeRant (matching, availability, and booking).

## Quick start

Follow the [installation guide](INSTALL.en.md) to set up Docker and `.env`. Build and start the application from the repository root. The container runs migrations at startup.

```sh
docker compose pull db
docker compose build app
docker compose up -d --no-build --wait --wait-timeout 120
```

Open the [local workspace](http://127.0.0.1:8000/).

## Local demo data

After startup, run one command to reset and seed the demo database. This clears existing business records, so use a dedicated local demo database.

```sh
docker compose exec -T app python manage.py seed_demo
```

**Local/demo accounts only.** Sign in with the username and the shared password `LocalDemo!2026`.

| Role | Username | Skills |
|---|---|---|
| Candidate | `candidate1` / `candidate2` / `candidate3` | Python, SQL / Python / Rust |
| Employer | `employer1` / `employer2` | — |

- Both `[DEMO-A2] Backend Developer` and `[Local demo] Data Analyst` require Python and SQL. The three candidates score **100, 50, and 0** respectively for Backend Developer. Each scores **100** for `[DEMO-A2] Generalist`, which has no required skills.
- The seed covers `Pending`, `Interviewing`, `Rejected`, and `Accepted`. `candidate1` and `candidate3` both have an `Interviewing` application with `employer1` and can book the same available 09:00 slot the next day in Beijing time.

## Unit tests

Set up local PostgreSQL, the Python virtual environment, and frontend dependencies as described in the installation guide. Run the following from the repository root. It runs the complete backend and frontend unit suites non-interactively and returns a nonzero exit code if either fails.

```sh
TEST_DATABASE_ENGINE=postgresql python -m pytest tests/unit -q -ra && npm --prefix frontend test
```

Windows PowerShell equivalent

```powershell
cmd.exe /d /c "set TEST_DATABASE_ENGINE=postgresql&& .venv\Scripts\python.exe -m pytest tests/unit -q -ra && npm.cmd --prefix frontend test"
```

The backend uses an isolated test database. The default SQLite database supports the remaining tests. The two concurrent booking cases require PostgreSQL.

## Requirement-to-test mapping

Python tests are in [tests/unit](tests/unit/) and use `file::test` notation. Frontend references give the file and Vitest case name.

| Requirement | Implementation | Named unit tests or verification evidence |
|---|---|---|
| FP-ARCH-1 Full-stack application | `frontend/`, `backend/`, `Dockerfile`, `compose.yaml` | The hiring flow is covered by `frontend/e2e/hiring-flow.spec.js`. Compose health checks verify application and database startup. |
| FP-AUTH-1 Registration and sessions | `backend/accounts/models.py`, `backend/accounts/views.py` | `test_auth.py::test_fp_auth_1_registration_and_session_lifecycle`, `test_auth.py::test_fp_auth_1_invalid_registration`, `test_auth.py::test_duplicate_account_is_rejected_case_insensitively` |
| FP-AUTH-2 Password storage and exposed fields | `backend/accounts/models.py`, `backend/accounts/serializers.py` | `test_auth.py::test_fp_auth_2_salted_hash_and_password_verification` |
| FP-AUTH-3 Server-side authorization | `backend/common/authentication.py`, `backend/common/permissions.py` | `test_auth.py::test_fp_auth_3_authorization_and_missing_object`, `test_auth.py::test_role_permissions_are_enforced_by_server` |
| FP-CAN-1 Profile and private resume | `backend/candidates/` | `test_workflows.py::test_fp_can_1_profile_and_private_resume_rules`, `test_candidate.py::test_invalid_profile_input_is_atomic`, `test_candidate.py::test_other_users_cannot_read_or_replace_private_resources` |
| FP-CAN-2 All-job recommendations | `backend/candidates/views.py`, `backend/matching/ranking.py`, `frontend/src/pages/candidate/` | `test_workflows.py::test_fp_can_2_recommendations_preserve_fields_and_rank_all_jobs`, `test_candidate.py::test_persisted_skills_feed_shared_matching` |
| FP-CAN-3 Applications and own application history | `backend/applications/`, `frontend/src/pages/candidate/Applications.jsx` | `test_workflows.py::test_fp_can_3_pending_duplicate_and_application_owner`, `test_applications.py::test_candidate_cannot_change_or_withdraw_own_application`, `test_applications.py::test_own_list_contains_all_statuses_current_jobs_company_and_persisted_booking` |
| FP-EMP-1 Company profile | `backend/employers/` | `test_employer_api.py::test_fp_emp_1_employer_creates_and_reads_own_profile`, `test_employer_api.py::test_fp_emp_1_profile_update_replaces_values`, `test_employer_api.py::test_fp_emp_1_invalid_profile_is_rejected` |
| FP-EMP-2 Job management | `backend/jobs/`, `backend/scheduling/models.py` | `test_employer_api.py::test_fp_emp_2_employer_creates_a_posting_with_skills`, `test_employer_api.py::test_fp_emp_2_invalid_posting_is_rejected`, `test_employer_api.py::test_fp_emp_2_partial_update_changes_only_supplied_fields`, `test_employer_api.py::test_fp_emp_2_other_employer_cannot_edit_or_delete`, `test_employer_api.py::test_fp_emp_2_delete_posting_without_dependents_removes_it`, `test_employer_api.py::test_fp_emp_2_delete_posting_with_applications_returns_409`, `test_scheduling.py::test_job_with_slot_is_protected` |
| FP-EMP-3 Applicant ranking and status | `backend/applications/employer_views.py`, `backend/matching/ranking.py` | `test_employer_applicants.py::test_fp_emp_3_applicants_are_ranked_by_match_score_descending`, `test_employer_applicants.py::test_fp_emp_3_each_row_carries_identity_skills_score_status_and_booking`, `test_employer_applicants.py::test_fp_emp_3_owner_sets_each_allowed_status`, `test_employer_applicants.py::test_fp_emp_3_invalid_status_input_is_rejected`, `test_employer_applicants.py::test_fp_emp_3_other_employer_cannot_change_status` |
| FP-MATCH-1 Skill matching and tie-breakers | `backend/matching/services.py`, `backend/matching/ranking.py` | `test_matching.py::test_fp_match_1_examples_normalization_and_floor`, `test_matching.py::test_fp_match_1_both_tie_breakers`, `test_matching.py::test_resume_text_cannot_change_match_score_or_order` |
| FP-MATCH-2 Optional AI enhancement | N/A | N/A |
| FP-SCHED-1 Interview availability | `backend/scheduling/views.py`, `backend/scheduling/models.py` | `test_scheduling.py::test_fp_sched_1_slot_creation_timezones_and_deletion`, `test_scheduling.py::test_fp_sched_1_invalid_slots`, `test_scheduling.py::test_booked_excluded_and_deletion_protected` |
| FP-SCHED-2 Booking eligibility and visibility | `backend/scheduling/booking_services.py`, `backend/scheduling/booking_views.py` | `test_booking.py::test_fp_sched_2_eligible_booking`, `test_booking.py::test_fp_sched_2_ineligible_booking`, `test_booking.py::test_status_change_keeps_booking_visible_and_slot_protected` |
| FP-SCHED-3 Concurrent booking | `backend/scheduling/booking_services.py`, `backend/scheduling/models.py` | `test_booking.py::test_fp_sched_3_conflict_contract`, `test_booking.py::test_postgres_concurrent_bookings` |
| FP-SEC-1 Object access isolation | `backend/candidates/views.py`, `backend/applications/`, `backend/jobs/views.py`, `backend/scheduling/booking_services.py` | `test_candidate.py::test_other_users_cannot_read_or_replace_private_resources`, `test_applications.py::test_other_candidate_cannot_access_or_change_an_application`, `test_employer_api.py::test_fp_emp_2_other_employer_cannot_edit_or_delete`, `test_employer_applicants.py::test_fp_emp_3_applicant_list_enforces_role_and_ownership`, `test_booking.py::test_permissions_missing_records_and_list_isolation` |
| FP-SEC-2 Bound SQL values | `backend/accounts/models.py`, `backend/candidates/views.py` | `test_auth.py::test_sql_metacharacters_remain_bound_values`, `test_candidate.py::test_profile_and_resume_sql_metacharacters_stay_bound` |
| FP-SEC-3 Text escaping | `frontend/src/components/AccountHome.jsx`, `frontend/src/pages/candidate/`, `frontend/src/pages/employer/` | `frontend/src/App.test.jsx` · `submits the selected registration role and escapes user-controlled display names`<br>`frontend/src/pages/candidate/CandidateWorkspace.test.jsx` · `preserves raw resume whitespace, escapes its preview and saves independently of profile drafts`<br>`frontend/src/pages/employer/EmployerWorkspace.test.jsx` · `escapes user-controlled job text instead of injecting markup` |
| FP-SEC-4 Secrets and test isolation | `.env.example`, `.gitignore`, `backend/config/test_settings.py`, `.github/workflows/ci.yml` | Review the environment example, tracked files, and isolated test database configuration. |
| FP-PROC-1 Living specification | `SPEC.md`, `SPEC.en.md` | Review architecture, models, permissions, API, screens, matching, and booking transactions against the implementation. |
| FP-DOC-1 Installation guide | `INSTALL.md`, `INSTALL.en.md`, `Dockerfile`, `compose.yaml` | Follow the installation guide from a clean checkout to build, migrate, seed, and run the tests. |
| FP-DOC-2 Repository README | `README.md`, `README.en.md` | Check the required sections and all 25 requirement IDs. |
| FP-DOC-3 Deterministic demo data | `backend/common/management/commands/seed_demo.py` | `test_seed_demo.py::test_seed_demo_builds_the_documented_dataset`, `test_seed_demo.py::test_seed_demo_reproduces_all_four_match_examples`, `test_seed_demo.py::test_seed_demo_supplies_two_interviewing_candidates_for_one_slot`, `test_seed_demo.py::test_seed_demo_is_repeatable_and_resets_business_rows` |
| FP-TEST-1 Automated verification | `tests/unit/`, `frontend/src/`, `.github/workflows/ci.yml` | Use the non-interactive command above and the PostgreSQL and Vitest CI jobs. |
| FP-SUB-1 Submission format | `Dockerfile`, `compose.yaml`, `docker/entrypoint.sh`, `INSTALL.md` | Submit a permanent URL with the 40-character SHA on public `main`. Verify the build, startup, seed, tests, and browser flow at that same commit. |

## Document index

| Document | Contents |
|---|---|
| [INSTALL.en.md](INSTALL.en.md) · [中文](INSTALL.md) | Dependencies, configuration, build, migrations, tests, and troubleshooting |
| [SPEC.en.md](SPEC.en.md) · [中文](SPEC.md) | Architecture, data model, screens, permissions, matching, and the booking transaction |
| [API contract](docs/API_CONTRACT.md) · [Matching contract](docs/MATCHING_CONTRACT.md) · [Booking contract](docs/BOOKING_CONTRACT.md) | Requests, responses, and business rules |
| [Demo data](docs/DEMO_DATA.md) | Full data set and reset scope |
| [Audit issue form](.github/ISSUE_TEMPLATE/audit_bug_report.yml) · [Audit label definitions](.github/labels.yml) | Peer audit reporting and label configuration |
| [Course project page](https://sra-research.github.io/CSC4801/project.html) | Requirements and submission schedule |

## Known limitations

Resumes are plain text. Optional PDF extraction and AI match explanations are not implemented.

The interface switches between Chinese and English from the header (default Chinese, kept in `localStorage` under `superball.lang`). Product names, role values, application status values, job titles, company names, and skills are not translated; network-level fallback errors such as an unreachable server are still raised in Chinese by the frontend request module.
