from rest_framework.authentication import SessionAuthentication


class SessionAuthenticationWith401(SessionAuthentication):
    """Keep Django's CSRF checks while giving anonymous requests a 401 challenge."""

    def authenticate_header(self, request):
        return "Session"
