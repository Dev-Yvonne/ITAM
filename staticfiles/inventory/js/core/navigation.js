/**
 * NAVIGATION MODULE - Complete Navigation Management
 * Handles: Active link highlighting + Page transitions
 */

(function() {
    'use strict';
    
    var initialized = false;
    var isNavigating = false;
    
    // ============================================
    // Configuration
    // ============================================
    var CONFIG = {
        LOADER_MESSAGE: 'Please wait',
        EXCLUDE_PATTERNS: [
            /\.(pdf|doc|docx|xls|xlsx|zip|rar|jpg|jpeg|png|gif|mp4|mp3|webm|svg|ico|json|xml|txt)$/i,
            /^mailto:/i,
            /^tel:/i,
            /^javascript:/i,
            /^#/
        ],
        SKIP_PAGES: [
            '/login',
            '/signup', 
            '/logout',
            '/auth/'
        ],
        NAV_SELECTORS: [
            '.sidebar-link',
            '.nav-link',
            '.main-nav-link',
            'a[data-loader="true"]',
            '.topbar-nav-link'
        ]
    };
    
    // ============================================
    // Initialize Navigation
    // ============================================
    function initNavigation() {
        if (initialized) return;
        
        console.log('Navigation module initializing...');
        
        highlightActiveLink();
        setupNavigationInterception();
        setupPopStateHandler();
        setupPageShowHandler();
        setupFormInterception();
        
        initialized = true;
        console.log('Navigation module initialized.');
    }
    
    // ============================================
    // Check if current page is auth page
    // ============================================
    function isAuthPage() {
        var currentPath = window.location.pathname;
        
        for (var i = 0; i < CONFIG.SKIP_PAGES.length; i++) {
            if (currentPath.includes(CONFIG.SKIP_PAGES[i])) {
                return true;
            }
        }
        
        return false;
    }
    
    // ============================================
    // Check if link is a main navigation link
    // ============================================
    function isMainNavLink(link) {
        for (var i = 0; i < CONFIG.NAV_SELECTORS.length; i++) {
            if (link.matches(CONFIG.NAV_SELECTORS[i])) {
                return true;
            }
        }
        
        if (link.closest('.sidebar')) {
            return true;
        }
        
        if (link.closest('.main-nav, .topbar-nav, .navigation')) {
            return true;
        }
        
        if (link.dataset.loader === 'true') {
            return true;
        }
        
        return false;
    }
    
    // ============================================
    // Active Link Highlighting
    // ============================================
    function highlightActiveLink() {
        var currentPath = window.location.pathname;
        var navLinks = document.querySelectorAll('.sidebar-link');
        var hasActive = false;
        
        navLinks.forEach(function(link) {
            var href = link.getAttribute('href');
            if (!href || href === '#') {
                link.classList.remove('active');
                return;
            }
            
            link.classList.remove('active');
            
            if (currentPath === href || 
                (href !== '/' && currentPath.startsWith(href) && href.length > 1)) {
                link.classList.add('active');
                hasActive = true;
            }
        });
        
        if (!hasActive) {
            navLinks.forEach(function(link) {
                var href = link.getAttribute('href');
                if (href && href !== '/' && currentPath.includes(href) && href.length > 1) {
                    link.classList.add('active');
                }
            });
        }
    }
    
    // ============================================
    // Check if link should be intercepted
    // ============================================
    function shouldInterceptLink(link) {
        var href = link.getAttribute('href');
        
        if (isAuthPage()) {
            return false;
        }
        
        if (!isMainNavLink(link)) {
            return false;
        }
        
        if (!href || href === '') return false;
        if (link.dataset.noLoader === 'true') return false;
        if (link.target === '_blank' || link.target === '_new') return false;
        
        for (var i = 0; i < CONFIG.EXCLUDE_PATTERNS.length; i++) {
            if (CONFIG.EXCLUDE_PATTERNS[i].test(href)) {
                return false;
            }
        }
        
        if (href.startsWith('http') && !href.startsWith(window.location.origin)) {
            return false;
        }
        
        if (href.startsWith('#')) return false;
        
        return true;
    }
    
    // ============================================
    // Setup Navigation Interception
    // ============================================
    function setupNavigationInterception() {
        document.addEventListener('click', function(e) {
            if (isAuthPage()) {
                return;
            }
            
            var link = e.target.closest('a');
            if (!link) return;
            
            if (!isMainNavLink(link)) {
                return;
            }
            
            if (!shouldInterceptLink(link)) return;
            
            var href = link.getAttribute('href');
            if (isNavigating) {
                e.preventDefault();
                return;
            }
            
            if (typeof window.Loader !== 'undefined' && window.Loader.show) {
                isNavigating = true;
                window.Loader.show(CONFIG.LOADER_MESSAGE);
                console.log('Navigation to:', href);
            }
        }, true);
    }
    
    // ============================================
    // Setup Form Interception
    // ============================================
    function setupFormInterception() {
        document.addEventListener('submit', function(e) {
            if (isAuthPage()) {
                return;
            }
            
            var form = e.target;
            
            if (form.dataset.loader !== 'true') {
                return;
            }
            
            if (form.dataset.noLoader === 'true') return;
            if (isNavigating) {
                e.preventDefault();
                return;
            }
            
            if (typeof window.Loader !== 'undefined' && window.Loader.show) {
                isNavigating = true;
                window.Loader.show(CONFIG.LOADER_MESSAGE);
            }
        }, true);
    }
    
    // ============================================
    // Handle Browser Back/Forward
    // ============================================
    function setupPopStateHandler() {
        window.addEventListener('popstate', function(e) {
            if (isAuthPage()) {
                return;
            }
            
            if (typeof window.Loader !== 'undefined' && window.Loader.show) {
                window.Loader.show(CONFIG.LOADER_MESSAGE);
            }
        });
    }
    
    // ============================================
    // Handle Page Show (bfcache)
    // ============================================
    function setupPageShowHandler() {
        window.addEventListener('pageshow', function(e) {
            if (e.persisted) {
                if (typeof window.Loader !== 'undefined' && window.Loader.hide) {
                    setTimeout(function() {
                        window.Loader.hide();
                        isNavigating = false;
                    }, 200);
                }
            }
            setTimeout(highlightActiveLink, 100);
        });
    }
    
    // ============================================
    // Reinitialize
    // ============================================
    function reinit() {
        console.log('Reinitializing navigation...');
        initialized = false;
        initNavigation();
    }
    
    // ============================================
    // Public API
    // ============================================
    window.Navigation = {
        init: initNavigation,
        reinit: reinit,
        highlightActive: highlightActiveLink,
        isInitialized: function() { return initialized; }
    };
    
    // ============================================
    // Auto-init
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initNavigation();
        });
    } else {
        if (!initialized) {
            initNavigation();
        }
    }
    
    console.log('Navigation module loaded.');
    
})();