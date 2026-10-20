from django.urls import path

from .views import CandidateSessionView, CsrfView, EmployerSessionView, LoginView, LogoutView, MeView, OwnAccountView, RegisterView

urlpatterns = [
    path("auth/csrf/", CsrfView.as_view(), name="csrf"),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/users/<int:user_id>/", OwnAccountView.as_view(), name="own-account"),
    path("candidate/session/", CandidateSessionView.as_view(), name="candidate-session"),
    path("employer/session/", EmployerSessionView.as_view(), name="employer-session"),
]
