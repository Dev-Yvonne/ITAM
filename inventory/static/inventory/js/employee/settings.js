// inventory/static/inventory/js/settings.js

(function() {
    'use strict';

    const SETTINGS_KEY = 'itam_employee_settings';

    function loadSettings() {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            try {
                return JSON.parse(raw);
            } catch (e) { /* ignore */ }
        }
        return {
            theme: 'light',
            notifications: true,
            // other defaults
        };
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-bs-theme', theme);
    }

    function renderSettingsForm(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const settings = loadSettings();
        container.innerHTML = `
            <form id="settings-form">
                <div class="mb-3">
                    <label class="form-label">Theme</label>
                    <select class="form-select" name="theme">
                        <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
                        <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
                    </select>
                </div>
                <div class="mb-3 form-check">
                    <input type="checkbox" class="form-check-input" name="notifications" id="notifCheck" ${settings.notifications ? 'checked' : ''}>
                    <label class="form-check-label" for="notifCheck">Enable Notifications</label>
                </div>
                <button type="submit" class="btn btn-primary">Save Settings</button>
            </form>
        `;
        container.querySelector('#settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const newSettings = {
                theme: formData.get('theme'),
                notifications: formData.get('notifications') === 'on',
            };
            saveSettings(newSettings);
            applyTheme(newSettings.theme);
            if (window.showToast) {
                window.showToast('✅ Settings saved!', 'success');
            }
        });
    }

    // Apply theme on load
    const settings = loadSettings();
    applyTheme(settings.theme);

    window.SettingsModule = {
        loadSettings,
        saveSettings,
        renderSettingsForm,
        applyTheme,
    };

})();