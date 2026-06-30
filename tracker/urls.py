from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('inventory.urls')),
]

handler400 = "inventory.views.error_bad_request"
handler403 = "inventory.views.error_permission_denied"
handler404 = "inventory.views.error_not_found"
handler500 = "inventory.views.error_server_error"