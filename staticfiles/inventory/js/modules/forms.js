/**
 * FORMS MODULE
 * Handles form validation, submission, and error handling
 */

(function() {
    'use strict';
    
    // ============================================
    // Form Configuration
    // ============================================
    const FORM_SELECTORS = {
        assetForm: '#asset-form',
        employeeForm: '#employee-form',
        assignmentForm: '#assignment-form'
    };
    
    // ============================================
    // Initialize Forms
    // ============================================
    function initForms() {
        // Asset Form
        const assetForm = document.querySelector(FORM_SELECTORS.assetForm);
        if (assetForm) {
            assetForm.addEventListener('submit', function(event) {
                handleAssetFormSubmit(event, assetForm);
            });
            
            // Real-time validation on blur
            assetForm.querySelectorAll('input, select, textarea').forEach(function(field) {
                field.addEventListener('blur', function() {
                    validateField(field);
                });
                field.addEventListener('input', function() {
                    if (field.classList.contains('is-invalid')) {
                        validateField(field);
                    }
                });
            });
        }
        
        // Employee Form
        const employeeForm = document.querySelector(FORM_SELECTORS.employeeForm);
        if (employeeForm) {
            employeeForm.addEventListener('submit', function(event) {
                handleEmployeeFormSubmit(event, employeeForm);
            });
            
            employeeForm.querySelectorAll('input, select, textarea').forEach(function(field) {
                field.addEventListener('blur', function() {
                    validateField(field);
                });
                field.addEventListener('input', function() {
                    if (field.classList.contains('is-invalid')) {
                        validateField(field);
                    }
                });
            });
        }
        
        // Assignment Form
        const assignmentForm = document.querySelector(FORM_SELECTORS.assignmentForm);
        if (assignmentForm) {
            assignmentForm.addEventListener('submit', function(event) {
                handleAssignmentFormSubmit(event, assignmentForm);
            });
        }
        
        // Delete forms
        document.querySelectorAll('.delete-form').forEach(function(form) {
            form.addEventListener('submit', function(event) {
                if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
                    event.preventDefault();
                }
            });
        });
    }
    
    // ============================================
    // Field Validation
    // ============================================
    function validateField(field) {
        const formGroup = field.closest('.form-group');
        if (!formGroup) return;
        
        let isValid = true;
        let errorMessage = '';
        
        // Required validation
        if (field.hasAttribute('required')) {
            const value = field.value ? field.value.trim() : '';
            if (!value) {
                isValid = false;
                errorMessage = 'This field is required.';
            }
        }
        
        // Email validation
        if (field.type === 'email' && field.value) {
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(field.value.trim())) {
                isValid = false;
                errorMessage = 'Please enter a valid email address.';
            }
        }
        
        // Pattern validation
        if (field.hasAttribute('pattern') && field.value) {
            const pattern = new RegExp(field.getAttribute('pattern'));
            if (!pattern.test(field.value)) {
                isValid = false;
                errorMessage = field.getAttribute('title') || 'Invalid format.';
            }
        }
        
        // Min length validation
        if (field.hasAttribute('minlength') && field.value) {
            const minLength = parseInt(field.getAttribute('minlength'));
            if (field.value.length < minLength) {
                isValid = false;
                errorMessage = 'Minimum length is ' + minLength + ' characters.';
            }
        }
        
        // Max length validation
        if (field.hasAttribute('maxlength') && field.value) {
            const maxLength = parseInt(field.getAttribute('maxlength'));
            if (field.value.length > maxLength) {
                isValid = false;
                errorMessage = 'Maximum length is ' + maxLength + ' characters.';
            }
        }
        
        // Show or clear error
        if (!isValid) {
            showFieldError(field, errorMessage);
        } else {
            clearFieldError(field);
        }
        
        return isValid;
    }
    
    function showFieldError(field, message) {
        const formGroup = field.closest('.form-group');
        if (!formGroup) return;
        
        // Remove existing errors
        clearFieldError(field);
        
        field.classList.add('is-invalid');
        formGroup.classList.add('has-error');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error-message';
        errorDiv.textContent = message;
        formGroup.appendChild(errorDiv);
    }
    
    function clearFieldError(field) {
        field.classList.remove('is-invalid');
        const formGroup = field.closest('.form-group');
        if (!formGroup) return;
        const errorDiv = formGroup.querySelector('.field-error-message');
        if (errorDiv) {
            errorDiv.remove();
        }
        if (!formGroup.querySelector('.field-errors')) {
            formGroup.classList.remove('has-error');
        }
    }
    
    function clearAllErrors(form) {
        form.querySelectorAll('.is-invalid').forEach(function(el) {
            el.classList.remove('is-invalid');
        });
        form.querySelectorAll('.form-group.has-error').forEach(function(el) {
            if (!el.querySelector('.field-errors')) {
                el.classList.remove('has-error');
            }
        });
        form.querySelectorAll('.field-error-message').forEach(function(el) {
            el.remove();
        });
    }
    
    // ============================================
    // Validate All Fields in Form
    // ============================================
    function validateForm(form) {
        let isValid = true;
        const fields = form.querySelectorAll('input, select, textarea');
        
        fields.forEach(function(field) {
            if (!validateField(field)) {
                isValid = false;
            }
        });
        
        return isValid;
    }
    
    // ============================================
    // Asset Form Submission
    // ============================================
    function handleAssetFormSubmit(event, form) {
        event.preventDefault();
        form.classList.add('validation-attempted');
        clearAllErrors(form);
        
        if (!validateForm(form)) {
            // Scroll to first error
            const firstError = form.querySelector('.is-invalid');
            if (firstError) {
                firstError.focus();
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            showToast('Please fix the errors before submitting.', 'error');
            return;
        }
        
        // Submit the form
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.textContent : 'Submit';
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }
        
        // Form will submit normally via Django
        form.submit();
    }
    
    // ============================================
    // Employee Form Submission
    // ============================================
    function handleEmployeeFormSubmit(event, form) {
        event.preventDefault();
        clearAllErrors(form);
        
        if (!validateForm(form)) {
            const firstError = form.querySelector('.is-invalid');
            if (firstError) {
                firstError.focus();
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            showToast('Please fix the errors before submitting.', 'error');
            return;
        }
        
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }
        
        form.submit();
    }
    
    // ============================================
    // Assignment Form Submission
    // ============================================
    function handleAssignmentFormSubmit(event, form) {
        event.preventDefault();
        clearAllErrors(form);
        
        // Validate the form
        const employeeSelect = form.querySelector('select[name="employee"]');
        if (employeeSelect && !employeeSelect.value) {
            showFieldError(employeeSelect, 'Please select an employee.');
            employeeSelect.focus();
            showToast('Please select an employee to assign.', 'error');
            return;
        }
        
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Assigning...';
        }
        
        form.submit();
    }
    
    // ============================================
    // Export
    // ============================================
    window.FormManager = {
        init: initForms,
        validateField: validateField,
        validateForm: validateForm,
        clearAllErrors: clearAllErrors,
        showFieldError: showFieldError,
        clearFieldError: clearFieldError
    };
    
    // Auto-init when DOM is ready
    document.addEventListener('DOMContentLoaded', initForms);
    
})();