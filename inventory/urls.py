from django.urls import path
from django.views.generic import RedirectView
from . import views


urlpatterns = [
    # Authentication URLs
    path("login/", views.AuthLoginView.as_view(), name="login"),
    path("logout/", views.AuthLogoutView.as_view(), name="logout"),
    
    # ==========================================
    # PASSWORD RESET URLs
    # ==========================================
    path(
        "password-reset/",
        views.ForgotPasswordEmailView.as_view(),
        name="password_reset",
    ),
    path(
        "password-reset/verify/",
        views.ForgotPasswordVerifyView.as_view(),
        name="password_reset_verify",
    ),
    path(
        "password-reset/set/",
        views.ForgotPasswordSetView.as_view(),
        name="password_reset_set",
    ),
    
    # Dashboard
    path("", views.DashboardView.as_view(), name="dashboard"),
    path("dashboard/", views.DashboardView.as_view(), name="dashboard_redirect"),
    
    # Profile
    path("profile/", views.ProfileView.as_view(), name="profile"),
    path(
        "api/profile/avatar/",
        views.ProfileAvatarUploadView.as_view(),
        name="api_profile_avatar",
    ),
    
    # Settings
    path("settings/", views.SettingsView.as_view(), name="settings"),
    
    # Admin Notifications
    path("notifications/", views.NotificationListView.as_view(), name="notifications"),
    path("api/notifications/", views.NotificationAPIView.as_view(), name="api_notifications"),
    path("api/notifications/<int:pk>/read/", views.NotificationMarkReadView.as_view(), name="api_notification_read"),
    path("api/notifications/mark-all-read/", views.NotificationMarkAllReadView.as_view(), name="api_notification_mark_all_read"),

    # Background jobs (async processing)
    path("api/jobs/", views.BackgroundJobCreateView.as_view(), name="background_job_create"),
    path("api/jobs/<uuid:job_id>/", views.BackgroundJobDetailView.as_view(), name="background_job_detail"),
    path(
        "api/jobs/<uuid:job_id>/download/",
        views.BackgroundJobDownloadView.as_view(),
        name="background_job_download",
    ),
    
    # Reports
    path("reports/", views.ReportsView.as_view(), name="reports"),
    
    # API URLs
    path("api/assets", views.AssetAPIListView.as_view(), name="api_asset_list"),
    path("api/assets/", views.AssetAPIListView.as_view(), name="api_asset_list_slash"),
    path(
        "api/assets/<int:pk>/",
        views.AssetAPIDetailView.as_view(),
        name="api_asset_detail",
    ),
    path(
        "api/assets/bulk-delete/",
        views.AssetBulkDeleteAPIView.as_view(),
        name="api_asset_bulk_delete",
    ),
    path(
        "api/assets/<int:pk>/assign/",
        views.AssetAssignAPIView.as_view(),
        name="api_asset_assign",
    ),
    path(
        "api/assets/<int:pk>/return/",
        views.AssetReturnAPIView.as_view(),
        name="api_asset_return",
    ),
    path(
        "api/employees",
        views.EmployeeAPIListView.as_view(),
        name="api_employee_list",
    ),
    path(
        "api/employees/",
        views.EmployeeAPIListView.as_view(),
        name="api_employee_list_slash",
    ),
    path(
        "api/employees/<int:pk>/",
        views.EmployeeAPIDetailView.as_view(),
        name="api_employee_detail",
    ),
    
    # Asset URLs
    path("assets/", views.AssetListView.as_view(), name="asset_list"),
    path(
        "assets/export/csv/",
        views.ExportAssetCSVView.as_view(),
        name="export_asset_csv",
    ),
    path("assets/export.csv", views.ExportAssetCSVView.as_view(), name="asset_export"),
    path(
        "assets/import/csv/validate/",
        views.ImportAssetCSVValidateView.as_view(),
        name="import_asset_csv_validate",
    ),
    path(
        "assets/import/csv/execute/",
        views.ImportAssetCSVExecuteView.as_view(),
        name="import_asset_csv_execute",
    ),
    path(
        "assets/add/",
        views.AssetAddRedirectView.as_view(),
        name="asset_add_redirect",
    ),
    path("assets/<int:pk>/", views.AssetDetailView.as_view(), name="asset_detail"),
    path("assets/<int:pk>/edit/", views.AssetUpdateView.as_view(), name="asset_edit"),
    path("assets/<int:pk>/delete/", views.AssetDeleteView.as_view(), name="asset_delete"),
    path("assets/<int:pk>/assign/", views.AssignAssetView.as_view(), name="assign_asset"),
    path("assets/<int:pk>/return/", views.ReturnAssetView.as_view(), name="return_asset"),
    path(
        "assets/<int:pk>/maintenance/done/",
        views.CompleteMaintenanceView.as_view(),
        name="maintenance_done",
    ),
    path(
        "assets/<int:asset_pk>/maintenance/add/",
        views.MaintenanceLogCreateView.as_view(),
        name="maintenance_log_add",
    ),
    path(
        "maintenance/<int:pk>/edit/",
        views.MaintenanceLogUpdateView.as_view(),
        name="maintenance_log_edit",
    ),
    path(
        "maintenance/<int:pk>/delete/",
        views.MaintenanceLogDeleteView.as_view(),
        name="maintenance_log_delete",
    ),
    
    # Employee URLs
    path("employees/", views.EmployeeListView.as_view(), name="employee_list"),
    path(
        "employees/add/",
        views.EmployeeAddRedirectView.as_view(),
        name="employee_add_redirect",
    ),
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
    
    # ==========================================
    # EMPLOYEE PORTAL URLs
    # ==========================================
    # Dashboard
    path('employee/', views.EmployeeDashboardView.as_view(), name='employee_portal'),
    path('employee/dashboard/', views.EmployeeDashboardView.as_view(), name='employee_dashboard'),
    
    # Assets
    path('employee/assets/', views.EmployeeAssetsView.as_view(), name='employee_assets'),
    path('employee/assets/<int:pk>/', views.EmployeeAssetDetailView.as_view(), name='employee_asset_detail'),
    path('employee/asset/<int:pk>/confirm/', views.EmployeeConfirmAssetView.as_view(), name='employee_confirm_asset'),
    path('employee/asset/<int:pk>/report-issue/', views.EmployeeReportIssueView.as_view(), name='employee_report_issue'),
    path('employee/asset/<int:pk>/maintenance/', views.EmployeeMaintenanceRequestView.as_view(), name='employee_maintenance_request'),
    path('employee/asset/<int:pk>/return/', views.EmployeeReturnRequestView.as_view(), name='employee_return_request'),
    
    # ==========================================
    # EMPLOYEE NOTIFICATIONS (legacy redirect)
    # ==========================================
    path(
        "employee/notifications/",
        RedirectView.as_view(pattern_name="employee_dashboard", permanent=False),
        name="employee_notifications",
    ),
    path('employee/notifications/<int:pk>/mark-read/', views.EmployeeMarkNotificationReadView.as_view(), name='employee_mark_notification_read'),
    path('employee/notifications/mark-all-read/', views.EmployeeMarkAllNotificationsReadView.as_view(), name='employee_mark_all_notifications_read'),
    
    # ==========================================
    # EMPLOYEE PROFILE & SETTINGS
    # ==========================================
    path(
        "employee/profile/",
        RedirectView.as_view(pattern_name="employee_settings", permanent=False),
        name="employee_profile",
    ),
    path('employee/settings/', views.EmployeeSettingsView.as_view(), name='employee_settings'),
    path('employee/settings/password/', views.EmployeePasswordChangeView.as_view(), name='employee_password_change'),
    
    # ==========================================
    # EMPLOYEE HISTORY & RETURNS (legacy redirects)
    # ==========================================
    path(
        "employee/history/",
        RedirectView.as_view(pattern_name="employee_dashboard", permanent=False),
        name="employee_history",
    ),
    path(
        "employee/returns/",
        RedirectView.as_view(pattern_name="employee_dashboard", permanent=False),
        name="employee_returns",
    ),
]