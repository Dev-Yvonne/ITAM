"""Authentication and password-reset views."""

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.views import LoginView
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views import View
from django.views.generic import FormView

from .access import get_post_auth_redirect_url
from .forms import (
    EmailOrUsernameAuthenticationForm,
    ForgotPasswordEmailForm,
    ForgotPasswordSecurityForm,
    ForgotPasswordSetForm,
)
from .services.password_reset import (
    PASSWORD_RESET_EMAIL_SESSION_KEY,
    PASSWORD_RESET_VERIFIED_SESSION_KEY,
    clear_password_reset_session,
    get_user_for_password_reset_email,
)


class AuthLoginView(LoginView):
    template_name = "inventory/auth.html"
    authentication_form = EmailOrUsernameAuthenticationForm
    redirect_authenticated_user = True

    def get_success_url(self):
        return get_post_auth_redirect_url(self.request.user)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = "login"
        context["remember_me"] = bool(self.request.POST.get("remember"))
        return context

    def form_valid(self, form):
        remember_me = self.request.POST.get("remember")
        login(self.request, form.get_user())
        if remember_me:
            self.request.session.set_expiry(settings.SESSION_COOKIE_AGE)
        else:
            self.request.session.set_expiry(0)
        self.request.session.modified = True
        return redirect(self.get_success_url())

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect(get_post_auth_redirect_url(request.user))
        return super().dispatch(request, *args, **kwargs)


class AuthLogoutView(View):
    template_name = "inventory/auth.html"

    def post(self, request, *args, **kwargs):
        logout(request)
        return redirect("login")

    def get(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect(get_post_auth_redirect_url(request.user))
        return redirect("login")


# ============================================
# PASSWORD RESET (security-question flow)
# ============================================

class PasswordResetStepView(FormView):
    """Base for the multi-step forgot-password flow.

    Owns the shared guards: bounce authenticated users to the dashboard,
    require the prior steps' session state, and expose ``page`` to the template.
    """

    template_name = "inventory/auth.html"
    page = ""
    requires_email = False
    requires_verified = False

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect(get_post_auth_redirect_url(request.user))

        if self.requires_email and not request.session.get(
            PASSWORD_RESET_EMAIL_SESSION_KEY
        ):
            return redirect("password_reset")

        if self.requires_verified and not request.session.get(
            PASSWORD_RESET_VERIFIED_SESSION_KEY
        ):
            return redirect("password_reset_verify")

        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page"] = self.page
        return context


class ForgotPasswordEmailView(PasswordResetStepView):
    form_class = ForgotPasswordEmailForm
    page = "password_reset"

    def form_valid(self, form):
        email = form.cleaned_data["email"]
        if get_user_for_password_reset_email(email) is None:
            form.add_error("email", "No account found with this email address.")
            return self.form_invalid(form)

        self.request.session[PASSWORD_RESET_EMAIL_SESSION_KEY] = email
        self.request.session.pop(PASSWORD_RESET_VERIFIED_SESSION_KEY, None)
        return redirect("password_reset_verify")


class ForgotPasswordVerifyView(PasswordResetStepView):
    form_class = ForgotPasswordSecurityForm
    page = "password_reset_verify"
    requires_email = True

    def form_valid(self, form):
        self.request.session[PASSWORD_RESET_VERIFIED_SESSION_KEY] = True
        return redirect("password_reset_set")


class ForgotPasswordSetView(PasswordResetStepView):
    form_class = ForgotPasswordSetForm
    page = "password_reset_set"
    requires_email = True
    requires_verified = True

    def get_reset_user(self):
        email = self.request.session.get(PASSWORD_RESET_EMAIL_SESSION_KEY)
        return get_user_for_password_reset_email(email)

    def get(self, request, *args, **kwargs):
        if self.get_reset_user() is None:
            clear_password_reset_session(request)
            return redirect("password_reset")
        return super().get(request, *args, **kwargs)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["user"] = self.get_reset_user()
        return kwargs

    def form_valid(self, form):
        user = self.get_reset_user()
        if user is None:
            clear_password_reset_session(self.request)
            return redirect("password_reset")

        user.set_password(form.cleaned_data["new_password"])
        user.save(update_fields=["password"])
        clear_password_reset_session(self.request)
        messages.success(self.request, "Your password has been reset. Please sign in.")
        return redirect("login")
