/**
 * EMPLOYEE NOTIFICATIONS MODULE
 * Handles notification interactions for employee portal
 */

(function() {
    'use strict';

    var notificationBadge = document.getElementById('notificationBadge');
    var notificationBell = document.getElementById('notificationBell');
    var notificationDropdown = document.getElementById('employeeNotificationDropdown');

    // ============================================
    // Get CSRF Token
    // ============================================
    function getCsrfToken() {
        var name = 'csrftoken';
        var cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // ============================================
    // Update Badge Count
    // ============================================
    function updateBadgeCount() {
        if (!notificationBadge) return;

        var unreadItems = document.querySelectorAll('.notification-item.unread');
        var count = unreadItems.length;

        if (count > 0) {
            notificationBadge.textContent = count > 99 ? '99+' : count;
            notificationBadge.classList.remove('hidden');
            if (count > 5) {
                notificationBadge.classList.add('many');
            } else {
                notificationBadge.classList.remove('many');
            }
        } else {
            notificationBadge.textContent = '';
            notificationBadge.classList.add('hidden');
            notificationBadge.classList.remove('many');
        }
    }

    // ============================================
    // Update Filter Counts
    // ============================================
    function updateFilterCounts() {
        var filters = document.querySelectorAll('.filter-btn');
        var allItems = document.querySelectorAll('.notification-item');
        var unreadItems = document.querySelectorAll('.notification-item.unread');
        var readItems = document.querySelectorAll('.notification-item:not(.unread)');

        filters.forEach(function(filter) {
            var filterType = filter.dataset.filter;
            var count = 0;
            
            switch(filterType) {
                case 'all':
                    count = allItems.length;
                    break;
                case 'unread':
                    count = unreadItems.length;
                    break;
                case 'read':
                    count = readItems.length;
                    break;
            }

            var badge = filter.querySelector('.filter-count');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline' : 'none';
            }
        });
    }

    // ============================================
    // Mark Single Notification as Read
    // ============================================
    window.markAsRead = function(notificationId) {
        if (!notificationId) return;

        var item = document.querySelector('.notification-item[data-notification-id="' + notificationId + '"]');

        if (item) {
            item.classList.remove('unread');
        }

        fetch('/employee/notifications/' + notificationId + '/mark-read/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRFToken': getCsrfToken(),
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
                    throw new Error('Failed to mark as read');
                }
                return data;
            });
        })
        .then(function(data) {
            updateBadgeCount();
            updateFilterCounts();
        })
        .catch(function(error) {
            console.warn('Error marking notification as read:', error);
            if (item) {
                item.classList.add('unread');
            }
        });
    };

    // ============================================
    // Handle Notification Click
    // ============================================
    window.handleNotificationClick = function(notificationId, link) {
        var item = document.querySelector('.notification-item[data-notification-id="' + notificationId + '"]');
        
        if (item && item.classList.contains('unread')) {
            item.classList.remove('unread');
            
            fetch('/employee/notifications/' + notificationId + '/mark-read/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
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
                        throw new Error('Failed to mark as read');
                    }
                    return data;
                });
            })
            .then(function(data) {
                updateBadgeCount();
                updateFilterCounts();
            })
            .catch(function(error) {
                console.warn('Error marking notification as read:', error);
                if (item) {
                    item.classList.add('unread');
                }
            });
        }
        
        if (link) {
            setTimeout(function() {
                window.location.href = link;
            }, 300);
        }
    };

    // ============================================
    // Mark All Notifications as Read
    // ============================================
    window.markAllRead = function() {
        var items = document.querySelectorAll('.notification-item.unread');

        if (items.length === 0) {
            showToast('No unread notifications', 'info');
            return;
        }

        var btn = document.querySelector('.mark-all-link');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Loading...';
        }

        // Optimistically update UI
        items.forEach(function(item) {
            item.classList.remove('unread');
        });

        fetch('/employee/notifications/mark-all-read/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRFToken': getCsrfToken(),
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
                    throw new Error('Failed to mark all as read');
                }
                return data;
            });
        })
        .then(function(data) {
            updateBadgeCount();
            updateFilterCounts();
            showToast('All notifications marked as read', 'success');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Mark all read';
            }
        })
        .catch(function(error) {
            console.warn('Error marking all as read:', error);
            items.forEach(function(item) {
                item.classList.add('unread');
            });
            showToast(
                window.Utils
                    ? window.Utils.getUserFacingError(error, 'Error marking all as read')
                    : 'Error marking all as read',
                'error'
            );
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Mark all read';
            }
        });
    };

    // ============================================
    // Filter Notifications
    // ============================================
    function initFilters() {
        var filters = document.querySelectorAll('.filter-btn');
        
        filters.forEach(function(filter) {
            filter.addEventListener('click', function() {
                filters.forEach(function(f) {
                    f.classList.remove('active');
                });
                this.classList.add('active');

                var filterType = this.dataset.filter;
                var items = document.querySelectorAll('.notification-item');

                items.forEach(function(item) {
                    var isUnread = item.classList.contains('unread');

                    switch(filterType) {
                        case 'all':
                            item.style.display = 'flex';
                            break;
                        case 'unread':
                            item.style.display = isUnread ? 'flex' : 'none';
                            break;
                        case 'read':
                            item.style.display = !isUnread ? 'flex' : 'none';
                            break;
                    }
                });
            });
        });
    }

    // ============================================
    // Toggle Notification Dropdown
    // ============================================
    function initDropdown() {
        if (notificationBell && notificationDropdown) {
            notificationBell.addEventListener('click', function(e) {
                e.stopPropagation();
                notificationDropdown.classList.toggle('open');
            });

            document.addEventListener('click', function(e) {
                if (!notificationBell.contains(e.target) && !notificationDropdown.contains(e.target)) {
                    notificationDropdown.classList.remove('open');
                }
            });

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && notificationDropdown.classList.contains('open')) {
                    notificationDropdown.classList.remove('open');
                }
            });
        }
    }

    // ============================================
    // Show Toast Notification
    // ============================================
    function showToast(message, type) {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            // Fallback
            console.log(message);
        }
    }

    // ============================================
    // Initialize
    // ============================================
    function init() {
        initDropdown();
        initFilters();
        updateBadgeCount();
        updateFilterCounts();
        console.log('Employee notifications module initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();