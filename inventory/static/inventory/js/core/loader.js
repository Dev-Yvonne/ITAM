/**
 * LOADER MODULE
 * Handles loading spinner management with animated dots
 */

(function() {
    'use strict';
    
    // ============================================
    // Configuration
    // ============================================
    var DEFAULT_MESSAGE = 'Loading';
    var DEFAULT_TIMEOUT = 30000; // 30 seconds
    
    // ============================================
    // DOM Elements
    // ============================================
    var overlay = null;
    var spinner = null;
    var textEl = null;
    var dotContainer = null;
    var ajaxIntercepted = false;
    var navigationIntercepted = false;
    var dotInterval = null;
    
    // ============================================
    // Create Loading Overlay with animated dots
    // ============================================
    function createOverlay() {
        // Remove existing overlay if present
        var existing = document.getElementById('loading-overlay');
        if (existing) {
            existing.remove();
        }
        
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="spinner-container">
                <div class="spinner-wrapper">
                    <svg class="spinner-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="spinner-text-wrapper">
                    <span class="spinner-text" id="loaderText">${DEFAULT_MESSAGE}</span>
                    <span class="dots-container" id="dotsContainer">
                        <span class="dot">.</span>
                        <span class="dot">.</span>
                        <span class="dot">.</span>
                    </span>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        textEl = overlay.querySelector('.spinner-text');
        dotContainer = overlay.querySelector('.dots-container');
        
        return overlay;
    }
    
    // ============================================
    // Animate Dots - Only 3 dots
    // ============================================
    function animateDots() {
        if (!dotContainer) return;
        
        var dots = dotContainer.querySelectorAll('.dot');
        if (dots.length !== 3) return;
        
        var dotIndex = 0;
        
        dots.forEach(function(dot) {
            dot.style.opacity = '0.3';
            dot.style.transform = 'translateY(0)';
        });
        
        if (dotInterval) {
            clearInterval(dotInterval);
        }
        
        dotInterval = setInterval(function() {
            dots.forEach(function(dot) {
                dot.style.opacity = '0.3';
                dot.style.transform = 'translateY(0)';
            });
            
            if (dots[dotIndex]) {
                dots[dotIndex].style.opacity = '1';
                dots[dotIndex].style.transform = 'translateY(-4px)';
            }
            
            dotIndex = (dotIndex + 1) % dots.length;
        }, 400);
    }
    
    // ============================================
    // Show Loader
    // ============================================
    function showLoader(message) {
        message = message || DEFAULT_MESSAGE;
        
        if (!overlay || !document.body.contains(overlay)) {
            createOverlay();
        }
        
        if (textEl) {
            textEl.textContent = message;
        }
        
        if (dotInterval) {
            clearInterval(dotInterval);
            dotInterval = null;
        }
        
        void overlay.offsetWidth;
        
        overlay.classList.add('active');
        
        setTimeout(function() {
            animateDots();
        }, 100);
        
        clearTimeout(overlay._timeout);
        overlay._timeout = setTimeout(function() {
            hideLoader();
        }, DEFAULT_TIMEOUT);
    }
    
    // ============================================
    // Hide Loader
    // ============================================
    function hideLoader() {
        if (dotInterval) {
            clearInterval(dotInterval);
            dotInterval = null;
        }
        
        if (overlay) {
            overlay.classList.remove('active');
            clearTimeout(overlay._timeout);
            
            setTimeout(function() {
                if (overlay && overlay.parentNode) {
                    overlay.remove();
                    overlay = null;
                    textEl = null;
                    dotContainer = null;
                }
            }, 400);
        }
    }
    
    // ============================================
    // Update Loader Message
    // ============================================
    function updateLoaderMessage(message) {
        if (textEl) {
            textEl.textContent = message || DEFAULT_MESSAGE;
        }
    }
    
    // ============================================
    // Create Inline Spinner
    // ============================================
    function createInlineSpinner(size) {
        size = size || 'sm';
        var spinnerEl = document.createElement('span');
        spinnerEl.className = 'spinner-inline';
        if (size === 'sm') {
            spinnerEl.style.width = '16px';
            spinnerEl.style.height = '16px';
        } else if (size === 'lg') {
            spinnerEl.style.width = '24px';
            spinnerEl.style.height = '24px';
        }
        return spinnerEl;
    }
    
    // ============================================
    // Show Loader on Form Submit
    // ============================================
    function showLoaderOnSubmit(formSelector) {
        var forms = document.querySelectorAll(formSelector || 'form[data-loader="true"]');
        forms.forEach(function(form) {
            form.addEventListener('submit', function() {
                var message = this.dataset.loaderMessage || 'Saving';
                showLoader(message);
            });
        });
    }
    
    // ============================================
    // Show Loader on Navigation
    // ============================================
    function showLoaderOnNavigation(linksSelector) {
        if (navigationIntercepted) {
            return;
        }
        navigationIntercepted = true;
        
        var links = document.querySelectorAll(linksSelector || 'a[data-loader="true"]');
        links.forEach(function(link) {
            link.addEventListener('click', function(e) {
                var href = this.getAttribute('href');
                if (!href || href === '#' || href.startsWith('javascript:')) {
                    return;
                }
                
                var message = this.dataset.loaderMessage || 'Loading';
                showLoader(message);
            });
        });
        
        var sidebarLinks = document.querySelectorAll('.sidebar-link');
        sidebarLinks.forEach(function(link) {
            if (link.hasAttribute('data-loader')) {
                return;
            }
            
            link.addEventListener('click', function(e) {
                var href = this.getAttribute('href');
                if (!href || href === '#' || href.startsWith('javascript:')) {
                    return;
                }
                showLoader('Loading');
            });
        });
    }
    
    // ============================================
    // Show Loader on AJAX Requests
    // ============================================
    function showLoaderOnAjax() {
        if (ajaxIntercepted) {
            return;
        }
        ajaxIntercepted = true;
        
        if (typeof window.fetch === 'function') {
            var originalFetch = window.fetch;
            window.fetch = function() {
                var args = arguments;
                var url = args[0];
                var isApiCall = false;
                
                if (typeof url === 'string') {
                    isApiCall = url.includes('/api/') || 
                               (url.includes('?') && !url.includes('/static/') && 
                                !url.includes('.css') && !url.includes('.js') &&
                                !url.includes('favicon') && !url.includes('manifest'));
                }
                
                if (isApiCall) {
                    showLoader('Loading data');
                }
                
                return originalFetch.apply(this, args).finally(function() {
                    if (isApiCall) {
                        hideLoader();
                    }
                });
            };
        }
        
        var originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function() {
            var args = arguments;
            var url = args[1];
            var isApiCall = false;
            
            if (typeof url === 'string') {
                isApiCall = url.includes('/api/') || 
                           (url.includes('?') && !url.includes('/static/') && 
                            !url.includes('.css') && !url.includes('.js') &&
                            !url.includes('favicon') && !url.includes('manifest'));
            }
            
            if (isApiCall) {
                showLoader('Loading data');
            }
            
            var xhr = this;
            var originalOnReadyStateChange = xhr.onreadystatechange;
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4 && isApiCall) {
                    hideLoader();
                }
                if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.apply(this, arguments);
                }
            };
            xhr.addEventListener('loadend', function() {
                if (isApiCall) {
                    hideLoader();
                }
            });
            return originalXHROpen.apply(this, args);
        };
    }
    
    // ============================================
    // Check if Loader is Active
    // ============================================
    function isActive() {
        return overlay ? overlay.classList.contains('active') : false;
    }
    
    // ============================================
    // Export
    // ============================================
    window.Loader = {
        show: showLoader,
        hide: hideLoader,
        updateMessage: updateLoaderMessage,
        createInline: createInlineSpinner,
        showOnSubmit: showLoaderOnSubmit,
        showOnNavigation: showLoaderOnNavigation,
        showOnAjax: showLoaderOnAjax,
        isActive: isActive
    };
    
    console.log('Loader module loaded.');
    
})();