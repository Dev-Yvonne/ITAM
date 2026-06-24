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
// 8. GLOBAL ERROR HANDLING
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
// 9. AUTO-DISMISS ALERTS
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
// 10. MAIN INIT
// ============================================================

function initApp() {
    console.log('ITAM Application starting...');

    var page = getCurrentPage();

    initProfileDropdown();
    initThemeToggle();
    initMobileNav();
    initAutoDismissAlerts();
    setupGlobalEvents();
    setupGlobalErrorHandling();

    window.showToast = showToast;

    initializePage(page);

    document.dispatchEvent(new CustomEvent('itam-ready', { detail: { page: page } }));
    console.log('ITAM Application ready. Page:', page);
}

// ============================================================
// 11. START
// ============================================================

document.addEventListener('DOMContentLoaded', initApp);

// ============================================================
// 12. EXPOSE
// ============================================================

window.MainApp = {
    getCurrentPage: getCurrentPage,
    initializePage: initializePage,
    refresh: function() { 
        initializePage(getCurrentPage()); 
    },
    showToast: showToast,
};

console.log('main.js loaded.');