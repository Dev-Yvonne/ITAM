/**
 * EMPLOYEE DASHBOARD MODULE
 * Handles dashboard-specific functionality
 */

(function() {
    'use strict';
    
    var initialized = false;
    var clockInterval = null;
    var typewriterTimeout = null;
    
    // ============================================
    // Configuration
    // ============================================
    var CONFIG = {
        ANIMATION_DELAY: 300
    };
    
    // ============================================
    // Initialize Dashboard
    // ============================================
    function init() {
        if (initialized) {
            return;
        }

        if (!document.querySelector('.employee-dashboard')) {
            return;
        }
        
        console.log('Employee dashboard module initializing...');
        
        initGreeting();
        initLiveClock();
        initTypewriter();
        animateStatsCards();
        setupAssetCardInteractions();
        
        initialized = true;
        console.log('Employee dashboard module initialized.');
    }
    
    // ============================================
    // Initialize Greeting - FIXED
    // ============================================
    function initGreeting() {
        var greetingElement = document.getElementById('greetingMessage');
        var iconElement = document.getElementById('greetingIcon');
        
        if (!greetingElement) {
            console.warn('Greeting element not found');
            return;
        }
        
        var now = new Date();
        var hour = now.getHours();
        var greeting = '';
        var iconClass = '';
        
        if (hour >= 5 && hour < 12) {
            greeting = 'Good Morning';
            iconClass = 'fas fa-sun greeting-icon';
        } else if (hour >= 12 && hour < 17) {
            greeting = 'Good Afternoon';
            iconClass = 'fas fa-cloud-sun greeting-icon';
        } else if (hour >= 17 && hour < 21) {
            greeting = 'Good Evening';
            iconClass = 'fas fa-moon greeting-icon';
        } else {
            greeting = 'Good Night';
            iconClass = 'fas fa-moon greeting-icon';
        }
        
        greetingElement.textContent = greeting;
        
        if (iconElement) {
            // Remove all existing classes and set the new one
            iconElement.className = iconClass;
            console.log('Greeting icon set to:', iconClass);
        }
        
        console.log('Greeting set to:', greeting, 'at hour:', hour);
    }
    
    // ============================================
    // Initialize Live Clock
    // ============================================
    function initLiveClock() {
        var timeElement = document.getElementById('liveTime');
        var dateElement = document.getElementById('liveDate');
        
        if (!timeElement) {
            console.warn('Live time element not found');
            return;
        }
        
        // Clear any existing interval
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
        
        function updateClock() {
            var now = new Date();
            
            // Format time: HH:MM:SS
            var hours = String(now.getHours()).padStart(2, '0');
            var minutes = String(now.getMinutes()).padStart(2, '0');
            var seconds = String(now.getSeconds()).padStart(2, '0');
            
            timeElement.textContent = hours + ':' + minutes + ':' + seconds;
            
            // Format date: Monday, January 1, 2024
            if (dateElement) {
                var options = { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                };
                dateElement.textContent = now.toLocaleDateString('en-US', options);
            }
        }
        
        // Update immediately
        updateClock();
        
        // Update every second
        clockInterval = setInterval(updateClock, 1000);
        
        console.log('Live clock initialized');
    }
    
    // ============================================
    // Initialize Typewriter - One time only
    // ============================================
    function initTypewriter() {
        var element = document.getElementById('typewriterText');
        if (!element) {
            console.warn('Typewriter element not found');
            return;
        }
        
        // Clear any existing timeout
        if (typewriterTimeout) {
            clearTimeout(typewriterTimeout);
            typewriterTimeout = null;
        }
        
        var messages = [
            'Welcome to your asset dashboard',
            'Manage your assigned assets easily',
            'Track your asset history',
            'Stay updated with notifications'
        ];
        
        var messageIndex = 0;
        var charIndex = 0;
        var isDeleting = false;
        var speed = 100;
        var isComplete = false;
        
        function type() {
            // Stop if complete
            if (isComplete) {
                return;
            }
            
            var currentMessage = messages[messageIndex];
            
            if (isDeleting) {
                element.textContent = currentMessage.substring(0, charIndex - 1);
                charIndex--;
                speed = 50;
                
                if (charIndex === 0) {
                    isDeleting = false;
                    messageIndex = (messageIndex + 1) % messages.length;
                    // Stop after showing all messages once
                    if (messageIndex === 0) {
                        isComplete = true;
                        return;
                    }
                    setTimeout(type, 500);
                    return;
                }
            } else {
                element.textContent = currentMessage.substring(0, charIndex + 1);
                charIndex++;
                speed = 100;
                
                if (charIndex === currentMessage.length) {
                    isDeleting = true;
                    speed = 2000;
                }
            }
            
            typewriterTimeout = setTimeout(type, speed);
        }
        
        // Start typing after a short delay
        setTimeout(type, 500);
        
        console.log('Typewriter initialized - One time only');
    }
    
    // ============================================
    // Animate Stats Cards
    // ============================================
    function animateStatsCards() {
        var cards = document.querySelectorAll('.stat-card');
        
        if (cards.length === 0) {
            console.warn('No stat cards found');
            return;
        }
        
        cards.forEach(function(card, index) {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            setTimeout(function() {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, CONFIG.ANIMATION_DELAY + (index * 100));
        });
        
        console.log('Stats cards animated:', cards.length);
    }
    
    // ============================================
    // Setup Asset Card Interactions
    // ============================================
    function setupAssetCardInteractions() {
        var assetCards = document.querySelectorAll('.asset-card');
        
        assetCards.forEach(function(card) {
            card.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-4px)';
                this.style.boxShadow = '0 8px 25px rgba(0,0,0,0.1)';
            });
            
            card.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = 'none';
            });
        });
        
        console.log('Asset card interactions set up:', assetCards.length);
    }
    
    // ============================================
    // Cleanup on page unload
    // ============================================
    function cleanup() {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
        if (typewriterTimeout) {
            clearTimeout(typewriterTimeout);
            typewriterTimeout = null;
        }
        console.log('Cleanup completed');
    }
    
    // ============================================
    // Export
    // ============================================
    window.Dashboard = {
        init: init,
        cleanup: cleanup
    };
    
    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, initializing employee dashboard...');
            init();
        });
    } else {
        console.log('DOM already ready, initializing employee dashboard...');
        init();
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    
    console.log('Employee dashboard module loaded.');
    
})();