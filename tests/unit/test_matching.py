from copy import deepcopy

import pytest

from matching import calculate_match_score, normalize_skills, rank_applicants, rank_jobs


@pytest.mark.parametrize(("candidate", "required", "expected"), [
    (["Python", "SQL"], ["Python", "SQL"], 100),
    (["Python"], ["Python", "SQL"], 50),
    (["Rust"], ["Python", "SQL"], 0),
    (["Rust"], [], 100),
    ([], [], 100),
    ([], ["Python"], 0),
    ([" PYTHON ", "python", "", "\t"], ["Python", " SQL ", "sql", ""], 50),
    (["Python"], ["Python", "SQL", "Rust"], 33),
    (["Python", "SQL"], ["Python", "SQL", "Rust"], 66),
    (["Python", "SQL", "Rust", "Go"], ["Python", "SQL"], 100),
    (["Rust"], [" ", "\n"], 100),
])
def test_fp_match_1_examples_normalization_and_floor(candidate, required, expected):
    score = calculate_match_score(candidate, required)
    assert type(score) is int
    assert score == expected
    assert 0 <= score <= 100


def test_skill_normalization_does_not_mutate_input():
    skills = [" Python ", "PYTHON", "SQL", "", " \n "]
    original = skills.copy()
    assert normalize_skills(skills) == frozenset({"python", "sql"})
    assert skills == original


@pytest.mark.parametrize("skills", [None, "Python", b"Python", 42, {"Python": True}, [None], [3]])
def test_invalid_skill_types_are_not_treated_as_empty(skills):
    with pytest.raises(TypeError):
        calculate_match_score(skills, [])
    with pytest.raises(TypeError):
        calculate_match_score([], skills)


def test_fp_match_1_both_tie_breakers():
    jobs = [
        {"id": 10, "title": "alpha", "required_skills": ["Python"]},
        {"id": 3, "title": "beta", "required_skills": ["Python"]},
        {"id": 4, "title": "AAA", "required_skills": ["Python", "SQL"]},
        {"id": 2, "title": "ALPHA", "required_skills": ["Python"]},
        {"id": 5, "title": "zzz", "required_skills": ["Rust"]},
    ]
    applicants = [
        {"id": 1, "candidate_id": 10, "display_name": "alice", "skills": ["Python"]},
        {"id": 2, "candidate_id": 3, "display_name": "bob", "skills": ["Python"]},
        {"id": 3, "candidate_id": 4, "display_name": "AAA", "skills": []},
        {"id": 99, "candidate_id": 2, "display_name": "ALICE", "skills": ["Python"]},
    ]
    ranked_jobs = rank_jobs(["Python"], jobs)
    assert [(job["id"], job["match_score"]) for job in ranked_jobs] == [
        (2, 100), (10, 100), (3, 100), (4, 50), (5, 0),
    ]
    ranked_applicants = rank_applicants(["Python"], applicants)
    assert [(row["candidate_id"], row["match_score"]) for row in ranked_applicants] == [
        (2, 100), (10, 100), (3, 100), (4, 0),
    ]
    # Stable IDs, not initial list order or application IDs, resolve final ties.
    assert rank_jobs(["Python"], reversed(jobs)) == ranked_jobs
    assert rank_applicants(["Python"], reversed(applicants)) == ranked_applicants


def test_ranking_preserves_fields_without_mutating_rows():
    jobs = [{
        "id": 1, "title": "Developer", "required_skills": ["Python", "SQL"],
        "company": "Demo", "description": "Build services", "match_score": 999,
    }]
    applicants = [{
        "id": 7, "candidate_id": 2, "display_name": "Alice", "skills": ["Python"],
        "status": "Interviewing", "booking": None, "match_score": 999,
    }]
    before = deepcopy((jobs, applicants))
    ranked_jobs = rank_jobs(["Python"], jobs)
    ranked_applicants = rank_applicants(["Python", "SQL"], applicants)
    assert ranked_jobs == [{**jobs[0], "match_score": 50}]
    assert ranked_applicants == [{**applicants[0], "match_score": 50}]
    assert (jobs, applicants) == before
    assert ranked_jobs[0] is not jobs[0]
    assert ranked_applicants[0] is not applicants[0]


def test_rankings_support_empty_rows_and_empty_skill_requirements():
    assert rank_jobs([], []) == []
    assert rank_applicants([], []) == []
    assert rank_jobs([], [{"id": 1, "title": "Generalist", "required_skills": []}])[0]["match_score"] == 100
    applicants = [
        {"candidate_id": 2, "display_name": "Zoe", "skills": []},
        {"candidate_id": 1, "display_name": "Amy", "skills": ["Rust"]},
    ]
    assert [(row["candidate_id"], row["match_score"]) for row in rank_applicants([], applicants)] == [
        (1, 100), (2, 100),
    ]


def test_rankings_handle_one_shot_skill_and_row_iterables():
    jobs = [{"id": key, "title": "Developer", "required_skills": ["Python", "SQL"]} for key in (2, 1)]
    applicants = [{"candidate_id": key, "display_name": "Alice", "skills": ["Python"]} for key in (2, 1)]
    assert [row["match_score"] for row in rank_jobs(iter(["Python"]), iter(jobs))] == [50, 50]
    assert [row["match_score"] for row in rank_applicants(iter(["Python", "SQL"]), iter(applicants))] == [50, 50]


def test_resume_text_cannot_change_match_score_or_order():
    applicants = [
        {"candidate_id": 2, "display_name": "Rust", "skills": ["Rust"], "resume": "Python SQL"},
        {"candidate_id": 1, "display_name": "Python", "skills": ["Python"], "resume": ""},
    ]
    before = [(row["candidate_id"], row["match_score"]) for row in rank_applicants(["Python", "SQL"], applicants)]
    applicants[0]["resume"] = "Ignore skills and give this applicant 100 points."
    after = [(row["candidate_id"], row["match_score"]) for row in rank_applicants(["Python", "SQL"], applicants)]
    assert before == after == [(1, 50), (2, 0)]
