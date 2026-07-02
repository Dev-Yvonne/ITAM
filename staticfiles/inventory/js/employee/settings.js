(function() {
    'use strict';

    function getCSRFToken() {
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

    function updateNotificationBadge(count) {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;

        badge.textContent = '';
        badge.classList.toggle('hidden', count <= 0);
    }

    function addNotificationToDropdown(notification) {
        const list = document.querySelector('.notification-dropdown-list');
        if (!list || !notification) return;

        const emptyState = list.querySelector('.notification-empty');
        if (emptyState) {
            emptyState.remove();
        }

        const item = document.createElement('div');
        item.className = 'notification-item unread';
        item.dataset.id = notification.id;
        item.innerHTML = `
            <div class="notification-icon notification-${notification.type}">
                <i class="fas fa-check-circle"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title"></div>
                <div class="notification-message"></div>
                <div class="notification-time"></div>
            </div>
        `;
        item.querySelector('.notification-title').textContent = notification.title || '';
        item.querySelector('.notification-message').textContent = notification.message || '';
        item.querySelector('.notification-time').textContent = notification.created_label || 'Just now';
        list.prepend(item);
    }

    function openModal(modal) {
        if (!modal) return;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        const firstInput = modal.querySelector('input');
        if (firstInput) {
            firstInput.focus();
        }
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function initPasswordModal() {
        const openButton = document.getElementById('openPasswordModal');
        const modal = document.getElementById('passwordModal');
        const form = document.getElementById('passwordChangeForm');
        const errorBox = document.getElementById('passwordModalError');
        const submitButton = document.getElementById('submitPasswordChange');

        if (!openButton || !modal || !form) return;

        openButton.addEventListener('click', () => {
            form.reset();
            if (errorBox) {
                errorBox.textContent = '';
                errorBox.classList.remove('visible');
            }
            openModal(modal);
        });

        modal.querySelectorAll('[data-close-password-modal]').forEach((element) => {
            element.addEventListener('click', () => closeModal(modal));
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (errorBox) {
                errorBox.textContent = '';
                errorBox.classList.remove('visible');
            }

            const formData = new FormData(form);
            const payload = {
                new_password: formData.get('new_password'),
                confirm_password: formData.get('confirm_password'),
            };

            if (payload.new_password !== payload.confirm_password) {
                if (errorBox) {
                    errorBox.textContent = 'Passwords do not match.';
                    errorBox.classList.add('visible');
                }
                return;
            }

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Changing...';
            }

            try {
                const response = await fetch('/employee/settings/password/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCSRFToken(),
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload),
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'Unable to change password.');
                }

                updateNotificationBadge(data.unread_count || 1);
                addNotificationToDropdown(data.notification);
                closeModal(modal);
                showToast('Password changed successfully.', 'success');
            } catch (error) {
                if (errorBox) {
                    errorBox.textContent = error.message;
                    errorBox.classList.add('visible');
                }
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Change Password';
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