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

        // Sidebar toggle is handled by sidebar.js
        
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