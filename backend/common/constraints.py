"""Reusable database constraints shared by domain models."""
from django.db.models import F, Value
from django.db.models.functions import Length, Replace, Trim
from django.db.models.lookups import GreaterThan

# SQL ``TRIM`` only removes spaces, so tabs and newlines are stripped explicitly
# first. A value such as " \t " must fail the constraint, not only "" and " ".
_WHITESPACE = ("\t", "\n", "\r")


def not_blank(field: str) -> GreaterThan:
    """Return a database condition rejecting empty and whitespace-only text.

    Works on PostgreSQL and on the SQLite test database; both provide
    ``REPLACE`` and ``TRIM``. Prefer this over ``~Q(field="")``, which accepts
    ``"   "``.
    """
    expression = F(field)
    for char in _WHITESPACE:
        expression = Replace(expression, Value(char), Value(""))
    return GreaterThan(Length(Trim(expression)), Value(0))
