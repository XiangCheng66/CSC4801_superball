from django.urls import path

from .views import ProfileView, RecommendationsView, ResumeView

urlpatterns = [
    path("candidate/profile/", ProfileView.as_view(), name="candidate-profile"),
    path("candidate/profiles/<int:user_id>/", ProfileView.as_view(), name="candidate-profile-owner"),
    path("candidate/resume/", ResumeView.as_view(), name="candidate-resume"),
    path("candidate/resumes/<int:user_id>/", ResumeView.as_view(), name="candidate-resume-owner"),
    path("candidate/recommendations/", RecommendationsView.as_view(), name="candidate-recommendations"),
]
