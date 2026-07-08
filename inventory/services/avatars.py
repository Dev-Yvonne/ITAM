from __future__ import annotations

import logging
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.core.exceptions import ValidationError

from ..models import UserProfile
from . import supabase_storage

logger = logging.getLogger(__name__)

MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_AVATAR_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}


class AvatarValidationError(ValidationError):
    pass


class AvatarStorageError(Exception):
    pass


def ui_avatar_url(user, size: int = 128) -> str:
    label = (getattr(user, "first_name", None) or getattr(user, "username", None) or "User").strip()
    if not label:
        label = "User"
    name = quote(label)
    return (
        f"https://ui-avatars.com/api/?name={name}"
        f"&background=random&color=fff&size={size}"
        f"&rounded=true&bold=true&font-size=0.33"
    )


def _avatar_cache_bust(url: str, profile: UserProfile) -> str:
    if not profile.updated_at:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}v={int(profile.updated_at.timestamp())}"


def get_user_avatar_url(user, size: int = 128) -> str:
    if not user or not getattr(user, "is_authenticated", False):
        return ui_avatar_url(user, size=size)

    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        return ui_avatar_url(user, size=size)

    if profile.avatar_url:
        return _avatar_cache_bust(profile.avatar_url, profile)
    return ui_avatar_url(user, size=size)


def get_user_avatar_urls(user) -> dict[str, str]:
    return {
        "small": get_user_avatar_url(user, size=32),
        "medium": get_user_avatar_url(user, size=64),
        "large": get_user_avatar_url(user, size=128),
    }


def validate_avatar_upload(uploaded_file) -> None:
    if not uploaded_file:
        raise AvatarValidationError("No image file was provided.")

    if uploaded_file.size > MAX_AVATAR_SIZE_BYTES:
        raise AvatarValidationError("Image must be 5 MB or smaller.")

    content_type = getattr(uploaded_file, "content_type", "") or ""
    if content_type and content_type not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise AvatarValidationError("Please upload a JPEG, PNG, GIF, or WebP image.")


def should_use_supabase_storage() -> bool:
    if supabase_storage.is_configured():
        return True
    if getattr(settings, "IS_VERCEL", False):
        return True
    return False


def _local_avatar_path(user_id: int, uploaded_file) -> Path:
    storage_key = supabase_storage.avatar_storage_key(user_id, uploaded_file)
    return Path(settings.MEDIA_ROOT) / "avatars" / storage_key


def _save_avatar_locally(user_id: int, uploaded_file) -> tuple[str, str]:
    destination = _local_avatar_path(user_id, uploaded_file)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        for chunk in uploaded_file.chunks():
            handle.write(chunk)

    storage_key = destination.name
    avatar_url = f"{settings.MEDIA_URL}avatars/{storage_key}"
    return avatar_url, storage_key


def _delete_local_avatar(storage_key: str) -> None:
    if not storage_key:
        return
    path = Path(settings.MEDIA_ROOT) / "avatars" / storage_key
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Failed to delete local avatar %s", path, exc_info=True)


def _infer_avatar_storage_backend(profile: UserProfile) -> str:
    if profile.avatar_storage_backend:
        return profile.avatar_storage_backend
    if profile.avatar_url.startswith("http"):
        return UserProfile.AvatarStorageBackend.SUPABASE
    return UserProfile.AvatarStorageBackend.LOCAL


def delete_existing_avatar(profile: UserProfile) -> None:
    if not profile.avatar_storage_key and profile.avatar_url:
        profile.avatar_storage_key = supabase_storage.storage_key_from_avatar_url(
            profile.avatar_url
        )

    if not profile.avatar_storage_key:
        return

    backend = _infer_avatar_storage_backend(profile)
    if backend == UserProfile.AvatarStorageBackend.SUPABASE:
        supabase_storage.delete_avatar(profile.avatar_storage_key)
    else:
        _delete_local_avatar(profile.avatar_storage_key)


def save_user_avatar(user, uploaded_file) -> str:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    delete_existing_avatar(profile)

    if should_use_supabase_storage():
        if not supabase_storage.is_configured():
            raise AvatarStorageError(
                "Avatar storage is not configured. Set SUPABASE_URL and "
                "SUPABASE_SERVICE_ROLE_KEY in your environment."
            )
        avatar_url = supabase_storage.upload_avatar(user.id, uploaded_file)
        storage_key = supabase_storage.storage_key_from_avatar_url(avatar_url)
        backend = UserProfile.AvatarStorageBackend.SUPABASE
    else:
        avatar_url, storage_key = _save_avatar_locally(user.id, uploaded_file)
        backend = UserProfile.AvatarStorageBackend.LOCAL

    profile.avatar_url = avatar_url
    profile.avatar_storage_key = storage_key
    profile.avatar_storage_backend = backend
    profile.save(
        update_fields=[
            "avatar_url",
            "avatar_storage_key",
            "avatar_storage_backend",
            "updated_at",
        ]
    )
    return get_user_avatar_url(user, size=128)
