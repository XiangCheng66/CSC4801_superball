from django.utils.cache import add_never_cache_headers


def private_api_responses(get_response):
    """Prevent caches from retaining session data, private text or CSRF tokens."""
    def middleware(request):
        response = get_response(request)
        if request.path_info == "/api" or request.path_info.startswith("/api/"):
            add_never_cache_headers(response)
        return response

    return middleware
