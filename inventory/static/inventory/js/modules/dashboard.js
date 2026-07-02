/**
 * DASHBOARD MODULE - ITAM SYSTEM
 * Handles dashboard interactivity: typewriter, greeting, stats animation
 */

(function() {
    'use strict';
    
    // ============================================
    // Configuration
    // ============================================
    var TYPING_SPEED = 70;
    var ERASING_SPEED = 35;
    var PAUSE_BEFORE_ERASE = 3000;
    var PAUSE_BEFORE_TYPING = 500;
    
    var typewriterMessages = [
        'Welcome to ITAM V2.0',
        'Manage your assets efficiently',
        'Track assignments in real-time',
        'Stay on top of maintenance',
        'Your IT assets, organized'
    ];
    
    var isStatsAnimated = false;
    var statsObserver = null;
    
    // ============================================
    // Greeting Function with Font Awesome Icons
    // ============================================
    function getGreeting() {
        var hour = new Date().getHours();
        var icon = '';
        var message = '';
        
        if (hour >= 5 && hour < 12) {
            message = 'Good Morning';
            icon = 'fa-sun';
        } else if (hour >= 12 && hour < 17) {
            message = 'Good Afternoon';
            icon = 'fa-cloud-sun';
        } else if (hour >= 17 && hour < 21) {
            message = 'Good Evening';
            icon = 'fa-moon';
        } else {
            message = 'Good Night';
            icon = 'fa-star';
        }
        
        return { message: message, icon: icon };
    }
    
    // ============================================
    // Update Greeting
    // ============================================
    function updateGreeting() {
        var greeting = getGreeting();
        var greetingElement = document.getElementById('greetingMessage');
        var iconElement = document.getElementById('greetingIcon');
        
        if (greetingElement) {
            greetingElement.textContent = greeting.message;
        }
        if (iconElement) {
            // Update Font Awesome icon
            iconElement.className = 'fas ' + greeting.icon + ' greeting-icon';
        }
    }
    
    // ============================================
    // Live Time and Date
    // ============================================
    function updateClock() {
        var now = new Date();
        var timeElement = document.getElementById('liveTime');
        var dateElement = document.getElementById('liveDate');
        
        if (timeElement) {
            var hours = String(now.getHours()).padStart(2, '0');
            var minutes = String(now.getMinutes()).padStart(2, '0');
            var seconds = String(now.getSeconds()).padStart(2, '0');
            timeElement.textContent = hours + ':' + minutes + ':' + seconds;
        }
        
        if (dateElement) {
            var options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            };
            dateElement.textContent = now.toLocaleDateString('en-US', options);
        }
        
        var lastUpdated = document.getElementById('lastUpdated');
        if (lastUpdated) {
            var nowStr = now.getFullYear() + '-' + 
                String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                String(now.getDate()).padStart(2, '0') + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0') + ':' +
                String(now.getSeconds()).padStart(2, '0');
            lastUpdated.textContent = nowStr;
        }
    }
    
    // ============================================
    // Typewriter Effect
    // ============================================
    function typewriterEffect() {
        var element = document.getElementById('typewriterText');
        if (!element) return;
        
        var messageIndex = 0;
        var charIndex = 0;
        var isDeleting = false;
        var typingTimer = null;
        
        function type() {
            var currentMessage = typewriterMessages[messageIndex];
            
            if (isDeleting) {
                element.textContent = currentMessage.substring(0, charIndex - 1);
                charIndex--;
                
                if (charIndex === 0) {
                    isDeleting = false;
                    messageIndex = (messageIndex + 1) % typewriterMessages.length;
                    clearTimeout(typingTimer);
                    typingTimer = setTimeout(type, PAUSE_BEFORE_TYPING);
                    return;
                }
                
                typingTimer = setTimeout(type, ERASING_SPEED);
            } else {
                element.textContent = currentMessage.substring(0, charIndex + 1);
                charIndex++;
                
                if (charIndex === currentMessage.length) {
                    isDeleting = true;
                    clearTimeout(typingTimer);
                    typingTimer = setTimeout(type, PAUSE_BEFORE_ERASE);
                    return;
                }
                
                typingTimer = setTimeout(type, TYPING_SPEED);
            }
        }
        
        type();
    }
    
    // ============================================
    // Animate Stats - Counting Effect
    // ============================================
    function animateStats() {
        var statNumbers = document.querySelectorAll('.stat-number[data-count]');
        
        statNumbers.forEach(function(stat) {
            var target = parseInt(stat.getAttribute('data-count'));
            if (target === 0) {
                stat.textContent = '0';
                return;
            }
            
            var current = 0;
            var duration = 1200;
            var steps = 30;
            var increment = target / steps;
            var stepTime = duration / steps;
            
            // Reset to 0 first
            stat.textContent = '0';
            
            var timer = setInterval(function() {
                current += increment;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }
                stat.textContent = Math.round(current);
            }, stepTime);
        });
    }
    
    // ============================================
    // Animate Overdue Cards
    // ============================================
    function animateOverdueCards() {
        var cards = document.querySelectorAll('.overdue-card');
        cards.forEach(function(card, index) {
            var delay = (index + 1) * 100;
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.classList.remove('visible');
            
            setTimeout(function() {
                card.classList.add('visible');
            }, delay);
        });
    }
    
    // ============================================
    // Setup Scroll Observer for Stats
    // ============================================
    function setupScrollObserver() {
        var statsSection = document.querySelector('.dashboard-stats');
        if (!statsSection) return;
        
        if ('IntersectionObserver' in window) {
            statsObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting && !isStatsAnimated) {
                        isStatsAnimated = true;
                        animateStats();
                        animateOverdueCards();
                        statsObserver.disconnect();
                    }
                });
            }, {
                threshold: 0.2,
                rootMargin: '0px 0px -50px 0px'
            });
            
            statsObserver.observe(statsSection);
        } else {
            animateStats();
            animateOverdueCards();
        }
    }
    
    // ============================================
    // Reset Stats for Re-animation
    // ============================================
    function resetStats() {
        var statNumbers = document.querySelectorAll('.stat-number[data-count]');
        statNumbers.forEach(function(stat) {
            stat.textContent = '0';
        });
        
        var cards = document.querySelectorAll('.overdue-card');
        cards.forEach(function(card) {
            card.classList.remove('visible');
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
        });
    }
    
    // ============================================
    // Refresh Dashboard Data
    // ============================================
    function refreshDashboardData() {
        // Only update the clock - NO page reload
        updateClock();
    }
    
    // ============================================
    // Initialize Dashboard
    // ============================================
    function init() {
        console.log('Dashboard module initializing...');
        
        updateGreeting();
        updateClock();
        
        // Update clock every second
        setInterval(updateClock, 1000);
        
        // Typewriter effect
        typewriterEffect();
        
        // Setup scroll observer for stats
        setupScrollObserver();
        
        // Refresh data every minute (NO page reload)
        setInterval(refreshDashboardData, 60000);
        
        console.log('Dashboard module initialized.');
    }
    
    // ============================================
    // Export
    // ============================================
    window.Dashboard = {
        init: init,
        refresh: refreshDashboardData,
        getGreeting: getGreeting,
        animateStats: animateStats,
        resetStats: resetStats
    };
    
    console.log('Dashboard module loaded.');
    
})();