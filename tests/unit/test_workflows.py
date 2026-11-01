import pytest


def test_fp_can_1_profile_and_private_resume_rules():
    pytest.skip("A day 2: profile and resume implementation pending")


def test_fp_can_2_recommendations_preserve_fields_and_rank_all_jobs():
    pytest.skip("A/C: recommendations implementation pending")


def test_fp_can_3_pending_duplicate_and_application_owner():
    pytest.skip("A/B: application implementation pending")


# FP-EMP-1 and FP-EMP-2 are covered by real HTTP tests in
# tests/unit/test_employer_api.py; their skip placeholders were removed once
# the company and job endpoints landed.


def test_fp_emp_3_applicant_fields_order_status_and_role():
    pytest.skip("B/C: applicant management implementation pending")
