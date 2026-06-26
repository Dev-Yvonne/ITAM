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
        
        // Theme toggle is handled by theme.js
        var themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            console.log('Theme toggle found in topbar.');
        } else {
            console.warn('Theme toggle button not found in topbar!');
        }
        
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