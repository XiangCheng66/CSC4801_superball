from django.urls import include, path, re_path

from common.views import HealthView, api_not_found, spa

urlpatterns = [
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/", include("accounts.urls")),
    path("api/", include("candidates.urls")),
    re_path(r"^api(?:/.*)?$", api_not_found),
    re_path(r"^(?!api(?:/|$)).*$", spa, name="frontend"),
]
handler404 = "common.errors.not_found"
handler500 = "common.errors.server_error"
