"""FP-MATCH-1: deterministic skill overlap; no database or resume access."""

from collections.abc import Iterable, Mapping


def normalize_skills(skills: Iterable[str]) -> frozenset[str]:
    """Trim, lowercase, discard blanks and deduplicate a collection of strings.

    An empty collection means no skills. Invalid types are programming/input
    errors, not empty skills; HTTP callers must validate with their serializer.
    """
    if isinstance(skills, (str, bytes, Mapping)) or not isinstance(skills, Iterable):
        raise TypeError("Skills must be a collection of strings.")

    normalized = set()
    for skill in skills:
        if not isinstance(skill, str):
            raise TypeError("Each skill must be a string.")
        value = skill.strip().lower()
        if value:
            normalized.add(value)
    return frozenset(normalized)


def calculate_match_score(
    candidate_skills: Iterable[str], required_skills: Iterable[str]
) -> int:
    """Return floor(100 * overlap / required), or 100 for no requirements."""
    candidate = normalize_skills(candidate_skills)
    required = normalize_skills(required_skills)
    if not required:
        return 100
    # Integer division implements floor without floating-point rounding.
    return 100 * len(candidate & required) // len(required)
