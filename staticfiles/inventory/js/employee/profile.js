// inventory/static/inventory/js/profile.js

(function() {
    'use strict';

    // ============================================
    // CSRF Token Helper
    // ============================================
    function getCSRFToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // ============================================
    // API Functions
    // ============================================
    async function fetchProfile() {
        if (window.Utils && typeof window.Utils.fetchJson === 'function') {
            return window.Utils.fetchJson('/api/profile/');
        }
        const response = await fetch('/api/profile/', {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('Failed to load profile');
        return response.json();
    }

    async function updateProfile(data) {
        if (window.Utils && typeof window.Utils.fetchJson === 'function') {
            return window.Utils.fetchJson('/api/profile/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        }
        const response = await fetch('/api/profile/', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            credentials: 'same-origin',
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Update failed');
        return response.json();
    }

    function friendlyError(error, fallback) {
        if (window.Utils && typeof window.Utils.getUserFacingError === 'function') {
            return window.Utils.getUserFacingError(error, fallback);
        }
        return fallback;
    }

    function safeHtml(value) {
        if (window.Utils && typeof window.Utils.escapeHtml === 'function') {
            return window.Utils.escapeHtml(value);
        }
        return String(value == null ? '' : value);
    }

    // ============================================
    // Render Profile Form
    // ============================================
    function renderProfileForm(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <form id="profile-form">
                <div class="mb-3">
                    <label class="form-label">Name</label>
                    <input type="text" class="form-control" name="name" value="${data.name || ''}" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-control" name="email" value="${data.email || ''}">
                </div>
                <div class="mb-3">
                    <label class="form-label">Department</label>
                    <input type="text" class="form-control" name="department" value="${data.department || ''}">
                </div>
                <button type="submit" class="btn btn-primary">Update Profile</button>
            </form>
        `;

        const form = container.querySelector('#profile-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const payload = Object.fromEntries(formData.entries());

            try {
                await updateProfile(payload);
                if (window.showToast) {
                    window.showToast('✅ Profile updated!', 'success');
                }
            } catch (error) {
                if (window.showToast) {
                    window.showToast(friendlyError(error, 'Unable to update profile.'), 'error');
                }
            }
        });
    }

    // ============================================
    // Toast Helper (fallback if not available)
    // ============================================
    function showToast(message, type) {
        if (window.showToast) {
            window.showToast(message, type);
            return;
        }
        // Fallback alert if toast function doesn't exist
        alert(message);
    }

    // ============================================
    // Load and Render Profile on Page
    // ============================================
    async function loadProfile(containerId) {
        try {
            const data = await fetchProfile();
            renderProfileForm(data, containerId);
        } catch (error) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML =
                    '<div class="alert alert-danger">' +
                        '<i class="fas fa-exclamation-circle"></i> ' +
                        safeHtml(friendlyError(error, 'Unable to load profile. Refresh the page and try again.')) +
                    '</div>';
            }
        }
    }

    // ============================================
    // Auto-init if container exists
    // ============================================
    function init() {
        const container = document.getElementById('profile-container');
        if (container) {
            loadProfile('profile-container');
        }
    }

    // ============================================
    // Export
    // ============================================
    window.ProfileModule = {
        fetchProfile,
        updateProfile,
        renderProfileForm,
        loadProfile,
        init,
    };

    // ============================================
    // Auto-init on DOM ready
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();