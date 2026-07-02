/**
 * LOADER MODULE - Logo + Text with Animated Dots
 * Animated logo with pulsing effect + "Please wait..." with bouncing dots
 */

(function() {
    'use strict';
    
    // ============================================
    // State
    // ============================================
    var state = {
        isActive: false,
        overlay: null,
        textEl: null,
        dotsEl: null,
        message: 'Please wait',
        dotInterval: null,
        timeoutId: null
    };
    
    // ============================================
    // Configuration
    // ============================================
    var CONFIG = {
        DEFAULT_MESSAGE: 'Please wait',
        TIMEOUT: 30000,
        DOT_INTERVAL: 400,
        FADE_DURATION: 300,
        SKIP_PAGES: ['/login', '/signup', '/logout', '/auth/']
    };
    
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
    // Create Loader Elements - Logo + Text with Dots
    // ============================================
    function createLoaderElements() {
        if (state.overlay) return;
        
        state.overlay = document.createElement('div');
        state.overlay.id = 'loading-overlay';
        state.overlay.className = 'loading-overlay';
        state.overlay.innerHTML = `
            <div class="loader-container">
                <!-- Animated Logo -->
                <div class="loader-logo-wrapper">
                    <svg class="loader-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                    </svg>
                </div>
                <!-- Text with Dots -->
                <div class="loader-text-wrapper">
                    <span class="loader-text" id="loaderText">${CONFIG.DEFAULT_MESSAGE}</span>
                    <span class="loader-dots" id="loaderDots">
                        <span class="dot">.</span>
                        <span class="dot">.</span>
                        <span class="dot">.</span>
                    </span>
                </div>
            </div>
        `;
        
        document.body.appendChild(state.overlay);
        state.textEl = state.overlay.querySelector('#loaderText');
        state.dotsEl = state.overlay.querySelector('#loaderDots');
    }
    
    // ============================================
    // Animate Dots - Bouncing effect
    // ============================================
    function animateDots() {
        if (!state.dotsEl) return;
        
        var dots = state.dotsEl.querySelectorAll('.dot');
        if (dots.length !== 3) return;
        
        if (state.dotInterval) {
            clearInterval(state.dotInterval);
        }
        
        var index = 0;
        
        dots.forEach(function(dot) {
            dot.style.opacity = '0.3';
            dot.style.transform = 'translateY(0)';
        });
        
        state.dotInterval = setInterval(function() {
            dots.forEach(function(dot) {
                dot.style.opacity = '0.3';
                dot.style.transform = 'translateY(0)';
            });
            
            if (dots[index]) {
                dots[index].style.opacity = '1';
                dots[index].style.transform = 'translateY(-4px)';
            }
            
            index = (index + 1) % dots.length;
        }, CONFIG.DOT_INTERVAL);
    }
    
    // ============================================
    // Show Loader
    // ============================================
    function show(message) {
        // Skip if on auth page
        if (isAuthPage()) {
            console.log('Auth page - skipping loader show');
            return;
        }
        
        // If already active, just update message
        if (state.isActive) {
            if (message && state.textEl) {
                state.textEl.textContent = message;
            }
            return;
        }
        
        // Create elements if needed
        createLoaderElements();
        
        // Set message
        var msg = message || CONFIG.DEFAULT_MESSAGE;
        if (state.textEl) {
            state.textEl.textContent = msg;
        }
        state.message = msg;
        
        // Clear any existing timeouts
        if (state.timeoutId) {
            clearTimeout(state.timeoutId);
            state.timeoutId = null;
        }
        
        // Show overlay with animation
        requestAnimationFrame(function() {
            state.overlay.classList.add('active');
            state.isActive = true;
            setTimeout(animateDots, 100);
        });
        
        // Safety timeout
        state.timeoutId = setTimeout(function() {
            hide();
        }, CONFIG.TIMEOUT);
        
        console.log('Loader shown:', msg);
    }
    
    // ============================================
    // Hide Loader
    // ============================================
    function hide() {
        if (!state.isActive || !state.overlay) return;
        
        // Clear intervals and timeouts
        if (state.dotInterval) {
            clearInterval(state.dotInterval);
            state.dotInterval = null;
        }
        if (state.timeoutId) {
            clearTimeout(state.timeoutId);
            state.timeoutId = null;
        }
        
        state.overlay.classList.remove('active');
        state.isActive = false;
        
        // Remove from DOM after transition
        setTimeout(function() {
            if (state.overlay && state.overlay.parentNode) {
                state.overlay.remove();
                state.overlay = null;
                state.textEl = null;
                state.dotsEl = null;
            }
        }, CONFIG.FADE_DURATION);
        
        console.log('Loader hidden');
    }
    
    // ============================================
    // Update Message
    // ============================================
    function updateMessage(message) {
        if (state.textEl && message) {
            state.textEl.textContent = message;
            state.message = message;
        }
    }
    
    // ============================================
    // Check if Active
    // ============================================
    function isActive() {
        return state.isActive;
    }
    
    // ============================================
    // Show Loader on Navigation Links
    // ============================================
    function showOnNavigation(selector) {
        if (isAuthPage()) {
            return;
        }
        
        var links = document.querySelectorAll(selector || 'a[data-loader="true"]');
        
        links.forEach(function(link) {
            link.addEventListener('click', function(e) {
                var href = this.getAttribute('href');
                if (!href || href === '#') return;
                show(CONFIG.DEFAULT_MESSAGE);
            });
        });
    }
    
    // ============================================
    // Show Loader on Form Submissions
    // ============================================
    function showOnSubmit(selector) {
        if (isAuthPage()) {
            return;
        }
        
        var forms = document.querySelectorAll(selector || 'form[data-loader="true"]');
        
        forms.forEach(function(form) {
            form.addEventListener('submit', function() {
                show(CONFIG.DEFAULT_MESSAGE);
            });
        });
    }
    
    // ============================================
    // Show Loader on AJAX Requests
    // ============================================
    function showOnAjax() {
        if (isAuthPage()) {
            return;
        }
        
        if (typeof window.fetch === 'function') {
            var originalFetch = window.fetch;
            window.fetch = function() {
                var args = arguments;
                var url = args[0];
                var isApiCall = false;
                
                if (typeof url === 'string') {
                    isApiCall = url.includes('/api/') && 
                               !url.includes('/static/') && 
                               !url.includes('.css') && 
                               !url.includes('.js');
                }
                
                if (isApiCall) {
                    show(CONFIG.DEFAULT_MESSAGE);
                }
                
                return originalFetch.apply(this, args).finally(function() {
                    if (isApiCall) {
                        hide();
                    }
                });
            };
        }
    }
    
    // ============================================
    // Export
    // ============================================
    window.Loader = {
        show: show,
        hide: hide,
        updateMessage: updateMessage,
        isActive: isActive,
        showOnNavigation: showOnNavigation,
        showOnSubmit: showOnSubmit,
        showOnAjax: showOnAjax
    };
    
    console.log('loader.js loaded - Logo + Text with Animated Dots');
    
})();