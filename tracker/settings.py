import logging
import os
import sys
from pathlib import Path

import environ

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
IS_VERCEL = bool(os.environ.get("VERCEL"))

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
)

# Local: .env or Vercel CLI: .env.local (never commit either)
for env_path in (BASE_DIR / ".env.local", BASE_DIR / ".env"):
    if env_path.exists():
        try:
            environ.Env.read_env(env_path)
            break
        except Exception as exc:
            logger.warning("Could not read %s: %s", env_path.name, exc)

SECRET_KEY = os.environ.get("SECRET_KEY") or env(
    "SECRET_KEY", default="django-insecure-dev-key-change-in-production"
)
DEBUG = env.bool("DEBUG", default=not IS_VERCEL)

_raw_hosts = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1")
ALLOWED_HOSTS = [host.strip() for host in _raw_hosts.split(",") if host.strip()]
if IS_VERCEL:
    for vercel_host in (".vercel.app", ".now.sh"):
        if vercel_host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(vercel_host)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "inventory",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "tracker.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "inventory.context_processors.itam_version_context",
                "inventory.context_processors.notification_context",
                "inventory.context_processors.avatar_context",
            ],
        },
    },
]

WSGI_APPLICATION = "tracker.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME") or env("DB_NAME", default="postgres"),
        "USER": os.environ.get("DB_USER") or env("DB_USER", default="postgres"),
        "PASSWORD": os.environ.get("DB_PASSWORD") or env("DB_PASSWORD", default=""),
        "HOST": os.environ.get("DB_HOST") or env("DB_HOST", default="localhost"),
        "PORT": os.environ.get("DB_PORT") or env("DB_PORT", default="5432"),
        "OPTIONS": {
            "sslmode": os.environ.get("DB_SSLMODE") or env("DB_SSLMODE", default="require"),
            "gssencmode": os.environ.get("DB_GSSENCMODE")
            or env("DB_GSSENCMODE", default="disable"),
        },
    }
}

if "test" in sys.argv:
    DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "test.sqlite3",
    }
elif DATABASES["default"]["ENGINE"].endswith("postgresql"):
    DATABASES["default"]["CONN_MAX_AGE"] = 0
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = env("TIME_ZONE", default="Africa/Nairobi")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
WHITENOISE_USE_FINDERS = DEBUG

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

SUPABASE_URL = os.environ.get("SUPABASE_URL") or env("SUPABASE_URL", default="")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or env(
    "SUPABASE_SERVICE_ROLE_KEY", default=""
)
SUPABASE_AVATAR_BUCKET = os.environ.get("SUPABASE_AVATAR_BUCKET") or env(
    "SUPABASE_AVATAR_BUCKET", default="avatars"
)

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]
vercel_url = os.environ.get("VERCEL_URL")
if vercel_url:
    origin = f"https://{vercel_url}"
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "dashboard"
LOGOUT_REDIRECT_URL = "login"

SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_AGE = env.int("SESSION_COOKIE_AGE", default=60 * 60 * 24 * 14)
SESSION_SAVE_EVERY_REQUEST = True
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

BACKGROUND_JOB_POLL_MS = env.int("BACKGROUND_JOB_POLL_MS", default=1500)
BACKGROUND_JOB_RESULT_TTL_SECONDS = env.int(
    "BACKGROUND_JOB_RESULT_TTL_SECONDS", default=120
)
BACKGROUND_JOB_CSV_ASYNC_MIN_ASSETS = env.int(
    "BACKGROUND_JOB_CSV_ASYNC_MIN_ASSETS", default=100
)
BACKGROUND_JOBS_USE_THREADS = env.bool(
    "BACKGROUND_JOBS_USE_THREADS",
    default=not IS_VERCEL and "test" not in sys.argv,
)