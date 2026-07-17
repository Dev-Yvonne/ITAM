/**
 * Add Employee Modal — create employees via API without leaving the page
 */
(function() {
    'use strict';

    var previouslyFocused = null;
    var submitting = false;
    var els = {};

    function getCsrf() {
        if (window.Utils && typeof window.Utils.getCSRFToken === 'function') {
            return window.Utils.getCSRFToken();
        }
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) {
            return meta.content;
        }
        var match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function toast(message, type) {
        if (window.Utils && typeof window.Utils.showToast === 'function') {
            window.Utils.showToast(message, type);
        }
    }

    function clearErrors() {
        if (els.formError) {
            els.formError.hidden = true;
            els.formError.textContent = '';
        }
        if (!els.modal) {
            return;
        }
        els.modal.querySelectorAll('[data-field-error]').forEach(function(node) {
            node.hidden = true;
            node.textContent = '';
        });
        els.modal.querySelectorAll('.form-group.has-error').forEach(function(group) {
            group.classList.remove('has-error');
        });
    }

    function showFormError(message) {
        if (!els.formError) {
            return;
        }
        els.formError.textContent = message;
        els.formError.hidden = !message;
    }

    function showFieldError(fieldName, message) {
        var node = els.modal.querySelector('[data-field-error="' + fieldName + '"]');
        if (!node) {
            return;
        }
        node.textContent = message;
        node.hidden = !message;
        var group = node.closest('.form-group');
        if (group) {
            group.classList.toggle('has-error', !!message);
        }
    }

    function parseDjangoFieldError(value) {
        if (!value) {
            return '';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (Array.isArray(value) && value.length) {
            var first = value[0];
            if (typeof first === 'string') {
                return first;
            }
            if (first && typeof first.message === 'string') {
                return first.message;
            }
        }
        if (typeof value.message === 'string') {
            return value.message;
        }
        return String(value);
    }

    function applyApiErrors(errors) {
        if (!errors || typeof errors !== 'object') {
            return false;
        }
        var applied = false;
        Object.keys(errors).forEach(function(key) {
            var message = parseDjangoFieldError(errors[key]);
            if (!message) {
                return;
            }
            applied = true;
            if (key === '__all__' || key === 'non_field_errors') {
                showFormError(message);
            } else {
                showFieldError(key, message);
            }
        });
        return applied;
    }

    function resetForm() {
        if (els.form) {
            els.form.reset();
        }
        clearErrors();
        submitting = false;
        if (els.submitBtn) {
            els.submitBtn.disabled = false;
            els.submitBtn.innerHTML = '<i class="fas fa-user-plus" aria-hidden="true"></i> Save Employee';
        }
    }

    function openModal() {
        if (!els.modal) {
            return;
        }
        if (window.AddAssetModal && typeof window.AddAssetModal.close === 'function') {
            window.AddAssetModal.close();
        }
        previouslyFocused = document.activeElement;
        resetForm();
        els.modal.classList.add('open');
        els.modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('add-employee-modal-open');
        if (els.username) {
            setTimeout(function() {
                els.username.focus();
            }, 50);
        }
    }

    function closeModal() {
        if (!els.modal) {
            return;
        }
        els.modal.classList.remove('open');
        els.modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('add-employee-modal-open');
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
        previouslyFocused = null;
    }

    function isOpen() {
        return !!(els.modal && els.modal.classList.contains('open'));
    }

    function syncAfterCreate() {
        if (window.Notifications && typeof window.Notifications.fetchNotifications === 'function') {
            window.Notifications.fetchNotifications();
        }
        if (window.Dashboard && typeof window.Dashboard.refresh === 'function') {
            window.Dashboard.refresh();
        }
        if (window.Reports && typeof window.Reports.refresh === 'function') {
            window.Reports.refresh();
        }

        var path = window.location.pathname || '';
        if (/^\/employees\/?$/.test(path)) {
            window.location.reload();
        }
    }

    function validateClient() {
        clearErrors();
        var valid = true;
        if (!els.username.value.trim()) {
            showFieldError('username', 'This field is required.');
            valid = false;
        }
        if (!els.email.value.trim()) {
            showFieldError('email', 'This field is required.');
            valid = false;
        }
        if (!els.department.value) {
            showFieldError('department', 'This field is required.');
            valid = false;
        }
        if (!els.password.value) {
            showFieldError('password', 'This field is required.');
            valid = false;
        }
        if (!els.confirmPassword.value) {
            showFieldError('confirm_password', 'This field is required.');
            valid = false;
        } else if (els.password.value && els.password.value !== els.confirmPassword.value) {
            showFieldError('confirm_password', 'Passwords do not match.');
            valid = false;
        }
        return valid;
    }

    async function submitForm(event) {
        event.preventDefault();
        if (submitting) {
            return;
        }
        if (!validateClient()) {
            return;
        }

        var createUrl = els.modal.getAttribute('data-create-url') || '/api/employees';
        submitting = true;
        els.submitBtn.disabled = true;
        els.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        clearErrors();

        try {
            var response = await fetch(createUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRFToken': getCsrf()
                },
                body: JSON.stringify({
                    username: els.username.value.trim(),
                    email: els.email.value.trim(),
                    department: els.department.value,
                    password: els.password.value,
                    confirm_password: els.confirmPassword.value
                })
            });

            var data = {};
            try {
                data = await response.json();
            } catch (parseError) {
                data = {};
            }

            if (!response.ok) {
                if (data.errors && applyApiErrors(data.errors)) {
                    throw new Error('Please fix the highlighted fields.');
                }
                var message = window.Utils
                    ? window.Utils.extractApiError(data, 'Could not create employee.')
                    : (data.detail || 'Could not create employee.');
                showFormError(message);
                throw new Error(message);
            }

            toast('Employee created successfully.', 'success');
            closeModal();
            syncAfterCreate();
        } catch (error) {
            if (!els.formError || els.formError.hidden) {
                showFormError(
                    window.Utils
                        ? window.Utils.getUserFacingError(error, 'Could not create employee.')
                        : (error.message || 'Could not create employee.')
                );
            }
        } finally {
            submitting = false;
            if (els.submitBtn) {
                els.submitBtn.disabled = false;
                els.submitBtn.innerHTML = '<i class="fas fa-user-plus" aria-hidden="true"></i> Save Employee';
            }
        }
    }

    function shouldOpenFromTrigger(target) {
        if (!target || !target.closest) {
            return null;
        }
        return target.closest('[data-open-add-employee]');
    }

    function bindTriggers() {
        document.addEventListener('click', function(event) {
            var trigger = shouldOpenFromTrigger(event.target);
            if (!trigger) {
                return;
            }
            event.preventDefault();
            openModal();
        });
    }

    function bindModalChrome() {
        if (!els.modal) {
            return;
        }
        els.modal.querySelectorAll('[data-add-employee-close]').forEach(function(node) {
            node.addEventListener('click', closeModal);
        });
        if (els.form) {
            els.form.addEventListener('submit', submitForm);
        }
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && isOpen()) {
                closeModal();
            }
        });
    }

    function maybeAutoOpen() {
        try {
            var params = new URLSearchParams(window.location.search);
            if (params.get('addEmployee') === '1' || params.get('add_employee') === '1') {
                openModal();
                params.delete('addEmployee');
                params.delete('add_employee');
                var next = params.toString();
                var cleanUrl = window.location.pathname + (next ? '?' + next : '') + window.location.hash;
                window.history.replaceState({}, '', cleanUrl);
            }
        } catch (error) {
            // Ignore URL API issues
        }
    }

    function init() {
        els.modal = document.getElementById('add-employee-modal');
        if (!els.modal) {
            return;
        }
        els.form = document.getElementById('add-employee-form');
        els.username = document.getElementById('add-employee-username');
        els.email = document.getElementById('add-employee-email');
        els.department = document.getElementById('add-employee-department');
        els.password = document.getElementById('add-employee-password');
        els.confirmPassword = document.getElementById('add-employee-confirm-password');
        els.formError = document.getElementById('add-employee-form-error');
        els.submitBtn = document.getElementById('add-employee-submit-btn');

        bindTriggers();
        bindModalChrome();
        maybeAutoOpen();
    }

    window.AddEmployeeModal = {
        init: init,
        open: openModal,
        close: closeModal
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
