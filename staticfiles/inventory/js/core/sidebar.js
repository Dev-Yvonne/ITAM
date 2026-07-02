/**
 * SIDEBAR MODULE
 * Handles sidebar toggle functionality for mobile menu
 */

(function() {
    'use strict';
    
    var sidebar = null;
    var toggleBtn = null;
    var overlay = null;
    var initialized = false;
    
    function initSidebar() {
        if (initialized) {
            return;
        }
        
        console.log('Sidebar module initializing...');
        
        // Get DOM elements
        sidebar = document.getElementById('sidebar');
        toggleBtn = document.getElementById('sidebarToggle');
        overlay = document.getElementById('sidebarOverlay');
        
        console.log('Sidebar element:', sidebar);
        console.log('Toggle button:', toggleBtn);
        console.log('Overlay element:', overlay);
        
        if (toggleBtn && sidebar) {
            console.log('Sidebar toggle found, attaching click event...');
            toggleBtn.addEventListener('click', toggleSidebar);
        } else {
            console.warn('Sidebar toggle button or sidebar not found.');
            if (!toggleBtn) console.warn('Toggle button not found - check #sidebarToggle in topbar.html');
            if (!sidebar) console.warn('Sidebar not found - check #sidebar in sidebar.html');
        }
        
        if (overlay) {
            overlay.addEventListener('click', closeSidebar);
        }
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeSidebar();
            }
        });
        
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768 && sidebar && sidebar.classList.contains('open')) {
                closeSidebar();
            }
        });
        
        initialized = true;
        console.log('Sidebar module initialized.');
    }
    
    function toggleSidebar(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        
        console.log('Toggling sidebar...');
        
        if (sidebar) {
            sidebar.classList.toggle('open');
            console.log('Sidebar classList:', sidebar.classList);
        }
        if (overlay) {
            overlay.classList.toggle('active');
        }
        if (toggleBtn) {
            toggleBtn.classList.toggle('open');
        }
    }
    
    function closeSidebar() {
        console.log('Closing sidebar...');
        
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
    
    function openSidebar() {
        console.log('Opening sidebar...');
        
        if (sidebar) {
            sidebar.classList.add('open');
        }
        if (overlay) {
            overlay.classList.add('active');
        }
        if (toggleBtn) {
            toggleBtn.classList.add('open');
        }
    }
    
    window.Sidebar = {
        init: initSidebar,
        toggle: toggleSidebar,
        open: openSidebar,
        close: closeSidebar
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, initializing sidebar...');
            initSidebar();
        });
    } else {
        console.log('DOM already ready, initializing sidebar...');
        setTimeout(initSidebar, 50);
    }
    
    console.log('Sidebar module loaded.');
    
})();