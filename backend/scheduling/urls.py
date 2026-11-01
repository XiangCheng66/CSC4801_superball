from django.urls import path

from .views import SlotDetailView, SlotJobsView, SlotListView

urlpatterns = [
    path("slots/", SlotListView.as_view(), name="slot-list"),
    path("slots/jobs/", SlotJobsView.as_view(), name="slot-jobs"),
    path("slots/<int:slot_id>/", SlotDetailView.as_view(), name="slot-detail"),
]
