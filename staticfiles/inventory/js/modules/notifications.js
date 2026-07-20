/**
 * NOTIFICATION MODULE - ITAM SYSTEM
 * Handles notification bell, badge updates, dropdown rendering, and polling
 */

(function() {
    'use strict';
    
    var initialized = false;
    var pollInterval = null;
    var unreadCount = 0;
    var badge = null;
    var bell = null;
    var dropdown = null;
    var dropdownList = null;
    var markAllButton = null;
    var isFetching = false;
    var cachedNotifications = [];
    
    var CONFIG = {
        POLL_INTERVAL: 30000,
        BADGE_UPDATE_URL: '/api/notifications/',
        MARK_READ_URL: '/api/notifications/mark-all-read/'
    };

    function escapeHtml(value) {
        if (window.Utils && typeof window.Utils.escapeHtml === 'function') {
            return window.Utils.escapeHtml(value);
        }
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function iconClassForType(type) {
        if (type === 'success') {
            return 'fa-check-circle';
        }
        if (type === 'warning') {
            return 'fa-exclamation-triangle';
        }
        if (type === 'error' || type === 'danger') {
            return 'fa-times-circle';
        }
        return 'fa-info-circle';
    }

    function formatNotificationTime(value) {
        if (!value) {
            return 'Just now';
        }

        var date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'Just now';
        }

        var diffMs = Date.now() - date.getTime();
        var minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) {
            return 'Just now';
        }
        if (minutes < 60) {
            return minutes + ' minute' + (minutes === 1 ? '' : 's') + ' ago';
        }

        var hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
        }

        var days = Math.floor(hours / 24);
        return days + ' day' + (days === 1 ? '' : 's') + ' ago';
    }

    function renderDropdownList(notifications) {
        if (!dropdownList) {
            return;
        }

        cachedNotifications = Array.isArray(notifications) ? notifications : [];

        if (!cachedNotifications.length) {
            dropdownList.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
            return;
        }

        dropdownList.innerHTML = cachedNotifications.slice(0, 10).map(function(notification) {
            var unreadClass = notification.read ? '' : ' unread';
            var type = notification.type || 'info';
            var timeLabel = formatNotificationTime(notification.time);
            return '' +
                '<div class="notification-item' + unreadClass + '" data-notification-id="' + escapeHtml(notification.id) + '" role="button" tabindex="0">' +
                    '<div class="notification-icon ' + escapeHtml(type) + '" aria-hidden="true">' +
                        '<i class="fas ' + iconClassForType(type) + '"></i>' +
                    '</div>' +
                    '<div class="notification-content">' +
                        '<div class="notification-heading">' +
                            '<div class="notification-title">' + escapeHtml(notification.title) + '</div>' +
                            (timeLabel ? '<div class="notification-time">' + escapeHtml(timeLabel) + '</div>' : '') +
                        '</div>' +
                        '<div class="notification-message">' + escapeHtml(notification.message) + '</div>' +
                    '</div>' +
                '</div>';
        }).join('');
    }

    function updateMarkAllVisibility() {
        if (!markAllButton) {
            return;
        }

        if (unreadCount > 0) {
            markAllButton.classList.remove('hidden');
        } else {
            markAllButton.classList.add('hidden');
        }
    }
    
    function init() {
        if (initialized) {
            return;
        }
        
        badge = document.getElementById('notificationBadge');
        bell = document.getElementById('notificationBell');
        dropdown = document.getElementById('notificationDropdown');
        dropdownList = document.getElementById('notificationDropdownList');
        markAllButton = document.getElementById('notificationMarkAllBtn');
        
        if (!badge || !bell || !dropdown) {
            return;
        }

        if (!dropdownList) {
            dropdownList = dropdown.querySelector('.notification-dropdown-list');
        }
        
        var justViewed = sessionStorage.getItem('notifications_viewed');
        if (justViewed === 'true') {
            updateBadge(0);
            sessionStorage.removeItem('notifications_viewed');
            fetchNotifications();
        } else {
            loadNotificationCount();
        }
        
        bell.addEventListener('click', function() {
            fetchNotifications();
        });

        if (markAllButton) {
            markAllButton.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                markAllAsRead();
            });
        }
        
        startPolling();
        
        document.addEventListener('new-notification', function(event) {
            if (event.detail && event.detail.count) {
                updateBadge(event.detail.count);
            }
            fetchNotifications();
        });
        
        initialized = true;
    }
    
    function loadNotificationCount() {
        var savedCount = sessionStorage.getItem('notification_count');
        if (savedCount !== null) {
            unreadCount = parseInt(savedCount, 10);
            updateBadge(unreadCount);
        }
        
        fetchNotifications();
    }
    
    function fetchNotifications() {
        if (isFetching) {
            return;
        }
        
        isFetching = true;
        
        fetch(CONFIG.BADGE_UPDATE_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        })
        .then(function(response) {
            var parser = window.Utils && window.Utils.parseJsonResponse
                ? window.Utils.parseJsonResponse(response)
                : response.json();
            return parser.then(function(data) {
                if (!response.ok) {
                    throw new Error('Unable to refresh notifications.');
                }
                return data;
            });
        })
        .then(function(data) {
            if (data && Array.isArray(data.notifications)) {
                renderDropdownList(data.notifications);
            }
            if (data && typeof data.unread_count !== 'undefined') {
                unreadCount = data.unread_count;
                sessionStorage.setItem('notification_count', unreadCount);
                updateBadge(unreadCount);
                updateMarkAllVisibility();
            }
        })
        .catch(function(error) {
            console.warn('Error fetching notifications:', error);
        })
        .finally(function() {
            isFetching = false;
        });
    }
    
    function updateBadge(count) {
        if (!badge) {
            return;
        }
        
        unreadCount = count || 0;
        sessionStorage.setItem('notification_count', unreadCount);
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
            badge.classList.toggle('many', unreadCount > 10);
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('many');
            badge.textContent = '';
        }

        updateMarkAllVisibility();
    }
    
    function incrementBadge() {
        updateBadge(unreadCount + 1);
        playNotificationSound();
        fetchNotifications();
    }
    
    function markAllAsRead() {
        fetch(CONFIG.MARK_READ_URL, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        })
        .then(function(response) {
            var parser = window.Utils && window.Utils.parseJsonResponse
                ? window.Utils.parseJsonResponse(response)
                : response.json();
            return parser.then(function(data) {
                if (!response.ok) {
                    throw new Error('Unable to mark notifications as read.');
                }
                return data;
            });
        })
        .then(function(data) {
            if (data.success) {
                cachedNotifications = cachedNotifications.map(function(notification) {
                    return Object.assign({}, notification, { read: true });
                });
                renderDropdownList(cachedNotifications);
                updateBadge(0);
                sessionStorage.removeItem('notification_count');
            }
        })
        .catch(function(error) {
            console.warn('Error marking notifications as read:', error);
        });
    }
    
    function getCSRFToken() {
        if (window.Utils && typeof window.Utils.getCSRFToken === 'function') {
            return window.Utils.getCSRFToken();
        }

        var cookieValue = null;
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            if (cookie.startsWith('csrftoken=')) {
                cookieValue = cookie.substring('csrftoken='.length);
                break;
            }
        }
        return cookieValue || '';
    }
    
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
        } catch (error) {
            // Audio unsupported.
        }
    }
    
    function startPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
        }
        
        pollInterval = setInterval(function() {
            if (!document.hidden && !isFetching) {
                fetchNotifications();
            }
        }, CONFIG.POLL_INTERVAL);
    }
    
    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }
    
    function reinit() {
        stopPolling();
        initialized = false;
        init();
    }
    
    window.Notifications = {
        init: init,
        reinit: reinit,
        updateBadge: updateBadge,
        incrementBadge: incrementBadge,
        markAllAsRead: markAllAsRead,
        fetchNotifications: fetchNotifications,
        getUnreadCount: function() { return unreadCount; },
        stopPolling: stopPolling,
        startPolling: startPolling
    };

    window.markAllRead = function() {
        markAllAsRead();
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
