/**
 * SIDEBAR MODULE
 * Handles sidebar toggle functionality for mobile menu
 */

(function() {
    'use strict';

    var sidebar = null;
    var toggleBtn = null;
    var overlay = null;
    var openClass = 'open';
    var initialized = false;

    function resolveElements() {
        toggleBtn = document.getElementById('sidebarToggle') ||
            document.getElementById('sidebarToggleEmployee');
        sidebar = document.getElementById('sidebar') ||
            document.getElementById('sidebarEmployee');
        overlay = document.getElementById('sidebarOverlay');
        openClass = sidebar && sidebar.id === 'sidebarEmployee' ? 'active' : 'open';
    }

    function initSidebar() {
        if (initialized) {
            return;
        }

        resolveElements();

        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', toggleSidebar);
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
            if (window.innerWidth > 768 && sidebar && sidebar.classList.contains(openClass)) {
                closeSidebar();
            }
        });

        initialized = true;
    }

    function toggleSidebar(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }

        if (!sidebar) {
            resolveElements();
        }
        if (!sidebar) {
            return;
        }

        var isOpen = sidebar.classList.contains(openClass);
        if (isOpen) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    function closeSidebar() {
        if (!sidebar) {
            resolveElements();
        }
        if (sidebar) {
            sidebar.classList.remove(openClass);
        }
        if (overlay) {
            overlay.classList.remove('active');
        }
        if (toggleBtn) {
            toggleBtn.classList.remove('open');
        }
    }

    function openSidebar() {
        if (!sidebar) {
            resolveElements();
        }
        if (sidebar) {
            sidebar.classList.add(openClass);
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
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }
})();
