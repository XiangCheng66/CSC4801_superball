import logging

from django.http import JsonResponse
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def error_payload(code, message, fields=None):
    error = {"code": code, "message": message}
    if fields is not None:
        error["fields"] = fields
    return {"error": error}


class AccountConflict(exceptions.APIException):
    status_code = 409
    default_detail = "Username or email is already registered."
    default_code = "account_conflict"


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        logger.error("Unhandled API exception", exc_info=(type(exc), exc, exc.__traceback__))
        return Response(error_payload("server_error", "The server could not complete this request."), status=500)
    if isinstance(exc, exceptions.ValidationError):
        response.data = error_payload("validation_error", "Check the submitted fields.", response.data)
    else:
        detail = response.data.get("detail", "Request failed.")
        code = getattr(detail, "code", getattr(exc, "default_code", "request_failed"))
        if response.status_code == 403 and str(detail).startswith("CSRF Failed"):
            code, detail = "csrf_failed", "CSRF verification failed. Refresh the page and try again."
        response.data = error_payload(str(code), str(detail))
    return response


def csrf_failure(request, reason=""):
    return JsonResponse(error_payload("csrf_failed", "CSRF verification failed. Refresh the page and try again."), status=403)


def not_found(request, exception=None):
    return JsonResponse(error_payload("not_found", "Resource not found."), status=404)


def server_error(request):
    return JsonResponse(error_payload("server_error", "The server could not complete this request."), status=500)
