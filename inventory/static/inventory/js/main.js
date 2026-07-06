/**
 * MAIN ENTRY POINT
 * Orchestrates all modules and initializes the application
 */

(function() {
    'use strict';
    
    // ============================================
    // Page Detection
    // ============================================
    function getCurrentPage() {
        var path = window.location.pathname;
        if (path === '/' || path === '/dashboard/' || path.includes('dashboard')) {
            return 'dashboard';
        }
        if (path.includes('assets')) return 'assets';
        if (path.includes('employees')) return 'employees';
        if (path.includes('reports')) return 'reports';
        if (path.includes('assign')) return 'assignments';
        if (path.includes('login') || path.includes('signup')) return 'auth';
        if (path.includes('logout')) return 'auth';
        return 'dashboard';
    }
    
    // ============================================
    // Load Core Modules
    // ============================================
    function loadCoreModules() {
        var modules = ['Utils', 'Loader', 'Theme', 'Navigation', 'Alerts'];
        var loaded = [];
        var missing = [];
        
        modules.forEach(function(module) {
            if (typeof window[module] !== 'undefined') {
                loaded.push(module);
            } else {
                missing.push(module);
            }
        });
        
        if (missing.length > 0) {
            console.warn('Missing core modules:', missing.join(', '));
        } else {
            console.log('All core modules loaded:', loaded.join(', '));
        }
        
        return loaded;
    }
    
    // ============================================
    // Load Page-Specific Modules
    // ============================================
    function loadPageModules(page) {
        console.log('Loading page modules for:', page);
        
        switch (page) {
            case 'dashboard':
                if (typeof window.Dashboard !== 'undefined' && typeof window.Dashboard.init === 'function') {
                    window.Dashboard.init();
                }
                break;
                
            case 'assets':
                if (typeof window.AssetManager !== 'undefined' && typeof window.AssetManager.init === 'function') {
                    window.AssetManager.init();
                }
                break;
                
            case 'employees':
                if (typeof window.EmployeeManager !== 'undefined' && typeof window.EmployeeManager.init === 'function') {
                    window.EmployeeManager.init();
                }
                break;
                
            case 'reports':
                if (typeof window.Reports !== 'undefined' && typeof window.Reports.init === 'function') {
                    // Reports will initialize with data from template
                }
                break;
                
            default:
                break;
        }
    }
    
    // ============================================
    // Initialize Forms
    // ============================================
    function initForms() {
        if (typeof window.FormManager !== 'undefined' && typeof window.FormManager.init === 'function') {
            window.FormManager.init();
        }
    }
    
    // ============================================
    // Setup Loader - Auto-attach to all navigation
    // ============================================
    function setupLoader() {
        if (typeof window.Loader !== 'undefined') {
            try {
                // Auto-attach to all sidebar links
                if (typeof window.Loader.showOnNavigation === 'function') {
                    // Attach to all sidebar links
                    window.Loader.showOnNavigation('.sidebar-link');
                    // Attach to employee sidebar links
                    window.Loader.showOnNavigation('.sidebar-employee .sidebar-link');
                    // Attach to any link with data-loader attribute
                    window.Loader.showOnNavigation('a[data-loader="true"]');
                }
                
                // Auto-attach to forms
                if (typeof window.Loader.showOnSubmit === 'function') {
                    window.Loader.showOnSubmit('form[data-loader="true"]');
                }
                
                // AJAX auto-show is disabled to prevent loops
                // window.Loader.showOnAjax(); // Disabled
                
                console.log('Loader auto-attached to all navigation links');
            } catch (error) {
                console.warn('Error setting up loader:', error.message);
            }
        }
    }
    
    // ============================================
    // Global Link Click Handler - Catch all navigation
    // ============================================
    function setupGlobalLinkHandler() {
        document.addEventListener('click', function(e) {
            // Find the closest anchor tag
            var link = e.target.closest('a[href]');
            if (!link) return;
            
            // Skip if already has data-loader or is a sidebar link (handled separately)
            if (link.hasAttribute('data-loader')) return;
            if (link.classList.contains('sidebar-link')) return;
            
            var href = link.getAttribute('href');
            
            // Skip invalid links
            if (!href || href === '#' || href === '' || href.startsWith('javascript:')) {
                return;
            }
            
            // Skip external links
            if (href.startsWith('http') && !href.includes(window.location.hostname)) {
                return;
            }
            
            // Skip download links
            if (href.includes('download') || link.hasAttribute('download')) {
                return;
            }
            
            // Skip if target is _blank
            if (link.target === '_blank') {
                return;
            }
            
            // Skip auth pages
            if (href.includes('/login') || href.includes('/logout') || href.includes('/signup') || href.includes('/auth/')) {
                return;
            }
            
            // Show loader immediately
            if (typeof window.Loader !== 'undefined' && typeof window.Loader.show === 'function') {
                var message = link.getAttribute('data-loader-message') || 'Loading...';
                window.Loader.show(message);
            }
        });
    }
    
    // ============================================
    // Initialize Notifications
    // ============================================
    function initNotifications() {
        var bell = document.getElementById('notificationBell');
        var dropdown = document.getElementById('notificationDropdown') || document.getElementById('employeeNotificationDropdown');
        
        if (bell && dropdown) {
            bell.removeEventListener('click', toggleNotificationDropdown);
            bell.addEventListener('click', toggleNotificationDropdown);
            
            document.removeEventListener('click', closeNotificationDropdown);
            document.addEventListener('click', closeNotificationDropdown);
        }
    }
    
    function toggleNotificationDropdown(event) {
        event.stopPropagation();
        var dropdown = document.getElementById('notificationDropdown') || document.getElementById('employeeNotificationDropdown');
        if (dropdown) {
            dropdown.classList.toggle('open');
        }
    }
    
    function closeNotificationDropdown(event) {
        var dropdown = document.getElementById('notificationDropdown') || document.getElementById('employeeNotificationDropdown');
        var bell = document.getElementById('notificationBell');
        
        if (dropdown && bell) {
            if (!dropdown.contains(event.target) && !bell.contains(event.target)) {
                dropdown.classList.remove('open');
            }
        }
    }
    
    // ============================================
    // Mark all notifications as read
    // ============================================
    function initMarkAllRead() {
        var markAllBtn = document.querySelector('.mark-all-link');
        if (markAllBtn) {
            markAllBtn.removeEventListener('click', handleMarkAllRead);
            markAllBtn.addEventListener('click', handleMarkAllRead);
        }
    }
    
    function handleMarkAllRead(event) {
        event.preventDefault();
        event.stopPropagation();
        
        var badge = document.getElementById('notificationBadge');
        var items = document.querySelectorAll('.notification-item.unread');
        
        items.forEach(function(item) {
            item.classList.remove('unread');
        });
        
        if (badge) {
            badge.classList.add('hidden');
            badge.textContent = '';
        }
        
        var csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
        if (csrfToken) {
            fetch('/notifications/mark-all-read/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken.value,
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin'
            }).catch(function(error) {
                console.warn('Error marking all as read:', error);
            });
        }
    }
    
    // ============================================
    // Initialize Application
    // ============================================
    function initApp() {
        try {
            console.log('ITAM 3.0 initializing...');
            
            // Load core modules
            loadCoreModules();
            
            // Setup loader - auto-attach to navigation
            setupLoader();
            
            // Setup global link handler for all navigation
            setupGlobalLinkHandler();
            
            // Initialize forms
            initForms();
            
            // Initialize sidebar (handled by sidebar.js)
            if (typeof window.Sidebar !== 'undefined' && typeof window.Sidebar.init === 'function') {
                window.Sidebar.init();
            }
            
            // Initialize notifications
            initNotifications();
            initMarkAllRead();
            
            // Load page-specific modules
            var page = getCurrentPage();
            loadPageModules(page);
            
            // Dispatch ready event
            document.dispatchEvent(new CustomEvent('itam-ready', {
                detail: { page: page }
            }));
            
            console.log('ITAM 3.0 ready. Page:', page);
            
            // Hide any lingering loader
            if (typeof window.Loader !== 'undefined' && window.Loader.forceHide) {
                setTimeout(function() {
                    try {
                        window.Loader.forceHide();
                    } catch (e) {
                        // Ignore
                    }
                }, 300);
            }
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            if (window.Loader && typeof window.Loader.forceHide === 'function') {
                window.Loader.forceHide();
            }
        }
    }
    
    // ============================================
    // Start Application
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (window._itam_initialized) return;
            window._itam_initialized = true;
            initApp();
        });
    } else {
        if (window._itam_initialized) return;
        window._itam_initialized = true;
        initApp();
    }
    
    // ============================================
    // Handle Turbo/HTMX
    // ============================================
    document.addEventListener('turbo:load', function() {
        if (typeof window.Sidebar !== 'undefined' && typeof window.Sidebar.init === 'function') {
            window.Sidebar.init();
        }
        initNotifications();
        initMarkAllRead();
        // Hide any lingering loader
        if (typeof window.Loader !== 'undefined' && window.Loader.forceHide) {
            window.Loader.forceHide();
        }
    });
    
    document.addEventListener('htmx:afterSwap', function() {
        if (typeof window.Sidebar !== 'undefined' && typeof window.Sidebar.init === 'function') {
            window.Sidebar.init();
        }
        initNotifications();
        initMarkAllRead();
        // Hide any lingering loader
        if (typeof window.Loader !== 'undefined' && window.Loader.forceHide) {
            window.Loader.forceHide();
        }
    });
    
    // Handle back/forward cache
    window.addEventListener('pageshow', function() {
        if (typeof window.Loader !== 'undefined' && window.Loader.forceHide) {
            window.Loader.forceHide();
        }
    });
    
    // ============================================
    // Export
    // ============================================
    window.MainApp = {
        getCurrentPage: getCurrentPage,
        refresh: function() {
            var page = getCurrentPage();
            loadPageModules(page);
        },
        closeSidebar: function() {
            if (typeof window.Sidebar !== 'undefined' && typeof window.Sidebar.close === 'function') {
                window.Sidebar.close();
            }
        },
        openSidebar: function() {
            if (typeof window.Sidebar !== 'undefined' && typeof window.Sidebar.open === 'function') {
                window.Sidebar.open();
            }
        },
        forceHideLoader: function() {
            if (typeof window.Loader !== 'undefined' && window.Loader.forceHide) {
                window.Loader.forceHide();
            }
        }
    };
    
    console.log('main.js loaded successfully');
    
})();