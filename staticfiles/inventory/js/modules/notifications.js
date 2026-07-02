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
    var isFetching = false;
    
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
        
        // Check if we just came back from notifications page
        var justViewed = sessionStorage.getItem('notifications_viewed');
        if (justViewed === 'true') {
            // Clear the badge immediately
            updateBadge(0);
            sessionStorage.removeItem('notifications_viewed');
            // Fetch fresh count
            fetchNotifications();
        } else {
            loadNotificationCount();
        }
        
        // Listen for click on bell - clear badge immediately
        bell.addEventListener('click', function(e) {
            // Mark as viewed when clicking the bell
            sessionStorage.setItem('notifications_viewed', 'true');
            // Clear badge immediately
            updateBadge(0);
            // Allow navigation to proceed
        });
        
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
        // Prevent multiple simultaneous fetches
        if (isFetching) {
            console.log('Notification fetch already in progress, skipping...');
            return;
        }
        
        isFetching = true;
        
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
        })
        .finally(function() {
            isFetching = false;
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
            badge.textContent = '';
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
                sessionStorage.setItem('notifications_viewed', 'true');
                
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
    // Start Polling - Single interval only
    // ============================================
    function startPolling() {
        // Clear any existing interval
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        
        // Set a single interval for polling
        pollInterval = setInterval(function() {
            // Only poll if document is visible and not already fetching
            if (!document.hidden && !isFetching) {
                var viewed = sessionStorage.getItem('notifications_viewed');
                if (viewed !== 'true') {
                    fetchNotifications();
                }
            }
        }, CONFIG.POLL_INTERVAL);
        
        console.log('Notification polling started with interval:', CONFIG.POLL_INTERVAL, 'ms');
    }
    
    // ============================================
    // Stop Polling
    // ============================================
    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
            console.log('Notification polling stopped.');
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
        getUnreadCount: function() { return unreadCount; },
        stopPolling: stopPolling,
        startPolling: startPolling
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