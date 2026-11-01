"""Employer company profile endpoint (FP-EMP-1)."""
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsEmployer
from employers.models import CompanyProfile
from employers.serializers import CompanyProfileSerializer, CompanyProfileWriteSerializer


class CompanyProfileView(APIView):
    """Read and replace the signed-in employer's own company profile.

    There is one profile per Employer account and no profile identifier in the
    URL, so a caller cannot address somebody else's company at all. A missing
    profile returns ``404``; an account without the Employer role returns
    ``403`` from ``IsEmployer``.
    """

    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request):
        profile = get_object_or_404(CompanyProfile, user=request.user)
        return Response({"data": CompanyProfileSerializer(profile).data})

    def put(self, request):
        serializer = CompanyProfileWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile, created = CompanyProfile.objects.update_or_create(
            user=request.user,
            defaults=serializer.validated_data,
        )
        return Response(
            {"data": CompanyProfileSerializer(profile).data},
            status=201 if created else 200,
        )
