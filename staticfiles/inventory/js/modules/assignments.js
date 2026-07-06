/**
 * ASSIGNMENT MODULE - ITAM SYSTEM
 * Handles asset assignment and return operations
 * Uses existing asset endpoints: /api/assets/{id}/assign/ and /api/assets/{id}/return/
 */

(function() {
    'use strict';
    
    // ============================================
    // Initialize Assignment Module
    // ============================================
    function init() {
        setupReturnButtons();
        console.log('Assignment module initialized.');
    }
    
    // ============================================
    // Setup Return Buttons
    // ============================================
    function setupReturnButtons() {
        const returnButtons = document.querySelectorAll('.action-return');
        returnButtons.forEach(function(button) {
            button.addEventListener('click', function(event) {
                const assetId = this.dataset.id;
                const assetName = this.dataset.asset || 'Asset';
                handleReturn(assetId, assetName);
            });
        });
    }
    
    // ============================================
    // Handle Return Action
    // ============================================
    function handleReturn(assetId, assetName) {
        if (!confirm('Return "' + assetName + '" to inventory?')) {
            return;
        }
        
        performReturn(assetId);
    }
    
    // ============================================
    // Perform Return API Call
    // ============================================
    async function performReturn(assetId) {
        try {
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Returning asset...', 'info');
            }
            
            // ✅ Uses existing backend endpoint: POST /api/assets/{id}/return/
            const url = '/api/assets/' + assetId + '/return/';
            
            await window.Utils.apiRequest(url, 'POST');
            
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Asset returned successfully!', 'success');
            }
            
            setTimeout(function() {
                window.location.reload();
            }, 1000);
            
        } catch (error) {
            console.error('Return failed:', error);
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast(
                    window.Utils.getUserFacingError(error, 'Return failed. Please try again.'),
                    'error'
                );
            }
        }
    }
    
    // ============================================
    // Open Assignment Modal
    // ============================================
    function openModal(assetId, assetName, onSuccess) {
        const employeeId = prompt('Enter the Employee ID to assign "' + assetName + '":');
        if (!employeeId) return;
        
        if (!employeeId.match(/^\d+$/)) {
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Please enter a valid Employee ID.', 'error');
            }
            return;
        }
        
        if (confirm('Assign "' + assetName + '" to Employee ID ' + employeeId + '?')) {
            performAssign(assetId, employeeId, onSuccess);
        }
    }
    
    // ============================================
    // Perform Assign API Call
    // ============================================
    async function performAssign(assetId, employeeId, onSuccess) {
        try {
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Assigning asset...', 'info');
            }
            
            // ✅ Uses existing backend endpoint: POST /api/assets/{id}/assign/
            const url = '/api/assets/' + assetId + '/assign/';
            const data = { employee_id: employeeId };
            
            await window.Utils.apiRequest(url, 'POST', data);
            
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Asset assigned successfully!', 'success');
            }
            
            if (onSuccess && typeof onSuccess === 'function') {
                onSuccess();
            }
            
        } catch (error) {
            console.error('Assignment failed:', error);
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast(
                    window.Utils.getUserFacingError(error, 'Assignment failed. Please try again.'),
                    'error'
                );
            }
        }
    }
    
    // ============================================
    // Export
    // ============================================
    window.AssignmentManager = {
        init: init,
        openModal: openModal,
        returnAsset: handleReturn,
        performAssign: performAssign,
        performReturn: performReturn
    };
    
})();