/**
 * ============================================================
 * MAIN ENTRY POINT - ITAM SYSTEM
 * Path: inventory/js/main.js
 * ============================================================
 * Orchestrates page detection, module initialization,
 * global events, and error handling.
 * ============================================================
 */

// ============================================================
// 1. PAGE DETECTION
// ============================================================

function getCurrentPage() {
    const body = document.body;
    if (body.dataset.page) return body.dataset.page;

    const path = window.location.pathname;
    if (path.includes('/dashboard') || path === '/') return 'dashboard';
    if (path.includes('/assets')) return 'assets';
    if (path.includes('/employees')) return 'employees';
    if (path.includes('/assignments')) return 'assignments';
    return 'dashboard';
}

// ============================================================
// 2. PROFILE DROPDOWN TOGGLE
// ============================================================

function initProfileDropdown() {
    const profileToggle = document.getElementById('profileToggle');
    const profileDropdown = document.getElementById('profileDropdown');
    
    if (profileToggle && profileDropdown) {
        // Toggle dropdown on click
        profileToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const parent = this.closest('.profile-dropdown');
            parent.classList.toggle('open');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.profile-dropdown')) {
                document.querySelectorAll('.profile-dropdown').forEach(function(el) {
                    el.classList.remove('open');
                });
            }
        });
        
        // Close dropdown on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.profile-dropdown').forEach(function(el) {
                    el.classList.remove('open');
                });
            }
        });
    }
}

// ============================================================
// 3. THEME TOGGLE
// ============================================================

function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Set initial theme
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeUI(savedTheme);
    } else if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeUI('dark');
    }
    
    // Toggle theme on click
    themeToggle.addEventListener('click', function() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeUI(newTheme);
        
        // Close dropdown after theme change
        const dropdown = this.closest('.profile-dropdown');
        if (dropdown) {
            dropdown.classList.remove('open');
        }
    });
}

function updateThemeUI(theme) {
    // Update icon and text in dropdown
    const themeIcon = document.querySelector('#themeToggle .theme-icon');
    const themeText = document.querySelector('#themeToggle .theme-text');
    if (themeIcon) {
        themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
    if (themeText) {
        themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
}

// ============================================================
// 4. MOBILE NAVIGATION TOGGLE
// ============================================================

function initMobileNav() {
    const toggleBtn = document.getElementById('navbarToggle');
    const navMenu = document.getElementById('navbarNav');
    
    if (toggleBtn && navMenu) {
        toggleBtn.addEventListener('click', function() {
            navMenu.classList.toggle('open');
            toggleBtn.classList.toggle('open');
        });
        
        document.addEventListener('click', function(event) {
            if (!event.target.closest('.navbar')) {
                navMenu.classList.remove('open');
                toggleBtn.classList.remove('open');
            }
        });
    }
}

// ============================================================
// 5. MODULE LOADER
// ============================================================

function initializePage(page) {
    console.log('Initializing page:', page);

    const loader = document.getElementById('page-loader');
    if (loader) loader.style.display = 'none';

    const content = document.getElementById('main-content');
    if (content) content.style.display = 'block';

    switch (page) {
        case 'dashboard':
            if (window.Dashboard?.init) window.Dashboard.init();
            else if (window.Dashboard?.refresh) window.Dashboard.refresh();
            break;

        case 'assets':
            if (window.assetManager?.refreshAssetList) window.assetManager.refreshAssetList();
            else if (typeof refreshAssetList === 'function') refreshAssetList();
            break;

        case 'employees':
            if (window.EmployeeManager?.refresh) window.EmployeeManager.refresh();
            else if (typeof refreshEmployeeList === 'function') refreshEmployeeList();
            break;

        case 'assignments':
            const container = document.getElementById('assignment-container');
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-info">
                        <h5>Assignment Center</h5>
                        <p>Use the "Assign" button on any asset card.</p>
                        <a href="/assets/" class="btn btn-primary">Go to Assets</a>
                    </div>
                `;
            }
            break;

        default:
            if (window.Dashboard?.init) window.Dashboard.init();
            break;
    }
}

// ============================================================
// 6. GLOBAL EVENTS
// ============================================================

function setupGlobalEvents() {
    // Highlight active nav
    const currentPage = getCurrentPage();
    document.querySelectorAll('.nav-link, .sidebar-link').forEach(function(link) {
        const href = link.getAttribute('href');
        if (href && href.includes(currentPage)) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Toast notifications via custom events
    window.addEventListener('show-notification', function(event) {
        const { message, type = 'info', duration = 3000 } = event.detail || {};
        showToast(message, type, duration);
    });

    console.log('Global event listeners set up.');
}

// ============================================================
// 7. TOAST SYSTEM
// ============================================================

function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    
    const container = document.getElementById('toast-container');
    if (!container) {
        alert(message);
        return;
    }

    const colors = {
        success: 'bg-success text-white',
        error: 'bg-danger text-white',
        warning: 'bg-warning text-dark',
        info: 'bg-primary text-white',
    };

    const toast = document.createElement('div');
    toast.className = 'toast align-items-center ' + (colors[type] || colors.info) + ' border-0 show';
    toast.role = 'alert';
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;

    container.appendChild(toast);
    setTimeout(function() { 
        if (toast.parentNode) toast.remove(); 
    }, duration);
}

// ============================================================
// 8. CONFIRMATION CARD SYSTEM
// ============================================================

function showConfirmationCard(options) {
    options = options || {};

    const existingCard = document.getElementById('confirmation-card-overlay');
    if (existingCard) existingCard.remove();

    return new Promise(function(resolve) {
        const overlay = document.createElement('div');
        overlay.id = 'confirmation-card-overlay';
        overlay.className = 'confirmation-card-overlay';
        overlay.style.cssText = [
            'position: fixed',
            'inset: 0',
            'z-index: 2000',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'padding: 1rem',
            'background: rgba(15, 23, 42, 0.45)',
            'backdrop-filter: blur(3px)'
        ].join(';');

        const confirmLabel = options.confirmLabel || 'Confirm';
        const cancelLabel = options.cancelLabel || 'Cancel';
        const variantClass = options.variant === 'warning' ? 'btn-warning' : 'btn-primary';

        overlay.innerHTML = `
            <div class="card confirmation-card" role="dialog" aria-modal="true" aria-labelledby="confirmation-card-title" style="max-width: 520px; width: 100%; padding: 1.5rem; box-shadow: var(--shadow-lg, 0 20px 40px rgba(15, 23, 42, 0.18));">
                <div class="confirmation-card-header" style="margin-bottom: 1rem;">
                    <h3 id="confirmation-card-title" style="margin-bottom: 0.5rem;">${options.title || 'Confirm Action'}</h3>
                    <p style="margin: 0; color: var(--text-secondary, #475569);">${options.message || 'Please confirm this action before continuing.'}</p>
                </div>
                ${options.details ? `<div class="confirmation-card-details" style="margin-bottom: 1rem;">${options.details}</div>` : ''}
                ${options.bodyHtml ? `<form id="confirmation-card-form" class="confirmation-card-form" style="margin-bottom: 1rem;">${options.bodyHtml}</form>` : ''}
                <div class="confirmation-card-actions" style="display: flex; gap: 0.75rem; justify-content: flex-end; flex-wrap: wrap;">
                    <button type="button" class="btn btn-secondary" data-confirmation-cancel>${cancelLabel}</button>
                    <button type="button" class="btn ${variantClass}" data-confirmation-confirm>${confirmLabel}</button>
                </div>
            </div>
        `;

        const close = function(result) {
            overlay.remove();
            document.removeEventListener('keydown', handleKeydown);
            resolve(result);
        };

        const handleKeydown = function(event) {
            if (event.key === 'Escape') {
                close({ confirmed: false, values: {} });
            }
        };

        overlay.querySelector('[data-confirmation-cancel]').addEventListener('click', function() {
            close({ confirmed: false, values: {} });
        });

        overlay.querySelector('[data-confirmation-confirm]').addEventListener('click', function() {
            const form = overlay.querySelector('#confirmation-card-form');
            const values = {};
            if (form) {
                const formData = new FormData(form);
                for (const [key, value] of formData.entries()) {
                    values[key] = value;
                }
            }
            close({ confirmed: true, values: values });
        });

        overlay.addEventListener('click', function(event) {
            if (event.target === overlay) {
                close({ confirmed: false, values: {} });
            }
        });

        document.addEventListener('keydown', handleKeydown);
        document.body.appendChild(overlay);

        const firstField = overlay.querySelector('select, input, textarea, button');
        if (firstField) firstField.focus();
    });
}

function initConfirmationForms() {
    document.querySelectorAll('form[data-confirm-card]').forEach(function(form) {
        form.addEventListener('submit', async function(event) {
            if (form.dataset.confirmed === 'true') {
                return;
            }

            event.preventDefault();
            if (form.checkValidity && !form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const result = await showConfirmationCard({
                title: form.dataset.confirmTitle || 'Confirm Action',
                message: form.dataset.confirmMessage || 'Please confirm this action.',
                details: form.dataset.confirmDetails || '',
                confirmLabel: form.dataset.confirmLabel || 'Confirm',
                cancelLabel: form.dataset.cancelLabel || 'Cancel',
                variant: form.dataset.confirmVariant || 'primary',
            });

            if (!result.confirmed) {
                return;
            }

            form.dataset.confirmed = 'true';
            form.submit();
        });
    });
}

// ============================================================
// 9. GLOBAL ERROR HANDLING
// ============================================================

function setupGlobalErrorHandling() {
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled Promise Rejection:', event.reason);
        var msg = event.reason?.message || 'An unexpected error occurred.';
        if (window.showToast) {
            window.showToast(msg, 'error');
        } else {
            alert('Error: ' + msg);
        }
        event.preventDefault();
    });

    window.addEventListener('error', function(event) {
        console.error('Global Error:', event.message, event.filename, event.lineno);
        if (event.message && !event.message.includes('404')) {
            if (window.showToast) {
                window.showToast(event.message, 'error');
            }
        }
    });

    console.log('Global error handling set up.');
}

// ============================================================
// 10. AUTO-DISMISS ALERTS
// ============================================================

function initAutoDismissAlerts() {
    var alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
    alerts.forEach(function(alert) {
        setTimeout(function() {
            alert.style.transition = 'opacity 0.5s ease';
            alert.style.opacity = '0';
            setTimeout(function() {
                alert.remove();
            }, 500);
        }, 5000);
    });
}

// ============================================================
// 11. MAIN INIT
// ============================================================

function initApp() {
    console.log('ITAM Application starting...');

    var page = getCurrentPage();

    initProfileDropdown();
    initThemeToggle();
    initMobileNav();
    initAutoDismissAlerts();
    initConfirmationForms();
    setupGlobalEvents();
    setupGlobalErrorHandling();

    window.showToast = showToast;
    window.showConfirmationCard = showConfirmationCard;

    initializePage(page);

    document.dispatchEvent(new CustomEvent('itam-ready', { detail: { page: page } }));
    console.log('ITAM Application ready. Page:', page);
}

// ============================================================
// 12. START
// ============================================================

document.addEventListener('DOMContentLoaded', initApp);

// ============================================================
// 13. EXPOSE
// ============================================================

window.MainApp = {
    getCurrentPage: getCurrentPage,
    initializePage: initializePage,
    refresh: function() { 
        initializePage(getCurrentPage()); 
    },
    showToast: showToast,
    showConfirmationCard: showConfirmationCard,
};

console.log('main.js loaded.');