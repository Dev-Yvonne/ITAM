/**
 * SETTINGS MODULE - ITAM SYSTEM
 * Handles settings page functionality
 */

(function() {
    'use strict';
    
    var initialized = false;
    
    // ============================================
    // Initialize Settings
    // ============================================
    function init() {
        if (initialized) {
            return;
        }
        
        console.log('Settings module initializing...');
        
        setupThemeToggles();
        setupSaveButton();
        setupResetButton();
        setupSelectChanges();
        setupToggleSwitches();
        
        initialized = true;
        console.log('Settings module initialized.');
    }
    
    // ============================================
    // Setup Theme Toggles
    // ============================================
    function setupThemeToggles() {
        var lightBtn = document.getElementById('lightModeBtn');
        var darkBtn = document.getElementById('darkModeBtn');
        var systemBtn = document.getElementById('systemModeBtn');
        
        if (!lightBtn || !darkBtn || !systemBtn) return;
        
        // Get current theme
        var currentTheme = localStorage.getItem('itam_theme') || 'light';
        
        // Set active button based on current theme
        if (currentTheme === 'dark') {
            darkBtn.classList.add('active');
            lightBtn.classList.remove('active');
            systemBtn.classList.remove('active');
        } else if (currentTheme === 'light') {
            lightBtn.classList.add('active');
            darkBtn.classList.remove('active');
            systemBtn.classList.remove('active');
        } else {
            systemBtn.classList.add('active');
            lightBtn.classList.remove('active');
            darkBtn.classList.remove('active');
        }
        
        // Light mode
        lightBtn.addEventListener('click', function() {
            setActiveTheme(this);
            if (window.Theme && typeof window.Theme.setTheme === 'function') {
                window.Theme.setTheme('light');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('itam_theme', 'light');
            }
        });
        
        // Dark mode
        darkBtn.addEventListener('click', function() {
            setActiveTheme(this);
            if (window.Theme && typeof window.Theme.setTheme === 'function') {
                window.Theme.setTheme('dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('itam_theme', 'dark');
            }
        });
        
        // System mode
        systemBtn.addEventListener('click', function() {
            setActiveTheme(this);
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            var theme = prefersDark ? 'dark' : 'light';
            if (window.Theme && typeof window.Theme.setTheme === 'function') {
                window.Theme.setTheme(theme);
            } else {
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('itam_theme', theme);
            }
        });
    }
    
    // ============================================
    // Set Active Theme Button
    // ============================================
    function setActiveTheme(activeBtn) {
        var buttons = document.querySelectorAll('.settings-toggle-btn');
        buttons.forEach(function(btn) {
            btn.classList.remove('active');
        });
        activeBtn.classList.add('active');
    }
    
    // ============================================
    // Setup Save Button
    // ============================================
    function setupSaveButton() {
        var saveBtn = document.getElementById('saveSettings');
        if (!saveBtn) return;
        
        saveBtn.addEventListener('click', function() {
            // Collect all settings
            var settings = {
                theme: getCurrentTheme(),
                itemsPerPage: document.getElementById('itemsPerPage')?.value || '25',
                sessionTimeout: document.getElementById('sessionTimeout')?.value || '60',
                overdueReminders: document.getElementById('overdueReminders')?.checked || false
            };
            
            // Save to localStorage
            localStorage.setItem('settings', JSON.stringify(settings));
            
            // Show success message
            showToast('Settings saved successfully!', 'success');
            console.log('Settings saved:', settings);
        });
    }
    
    // ============================================
    // Setup Reset Button
    // ============================================
    function setupResetButton() {
        var resetBtn = document.getElementById('resetSettings');
        if (!resetBtn) return;
        
        resetBtn.addEventListener('click', function() {
            // Reset to defaults
            var defaultSettings = {
                theme: 'light',
                itemsPerPage: '25',
                sessionTimeout: '60',
                overdueReminders: true
            };
            
            // Apply defaults
            localStorage.setItem('settings', JSON.stringify(defaultSettings));
            
            // Reset UI
            var itemsPerPage = document.getElementById('itemsPerPage');
            if (itemsPerPage) itemsPerPage.value = '25';
            
            var sessionTimeout = document.getElementById('sessionTimeout');
            if (sessionTimeout) sessionTimeout.value = '60';
            
            var overdueReminders = document.getElementById('overdueReminders');
            if (overdueReminders) overdueReminders.checked = true;
            
            // Reset theme
            if (window.Theme && typeof window.Theme.setTheme === 'function') {
                window.Theme.setTheme('light');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('itam_theme', 'light');
            }
            
            // Reset active button
            var lightBtn = document.getElementById('lightModeBtn');
            if (lightBtn) {
                var buttons = document.querySelectorAll('.settings-toggle-btn');
                buttons.forEach(function(btn) {
                    btn.classList.remove('active');
                });
                lightBtn.classList.add('active');
            }
            
            showToast('Settings reset to defaults.', 'info');
            console.log('Settings reset to defaults');
        });
    }
    
    // ============================================
    // Get Current Theme
    // ============================================
    function getCurrentTheme() {
        var theme = localStorage.getItem('itam_theme');
        if (!theme) {
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            theme = prefersDark ? 'dark' : 'light';
        }
        return theme;
    }
    
    // ============================================
    // Setup Select Changes
    // ============================================
    function setupSelectChanges() {
        var selects = document.querySelectorAll('.settings-select');
        selects.forEach(function(select) {
            // Load saved value
            var savedSettings = localStorage.getItem('settings');
            if (savedSettings) {
                try {
                    var settings = JSON.parse(savedSettings);
                    if (settings[select.id]) {
                        select.value = settings[select.id];
                    }
                } catch (e) {
                    console.warn('Error parsing saved settings:', e);
                }
            }
            
            // Save on change
            select.addEventListener('change', function() {
                var savedSettings = localStorage.getItem('settings');
                var settings = savedSettings ? JSON.parse(savedSettings) : {};
                settings[this.id] = this.value;
                localStorage.setItem('settings', JSON.stringify(settings));
            });
        });
    }
    
    // ============================================
    // Setup Toggle Switches
    // ============================================
    function setupToggleSwitches() {
        var toggles = document.querySelectorAll('.settings-toggle-switch input[type="checkbox"]');
        toggles.forEach(function(toggle) {
            // Load saved value
            var savedSettings = localStorage.getItem('settings');
            if (savedSettings) {
                try {
                    var settings = JSON.parse(savedSettings);
                    if (settings[toggle.id] !== undefined) {
                        toggle.checked = settings[toggle.id];
                    }
                } catch (e) {
                    console.warn('Error parsing saved settings:', e);
                }
            }
            
            // Save on change
            toggle.addEventListener('change', function() {
                var savedSettings = localStorage.getItem('settings');
                var settings = savedSettings ? JSON.parse(savedSettings) : {};
                settings[this.id] = this.checked;
                localStorage.setItem('settings', JSON.stringify(settings));
            });
        });
    }
    
    // ============================================
    // Show Toast Notification
    // ============================================
    function showToast(message, type) {
        // Check if Utils module exists
        if (window.Utils && typeof window.Utils.showToast === 'function') {
            window.Utils.showToast(message, type);
            return;
        }
        
        // Fallback toast
        var toast = document.createElement('div');
        toast.className = 'toast-notification toast-' + (type || 'info');
        toast.textContent = message;
        toast.style.cssText = [
            'position: fixed',
            'bottom: 20px',
            'right: 20px',
            'padding: 12px 20px',
            'border-radius: 8px',
            'color: white',
            'z-index: 9999',
            'font-size: 14px',
            'font-weight: 500',
            'box-shadow: 0 4px 12px rgba(0,0,0,0.15)',
            'animation: slideIn 0.3s ease',
            'background: ' + (type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6')
        ].join(';');
        
        document.body.appendChild(toast);
        
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(function() {
                toast.remove();
            }, 300);
        }, 3000);
    }
    
    // ============================================
    // Reinitialize
    // ============================================
    function reinit() {
        console.log('Reinitializing settings...');
        initialized = false;
        init();
    }
    
    // ============================================
    // Export
    // ============================================
    window.Settings = {
        init: init,
        reinit: reinit
    };
    
    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, initializing settings...');
            init();
        });
    } else {
        if (!initialized) {
            console.log('DOM already ready, initializing settings...');
            init();
        }
    }
    
    console.log('Settings module loaded.');
    
})();