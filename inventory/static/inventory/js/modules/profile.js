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
        
        // Fallback selectors
        if (!profileToggle) {
            profileToggle = document.querySelector('.profile-btn');
        }
        if (!profileDropdown) {
            profileDropdown = document.querySelector('.dropdown-menu');
        }
        
        if (profileToggle && profileDropdown) {
            console.log('Profile dropdown elements found.');
            setupDropdown();
        } else {
            console.warn('Profile dropdown elements not found.');
            if (!profileToggle) console.warn('profileToggle not found');
            if (!profileDropdown) console.warn('profileDropdown not found');
        }
        
        // Setup profile page interactions if on profile page
        setupProfilePageInteractions();
        
        // Setup avatar click functionality
        setupAvatarClick();
        
        // Setup quick action cards
        setupQuickActions();
        
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
            e.preventDefault();
            toggleDropdown();
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            var target = event.target;
            if (!target.closest('.profile-dropdown') && !target.closest('.profile-btn')) {
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
            item.addEventListener('click', function(e) {
                // Don't close if it's a link with data-loader
                if (this.getAttribute('data-loader')) {
                    // Let the loader handle it
                    return;
                }
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
    // Check if dropdown is open
    // ============================================
    function isOpen() {
        return profileDropdown ? profileDropdown.classList.contains('open') : false;
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
        
        // Animate profile cards on load
        animateCards();
        
        // Setup tab switching if tabs exist
        setupProfileTabs();
        
        // Setup edit profile functionality
        setupEditProfile();
        
        console.log('Profile page interactions set up.');
    }
    
    // ============================================
    // Animate Cards
    // ============================================
    function animateCards() {
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
    }
    
    // ============================================
    // Setup Profile Tabs
    // ============================================
    function setupProfileTabs() {
        var tabs = document.querySelectorAll('.profile-tab');
        var tabContents = document.querySelectorAll('.profile-tab-content');
        
        if (!tabs.length || !tabContents.length) {
            return;
        }
        
        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                // Remove active class from all tabs
                tabs.forEach(function(t) {
                    t.classList.remove('active');
                });
                
                // Add active class to clicked tab
                this.classList.add('active');
                
                // Hide all tab contents
                tabContents.forEach(function(content) {
                    content.classList.remove('active');
                });
                
                // Show the corresponding tab content
                var targetId = this.getAttribute('data-tab');
                var targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }
    
    // ============================================
    // Setup Edit Profile
    // ============================================
    function setupEditProfile() {
        var editBtn = document.querySelector('.edit-profile-btn');
        var saveBtn = document.querySelector('.save-profile-btn');
        var cancelBtn = document.querySelector('.cancel-profile-btn');
        var editFields = document.querySelectorAll('.profile-edit-field');
        var viewFields = document.querySelectorAll('.profile-view-field');
        
        if (!editBtn) {
            return;
        }
        
        editBtn.addEventListener('click', function() {
            // Show edit fields, hide view fields
            viewFields.forEach(function(field) {
                field.style.display = 'none';
            });
            editFields.forEach(function(field) {
                field.style.display = 'block';
            });
            editBtn.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'inline-block';
            if (cancelBtn) cancelBtn.style.display = 'inline-block';
        });
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                // Show view fields, hide edit fields
                viewFields.forEach(function(field) {
                    field.style.display = 'block';
                });
                editFields.forEach(function(field) {
                    field.style.display = 'none';
                });
                editBtn.style.display = 'inline-block';
                if (saveBtn) saveBtn.style.display = 'none';
                this.style.display = 'none';
            });
        }
        
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                // Collect form data
                var formData = {};
                var inputs = document.querySelectorAll('.profile-edit-field input, .profile-edit-field select, .profile-edit-field textarea');
                inputs.forEach(function(input) {
                    formData[input.name] = input.value;
                });
                
                // Here you would typically send the data to the server
                console.log('Saving profile data:', formData);
                
                // Show success message
                if (window.Utils && typeof window.Utils.showToast === 'function') {
                    window.Utils.showToast('Profile updated successfully!', 'success');
                } else {
                    alert('Profile updated successfully!');
                }
                
                // Update view fields with new values
                inputs.forEach(function(input) {
                    var viewField = document.querySelector('.profile-view-field[data-field="' + input.name + '"]');
                    if (viewField) {
                        viewField.textContent = input.value;
                    }
                });
                
                // Switch back to view mode
                viewFields.forEach(function(field) {
                    field.style.display = 'block';
                });
                editFields.forEach(function(field) {
                    field.style.display = 'none';
                });
                editBtn.style.display = 'inline-block';
                this.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
            });
        }
    }
    
    // ============================================
    // Setup Avatar Click
    // ============================================
    function setupAvatarClick() {
        var avatarBadge = document.querySelector('.profile-avatar-badge');
        var avatarInput = document.querySelector('#avatar-upload');
        
        if (avatarBadge) {
            avatarBadge.addEventListener('click', function() {
                if (avatarInput) {
                    avatarInput.click();
                } else {
                    // Show notification if file input doesn't exist
                    if (window.Utils && typeof window.Utils.showToast === 'function') {
                        window.Utils.showToast('Avatar upload feature coming soon!', 'info');
                    } else {
                        alert('Avatar upload feature coming soon!');
                    }
                }
            });
        }
        
        if (avatarInput) {
            avatarInput.addEventListener('change', function(e) {
                if (this.files && this.files[0]) {
                    var reader = new FileReader();
                    reader.onload = function(event) {
                        var avatarImg = document.querySelector('.profile-avatar-large');
                        if (avatarImg) {
                            avatarImg.src = event.target.result;
                        }
                        // Also update dropdown avatar if it exists
                        var dropdownAvatar = document.querySelector('.dropdown-avatar');
                        if (dropdownAvatar) {
                            dropdownAvatar.src = event.target.result;
                        }
                        // Also update topbar avatar if it exists
                        var topbarAvatar = document.querySelector('.profile-avatar');
                        if (topbarAvatar) {
                            topbarAvatar.src = event.target.result;
                        }
                    };
                    reader.readAsDataURL(this.files[0]);
                }
            });
        }
    }
    
    // ============================================
    // Setup Quick Actions
    // ============================================
    function setupQuickActions() {
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
            action.addEventListener('click', function(e) {
                // If it's a link, let it navigate normally
                var href = this.getAttribute('href');
                if (href && href !== '#') {
                    return;
                }
                e.preventDefault();
                if (window.Utils && typeof window.Utils.showToast === 'function') {
                    window.Utils.showToast('Feature coming soon!', 'info');
                }
            });
        });
    }
    
    // ============================================
    // Setup Password Change
    // ============================================
    function setupPasswordChange() {
        var changePasswordBtn = document.querySelector('.change-password-btn');
        var passwordModal = document.querySelector('#passwordModal');
        var closeModalBtn = document.querySelector('.close-modal');
        
        if (!changePasswordBtn || !passwordModal) {
            return;
        }
        
        changePasswordBtn.addEventListener('click', function() {
            passwordModal.classList.add('active');
        });
        
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', function() {
                passwordModal.classList.remove('active');
            });
        }
        
        // Close modal when clicking outside
        passwordModal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
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
        isOpen: isOpen
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