from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import StrictSerializer
from common.permissions import IsCandidate, get_owned_object
from .models import Application
from .serializers import ApplicationSerializer, ApplyInput
from .services import apply_to_job


def application_queryset():
    return Application.objects.select_related(
        "job__employer__company_profile", "booking__slot",
    ).prefetch_related("job__required_skills")


class ApplicationListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsCandidate]

    def get(self, request):
        # No client-supplied candidate/owner/status filters or pagination.
        query = StrictSerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        rows = application_queryset().filter(candidate=request.user).order_by("-created_at", "-id")
        return Response({"data": ApplicationSerializer(rows, many=True).data})

    def post(self, request):
        serializer = ApplyInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = apply_to_job(request.user, serializer.validated_data["job_id"])
        row = application_queryset().get(pk=created.pk)
        return Response({"data": ApplicationSerializer(row).data}, status=201)


class ApplicationDetailView(APIView):
    permission_classes = [IsAuthenticated, IsCandidate]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Check ownership even for unsupported writes. Own writes are 405;
        # another candidate's ID is 403 and a nonexistent ID is 404.
        self.application = get_owned_object(
            application_queryset(), request.user, owner_field="candidate_id",
            pk=kwargs["application_id"],
        )

    def get(self, request, application_id):
        return Response({"data": ApplicationSerializer(self.application).data})
