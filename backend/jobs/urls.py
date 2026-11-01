from django.urls import path

from jobs.views import JobDetailView, JobListCreateView

urlpatterns = [
    path("", JobListCreateView.as_view(), name="employer-job-list"),
    path("<int:job_id>/", JobDetailView.as_view(), name="employer-job-detail"),
]
