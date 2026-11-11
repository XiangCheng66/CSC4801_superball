# CSC4801 Superball — Recruiting and Candidate Matching

[中文](README.md) | **English**

## Project Overview

This CSC4801 final project is a locally runnable recruiting and candidate matching platform with exactly two business roles: `Candidate` and `Employer`.

```text
Employer registers → completes company profile → posts a job
Candidate registers → enters skills and a text resume → views jobs and scores → applies
Employer reviews applicants → sets status to Interviewing → creates interview slots
Candidate books a slot → both parties can view the booking
```

**Current stage: A/B/C Day 3 integration and acceptance.** A has delivered accounts, profiles, private resumes, recommendations, applications and the candidate's application list. B has delivered companies, jobs, applicant ranking and status management. C has delivered slots and atomic bookings. The complete workflow is integrated into the workspaces.

## Team Members

- JeRant
- Isochiot
- XiangCheng66 (A: project/authentication foundations and candidate module)

A is assigned to XiangCheng66. Role C has been claimed; the team still needs to document the member-to-role mapping for B and C.

## Architecture Summary

### Technology

| Component | Development baseline | Responsibility |
|---|---|---|
| Frontend | React | Pages, forms, interactions and API calls |
| Backend | Python + Django 5.2 + Django REST Framework | Authentication, profiles, recommendations, applications, companies, jobs, applicants, slots and bookings |
| Database | PostgreSQL 17 | Persistent data and unique constraints preventing duplicate applications and bookings |
| Verification | pytest + pytest-django; Vitest; optional Playwright | Isolated in-memory test database by default; dedicated PostgreSQL test database also supported |
| Delivery | Multi-stage Dockerfile + Compose | Build frontend/backend from a clean checkout and run with PostgreSQL; see [installation guide](INSTALL.md) |

React calls the Python API. The backend checks roles, ownership and business rules before accessing the database and returning JSON. Scores and booking eligibility are calculated and validated centrally on the backend.

References: [Django](https://www.djangoproject.com/start/), [Django REST Framework](https://www.django-rest-framework.org/), [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html). Python dependencies are pinned in `requirements.lock`; frontend dependencies are locked in `frontend/package-lock.json`.

### Directory Structure

The frontend is organized around authentication, candidate, employer and interview workflows. Backend modules expose the corresponding APIs.

```text
CSC4801_superball/
├── frontend/src/
│   ├── api/                    # Shared request helpers
│   ├── components/             # Shared components
│   └── pages/
│       ├── auth/               # A
│       ├── candidate/          # A: profile, private resume, recommendations, applications
│       ├── employer/           # B
│       └── scheduling/         # C
├── backend/
│   ├── accounts/               # A
│   ├── common/                 # Shared authentication, permissions, responses, health checks
│   ├── config/                 # Django settings and routing
│   ├── candidates/             # A: models, authorized APIs, recommendations, demo seed
│   ├── employers/              # B: company profiles
│   ├── jobs/                   # B
│   ├── applications/           # Applications, owner queries, employer lists/status updates
│   ├── matching/               # C: shared scoring and ranking services
│   └── scheduling/             # C
├── tests/unit/
├── .github/workflows/ci.yml    # C: backend tests, frontend tests and build
├── Dockerfile
├── SPEC.md
├── INSTALL.md
├── README.md                   # Chinese
└── README.en.md                # English
```

## Team Responsibilities

Each member owns the React pages, Python APIs, unit tests and documentation for their modules. Everyone must understand the complete workflow and be able to explain and modify the submitted code.

| Role | React pages | Backend work | Requirements |
|---|---|---|---|
| A: accounts and candidates | Registration, login, profile, private resume, recommendations, my applications | Authentication, shared permissions, profiles/resumes; integrate B's application service and C's matching functions | FP-AUTH-1–3, FP-CAN-1–3 |
| B: employers and recruiting | Company profile, jobs, applicants, status changes | Company/job management, application creation, duplicate prevention, applicant queries/status management | FP-EMP-1–3; collaborate with A on FP-CAN-3 |
| C: matching and scheduling | Employer slots, candidate booking, booking details | Shared matching algorithm, slots, eligibility, transactions and concurrency conflicts | FP-MATCH-1, FP-SCHED-1–3 |

| Shared work | Lead | Collaboration |
|---|---|---|
| Project scaffold, configuration, Docker, INSTALL.md | A | All three verify installation/startup from a clean checkout |
| Deterministic demo data, README.md | B | Each module provides data, demo steps and test mappings |
| CI, architecture/transaction documentation in SPEC.md | C | Each module documents design, interfaces, permissions and verification |
| Unit tests and security checks | A/B/C individually | Cross-review; do not delegate all testing to one person |

### Shared Boundaries

- A's application page calls B's application service; application validation and persistence have one implementation.
- A's recommendations and B's applicant lists both call C's matching functions.
- C uses the authenticated identity and B's application data, while independently checking ownership and booking eligibility.
- Shared request helpers, session state, error format and routing are agreed on Day 1. All role and ownership checks run on the backend.

## Shared Contracts

### Agreements Before Development

1. Django session cookies and CSRF are implemented. All modules use the [API contract](docs/API_CONTRACT.md) and `frontend/src/api/client.js`. Protected operations return `401` for unauthenticated requests, `403` for role/ownership failures, and `404` for accessible but missing objects.
2. Shared models: `User`, `CandidateProfile`, `CompanyProfile`, `Job`, `Application`, `InterviewSlot`, `Booking`; agree on skill storage and time zones.
3. Unique constraints cover account identifiers, `Application(candidate_id, job_id)`, `Booking.slot_id` and `Booking.application_id`.
4. Agree on request/response fields, error codes and service functions; notify teammates before model or migration changes.

See the [API contract](docs/API_CONTRACT.md) for fields, permissions and responses.

| Owner | API scope |
|---|---|
| A | `/api/auth/`, `/api/candidate/profile/`, `/api/candidate/resume/`, `/api/candidate/recommendations/`; Day 3 integrates `/api/applications/` creation and owner queries |
| B | `/api/employer/`, `/api/employer/jobs/`, `/api/employer/applications/` for applicants/statuses of owned jobs |
| C | `/api/slots/`, `/api/booking-applications/`, `/api/bookings/` and shared backend matching functions |

Applications use `apply_to_job`. Employers update applications for their own jobs through the status API. Bookings use `create_booking` to check eligibility and persist inside a transaction. Both roles use the same scoring implementation and `rank_jobs` / `rank_applicants`. See the [matching contract](docs/MATCHING_CONTRACT.md).

### Required Business Rules

- Account identifiers are unique; passwords use established password hashing; authentication secrets are never returned to clients.
- Candidates manage only their own profiles and text resumes. Resume text is private to its owner; direct access by other candidates or employers returns `403`.
- New applications are `Pending`; a candidate cannot apply twice to the same job. Only the job's employer can change status, which must be `Pending`, `Interviewing`, `Rejected` or `Accepted`.
- Employers manage only their own jobs/applicants. Deleting a job with applications or interview slots returns `409` and preserves data; otherwise deletion is allowed.
- Skills are trimmed, lowercased, stripped of empty values and deduplicated. An empty job skill set scores 100; otherwise the score is `floor(100 * |candidate skills ∩ job skills| / |job skills|)`. Resume text never affects the score.
- Candidates see all current jobs in descending score order, with ties broken by case-insensitive job title and stable job ID. Employer lists break ties by case-insensitive candidate display name and stable candidate ID. Both use the shared implementation.
- Slots must be in the future, exactly 30 minutes long, and have an explicit time zone. Booked slots cannot be deleted or offered as available.
- Booking requires an application owned by the current candidate, a slot belonging to that application's employer, `Interviewing` status, a future/unoccupied slot, and no existing booking for the application.
- Transactions, unique constraints or equivalent mechanisms guarantee atomicity. When two eligible candidates compete for one slot, exactly one succeeds; the other receives `409` with `Slot already booked`. Exactly one booking remains in the database.
- Failed bookings leave no partial updates. A booking remains when its application leaves `Interviewing`, and the slot remains unavailable.
- Use safe ORM/parameterized queries, HTML escaping and isolated test data. Tests must not call real third-party services; database tests use isolated databases.
- AI explanations are optional future enhancements and must not change required scores or ranking. The core system and tests work without paid credentials.

## Development Plan

### First Week

Days below are relative development days; course freeze and submission dates take precedence.

| Day | A | B | C | Shared acceptance |
|---|---|---|---|---|
| 1 | Project/auth scaffold, request conventions | Company/job/application model design | Matching functions/tests, CI scaffold | Everyone can start the project; React displays demo data read from the database through the API |
| 2–3 | Login, profile, skills, private resume | Company profile, job management | Matching/ranking, slot management | Candidates see real jobs and correct scores |
| 4–5 | Application entry, my applications | Duplicate prevention, applicant queries, status changes | Booking eligibility, transactions/conflicts | Complete application → Interviewing → booking workflow |
| 6–7 | Candidate permissions, installation | Employer permissions, demo data | Booking conflicts, integration fixes | Run the main workflow and real unit tests in Docker |

The full demo begins with posting jobs and slots. A candidate views scores and applies; the employer sets the application to `Interviewing`; the candidate books; both can view the interview time.

### Git Workflow and Definition of Done

- Create small feature branches from the latest `main`, such as `feat/auth`, `feat/candidate-profile`, `feat/job-management` or `feat/interview-booking`.
- Each PR focuses on one verifiable feature and describes requirements, behavior, verification and database/shared-interface changes.
- At least one teammate reviews each PR; suggested rotation: A reviews B, B reviews C, C reviews A. Merge after checks pass and integrate the main workflow daily.
- Done means usable pages, correct backend permissions/validation, real persistence, named tests for success and applicable errors, and synchronized documentation/mappings.
- Week 11: feature freeze. Week 12: audit, repair and regression evidence under course rules. Weeks 13–14: presentations. Follow official dates.
- Submit a permanent URL to the exact commit on the public repository's `main`. Its Dockerfile and documented startup, seed and test workflows must be reproducible.

## Quick Start

```bash
git clone https://github.com/XiangCheng66/CSC4801_superball.git
cd CSC4801_superball
```

See [INSTALL.md](INSTALL.md) for complete instructions. For local Docker:

```bash
cp .env.example .env
# Replace secret and database-password placeholders in .env; use Copy-Item in PowerShell.
docker compose pull db
docker compose build app
docker compose up -d --no-build --wait --wait-timeout 120
docker compose exec -T app python manage.py seed_demo
```

Open `http://127.0.0.1:8000`. For native development, follow INSTALL.md to configure PostgreSQL, run migrations/seed, and start the Python backend (8000) and React frontend (5173) separately. The candidate workspace includes profile, recommendations, applications and interview bookings. The employer workspace includes company, jobs, applicants, interview slots and booking records.

## Demo Accounts

After running `python manage.py seed_demo`, use these public **local/demo** accounts:

| Username | Role | Password |
|---|---|---|
| `candidate1`, `candidate2`, `candidate3` | Candidate | `LocalDemo!2026` |
| `employer1`, `employer2` | Employer | `LocalDemo!2026` |

Emails are `<username>@example.test`.

`seed_demo` is the single reset entry point: it clears bookings, slots, applications, jobs, company profiles, candidate profiles and temporary `e2e_` accounts in foreign-key order, then recreates a deterministic dataset: 5 accounts, 2 companies, 4 jobs, 5 applications covering all four statuses, and 2 open slots. Use `--no-reset` for incremental additions only.

The three candidates have Python/SQL, Python and Rust skills, scoring 100/50/0 for `[DEMO-A2] Backend Developer` (Python/SQL required); all score 100 for jobs without requirements. candidate1 and candidate3 both have `Interviewing` applications under employer1 and can compete for one slot. Job titles are e2e locators; update Playwright tests if titles change.

## Running Unit Tests

After installing locked dependencies, run from the repository root using the virtual environment's Python:

```bash
python -m pytest tests/unit -v
```

The suite covers authentication, profiles, matching, applications, applicant management, slots and bookings. SQLite skips only the two concurrency tests requiring PostgreSQL row locks; PostgreSQL runs the complete suite.

In `frontend`, run `npm test` and `npm run build`. Optional real-browser tests use `npm run test:e2e`; start the local PostgreSQL demo environment and services first. C configured `.github/workflows/ci.yml` for PostgreSQL backend tests, Django/migration checks, frontend tests and builds. See [GitHub Actions](https://github.com/XiangCheng66/CSC4801_superball/actions).

See [A final handoff](docs/A_FINAL_HANDOFF.md) for current permissions/installation acceptance and [A Day 3 handoff](docs/A_DAY3_HANDOFF.md) for application interfaces. Test counts and Docker status in older handoffs are historical.

Verification covers success, validation, permissions and conflicts, especially `401/403/404`, skill normalization, tie-breaking on both sides, unauthorized access, SQL bound values, XSS escaping and booking conflicts. The course requires unit tests; database atomicity also requires implementation/runtime verification.

## Requirement–Test Mapping

**This table describes current implementation and verification.** Required workflows are integrated; AI enhancements are optional. Test identifiers abbreviated below use the same file as the preceding qualified identifier unless another file is specified.

| Requirement ID | Owner / behavior | Implementation | Unit tests / verification evidence |
|---|---|---|---|
| FP-ARCH-1 | All: integrated authentication, applications, applicants and bookings | `frontend/`, `backend/`, `Dockerfile`, `compose.yaml` | `frontend/e2e/hiring-flow.spec.js` Full hiring workflow browser coverage. |
| FP-AUTH-1 | A: registration, login, logout and unique identifiers | `backend/accounts/models.py`, `serializers.py`, `views.py` | `tests/unit/test_auth.py::test_fp_auth_1_registration_and_session_lifecycle`; `test_fp_auth_1_invalid_registration`; `test_duplicate_account_is_rejected_case_insensitively` |
| FP-AUTH-2 | A: password hashing and public-field allowlist | `backend/accounts/models.py`, `serializers.py` | `tests/unit/test_auth.py::test_fp_auth_2_salted_hash_and_password_verification` |
| FP-AUTH-3 | A: server-side role/ownership checks; clear workspace when switching accounts | `backend/common/authentication.py`, `permissions.py`, `frontend/src/App.jsx` | `tests/unit/test_auth.py::test_fp_auth_3_authorization_and_missing_object`; `test_role_permissions_are_enforced_by_server`; `frontend/src/App.test.jsx` Account-switch and late-response regressions in App.test.jsx. |
| FP-CAN-1 | A: profiles, skills and private resumes | `backend/candidates/`, `frontend/src/pages/candidate/` | `tests/unit/test_workflows.py::test_fp_can_1_profile_and_private_resume_rules`; `tests/unit/test_candidate.py::test_invalid_profile_input_is_atomic`; `test_other_users_cannot_read_or_replace_private_resources`; `test_missing_owner_has_404_and_own_alias_is_equivalent`; `test_resume_first_save_and_large_raw_text_preserve_other_fields` |
| FP-CAN-2 | A/C: all jobs, scores and ranking integrated into the UI | `backend/candidates/views.py`, `backend/matching/`, `frontend/src/pages/candidate/` | `tests/unit/test_workflows.py::test_fp_can_2_recommendations_preserve_fields_and_rank_all_jobs`; `tests/unit/test_candidate.py::test_persisted_skills_feed_shared_matching`; `test_uninitialized_profile_and_company_fallbacks`; `test_resume_never_leaks_or_changes_recommendations` |
| FP-CAN-3 | A/B: shared applications, Pending, duplicate prevention, own applications/bookings; no access to others or status edits | `backend/applications/`, `frontend/src/pages/candidate/Applications.jsx`, `CandidateWorkspace.jsx` | `tests/unit/test_workflows.py::test_fp_can_3_pending_duplicate_and_application_owner`; `tests/unit/test_applications.py::test_application_creation_does_not_require_a_profile_and_survives_new_session`; `test_duplicate_is_rejected_for_every_status_without_resetting_it`; `test_database_duplicate_after_stale_precheck_is_a_conflict`; `test_other_candidate_cannot_access_or_change_an_application`; `test_candidate_cannot_change_or_withdraw_own_application`; `test_own_list_contains_all_statuses_current_jobs_company_and_persisted_booking` Also CandidateWorkspace frontend tests and applications.spec.js. |
| FP-EMP-1 | B: company profile model, API and UI | `backend/employers/`, `frontend/src/pages/employer/` | `tests/unit/test_employer_api.py::test_fp_emp_1_employer_creates_and_reads_own_profile`; `test_fp_emp_1_invalid_profile_is_rejected`; `test_fp_emp_1_candidate_and_anonymous_cannot_touch_a_company_profile` |
| FP-EMP-2 | B/C: owned job CRUD; deletion guards for applications and slots | `backend/jobs/`, `backend/scheduling/` | `tests/unit/test_employer_api.py::test_fp_emp_2_partial_update_changes_only_supplied_fields`; `test_fp_emp_2_other_employer_cannot_edit_or_delete`; `test_fp_emp_2_delete_posting_with_applications_returns_409`; `tests/unit/test_day2_integration.py::test_employer_job_candidate_matching_and_slot_deletion_guard_work_together` |
| FP-EMP-3 | B: applicant list, match ranking and four application statuses | `backend/applications/employer_views.py`, `backend/jobs/urls.py`, `frontend/src/pages/employer/` | `tests/unit/test_employer_applicants.py::test_fp_emp_3_applicants_are_ranked_by_match_score_descending`; `test_fp_emp_3_ties_break_by_display_name_then_candidate_id`; `test_fp_emp_3_each_row_carries_identity_skills_score_status_and_booking`; `test_fp_emp_3_employer_never_sees_resume_or_account_secrets`; `test_fp_emp_3_owner_sets_each_allowed_status`; `test_fp_emp_3_other_employer_cannot_change_status`; `test_fp_emp_3_candidate_cannot_change_status`; `test_fp_emp_3_booking_is_visible_and_survives_leaving_interviewing`; `EmployerWorkspace.test.jsx::lists applicants with score, skills and status for an owned posting` |
| FP-MATCH-1 | C: shared algorithm; A: recommendation UI and four score examples; employer ranking also reuses it | `backend/matching/services.py`, `backend/matching/ranking.py` | `tests/unit/test_matching.py::test_fp_match_1_examples_normalization_and_floor`; `test_fp_match_1_both_tie_breakers`; `test_skill_normalization_does_not_mutate_input`; `test_invalid_skill_types_are_not_treated_as_empty`; `test_ranking_preserves_fields_without_mutating_rows`; `test_rankings_support_empty_rows_and_empty_skill_requirements`; `test_rankings_handle_one_shot_skill_and_row_iterables`; `test_resume_text_cannot_change_match_score_or_order` |
| FP-MATCH-2 | Optional AI enhancement; not currently planned | N/A | N/A; add data-flow documentation and named tests if implemented. |
| FP-SCHED-1 | C: future 30-minute slots, time zones and deletion management | `backend/scheduling/`, `frontend/src/pages/scheduling/` | `tests/unit/test_scheduling.py::test_fp_sched_1_slot_creation_timezones_and_deletion`; `test_fp_sched_1_invalid_slots`; `test_foreign_and_missing_objects`; `test_booked_excluded_and_deletion_protected`; `test_database_enforces_duration` |
| FP-SCHED-2 | C: booking eligibility, visibility and retention after status changes | `backend/scheduling/` | `tests/unit/test_booking.py::test_fp_sched_2_eligible_booking`; `test_fp_sched_2_ineligible_booking`; `test_status_change_keeps_booking_visible_and_slot_protected` |
| FP-SCHED-3 | C: database atomicity and conflict contract | `backend/scheduling/` | `tests/unit/test_booking.py::test_fp_sched_3_conflict_contract`; `test_postgres_concurrent_bookings` Real PostgreSQL connections; both contention scenarios. |
| FP-SEC-1 | Object boundaries for profiles/resumes, applications, jobs and slots; booking creation checked in test_booking.py::test_permissions_missing_records_and_list_isolation | Shared permission checks and module views/services | `test_candidate.py::test_other_users_cannot_read_or_replace_private_resources`; `test_applications.py::test_other_candidate_cannot_access_or_change_an_application`; `test_employer_api.py::test_fp_emp_2_other_employer_cannot_edit_or_delete`; `test_scheduling.py::test_foreign_and_missing_objects` All referenced files are under tests/unit/. |
| FP-SEC-2 | Authentication and candidate data access verified | `backend/accounts/models.py`, `backend/candidates/views.py` | `tests/unit/test_auth.py::test_sql_metacharacters_remain_bound_values`; `tests/unit/test_candidate.py::test_profile_and_resume_sql_metacharacters_stay_bound` |
| FP-SEC-3 | Account, resume preview, job and application text verified; additional page coverage pending | `frontend/src/pages/candidate/`, `frontend/src/components/AccountHome.jsx` | `frontend/src/App.test.jsx`; `submits the selected registration role and escapes user-controlled display names`; `CandidateWorkspace.test.jsx`; `preserves raw resume whitespace, escapes its preview and saves independently of profile drafts`; `renders zero-score jobs, empty requirements and escaped job text in server order`; `shows all four statuses and retains a booking after its application leaves Interviewing, escaping text` |
| FP-SEC-4 | All: secrets, personal data and test isolation; API responses must not be HTTP-cached | `backend/common/middleware.py`, `.env.example` | `tests/unit/test_auth.py::test_session_and_private_api_responses_are_not_stored` Also repository inspection and isolated test databases. |
| FP-PROC-1 | All: specification matches actual code | `SPEC.md` | Review each module specification and confirm members can explain and modify the code. |
| FP-DOC-1 | A lead: clean checkout, health wait, migrations, seed and isolated tests | `INSTALL.md`, `Dockerfile`, `compose.yaml` | `test_auth.py::test_optional_startup_seed_keeps_existing_demo_account_credentials` [A final handoff](docs/A_FINAL_HANDOFF.md). |
| FP-DOC-2 | B lead: complete README and mappings | `README.md` | Verify overview, architecture, accounts, tests, documents and every requirement mapping. |
| FP-DOC-3 | B: one-command reset and full demo dataset | `backend/common/management/commands/seed_demo.py` | `tests/unit/test_seed_demo.py::test_seed_demo_builds_the_documented_dataset`; `test_seed_demo_reproduces_all_four_match_examples`; `test_seed_demo_supplies_two_interviewing_candidates_for_one_slot`; `test_seed_demo_creates_future_thirty_minute_slots_in_beijing_time`; `test_seed_demo_is_repeatable_and_resets_business_rows` |
| FP-TEST-1 | Named tests for accounts, candidate/employer workflows and booking | `tests/unit/` | PostgreSQL runs the complete suite, including two concurrent booking cases; SQLite skips those two. |
| FP-SUB-1 | All: exact main commit and complete Docker environment | `Dockerfile`, `INSTALL.md` | Verify build, dependency startup, migrations, seed, tests and UI at the submitted commit. |

## Document Index

Supporting documents linked below retain their existing language; this change provides Chinese and English versions of the README.

| Document | Purpose | Status |
|---|---|---|
| [Chinese README](README.md) / [English README](README.en.md) | Overview, responsibilities, startup plan and requirement mapping | A/B/C Day 3 integration |
| [SPEC.md](SPEC.md) | Architecture, models, permissions, APIs, matching, booking transactions and security | Authentication, candidate profile/recommendations, employer model and CI documented |
| [INSTALL.md](INSTALL.md) | Exact installation, startup, migrations, seed, tests and Docker instructions | Basic workflows provided |
| [Day 2 integration](docs/DAY2_INTEGRATION.md) | Three branch sources, integration changes and verification | Historical acceptance |
| [B Day 2](docs/B_DAY2_HANDOFF.md) / [C Day 2](docs/C_DAY2_HANDOFF.md) | Independent deliveries and historical evidence | Retained |
| [Scheduling contract](docs/SCHEDULING_CONTRACT.md) | UTC/Beijing time, ownership and booking protection | Employer management implemented |
| [API contract](docs/API_CONTRACT.md) | Sessions, CSRF, JSON, errors and integration examples | Implemented |
| [A Day 1](docs/DAY1_HANDOFF.md) | Scope, evidence, B/C integration and next steps | Provided |
| [A Day 2](docs/A_DAY2_HANDOFF.md) | Profile/resume/recommendations, migrations, verification and integration | Provided |
| [A Day 3](docs/A_DAY3_HANDOFF.md) | Applications/owner queries, verification and B/C integration | Current A delivery |
| [A final handoff](docs/A_FINAL_HANDOFF.md) | Permissions, session switching, clean installation and integration | Current A acceptance |
| [Application contract](docs/APPLICATION_CONTRACT.md) | Transactions, Pending, duplicate prevention, ownership and booking fields | Implemented |
| [Applicant contract](docs/APPLICANT_CONTRACT.md) / [Booking contract](docs/BOOKING_CONTRACT.md) | B/C Day 3 APIs | Integrated |
| [Demo data](docs/DEMO_DATA.md) | seed_demo reset scope, dataset and accounts | Provided by B |
| [Candidate contract](docs/CANDIDATE_CONTRACT.md) | Fields, privacy, error boundaries and recommendations | Implemented |
| [Matching contract](docs/MATCHING_CONTRACT.md) | A/B usage, skills/ranking fields, authorization and public responses | Implemented by C |
| [C Day 1](docs/C_DAY1_HANDOFF.md) | Matching, CI, verification and booking dependencies | Provided |
| [Dockerfile](Dockerfile) / [compose.yaml](compose.yaml) | React/Python build and PostgreSQL environment | Build/container evidence in A Day 2 handoff |
| [Course project page](https://sra-research.github.io/CSC4801/project.html) | Project and audit schedule | Check against the instructor's latest requirements |

## Known Limitations

- Accounts, profiles/private resumes/recommendations, applications/own application lists, company/job management, employer slots, applicant/status management and candidate bookings are implemented. Optional AI functionality is not enabled.
- See A's final handoff for current build/verification evidence. CI runs backend tests and frontend tests/builds; Docker and browsers are also verified locally.
- `python manage.py seed_demo` resets and populates the full demo dataset (five accounts, two companies, four jobs, four application statuses and two contested slots). `seed_auth_demo`, `seed_candidate_demo` and `seed_availability_demo` are incremental commands.
- Shared authentication, candidate APIs, employer models and matching contracts are established. Remote verification is available in Actions. Future features must continue to reuse authorization checks and public-field allowlists.
