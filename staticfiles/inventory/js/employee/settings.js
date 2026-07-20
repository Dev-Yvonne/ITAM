(function() {
    'use strict';

    function getCSRFToken() {
        if (window.Utils && typeof window.Utils.getCSRFToken === 'function') {
            return window.Utils.getCSRFToken();
        }

        if (window.EmployeeCommon && typeof window.EmployeeCommon.getCSRFToken === 'function') {
            return window.EmployeeCommon.getCSRFToken();
        }

        const cookie = document.cookie
            .split(';')
            .map((item) => item.trim())
            .find((item) => item.startsWith('csrftoken='));
        return cookie ? cookie.substring('csrftoken='.length) : '';
    }

    function showToast(message, type) {
        if (window.EmployeeCommon && typeof window.EmployeeCommon.showToast === 'function') {
            window.EmployeeCommon.showToast(message, type);
        } else if (window.showToast) {
            window.showToast(message, type);
        }
    }

    function showModalError(errorBox, message) {
        if (!errorBox) {
            return;
        }
        errorBox.textContent = message;
        errorBox.classList.add('show');
    }

    function clearModalError(errorBox) {
        if (!errorBox) {
            return;
        }
        errorBox.textContent = '';
        errorBox.classList.remove('show');
    }

    function updateNotificationBadge(count) {
        const badge = document.getElementById('notificationBadge');
        if (!badge) {
            return;
        }

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.classList.remove('hidden');
        } else {
            badge.textContent = '';
            badge.classList.add('hidden');
        }
    }

    function addNotificationToDropdown(notification) {
        const list = document.getElementById('notificationDropdownList')
            || document.querySelector('.notification-dropdown-list');
        if (!list || !notification) {
            return;
        }

        const emptyState = list.querySelector('.notification-empty');
        if (emptyState) {
            emptyState.remove();
        }

        const item = document.createElement('div');
        item.className = 'notification-item unread';
        item.dataset.notificationId = notification.id;
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.innerHTML =
            '<div class="notification-icon ' + (notification.type || 'success') + '" aria-hidden="true">' +
                '<i class="fas fa-check-circle"></i>' +
            '</div>' +
            '<div class="notification-content">' +
                '<div class="notification-heading">' +
                    '<div class="notification-title"></div>' +
                    '<div class="notification-time"></div>' +
                '</div>' +
                '<div class="notification-message"></div>' +
            '</div>';
        item.querySelector('.notification-title').textContent = notification.title || '';
        item.querySelector('.notification-message').textContent = notification.message || '';
        item.querySelector('.notification-time').textContent = notification.created_label || 'Just now';
        list.prepend(item);
    }

    function openModal(modal) {
        if (!modal) {
            return;
        }
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('employee-modal-open');

        const firstInput = modal.querySelector('#id_current_password');
        if (firstInput) {
            window.setTimeout(function() {
                firstInput.focus();
            }, 0);
        }
    }

    function closeModal(modal) {
        if (!modal) {
            return;
        }
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('employee-modal-open');
    }

    function validatePasswordPayload(payload, errorBox) {
        if (!payload.current_password) {
            showModalError(errorBox, 'Enter your current password.');
            return false;
        }

        if (!payload.new_password || !payload.confirm_password) {
            showModalError(errorBox, 'Enter and confirm your new password.');
            return false;
        }

        if (payload.new_password.length < 8) {
            showModalError(errorBox, 'Password must be at least 8 characters long.');
            return false;
        }

        if (payload.new_password !== payload.confirm_password) {
            showModalError(errorBox, 'Passwords do not match.');
            return false;
        }

        return true;
    }

    function initPasswordModal() {
        const openButton = document.getElementById('openPasswordModal');
        const modal = document.getElementById('passwordModal');
        const form = document.getElementById('passwordChangeForm');
        const errorBox = document.getElementById('passwordModalError');
        const submitButton = document.getElementById('submitPasswordChange');

        if (!openButton || !modal || !form) {
            return;
        }

        openButton.addEventListener('click', function() {
            form.reset();
            clearModalError(errorBox);
            openModal(modal);
        });

        modal.querySelectorAll('[data-close-password-modal]').forEach(function(element) {
            element.addEventListener('click', function() {
                closeModal(modal);
            });
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && modal.classList.contains('active')) {
                closeModal(modal);
            }
        });

        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            clearModalError(errorBox);

            const formData = new FormData(form);
            const payload = {
                current_password: String(formData.get('current_password') || ''),
                new_password: String(formData.get('new_password') || '').trim(),
                confirm_password: String(formData.get('confirm_password') || '').trim(),
            };

            if (!validatePasswordPayload(payload, errorBox)) {
                return;
            }

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Saving...';
            }

            try {
                const response = await fetch('/employee/settings/password/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRFToken': getCSRFToken(),
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload),
                });
                const parser = window.Utils && window.Utils.parseJsonResponse
                    ? window.Utils.parseJsonResponse(response)
                    : response.json();
                const data = await parser;

                if (!response.ok || !data.success) {
                    throw new Error(
                        window.Utils
                            ? window.Utils.extractApiError(data, 'Unable to change password.')
                            : (data.message || 'Unable to change password.')
                    );
                }

                if (typeof data.unread_count === 'number') {
                    updateNotificationBadge(data.unread_count);
                }
                if (data.notification) {
                    addNotificationToDropdown(data.notification);
                }

                form.reset();
                closeModal(modal);
                showToast('Password changed successfully. Use your new password next time you sign in.', 'success');
            } catch (error) {
                showModalError(
                    errorBox,
                    window.Utils
                        ? window.Utils.getUserFacingError(error, 'Unable to change password.')
                        : 'Unable to change password.'
                );
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Save New Password';
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPasswordModal);
    } else {
        initPasswordModal();
    }
})();
