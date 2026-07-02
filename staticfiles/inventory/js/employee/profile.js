// inventory/static/inventory/js/profile.js

(function() {
    'use strict';

    async function fetchProfile() {
        const response = await fetch('/api/profile/');
        if (!response.ok) throw new Error('Failed to load profile');
        return response.json();
    }

    async function updateProfile(data) {
        const response = await fetch('/api/profile/', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            credentials: 'same-origin',
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Update failed');
        return response.json();
    }

    function getCSRFToken() {
        // same as before
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
        container.querySelector('#profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const payload = Object.fromEntries(formData.entries());
            try {
                const result = await updateProfile(payload);
                if (window.showToast) {
                    window.showToast('✅ Profile updated!', 'success');
                }
            } catch (error) {
                if (window.showToast) {
                    window.showToast('❌ ' + error.message, 'error');
                }
            }
        });
    }

    window.ProfileModule = {
        fetchProfile,
        updateProfile,
        renderProfileForm,
    };

})();