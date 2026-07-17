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
        'Welcome to ITAM 3.0',
        'Manage your assets efficiently',
        'Track assignments in real-time',
        'Stay on top of maintenance',
        'Your IT assets, organized'
    ];
    
    var isStatsAnimated = false;
    var statsObserver = null;
    var greetingContext = {
        todayActivityCount: 0,
        busyDayThreshold: 3
    };
    
    // ============================================
    // Greeting + sky period
    // ============================================
    function isLateNightHour(hour) {
        return hour === 23 || hour === 0 || hour === 1 || hour === 2;
    }

    function isEarlyCoffeeHour(hour) {
        return hour >= 5 && hour <= 8;
    }

    function getStandardGreeting(now) {
        var period = getSkyPeriod(now);
        if (period === 'morning') {
            return 'Good Morning';
        }
        if (period === 'noon') {
            return 'Good Afternoon';
        }
        if (period === 'sunset') {
            return 'Good Evening';
        }
        return 'Good Night';
    }

    function getSkyPeriod(now) {
        var hour = (now || new Date()).getHours();
        var minute = (now || new Date()).getMinutes();
        var decimal = hour + (minute / 60);

        if (decimal >= 5 && decimal < 11) {
            return 'morning';
        }
        if (decimal >= 11 && decimal < 15) {
            return 'noon';
        }
        if (decimal >= 15 && decimal < 20) {
            return 'sunset';
        }
        return 'night';
    }

    function getGreeting(now) {
        now = now || new Date();
        var hour = now.getHours();

        if (isLateNightHour(hour)) {
            return 'Late night';
        }
        if (isEarlyCoffeeHour(hour)) {
            return 'Coffee and ITAM';
        }
        if (greetingContext.todayActivityCount >= greetingContext.busyDayThreshold) {
            return 'Busy day at the office';
        }
        return getStandardGreeting(now);
    }

    function setGreetingActivity(count, threshold) {
        greetingContext.todayActivityCount = Number(count) || 0;
        if (threshold !== undefined && threshold !== null) {
            greetingContext.busyDayThreshold = Number(threshold) || 3;
        }
        updateGreeting();
    }

    function updateMoonPosition(now) {
        var welcome = document.getElementById('dashboardWelcome');
        if (!welcome || welcome.getAttribute('data-sky') !== 'night') {
            return;
        }

        // Night window: 20:00 -> 05:00 (9 hours). Moon starts west/high and sets before morning.
        var hour = now.getHours();
        var minute = now.getMinutes();
        var minutesIntoNight;
        if (hour >= 20) {
            minutesIntoNight = ((hour - 20) * 60) + minute;
        } else {
            minutesIntoNight = ((hour + 4) * 60) + minute;
        }
        var progress = Math.min(1, Math.max(0, minutesIntoNight / (9 * 60)));
        var moonX = 8 + (progress * 28);
        var moonY = 18 + (progress * 58);
        welcome.style.setProperty('--moon-x', moonX.toFixed(2) + '%');
        welcome.style.setProperty('--moon-y', moonY.toFixed(2) + '%');
    }

    function updateGreeting() {
        var now = new Date();
        var greetingElement = document.getElementById('greetingMessage');
        var welcome = document.getElementById('dashboardWelcome');
        var period = getSkyPeriod(now);

        if (greetingElement) {
            greetingElement.textContent = getGreeting(now);
        }
        if (welcome) {
            welcome.setAttribute('data-sky', period);
            updateMoonPosition(now);
        }
    }

    // ============================================
    // Ambient sky clouds
    // ============================================
    var skyCloudTimer = null;
    var skyCloudMax = 7;

    function spawnSkyCloud() {
        var container = document.getElementById('welcomeSkyClouds');
        if (!container || container.children.length >= skyCloudMax) {
            return;
        }

        var cloud = document.createElement('span');
        cloud.className = 'welcome-sky-cloud';
        var width = 72 + (Math.random() * 96);
        var duration = 5 + (Math.random() * 5);
        var top = 4 + (Math.random() * 52);
        var opacity = 0.32 + (Math.random() * 0.38);
        var scale = 0.55 + (Math.random() * 0.75);
        var startOffset = Math.random() * 18;

        cloud.style.setProperty('--cloud-duration', duration.toFixed(2) + 's');
        cloud.style.setProperty('--cloud-top', top.toFixed(1) + '%');
        cloud.style.setProperty('--cloud-width', width.toFixed(0) + 'px');
        cloud.style.setProperty('--cloud-opacity', opacity.toFixed(2));
        cloud.style.setProperty('--cloud-scale', scale.toFixed(2));
        cloud.style.left = (-35 - startOffset) + '%';

        cloud.addEventListener('animationend', function() {
            if (cloud.parentNode) {
                cloud.parentNode.removeChild(cloud);
            }
        });

        container.appendChild(cloud);
    }

    function initSkyClouds() {
        var container = document.getElementById('welcomeSkyClouds');
        if (!container || skyCloudTimer) {
            return;
        }

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        var i;
        for (i = 0; i < 3; i += 1) {
            setTimeout(spawnSkyCloud, i * 900);
        }

        skyCloudTimer = setInterval(spawnSkyCloud, 1600);
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
            timeElement.textContent = hours + ':' + minutes;
            timeElement.setAttribute('datetime', now.toISOString());
        }

        if (dateElement) {
            var options = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            dateElement.textContent = now.toLocaleDateString('en-US', options);
            dateElement.setAttribute(
                'datetime',
                now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0')
            );
        }

        updateGreeting();

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
    // Async dashboard data
    // ============================================
    function renderDashboardStats(stats) {
        var container = document.getElementById('dashboard-stats');
        if (!container || !stats || !stats.length) {
            return;
        }

        container.innerHTML = stats.map(function(stat) {
            var key = stat.css_class || 'stat';
            var labelId = key + '-label';
            var valueId = key + '-value';
            var animateAttr = stat.animate_count && stat.data_count !== undefined
                ? ' data-count="' + stat.data_count + '"'
                : '';
            return '' +
                '<li class="dashboard-stats-item">' +
                    '<a href="' + stat.link + '" class="stat-card stat-card-link ' + key + '"' +
                        ' data-stat="' + key + '"' +
                        ' data-loader="true" data-loader-message="Loading Assets..."' +
                        ' aria-labelledby="' + labelId + ' ' + valueId + '">' +
                        '<header class="stat-card-head">' +
                            '<span class="stat-label" id="' + labelId + '">' + stat.label + '</span>' +
                            '<i class="fas ' + stat.icon + ' stat-icon" aria-hidden="true"></i>' +
                        '</header>' +
                        '<p class="stat-number" id="' + valueId + '"' + animateAttr + '>' + stat.value + '</p>' +
                        '<p class="stat-trend">' + stat.trend + '</p>' +
                    '</a>' +
                '</li>';
        }).join('');
    }

    function renderOverdueSection(data) {
        var container = document.getElementById('overdue-section-mount');
        if (!container) {
            return;
        }

        var overdueAssets = data.overdue_assets || [];
        if (!overdueAssets.length) {
            container.innerHTML = '' +
                '<div class="overdue-section overdue-clear">' +
                    '<div class="overdue-header">' +
                        '<h2><i class="fas fa-check-circle overdue-clear-icon" aria-hidden="true"></i> You\'re all caught up!</h2>' +
                    '</div>' +
                    '<p class="overdue-clear-message">All assets serviced within 6 months</p>' +
                '</div>';
            return;
        }

        var cards = overdueAssets.slice(0, 6).map(function(asset, index) {
            return '' +
                '<div class="overdue-card" data-delay="' + (index + 1) + '">' +
                    '<div class="overdue-card-header">' +
                        '<span class="overdue-icon"></span>' +
                        '<strong>' + asset.name + '</strong>' +
                    '</div>' +
                    '<div class="overdue-card-body">' +
                        '<p><span>Type</span> ' + asset.type + '</p>' +
                        '<p><span>Serial</span> ' + asset.serial_number + '</p>' +
                        '<p><span>Status</span> <span class="badge badge-' + String(asset.status).toLowerCase().replace(/\s+/g, '') + '">' + asset.status + '</span></p>' +
                        '<p><span>Last Service</span> ' + (asset.last_maintenance_date || 'Never') + '</p>' +
                    '</div>' +
                    '<div class="overdue-card-footer">' +
                        '<a href="' + asset.detail_url + '" class="btn-sm"><i class="fas fa-eye"></i> View Details</a>' +
                    '</div>' +
                '</div>';
        }).join('');

        var moreLink = overdueAssets.length > 6
            ? '<div class="overdue-more"><a href="' + (data.overdue_list_url || '') + '" class="btn btn-secondary"><i class="fas fa-list"></i> View All ' + overdueAssets.length + '</a></div>'
            : '';

        container.innerHTML = '' +
            '<div class="overdue-section">' +
                '<div class="overdue-header">' +
                    '<h2><i class="fas fa-exclamation-triangle" style="color: var(--danger-color, #ef4444);"></i> Overdue Service</h2>' +
                    '<span class="overdue-badge">' + overdueAssets.length + '</span>' +
                '</div>' +
                '<p class="overdue-subtitle"><strong>' + overdueAssets.length + '</strong> asset' + (overdueAssets.length > 1 ? 's' : '') + ' overdue since ' + (data.overdue_cutoff || '') + '</p>' +
                '<div class="overdue-grid">' + cards + '</div>' +
                moreLink +
            '</div>';
    }

    function applyDashboardData(data) {
        renderDashboardStats(data.dashboard_stats || []);
        renderOverdueSection(data);
        setGreetingActivity(data.today_activity_count, data.busy_day_threshold);
        if (window.DashboardAnalytics) {
            window.DashboardAnalytics.applyData(data);
        }
    }

    function loadAsyncDashboard() {
        var mount = document.getElementById('dashboard-stats');
        if (!mount || !window.BackgroundJobs) {
            return;
        }

        mount.classList.add('async-loading');
        if (window.DashboardAnalytics) {
            window.DashboardAnalytics.initTabs();
            window.DashboardAnalytics.applyData(null);
        }
        window.BackgroundJobs.run('dashboard').then(function(job) {
            var data = job.result || {};
            mount.classList.remove('async-loading');
            var overdueMount = document.getElementById('overdue-section-mount');
            if (overdueMount) {
                overdueMount.classList.remove('async-loading');
            }
            applyDashboardData(data);
            isStatsAnimated = false;
            setupScrollObserver();
        }).catch(function(error) {
            mount.classList.remove('async-loading');
            var overdueMount = document.getElementById('overdue-section-mount');
            if (overdueMount) {
                overdueMount.classList.remove('async-loading');
            }
            console.error('Dashboard async load failed:', error);
            if (window.Utils && typeof window.Utils.showAsyncError === 'function') {
                window.Utils.showAsyncError(
                    mount,
                    window.Utils.getUserFacingError(
                        error,
                        'Unable to load dashboard metrics. Refresh the page to try again.'
                    ),
                    { onRetry: loadAsyncDashboard }
                );
            }
        });
    }

    // ============================================
    // Initialize Dashboard
    // ============================================
    function init() {
        console.log('Dashboard module initializing...');
        
        updateGreeting();
        updateClock();
        initSkyClouds();
        
        // Update clock every second
        setInterval(updateClock, 1000);
        
        // Typewriter effect
        typewriterEffect();

        if (document.querySelector('.dashboard-page') && document.querySelector('.dashboard-page').dataset.asyncDashboard === 'true') {
            loadAsyncDashboard();
        } else {
            setupScrollObserver();
        }
        
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
        setGreetingActivity: setGreetingActivity,
        animateStats: animateStats,
        resetStats: resetStats
    };
    
    console.log('Dashboard module loaded.');
    
})();