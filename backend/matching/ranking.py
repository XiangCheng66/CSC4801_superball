"""Ranking adapters shared by A's job dashboard and B's applicant list.

Callers select current jobs or authorized applicants and provide integer IDs.
Rows are copied, scored and sorted; unrelated fields are preserved. HTTP
callers remain responsible for choosing public response fields.
"""

from collections.abc import Iterable, Sequence
from typing import TypedDict

from .services import calculate_match_score, normalize_skills


class JobForMatching(TypedDict):
    id: int
    title: str
    required_skills: Sequence[str]


class RankedJob(JobForMatching):
    match_score: int


class ApplicantForMatching(TypedDict):
    candidate_id: int
    display_name: str
    skills: Sequence[str]


class RankedApplicant(ApplicantForMatching):
    match_score: int


def rank_jobs(
    candidate_skills: Iterable[str], jobs: Iterable[JobForMatching]
) -> list[RankedJob]:
    """Score every supplied job; ties use case-insensitive title then job ID."""
    # Materialize once so a generator of skills also works for multiple rows.
    candidate = normalize_skills(candidate_skills)
    ranked = [
        {**job, "match_score": calculate_match_score(candidate, job["required_skills"])}
        for job in jobs
    ]
    return sorted(
        ranked,
        key=lambda job: (-job["match_score"], job["title"].casefold(), job["id"]),
    )


def rank_applicants(
    required_skills: Iterable[str], applicants: Iterable[ApplicantForMatching]
) -> list[RankedApplicant]:
    """Score supplied applicants; ties use display name then candidate ID.

    candidate_id is the stable user ID, never the application or profile ID.
    """
    required = normalize_skills(required_skills)
    ranked = [
        {**applicant, "match_score": calculate_match_score(applicant["skills"], required)}
        for applicant in applicants
    ]
    return sorted(
        ranked,
        key=lambda applicant: (
            -applicant["match_score"],
            applicant["display_name"].casefold(),
            applicant["candidate_id"],
        ),
    )
