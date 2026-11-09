from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import StrictSerializer
from common.permissions import IsCandidate
from .booking_services import available_slots, booking_queryset, create_booking, eligible_applications, visible_booking, visible_bookings
from .models import Booking
from .serializers import SlotSerializer


class IdField(serializers.IntegerField):
    def __init__(self, **kwargs):
        super().__init__(min_value=1, max_value=2**63-1, **kwargs)

    def to_internal_value(self, data):
        if type(data) is not int:
            raise serializers.ValidationError('Use a positive JSON integer.')
        return super().to_internal_value(data)


class BookingInput(StrictSerializer):
    application_id = IdField()
    slot_id = IdField()


class EmptyQuery(StrictSerializer):
    pass


def check_query(request):
    EmptyQuery(data=request.query_params).is_valid(raise_exception=True)


class BookingSerializer(serializers.ModelSerializer):
    job_id = serializers.IntegerField(source='application.job_id')
    job_title = serializers.CharField(source='application.job.title')
    candidate_name = serializers.SerializerMethodField()
    employer_id = serializers.IntegerField(source='slot.job.employer_id')
    start_at = serializers.DateTimeField(source='slot.start_at')
    end_at = serializers.DateTimeField(source='slot.end_at')

    class Meta:
        model = Booking
        fields = ['id', 'application_id', 'slot_id', 'job_id', 'job_title', 'candidate_name', 'employer_id', 'start_at', 'end_at', 'created_at']
        read_only_fields = fields

    def get_candidate_name(self, booking):
        user = booking.application.candidate
        return user.display_name or user.username


class BookingApplicationsView(APIView):
    permission_classes = [IsAuthenticated, IsCandidate]

    def get(self, request):
        check_query(request)
        return Response({'data': [{'id': app.pk, 'job_id': app.job_id, 'job_title': app.job.title} for app in eligible_applications(request.user)]})


class ApplicationSlotsView(APIView):
    permission_classes = [IsAuthenticated, IsCandidate]

    def get(self, request, application_id):
        check_query(request)
        return Response({'data': SlotSerializer(available_slots(request.user, application_id), many=True).data})


class BookingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsCandidate()]
        return super().get_permissions()

    def get(self, request):
        check_query(request)
        return Response({'data': BookingSerializer(visible_bookings(request.user), many=True).data})

    def post(self, request):
        serializer = BookingInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = create_booking(request.user, **serializer.validated_data)
        return Response({'data': BookingSerializer(booking_queryset().get(pk=booking.pk)).data}, status=201)


class BookingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        check_query(request)
        return Response({'data': BookingSerializer(visible_booking(request.user, booking_id)).data})
