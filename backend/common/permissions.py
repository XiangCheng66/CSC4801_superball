from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import BasePermission


class IsCandidate(BasePermission):
    message = "This operation requires the Candidate role."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "Candidate"


class IsEmployer(BasePermission):
    message = "This operation requires the Employer role."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "Employer"


def get_owned_object(queryset, user, *, owner_field="owner_id", **lookup):
    """Check authentication first, then distinguish a missing object from a wrong owner.

    Views must check their required role before calling this helper. For future
    models pass their owning user-ID attribute, e.g. employer_id or candidate_id.
    """
    if not user.is_authenticated:
        raise NotAuthenticated()
    obj = get_object_or_404(queryset, **lookup)
    if getattr(obj, owner_field) != user.pk:
        raise PermissionDenied("You do not own this resource.")
    return obj
