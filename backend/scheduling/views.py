from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsEmployer, get_owned_object
from .serializers import CreateSlotSerializer, SlotQuerySerializer, SlotSerializer
from .services import create_slot, delete_slot, owned_jobs, owned_slots
from .models import InterviewSlot


class SlotListView(APIView):
    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request):
        query = SlotQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        slots = owned_slots(request.user)
        if query.validated_data["available"] == "true":
            slots = slots.available()
        return Response({"data": SlotSerializer(slots, many=True, context={"now": timezone.now()}).data})

    def post(self, request):
        serializer = CreateSlotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        slot = create_slot(request.user, **serializer.validated_data)
        return Response({"data": SlotSerializer(slot).data}, status=201)


class SlotDetailView(APIView):
    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request, slot_id):
        slot = get_owned_object(
            InterviewSlot.objects.select_related("job", "booking"),
            request.user, owner_field="employer_id", pk=slot_id,
        )
        return Response({"data": SlotSerializer(slot).data})

    def delete(self, request, slot_id):
        delete_slot(request.user, slot_id)
        return Response({"data": {"message": "Slot deleted."}})


class SlotJobsView(APIView):
    """Minimal owned-job picker, not a replacement for B's job CRUD API."""
    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request):
        return Response({"data": list(owned_jobs(request.user).values("id", "title"))})
