# Superball Project Specification

[中文](SPEC.md) | **English**

## Product scope and architecture

The system has two roles. Candidates maintain their profiles, review jobs ranked by skill, apply, and book interviews. Employers maintain company and job information, review applicants, update application statuses, and manage availability.

- `frontend/` uses React 19 and Vite. `frontend/src/App.jsx` restores sessions and selects a workspace. `frontend/src/api/client.js` handles JSON, session cookies, CSRF, and API errors.
- `backend/` uses Django 5.2 and Django REST Framework. Domain modules enforce validation, permissions, and writes. `backend/matching/` provides stateless scoring and ranking.
- PostgreSQL 17 persists business and session data. In development, Vite proxies `/api/`. The multi-stage Docker build compiles the frontend. At runtime, Gunicorn and WhiteNoise serve the page, assets, and API on one origin.

## Data model and relationships

| Model | Relationships and constraints |
|---|---|
| `accounts.User` | Custom Django user with either the `Candidate` or `Employer` role. The database enforces uniqueness on lowercased usernames and email addresses. Stores a display name and Django password hash. |
| `candidates.CandidateProfile` | One-to-one with the user, whose ID is the primary key. Stores a JSON skill array, private raw resume text, and timestamps. When no profile row exists, reads return the account display name, empty skills, and an empty resume. The first write creates it. |
| `employers.CompanyProfile` | One-to-one with the employer, whose ID is the primary key. Stores a nonblank company name and description. |
| `jobs.Job` / `RequiredSkill` | Each job belongs to an employer account and has a nonblank title and description. Required skills are child records with case-insensitive uniqueness per job. The list can be empty. |
| `applications.Application` | Links a candidate and job with `UNIQUE(job, candidate)`. New applications start as `Pending`. The database allows `Pending`, `Interviewing`, `Rejected`, and `Accepted`. |
| `scheduling.InterviewSlot` | Belongs to a job and derives its employer from that job. Stores a start and end time with a database constraint requiring a 30-minute duration. |
| `scheduling.Booking` | Has a one-to-one relationship with both application and slot. Each application and slot can have at most one booking. |

Applications and slots reference jobs through `PROTECT`. Bookings protect the linked applications and slots. Deleting a job with applications or slots returns `409`. Profile and resume writes update separate fields and lock the user row in a transaction before creating or updating the profile. The display name lives on `User`.

## Authentication and authorization

Registration applies Django password validation and stores a salted PBKDF2-SHA256 hash. Sign-in takes a username and password and matches the username case-insensitively. Registration and sign-in establish a database session with an `HttpOnly` and `SameSite=Lax` cookie. Signing out invalidates the session.

The server derives identity from the session. `IsCandidate` and `IsEmployer` enforce roles. Views and services check object ownership. Protected requests return `401` for unauthenticated callers, `403` for a wrong role or owner, and `404` for a missing object the caller could otherwise access. Lists are scoped to the caller and role.

## API

Successful responses contain `{"data": ...}`. Errors contain an `error` object with `code`, `message`, and optional `fields`. API paths use trailing slashes. See the [API contract](docs/API_CONTRACT.md) for field definitions.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/health/` | Database readiness check. Returns 200 when ready and 503 on connection failure. |
| GET | `/api/auth/csrf/` | Obtain the CSRF cookie and token. |
| POST | `/api/auth/register/` | Register and sign in, returning 201. |
| POST | `/api/auth/login/` | Sign in with a username and password. |
| POST | `/api/auth/logout/` | Invalidate the current session. |
| GET | `/api/auth/me/` | Restore the current account details. |
| GET | `/api/auth/users/<user_id>/` | Read the caller's own account. |
| GET | `/api/candidate/session/` | Check the Candidate role. |
| GET | `/api/employer/session/` | Check the Employer role. |
| GET / PUT | `/api/candidate/profile/` | Read or save the caller's display name and skills. |
| GET / PUT | `/api/candidate/profiles/<user_id>/` | Access the caller's profile by ID. |
| GET / PUT | `/api/candidate/resume/` | Read or replace the caller's raw resume text. |
| GET / PUT | `/api/candidate/resumes/<user_id>/` | Access the caller's resume by ID. |
| GET | `/api/candidate/recommendations/` | List all current jobs with required skills and match scores. |
| GET / POST | `/api/applications/` | List the caller's applications or create a `Pending` application for a job. |
| GET | `/api/applications/<application_id>/` | Read the caller's application details and any booking. |
| GET / PUT | `/api/employer/company/` | Read or save the caller's company profile. First save returns 201. |
| GET / POST | `/api/employer/jobs/` | List or create the caller's job postings. |
| GET / PATCH / DELETE | `/api/employer/jobs/<job_id>/` | Read, update, or delete the caller's job posting. |
| GET | `/api/employer/jobs/<job_id>/applicants/` | List ranked applicants for the caller's job. |
| PATCH | `/api/employer/applications/<application_id>/status/` | Set one of the four statuses on an application for the caller's job. |
| GET / POST | `/api/slots/` | List or create the caller's interview slots. |
| GET | `/api/slots/jobs/` | List the caller's jobs for the slot form. |
| GET / DELETE | `/api/slots/<slot_id>/` | Read the caller's slot or delete an unbooked slot that has yet to start. |
| GET | `/api/booking-applications/` | List the caller's applications eligible for booking. |
| GET | `/api/booking-applications/<application_id>/slots/` | List available slots for the application's employer. |
| GET / POST | `/api/bookings/` | List the caller's bookings for either role. Candidates can create bookings. |
| GET | `/api/bookings/<booking_id>/` | Read a booking for the caller's application or slot. |

## Main screens and workflows

- **Account entry** offers registration and sign-in. The account screen can refresh identity, verify the role, and sign out. Page reload restores the session through `/api/auth/me/`.
- **Candidate workspace** includes profile, private resume, ranked jobs, application history, and interview booking. The application service locks the job in a transaction. A lookup and uniqueness constraint prevent duplicate submissions, which return `409`. The candidate sees each job, employer, status, and existing booking. The employer controls status changes.
- **Employer workspace** includes company details, job management, applicant lists, interview slots, and received bookings. Applicant rows show identity, skills, match score, status, and booking. Only the job owner can change status.

## Skill storage, matching, and ranking

Candidate skills are stored in `CandidateProfile.skills` and job skills in `RequiredSkill`. `backend/matching/services.py` trims and lowercases strings, discards empty values, and deduplicates both lists. Let `C` be the normalized candidate skill set and `R` the required skill set.

```text
score = 100                            when R is empty
score = 100 * len(C & R) // len(R)      otherwise
```

`backend/matching/ranking.py` shares that scoring function across both views. Scores sort in descending order. Candidate recommendations break ties by the job title's `casefold()` value and integer job ID. Employer lists break ties by the candidate display name's `casefold()` value and integer user ID. Recommendations include every current job, including zero scores. Without a company profile, they use the employer's display name and fall back to the username. The score uses skills only. See the [matching contract](docs/MATCHING_CONTRACT.md).

## Interview availability and booking transaction

Slots must start in the future and last exactly 30 minutes. The API accepts times with an explicit timezone and returns UTC. The UI displays `Asia/Shanghai`. Employers can delete their own slots before they start if those slots have no bookings.

A booking requires an application owned by the caller in `Interviewing`, a future and available slot with the application's employer, and an application without an existing booking. Slots for another job with the same employer are eligible.

`backend/scheduling/booking_services.py` uses `transaction.atomic()` and `SELECT FOR UPDATE` to lock the application first and the slot second. It checks eligibility under both locks and creates the booking. Two one-to-one uniqueness constraints guard concurrent writes. When two candidates try to book the same slot, the first committed booking stays and the other request receives `409 Slot already booked`. If an insert raises an integrity error, the service confirms a conflict after rollback and propagates unrelated database errors. Both parties see the same booking record, which remains visible after a status change. See the [booking contract](docs/BOOKING_CONTRACT.md).

## Security controls and limitations

- Registration, sign-in, and session-based writes check CSRF. Input serializers reject extra role and ownership fields. Responses expose a defined set of fields. Resume access is limited to the owner. Applicant lists expose the candidate information needed for recruitment.
- Business queries bind values through the Django ORM. React renders user input as text. API responses use `Cache-Control: no-store`. Switching accounts remounts the workspace and discards responses from the previous session.
- Local secrets are stored in the untracked `.env` file. Unit tests use isolated SQLite or PostgreSQL databases. The two database concurrency cases require PostgreSQL.
- Resumes are plain text. Optional PDF extraction and AI enhancements are unimplemented. The application does not send user data to external models.

See the [README](README.en.md) for the requirement-to-test mapping and [INSTALL](INSTALL.en.md) for setup and verification commands.
