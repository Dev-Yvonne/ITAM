/**
 * NOTIFICATION MODULE - ITAM SYSTEM
 * Handles notification bell, badge updates, and polling
 */

(function() {
    'use strict';
    
    var initialized = false;
    var pollInterval = null;
    var unreadCount = 0;
    var badge = null;
    var bell = null;
    
    // ============================================
    // Configuration
    // ============================================
    var CONFIG = {
        POLL_INTERVAL: 30000, // 30 seconds
        BADGE_UPDATE_URL: '/api/notifications/',
        MARK_READ_URL: '/api/notifications/mark-all-read/'
    };
    
    // ============================================
    // Initialize
    // ============================================
    function init() {
        if (initialized) {
            return;
        }
        
        console.log('Notification module initializing...');
        
        // Get DOM elements
        badge = document.getElementById('notificationBadge');
        bell = document.getElementById('notificationBell');
        
        if (!badge || !bell) {
            console.warn('Notification elements not found.');
            return;
        }
        
        // Load initial count
        loadNotificationCount();
        
        // Start polling for updates
        startPolling();
        
        // Listen for notification events
        document.addEventListener('new-notification', function(e) {
            if (e.detail && e.detail.count) {
                updateBadge(e.detail.count);
            }
        });
        
        initialized = true;
        console.log('Notification module initialized.');
    }
    
    // ============================================
    // Load Notification Count
    // ============================================
    function loadNotificationCount() {
        // Check if we have a count in session storage
        var savedCount = sessionStorage.getItem('notification_count');
        if (savedCount !== null) {
            unreadCount = parseInt(savedCount, 10);
            updateBadge(unreadCount);
            return;
        }
        
        // Fetch from server
        fetchNotifications();
    }
    
    // ============================================
    // Fetch Notifications from Server
    // ============================================
    function fetchNotifications() {
        fetch(CONFIG.BADGE_UPDATE_URL, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(function(data) {
            if (data && typeof data.unread_count !== 'undefined') {
                unreadCount = data.unread_count;
                sessionStorage.setItem('notification_count', unreadCount);
                updateBadge(unreadCount);
            }
        })
        .catch(function(error) {
            console.warn('Error fetching notifications:', error);
        });
    }
    
    // ============================================
    // Update Badge
    // ============================================
    function updateBadge(count) {
        if (!badge) return;
        
        unreadCount = count || 0;
        sessionStorage.setItem('notification_count', unreadCount);
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
            
            // Add special animation for many notifications
            if (unreadCount > 10) {
                badge.classList.add('many');
            } else {
                badge.classList.remove('many');
            }
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('many');
        }
    }
    
    // ==========================================
    // Increment Badge
    // ==========================================
    function incrementBadge() {
        var newCount = unreadCount + 1;
        updateBadge(newCount);
        
        // Play notification sound
        playNotificationSound();
    }
    
    // ==========================================
    // Mark All as Read
    // ==========================================
    function markAllAsRead() {
        fetch(CONFIG.MARK_READ_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken(),
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                updateBadge(0);
                sessionStorage.removeItem('notification_count');
                
                // Dispatch event
                document.dispatchEvent(new CustomEvent('notifications-cleared'));
            }
        })
        .catch(function(error) {
            console.warn('Error marking notifications as read:', error);
        });
    }
    
    // ============================================
    // Get CSRF Token
    // ============================================
    function getCSRFToken() {
        var cookieValue = null;
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            if (cookie.startsWith('csrftoken=')) {
                cookieValue = cookie.substring('csrftoken='.length, cookie.length);
                break;
            }
        }
        return cookieValue || '';
    }
    
    // ============================================
    // Play Notification Sound
    // ============================================
    function playNotificationSound() {
        try {
            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            var oscillator = audioCtx.createOscillator();
            var gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.2);
        } catch (e) {
            // Silent fail if audio not supported
        }
    }
    
    // ============================================
    // Start Polling
    // ============================================
    function startPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
        }
        
        pollInterval = setInterval(function() {
            // Only poll if document is visible
            if (!document.hidden) {
                fetchNotifications();
            }
        }, CONFIG.POLL_INTERVAL);
        
        // Also poll when page becomes visible again
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                fetchNotifications();
            }
        });
    }
    
    // ============================================
    // Stop Polling
    // ============================================
    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }
    
    // ============================================
    // Reinitialize
    // ============================================
    function reinit() {
        console.log('Reinitializing notifications...');
        stopPolling();
        initialized = false;
        init();
    }
    
    // ============================================
    // Export
    // ============================================
    window.Notifications = {
        init: init,
        reinit: reinit,
        updateBadge: updateBadge,
        incrementBadge: incrementBadge,
        markAllAsRead: markAllAsRead,
        getUnreadCount: function() { return unreadCount; }
    };
    
    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, initializing notifications...');
            init();
        });
    } else {
        if (!initialized) {
            console.log('DOM already ready, initializing notifications...');
            init();
        }
    }
    
    console.log('Notification module loaded.');
    
})();