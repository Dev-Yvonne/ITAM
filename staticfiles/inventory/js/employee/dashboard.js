/**
 * EMPLOYEE DASHBOARD MODULE
 * Handles dashboard-specific functionality
 */

(function() {
    'use strict';
    
    var initialized = false;
    var refreshInterval = null;
    
    // ============================================
    // Configuration
    // ============================================
    var CONFIG = {
        REFRESH_INTERVAL: 60000, // 60 seconds
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
        
        // Animate stats cards on load
        animateStatsCards();
        
        // Setup refresh button
        setupRefreshButton();
        
        // Setup notification handlers
        setupNotificationHandlers();
        
        // Setup asset card interactions
        setupAssetCardInteractions();
        
        initialized = true;
        console.log('Employee dashboard module initialized.');
    }
    
    // ============================================
    // Animate Stats Cards
    // ============================================
    function animateStatsCards() {
        var cards = document.querySelectorAll('.stat-card');
        
        cards.forEach(function(card, index) {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            setTimeout(function() {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, CONFIG.ANIMATION_DELAY + (index * 100));
        });
    }
    
    // ============================================
    // Setup Refresh Button
    // ============================================
    function setupRefreshButton() {
        var refreshBtn = document.getElementById('refreshDashboard');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function(e) {
                e.preventDefault();
                refreshDashboard();
            });
        }
    }
    
    // ============================================
    // Refresh Dashboard
    // ============================================
    function refreshDashboard() {
        var btn = document.getElementById('refreshDashboard');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        }
        
        // Show loading state on stats
        var statValues = document.querySelectorAll('.stat-value');
        statValues.forEach(function(stat) {
            stat.style.opacity = '0.5';
        });
        
        // Fetch latest data
        fetch('/api/employee/dashboard/', {
            method: 'GET',
            headers: {
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
            updateDashboardData(data);
            if (window.EmployeeCommon && typeof window.EmployeeCommon.showToast === 'function') {
                window.EmployeeCommon.showToast('Dashboard refreshed successfully!', 'success');
            }
        })
        .catch(function(error) {
            console.error('Error refreshing dashboard:', error);
            if (window.EmployeeCommon && typeof window.EmployeeCommon.showToast === 'function') {
                window.EmployeeCommon.showToast('Error refreshing dashboard', 'error');
            }
        })
        .finally(function() {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
            }
            var statValues2 = document.querySelectorAll('.stat-value');
            statValues2.forEach(function(stat) {
                stat.style.opacity = '1';
            });
        });
    }
    
    // ============================================
    // Update Dashboard Data
    // ============================================
    function updateDashboardData(data) {
        // Update stats
        var stats = {
            'total_assets': data.total_assets || 0,
            'pending_assets': data.pending_assets || 0,
            'unread_notifications': data.unread_notifications || 0,
            'due_assets': data.due_assets || 0
        };
        
        Object.keys(stats).forEach(function(key) {
            var element = document.getElementById(key);
            if (element) {
                // Animate the change
                var currentValue = parseInt(element.textContent) || 0;
                var targetValue = stats[key];
                animateNumber(element, currentValue, targetValue);
            }
        });
        
        // Update assets list if present
        var assetsContainer = document.getElementById('assetsContainer');
        if (assetsContainer && data.assets) {
            // Update assets
        }
        
        // Update notifications if present
        var notificationsContainer = document.getElementById('notificationsContainer');
        if (notificationsContainer && data.notifications) {
            // Update notifications
        }
    }
    
    // ============================================
    // Animate Number Change
    // ============================================
    function animateNumber(element, from, to) {
        var duration = 800;
        var startTime = null;
        
        function updateNumber(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            var current = Math.round(from + (to - from) * easeOutQuart(progress));
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(updateNumber);
            }
        }
        
        function easeOutQuart(t) {
            return 1 - Math.pow(1 - t, 4);
        }
        
        requestAnimationFrame(updateNumber);
    }
    
    // ============================================
    // Start Auto-Refresh
    // ============================================
    function startAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
        
        refreshInterval = setInterval(function() {
            // Only refresh if page is visible
            if (!document.hidden) {
                refreshDashboard();
            }
        }, CONFIG.REFRESH_INTERVAL);
    }
    
    // ============================================
    // Stop Auto-Refresh
    // ============================================
    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }
    
    // ============================================
    // Setup Notification Handlers
    // ============================================
    function setupNotificationHandlers() {
        // Mark notification as read when clicked
        var notificationItems = document.querySelectorAll('.notification-item');
        notificationItems.forEach(function(item) {
            item.addEventListener('click', function(e) {
                // Don't trigger if clicking on a button inside
                if (e.target.closest('.notification-actions')) {
                    return;
                }
                
                var id = this.getAttribute('data-id');
                if (id && this.classList.contains('unread')) {
                    if (window.EmployeeCommon && typeof window.EmployeeCommon.markAsRead === 'function') {
                        window.EmployeeCommon.markAsRead(id);
                    }
                }
            });
        });
    }
    
    // ============================================
    // Setup Asset Card Interactions
    // ============================================
    function setupAssetCardInteractions() {
        // Hover effects for asset cards
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
        
        // Confirm button handler
        var confirmBtns = document.querySelectorAll('.confirm-btn');
        confirmBtns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = this.getAttribute('data-id');
                if (id && window.EmployeeCommon && typeof window.EmployeeCommon.confirmAsset === 'function') {
                    window.EmployeeCommon.confirmAsset(id);
                }
            });
        });
        
        // Report issue button handler
        var reportBtns = document.querySelectorAll('.report-btn');
        reportBtns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = this.getAttribute('data-id');
                if (id && window.EmployeeCommon && typeof window.EmployeeCommon.reportIssue === 'function') {
                    window.EmployeeCommon.reportIssue(id);
                }
            });
        });
    }
    
    // ============================================
    // Load More Assets
    // ============================================
    function loadMoreAssets() {
        var loadMoreBtn = document.getElementById('loadMoreAssets');
        if (loadMoreBtn) {
            loadMoreBtn.disabled = true;
            loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }
        
        var nextPage = document.querySelector('.pagination .next-page');
        if (nextPage) {
            var url = nextPage.getAttribute('href');
            if (url) {
                fetch(url, {
                    method: 'GET',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                })
                .then(function(response) {
                    return response.text();
                })
                .then(function(html) {
                    var container = document.getElementById('assetsContainer');
                    if (container) {
                        // Extract new content
                        var tempDiv = document.createElement('div');
                        tempDiv.innerHTML = html;
                        var newContent = tempDiv.querySelector('#assetsContainer');
                        if (newContent) {
                            container.innerHTML += newContent.innerHTML;
                        }
                        // Update pagination
                        var newPagination = tempDiv.querySelector('.pagination');
                        if (newPagination) {
                            var oldPagination = document.querySelector('.pagination');
                            if (oldPagination) {
                                oldPagination.innerHTML = newPagination.innerHTML;
                            }
                        }
                        // Rebind events
                        setupAssetCardInteractions();
                    }
                })
                .catch(function(error) {
                    console.error('Error loading more assets:', error);
                    if (window.EmployeeCommon && typeof window.EmployeeCommon.showToast === 'function') {
                        window.EmployeeCommon.showToast('Error loading more assets', 'error');
                    }
                })
                .finally(function() {
                    if (loadMoreBtn) {
                        loadMoreBtn.disabled = false;
                        loadMoreBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Load More';
                    }
                });
            }
        }
    }
    
    // ============================================
    // Export
    // ============================================
    window.Dashboard = {
        init: init,
        refresh: refreshDashboard,
        loadMore: loadMoreAssets,
        animateNumber: animateNumber,
        stopAutoRefresh: stopAutoRefresh,
        startAutoRefresh: startAutoRefresh
    };
    
    // Expose functions globally
    window.loadMoreAssets = loadMoreAssets;
    window.refreshDashboard = refreshDashboard;
    
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
    
    console.log('Employee dashboard module loaded.');
    
})();