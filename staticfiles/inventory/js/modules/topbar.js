/**
 * TOPBAR MODULE - ITAM SYSTEM
 * Handles topbar functionality: theme toggle, sidebar toggle, profile
 */

(function() {
    'use strict';
    
    var initialized = false;
    
    // ============================================
    // Initialize Topbar
    // ============================================
    function init() {
        if (initialized) {
            return;
        }
        
        console.log('Topbar module initializing...');
        
        setupSidebarToggle();
        setupThemeToggle();
        
        initialized = true;
        console.log('Topbar module initialized.');
    }
    
    // ============================================
    // Setup Sidebar Toggle
    // ============================================
    function setupSidebarToggle() {
        var toggleBtn = document.getElementById('sidebarToggle');
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebarOverlay');
        
        if (toggleBtn && sidebar) {
            console.log('Setting up sidebar toggle...');
            
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                sidebar.classList.toggle('open');
                if (overlay) {
                    overlay.classList.toggle('active');
                }
                toggleBtn.classList.toggle('open');
            });
        }
        
        if (overlay) {
            overlay.addEventListener('click', function() {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                if (toggleBtn) {
                    toggleBtn.classList.remove('open');
                }
            });
        }
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (sidebar) {
                    sidebar.classList.remove('open');
                }
                if (overlay) {
                    overlay.classList.remove('active');
                }
                if (toggleBtn) {
                    toggleBtn.classList.remove('open');
                }
            }
        });
    }
    
    // ============================================
    // Setup Theme Toggle
    // ============================================
    function setupThemeToggle() {
        var themeToggle = document.getElementById('themeToggle');
        
        if (themeToggle) {
            console.log('Setting up theme toggle...');
            
            themeToggle.addEventListener('click', function() {
                var currentTheme = document.documentElement.getAttribute('data-theme');
                var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                
                updateThemeIcon(newTheme);
                
                document.dispatchEvent(new CustomEvent('theme-changed', {
                    detail: { theme: newTheme }
                }));
            });
            
            // Set initial icon
            var savedTheme = localStorage.getItem('theme') || 
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            updateThemeIcon(savedTheme);
        }
    }
    
    // ============================================
    // Update Theme Icon
    // ============================================
    function updateThemeIcon(theme) {
        var icon = document.querySelector('.theme-icon');
        if (!icon) return;
        
        if (theme === 'dark') {
            icon.className = 'fas fa-sun theme-icon';
        } else {
            icon.className = 'fas fa-moon theme-icon';
        }
    }
    
    // ============================================
    // Reinitialize
    // ============================================
    function reinit() {
        console.log('Reinitializing topbar...');
        initialized = false;
        init();
    }
    
    // ============================================
    // Export
    // ============================================
    window.Topbar = {
        init: init,
        reinit: reinit
    };
    
    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, initializing topbar...');
            init();
        });
    } else {
        if (!initialized) {
            console.log('DOM already ready, initializing topbar...');
            init();
        }
    }
    
    console.log('Topbar module loaded.');
    
})();