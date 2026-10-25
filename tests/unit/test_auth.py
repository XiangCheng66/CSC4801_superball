from io import StringIO
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError, OperationalError, connection, transaction
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db
User = get_user_model()
PASSWORD = "ReliablePass!4826"


@pytest.fixture
def client():
    return APIClient(enforce_csrf_checks=True)


def post(client, path, body=None):
    client.get("/api/auth/csrf/")
    token = client.cookies["csrftoken"].value
    return client.post(path, body or {}, format="json", HTTP_X_CSRFTOKEN=token)


def registration(**changes):
    return {"username": "alice", "email": "alice@example.test", "password": PASSWORD, "role": "Candidate", **changes}


def test_fp_auth_1_registration_and_session_lifecycle(client):
    response = post(client, "/api/auth/register/", registration())
    assert response.status_code == 201
    user = response.json()["data"]
    assert user["role"] == "Candidate" and user["display_name"] == "alice"
    assert client.cookies["sessionid"]["httponly"]
    assert client.get("/api/auth/me/").json()["data"] == user
    old_session = client.cookies["sessionid"].value
    assert post(client, "/api/auth/logout/").status_code == 200
    assert client.get("/api/auth/me/").status_code == 401
    replay = APIClient()
    replay.cookies["sessionid"] = old_session
    assert replay.get("/api/auth/me/").status_code == 401
    assert post(client, "/api/auth/login/", {"username": "ALICE", "password": PASSWORD}).status_code == 200


@pytest.mark.parametrize("changes", [
    {"username": "ab"}, {"email": "invalid"}, {"role": "Admin"},
    {"password": "12345678"}, {"password": "short"}, {"is_staff": True},
    {"username": ""}, {"role": ""},
])
def test_fp_auth_1_invalid_registration(client, changes):
    response = post(client, "/api/auth/register/", registration(**changes))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "fields" in response.json()["error"]
    assert User.objects.count() == 0


@pytest.mark.parametrize("role", ["Candidate", "Employer"])
def test_only_supported_roles_can_register(client, role):
    response = post(client, "/api/auth/register/", registration(role=role))
    assert response.status_code == 201 and response.json()["data"]["role"] == role


@pytest.mark.parametrize("changes", [{"username": "ALICE", "email": "other@example.test"}, {"username": "other", "email": "ALICE@EXAMPLE.TEST"}])
def test_duplicate_account_is_rejected_case_insensitively(client, changes):
    assert post(client, "/api/auth/register/", registration()).status_code == 201
    response = post(client, "/api/auth/register/", registration(**changes))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "account_conflict"
    assert User.objects.count() == 1


def test_fp_auth_2_salted_hash_and_password_verification(client):
    first = User.objects.create_user(username="alice", email="a@example.test", password=PASSWORD, role="Candidate")
    second = User.objects.create_user(username="bob", email="b@example.test", password=PASSWORD, role="Employer")
    assert first.password != PASSWORD and first.password != second.password
    assert first.password.startswith("pbkdf2_sha256$")
    assert first.check_password(PASSWORD) and not first.check_password("wrong")
    client.force_login(first)
    data = client.get("/api/auth/me/").json()["data"]
    assert set(data) == {"id", "username", "email", "display_name", "role"}
    assert PASSWORD not in str(data) and first.password not in str(data)


def test_fp_auth_3_authorization_and_missing_object(client):
    first = User.objects.create_user(username="alice", email="a@example.test", password=PASSWORD, role="Candidate")
    second = User.objects.create_user(username="bob", email="b@example.test", password=PASSWORD, role="Employer")
    path = f"/api/auth/users/{first.pk}/"
    assert client.get(path).status_code == 401
    client.force_login(first)
    assert client.get(path).status_code == 200
    forbidden = client.get(f"/api/auth/users/{second.pk}/")
    assert forbidden.status_code == 403 and forbidden.json()["error"]["code"] == "permission_denied"
    missing = client.get("/api/auth/users/999999/")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize("role,allowed,forbidden", [
    ("Candidate", "candidate", "employer"), ("Employer", "employer", "candidate"),
])
def test_role_permissions_are_enforced_by_server(client, role, allowed, forbidden):
    assert client.get(f"/api/{allowed}/session/").status_code == 401
    user = User.objects.create_user(username="alice", email="a@example.test", password=PASSWORD, role=role)
    client.force_login(user)
    assert client.get(f"/api/{allowed}/session/").status_code == 200
    assert client.get(f"/api/{forbidden}/session/").status_code == 403


@pytest.mark.parametrize("path", ["/api/auth/login/", "/api/auth/register/"])
def test_anonymous_auth_posts_require_csrf(client, path):
    response = client.post(path, registration(), format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"
    assert User.objects.count() == 0


def test_logout_requires_csrf_for_authenticated_session(client):
    post(client, "/api/auth/register/", registration())
    response = client.post("/api/auth/logout/", {}, format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"
    assert client.get("/api/auth/me/").status_code == 200


def test_login_rotates_session_and_csrf_and_rejects_wrong_credentials(client):
    User.objects.create_user(username="alice", email="a@example.test", password=PASSWORD, role="Candidate")
    client.get("/api/auth/csrf/")
    old_csrf = client.cookies["csrftoken"].value
    bad = post(client, "/api/auth/login/", {"username": "alice", "password": "wrong"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"
    assert post(client, "/api/auth/login/", {"username": "alice", "password": PASSWORD}).status_code == 200
    assert client.cookies["csrftoken"].value != old_csrf


def test_database_rejects_invalid_role_and_case_duplicate():
    User.objects.create_user(username="alice", email="a@example.test", password=PASSWORD, role="Candidate")
    for values in [dict(username="ALICE", email="b@example.test", role="Candidate"), dict(username="bob", email="b@example.test", role="Admin")]:
        with pytest.raises(IntegrityError), transaction.atomic():
            User.objects.create_user(password=PASSWORD, **values)


def test_sql_metacharacters_remain_bound_values():
    payload = "' OR 1=1 --"
    observed = []

    def inspect(execute, sql, params, many, context):
        observed.append((sql, params))
        return execute(sql, params, many, context)

    with connection.execute_wrapper(inspect), pytest.raises(User.DoesNotExist):
        User.objects.get_by_natural_key(payload)
    assert observed
    assert all(payload not in sql for sql, _ in observed)
    assert any(payload in params for _, params in observed if params)


def test_invalid_json_and_unknown_api_paths_use_error_contract(client):
    client.get("/api/auth/csrf/")
    response = client.post("/api/auth/login/", '{"broken":', content_type="application/json", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
    assert response.status_code == 400 and response.json()["error"]["code"] == "parse_error"
    for path in ["/api/missing/", "/api/auth/me"]:
        response = client.get(path)
        assert response.status_code == 404 and response.json()["error"]["code"] == "not_found"


def test_health_probes_database_and_hides_connection_errors(client):
    assert client.get("/api/health/").json()["data"]["status"] == "ok"
    with patch("common.views.connection.cursor", side_effect=OperationalError("private connection details")):
        response = client.get("/api/health/")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert "private" not in str(response.json())


def test_demo_seed_is_idempotent_and_has_only_demo_accounts():
    for _ in range(2):
        call_command("seed_auth_demo", stdout=StringIO())
    assert User.objects.count() == 4
    assert set(User.objects.values_list("role", flat=True)) == {"Candidate", "Employer"}
    assert all(user.check_password("LocalDemo!2026") for user in User.objects.all())
