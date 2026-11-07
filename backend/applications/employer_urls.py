from django.urls import path

from applications.employer_views import ApplicationStatusView

urlpatterns = [
    path(
        "<int:application_id>/status/",
        ApplicationStatusView.as_view(),
        name="employer-application-status",
    ),
]
