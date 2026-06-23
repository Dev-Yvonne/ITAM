from django.urls import path

from . import views


app_name = "inventory"

urlpatterns = [
    path("", views.DashboardView.as_view(), name="dashboard"),
    path("assets/", views.AssetListView.as_view(), name="asset-list"),
    path("assets/export.csv", views.AssetCSVExportView.as_view(), name="asset-export"),
    path("assets/new/", views.AssetCreateView.as_view(), name="asset-create"),
    path("assets/<int:pk>/", views.AssetDetailView.as_view(), name="asset-detail"),
    path("assets/<int:pk>/edit/", views.AssetUpdateView.as_view(), name="asset-update"),
    path("assets/<int:pk>/delete/", views.AssetDeleteView.as_view(), name="asset-delete"),
    path("employees/", views.EmployeeListView.as_view(), name="employee-list"),
    path("employees/new/", views.EmployeeCreateView.as_view(), name="employee-create"),
    path(
        "employees/<int:pk>/",
        views.EmployeeDetailView.as_view(),
        name="employee-detail",
    ),
    path(
        "employees/<int:pk>/edit/",
        views.EmployeeUpdateView.as_view(),
        name="employee-update",
    ),
    path(
        "employees/<int:pk>/delete/",
        views.EmployeeDeleteView.as_view(),
        name="employee-delete",
    ),
    path("assignments/new/", views.AssignAssetView.as_view(), name="assign-asset"),
    path(
        "assignments/<int:pk>/return/",
        views.ReturnAssetView.as_view(),
        name="return-asset",
    ),
]
