from django.urls import path

from employers.views import CompanyProfileView

urlpatterns = [
    path("company/", CompanyProfileView.as_view(), name="employer-company"),
]
