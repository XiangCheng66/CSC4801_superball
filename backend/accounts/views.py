from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.errors import AccountConflict
from common.permissions import IsCandidate, IsEmployer, get_owned_object
from .serializers import LoginSerializer, PublicUserSerializer, RegisterSerializer

User = get_user_model()


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"data": {"csrfToken": get_token(request)}})


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        data["display_name"] = data.get("display_name") or data["username"]
        try:
            with transaction.atomic():
                user = User.objects.create_user(**data)
        except IntegrityError as exc:
            raise AccountConflict() from exc
        login(request, user)
        return Response({"data": PublicUserSerializer(user).data}, status=201)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request=request, **serializer.validated_data)
        if user is None:
            raise AuthenticationFailed("Invalid username or password.", code="invalid_credentials")
        login(request, user)
        return Response({"data": PublicUserSerializer(user).data})


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"data": {"message": "Logged out."}})


class MeView(APIView):
    def get(self, request):
        return Response({"data": PublicUserSerializer(request.user).data})


class OwnAccountView(APIView):
    """Foundation example for ownership checks; no cross-user account directory."""

    def get(self, request, user_id):
        user = get_owned_object(User.objects.all(), request.user, owner_field="pk", pk=user_id)
        return Response({"data": PublicUserSerializer(user).data})


class CandidateSessionView(MeView):
    permission_classes = [IsAuthenticated, IsCandidate]


class EmployerSessionView(MeView):
    permission_classes = [IsAuthenticated, IsEmployer]
