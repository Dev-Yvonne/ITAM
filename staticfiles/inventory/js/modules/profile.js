/**
 * PROFILE MODULE - ITAM SYSTEM
 * Handles profile dropdown functionality and profile page interactions
 */

(function() {
    'use strict';
    
    // ============================================
    // DOM Elements
    // ============================================
    var profileToggle = null;
    var profileDropdown = null;
    var initialized = false;
    
    // ============================================
    // Initialize Profile
    // ============================================
    function init() {
        if (initialized) {
            return;
        }
        
        console.log('Profile module initializing...');
        
        // Get dropdown elements
        profileToggle = document.getElementById('profileToggle');
        profileDropdown = document.getElementById('profileDropdown');
        
        if (profileToggle && profileDropdown) {
            console.log('Profile dropdown elements found.');
            setupDropdown();
        } else {
            console.warn('Profile dropdown elements not found.');
        }
        
        // Setup profile page interactions if on profile page
        setupProfilePageInteractions();
        
        initialized = true;
        console.log('Profile module initialized.');
    }
    
    // ============================================
    // Setup Dropdown
    // ============================================
    function setupDropdown() {
        // Toggle dropdown on button click
        profileToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleDropdown();
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            var target = event.target;
            if (!target.closest('.profile-dropdown')) {
                closeDropdown();
            }
        });
        
        // Close dropdown on Escape key
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closeDropdown();
            }
        });
        
        // Handle dropdown item clicks
        var dropdownItems = profileDropdown.querySelectorAll('.dropdown-item');
        dropdownItems.forEach(function(item) {
            item.addEventListener('click', function() {
                // Close dropdown after clicking an item
                closeDropdown();
            });
        });
    }
    
    // ============================================
    // Toggle Dropdown
    // ============================================
    function toggleDropdown() {
        if (profileDropdown) {
            profileDropdown.classList.toggle('open');
            console.log('Profile dropdown:', profileDropdown.classList.contains('open') ? 'OPEN' : 'CLOSED');
        }
    }
    
    // ============================================
    // Close Dropdown
    // ============================================
    function closeDropdown() {
        if (profileDropdown) {
            profileDropdown.classList.remove('open');
        }
    }
    
    // ============================================
    // Open Dropdown
    // ============================================
    function openDropdown() {
        if (profileDropdown) {
            profileDropdown.classList.add('open');
        }
    }
    
    // ============================================
    // Setup Profile Page Interactions
    // ============================================
    function setupProfilePageInteractions() {
        // Check if we're on the profile page
        var profileContainer = document.querySelector('.profile-container');
        if (!profileContainer) {
            return;
        }
        
        console.log('Profile page detected. Setting up interactions...');
        
        // Avatar hover effect
        var avatarBadge = document.querySelector('.profile-avatar-badge');
        if (avatarBadge) {
            avatarBadge.addEventListener('click', function() {
                if (window.Utils && typeof window.Utils.showToast === 'function') {
                    window.Utils.showToast('Avatar update feature coming soon!', 'info');
                }
            });
        }
        
        // Quick action cards hover effect
        var quickActions = document.querySelectorAll('.quick-action');
        quickActions.forEach(function(action) {
            action.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            });
            action.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = 'none';
            });
        });
        
        // Profile cards animation on scroll
        var cards = document.querySelectorAll('.profile-card');
        cards.forEach(function(card, index) {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            setTimeout(function() {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 100 + (index * 100));
        });
        
        console.log('Profile page interactions set up.');
    }
    
    // ============================================
    // Reinitialize
    // ============================================
    function reinit() {
        console.log('Reinitializing profile...');
        initialized = false;
        init();
    }
    
    // ============================================
    // Export
    // ============================================
    window.Profile = {
        init: init,
        reinit: reinit,
        toggle: toggleDropdown,
        open: openDropdown,
        close: closeDropdown,
        isOpen: function() {
            return profileDropdown ? profileDropdown.classList.contains('open') : false;
        }
    };
    
    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, initializing profile...');
            init();
        });
    } else {
        if (!initialized) {
            console.log('DOM already ready, initializing profile...');
            init();
        }
    }
    
    console.log('Profile module loaded.');
    
})();