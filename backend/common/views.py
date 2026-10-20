from django.conf import settings
from django.db import DatabaseError, connection
from django.http import FileResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .errors import error_payload


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except DatabaseError:
            return Response(error_payload("database_unavailable", "Database is not ready."), status=503)
        return Response({"data": {"status": "ok", "database": connection.vendor}})


def spa(request, **kwargs):
    index = settings.BASE_DIR / "frontend_dist" / "index.html"
    if not index.is_file():
        return JsonResponse(error_payload("frontend_not_built", "Use the Vite development server or build the Docker image."), status=503)
    return FileResponse(index.open("rb"), content_type="text/html")


@csrf_exempt
def api_not_found(request, **kwargs):
    return JsonResponse(error_payload("not_found", "Resource not found."), status=404)
