/**
 * EMPLOYEE COMMON MODULE
 * Shared functions for employee portal
 */

(function() {
    'use strict';
    
    // ============================================
    // CSRF Token Helper
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
    // Toast Notification
    // ============================================
    function showToast(message, type) {
        type = type || 'info';
        
        // Check if Utils module exists
        if (window.Utils && typeof window.Utils.showToast === 'function') {
            window.Utils.showToast(message, type);
            return;
        }
        
        // Fallback toast
        var toast = document.createElement('div');
        toast.className = 'toast-notification toast-' + type;
        toast.textContent = message;
        
        var colors = {
            success: '#22c55e',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        
        toast.style.cssText = [
            'position: fixed',
            'bottom: 20px',
            'right: 20px',
            'padding: 12px 20px',
            'border-radius: 8px',
            'color: white',
            'z-index: 9999',
            'font-size: 14px',
            'font-weight: 500',
            'box-shadow: 0 4px 12px rgba(0,0,0,0.15)',
            'animation: slideIn 0.3s ease',
            'background: ' + (colors[type] || colors.info)
        ].join(';');
        
        document.body.appendChild(toast);
        
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(function() {
                toast.remove();
            }, 300);
        }, 3000);
    }
    
    // ============================================
    // Confirm Asset Receipt
    // ============================================
    function confirmAsset(assignmentId) {
        if (!assignmentId) {
            showToast('Invalid assignment ID', 'error');
            return;
        }
        
        if (!confirm('Are you sure you want to confirm receipt of this asset?')) {
            return;
        }
        
        var btn = document.querySelector('.confirm-btn[data-id="' + assignmentId + '"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirming...';
        }
        
        fetch('/employee/asset/' + assignmentId + '/confirm/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Content-Type': 'application/json'
            }
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                showToast('Asset confirmed successfully!', 'success');
                setTimeout(function() {
                    location.reload();
                }, 1000);
            } else {
                showToast(data.message || 'Error confirming asset', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-check"></i> Confirm';
                }
            }
        })
        .catch(function(error) {
            showToast('Error confirming asset', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Confirm';
            }
        });
    }
    
    // ============================================
    // Report Issue
    // ============================================
    function reportIssue(assignmentId) {
        if (!assignmentId) {
            showToast('Invalid assignment ID', 'error');
            return;
        }
        
        var modal = document.getElementById('reportIssueModal');
        if (modal) {
            var form = modal.querySelector('form');
            if (form) {
                form.action = '/employee/asset/' + assignmentId + '/report-issue/';
            }
            // Show modal using Bootstrap or custom
            if (typeof $ !== 'undefined' && $.fn.modal) {
                $(modal).modal('show');
            } else {
                modal.style.display = 'block';
                modal.classList.add('show');
            }
        } else {
            // Fallback: redirect to report page
            window.location.href = '/employee/asset/' + assignmentId + '/report-issue/';
        }
    }
    
    // ============================================
    // Request Maintenance
    // ============================================
    function requestMaintenance(assignmentId) {
        if (!assignmentId) {
            showToast('Invalid assignment ID', 'error');
            return;
        }
        
        if (!confirm('Request maintenance for this asset?')) {
            return;
        }
        
        var btn = document.querySelector('.maintenance-btn[data-id="' + assignmentId + '"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Requesting...';
        }
        
        fetch('/employee/asset/' + assignmentId + '/maintenance/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Content-Type': 'application/json'
            }
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                showToast('Maintenance request submitted successfully!', 'success');
            } else {
                showToast(data.message || 'Error requesting maintenance', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-tools"></i> Request Maintenance';
                }
            }
        })
        .catch(function(error) {
            showToast('Error requesting maintenance', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-tools"></i> Request Maintenance';
            }
        });
    }
    
    // ============================================
    // Request Return
    // ============================================
    function requestReturn(assignmentId) {
        if (!assignmentId) {
            showToast('Invalid assignment ID', 'error');
            return;
        }
        
        if (!confirm('Are you sure you want to return this asset?')) {
            return;
        }
        
        var btn = document.querySelector('.return-btn[data-id="' + assignmentId + '"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        }
        
        fetch('/employee/asset/' + assignmentId + '/return/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Content-Type': 'application/json'
            }
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                showToast('Asset returned successfully!', 'success');
                setTimeout(function() {
                    location.reload();
                }, 1000);
            } else {
                showToast(data.message || 'Error returning asset', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-undo"></i> Return Asset';
                }
            }
        })
        .catch(function(error) {
            showToast('Error returning asset', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-undo"></i> Return Asset';
            }
        });
    }
    
    // ============================================
    // Mark Notification as Read
    // ============================================
    function markAsRead(notificationId) {
        if (!notificationId) {
            showToast('Invalid notification ID', 'error');
            return;
        }
        
        fetch('/employee/notifications/mark-read/' + notificationId + '/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Content-Type': 'application/json'
            }
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                var item = document.querySelector('.notification-item[data-id="' + notificationId + '"]');
                if (item) {
                    item.classList.remove('unread');
                }
                // Update badge count
                var badge = document.querySelector('.notification-badge');
                if (badge) {
                    var unreadCount = Number.isInteger(data.unread_count)
                        ? data.unread_count
                        : Math.max((parseInt(badge.textContent) || 0) - 1, 0);
                    badge.textContent = unreadCount > 0 ? unreadCount : '';
                    if (unreadCount <= 0) {
                        badge.classList.add('hidden');
                    }
                }
            } else {
                showToast(data.message || 'Error marking notification as read', 'error');
            }
        })
        .catch(function(error) {
            showToast('Error marking notification as read', 'error');
        });
    }
    
    // ============================================
    // Mark All Notifications as Read
    // ============================================
    function markAllRead() {
        fetch('/employee/notifications/mark-all-read/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Content-Type': 'application/json'
            }
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                showToast('All notifications marked as read', 'success');
                var items = document.querySelectorAll('.notification-item.unread');
                items.forEach(function(item) {
                    item.classList.remove('unread');
                });
                var badge = document.querySelector('.notification-badge');
                if (badge) {
                    badge.textContent = '0';
                    badge.classList.add('hidden');
                }
            } else {
                showToast(data.message || 'Error marking notifications as read', 'error');
            }
        })
        .catch(function(error) {
            showToast('Error marking notifications as read', 'error');
        });
    }
    
    // ============================================
    // Clear All Notifications
    // ============================================
    function clearAll() {
        if (!confirm('Are you sure you want to clear all notifications?')) {
            return;
        }
        
        var items = document.querySelectorAll('.notification-item');
        items.forEach(function(item) {
            item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            item.style.opacity = '0';
            item.style.transform = 'translateX(20px)';
        });
        
        setTimeout(function() {
            items.forEach(function(item) {
                item.remove();
            });
            var badge = document.querySelector('.notification-badge');
            if (badge) {
                badge.textContent = '0';
                badge.classList.add('hidden');
            }
            showToast('All notifications cleared', 'info');
        }, 300);
    }
    
    // ============================================
    // Search Assets
    // ============================================
    function searchAssets(query) {
        var cards = document.querySelectorAll('.asset-card');
        var searchTerm = query.toLowerCase().trim();
        
        cards.forEach(function(card) {
            var name = card.querySelector('.asset-name')?.textContent?.toLowerCase() || '';
            var serial = card.querySelector('.asset-serial')?.textContent?.toLowerCase() || '';
            var type = card.querySelector('.asset-type')?.textContent?.toLowerCase() || '';
            
            var match = name.includes(searchTerm) || 
                       serial.includes(searchTerm) || 
                       type.includes(searchTerm);
            
            if (searchTerm === '') {
                card.style.display = 'block';
            } else if (match) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }
    
    // ============================================
    // Filter Assets by Status
    // ============================================
    function filterAssets(status) {
        var cards = document.querySelectorAll('.asset-card');
        
        cards.forEach(function(card) {
            var cardStatus = card.getAttribute('data-status') || '';
            if (status === 'all' || cardStatus === status) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // ============================================
    // Notification Dropdown
    // ============================================
    function setupNotificationDropdown() {
        var bell = document.getElementById('notificationBell');
        var dropdown = document.getElementById('employeeNotificationDropdown');

        if (!bell || !dropdown) {
            return;
        }

        bell.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            dropdown.classList.toggle('active');
        });

        dropdown.addEventListener('click', function(event) {
            event.stopPropagation();
        });

        document.addEventListener('click', function() {
            dropdown.classList.remove('active');
        });
    }
    
    // ============================================
    // Initialize Employee Common
    // ============================================
    function init() {
        console.log('Employee common module initialized.');
        setupNotificationDropdown();
        
        // Setup search input handler
        var searchInput = document.getElementById('assetSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                searchAssets(this.value);
            });
        }
        
        // Setup status filter handler
        var statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', function() {
                filterAssets(this.value);
            });
        }
        
        // Setup mark all read button
        var markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', function(e) {
                e.preventDefault();
                markAllRead();
            });
        }
        
        // Setup clear all button
        var clearAllBtn = document.getElementById('clearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', function(e) {
                e.preventDefault();
                clearAll();
            });
        }
    }
    
    // ============================================
    // Export
    // ============================================
    window.EmployeeCommon = {
        init: init,
        getCSRFToken: getCSRFToken,
        showToast: showToast,
        confirmAsset: confirmAsset,
        reportIssue: reportIssue,
        requestMaintenance: requestMaintenance,
        requestReturn: requestReturn,
        markAsRead: markAsRead,
        markAllRead: markAllRead,
        clearAll: clearAll,
        searchAssets: searchAssets,
        filterAssets: filterAssets
    };
    
    // Expose functions globally for inline usage
    window.confirmAsset = confirmAsset;
    window.reportIssue = reportIssue;
    window.requestMaintenance = requestMaintenance;
    window.requestReturn = requestReturn;
    window.markAsRead = markAsRead;
    window.markAllRead = markAllRead;
    window.clearAll = clearAll;
    window.searchAssets = searchAssets;
    window.filterAssets = filterAssets;
    window.showToast = showToast;
    
    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    console.log('Employee common module loaded.');
    
})();