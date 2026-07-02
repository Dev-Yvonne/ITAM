import sys
from pathlib import Path
import os

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

# Initialize environ
env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
)

# Try to read .env file safely
env_file = BASE_DIR / ".env"
if env_file.exists():
    try:
        environ.Env.read_env(env_file)
        print(".env file loaded successfully")
    except Exception as e:
        print(f"Warning: Could not read .env file: {e}")
        print("Using environment variables or defaults instead.")
else:
    print("No .env file found. Using environment variables or defaults.")

# Get settings from environment or use defaults
SECRET_KEY = os.environ.get("SECRET_KEY") or env("SECRET_KEY", default="django-insecure-dev-key-change-in-production")
DEBUG = os.environ.get("DEBUG", "True").lower() in ("true", "1", "yes") or env("DEBUG", default=True)
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") or env("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# Application definition
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
            ],
        },
    },
]

WSGI_APPLICATION = "tracker.wsgi.application"

# Database Configuration
# Choose one of the following configurations:

# Option 1: PostgreSQL (for production with Supabase)
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
            "gssencmode": os.environ.get("DB_GSSENCMODE") or env("DB_GSSENCMODE", default="disable"),
        },
    }
}

# Uncomment below to use SQLite for local development instead
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.sqlite3',
#         'NAME': BASE_DIR / 'db.sqlite3',
#     }
# }

if "test" in sys.argv:
    DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "test.sqlite3",
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = env("TIME_ZONE", default="Africa/Nairobi")
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Media files (user uploaded files)
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

CSRF_TRUSTED_ORIGINS = [
    origin
    for origin in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin
]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Login/Logout URLs
LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "dashboard"
LOGOUT_REDIRECT_URL = "dashboard"

# Print configuration status
print("\nConfiguration Summary:")
print(f"   DEBUG: {DEBUG}")
print(f"   ALLOWED_HOSTS: {ALLOWED_HOSTS}")
print(f"   Database: {DATABASES['default']['ENGINE']}")
print(f"   Database Host: {DATABASES['default'].get('HOST', 'local')}")
print(f"   Database Port: {DATABASES['default'].get('PORT', 'default')}")
print("Configuration loaded successfully.\n")