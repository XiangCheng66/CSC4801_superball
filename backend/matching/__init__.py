"""Shared matching services for candidate and employer Django workflows."""

from .ranking import rank_applicants, rank_jobs
from .services import calculate_match_score, normalize_skills

__all__ = [
    "normalize_skills",
    "calculate_match_score",
    "rank_jobs",
    "rank_applicants",
]
