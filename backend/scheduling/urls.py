from django.urls import path

from .booking_views import ApplicationSlotsView, BookingApplicationsView, BookingDetailView, BookingListView
from .views import SlotDetailView, SlotJobsView, SlotListView

urlpatterns = [
    path("slots/", SlotListView.as_view(), name="slot-list"),
    path("slots/jobs/", SlotJobsView.as_view(), name="slot-jobs"),
    path("slots/<int:slot_id>/", SlotDetailView.as_view(), name="slot-detail"),
    path('booking-applications/', BookingApplicationsView.as_view(), name='booking-applications'),
    path('booking-applications/<int:application_id>/slots/', ApplicationSlotsView.as_view(), name='application-slots'),
    path('bookings/', BookingListView.as_view(), name='booking-list'),
    path('bookings/<int:booking_id>/', BookingDetailView.as_view(), name='booking-detail'),
]
