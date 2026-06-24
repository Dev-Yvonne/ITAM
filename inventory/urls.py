from django.urls import path

from . import views


urlpatterns = [
    path("", views.DashboardView.as_view(), name="dashboard"),
    path("assets/", views.AssetListView.as_view(), name="asset_list"),
    path("assets/export.csv", views.AssetCSVExportView.as_view(), name="asset_export"),
    path("assets/add/", views.AssetCreateView.as_view(), name="asset_add"),
    path("assets/<int:pk>/", views.AssetDetailView.as_view(), name="asset_detail"),
    path("assets/<int:pk>/edit/", views.AssetUpdateView.as_view(), name="asset_edit"),
    path("assets/<int:pk>/delete/", views.AssetDeleteView.as_view(), name="asset_delete"),
    path("employees/", views.EmployeeListView.as_view(), name="employee_list"),
    path("employees/add/", views.EmployeeCreateView.as_view(), name="employee_add"),
    path(
        "employees/<int:pk>/edit/",
        views.EmployeeUpdateView.as_view(),
        name="employee_edit",
    ),
    path(
        "employees/<int:pk>/delete/",
        views.EmployeeDeleteView.as_view(),
        name="employee_delete",
    ),
    path("assets/<int:pk>/assign/", views.AssignAssetView.as_view(), name="assign_asset"),
    path("assets/<int:pk>/return/", views.ReturnAssetView.as_view(), name="return_asset"),
]
