from django.urls import path

from .views import ApplicationDetailView, ApplicationListCreateView

urlpatterns = [
    path("applications/", ApplicationListCreateView.as_view(), name="applications"),
    path("applications/<int:application_id>/", ApplicationDetailView.as_view(), name="application-detail"),
]
