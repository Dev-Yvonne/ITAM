/**
 * ASSET MODULE
 * Handles asset management: list, detail, and actions
 */

(function() {
    'use strict';
    
    // ============================================
    // DOM Elements
    // ============================================
    let elements = {};
    let isInitialized = false;
    
    // ============================================
    // Initialize Asset Module
    // ============================================
    function init() {
        if (isInitialized) {
            return;
        }
        isInitialized = true;
        // Cache DOM elements
        elements = {
            assetTable: document.querySelector('.asset-table'),
            assetTableBody: document.querySelector('#asset-table-body'),
            filterForm: document.querySelector('.filter-form'),
            assignButtons: document.querySelectorAll('.action-assign'),
            returnButtons: document.querySelectorAll('.action-return'),
            deleteButtons: document.querySelectorAll('.action-delete')
        };
        
        // Setup event listeners
        setupFilterForm();
        setupActionButtons();
        loadAssetTable();
        
        console.log('Asset module initialized.');
    }

    // ============================================
    // Asset Table Rendering
    // ============================================
    async function loadAssetTable() {
        if (!elements.assetTableBody || !window.Utils || typeof window.Utils.apiRequest !== 'function') {
            return;
        }

        renderSkeletonRows();

        try {
            const assets = await window.Utils.apiRequest(getAssetListUrl());
            renderAssetRows(assets);
        } catch (error) {
            console.error('Failed to load assets:', error);
            renderTableMessage('Unable to load assets. Please refresh the page.');

            if (typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Unable to load assets.', 'error');
            }
        }
    }

    function getAssetListUrl() {
        const apiUrl = elements.assetTableBody.dataset.apiUrl || '/api/assets';
        const currentParams = new URLSearchParams(window.location.search);
        const apiParams = new URLSearchParams();

        ['type', 'status'].forEach(function(key) {
            const value = currentParams.get(key);
            if (value) {
                apiParams.set(key, value);
            }
        });

        const queryString = apiParams.toString();
        return queryString ? apiUrl + '?' + queryString : apiUrl;
    }

    function renderSkeletonRows() {
        const rows = [];

        for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
            rows.push(
                '<tr class="skeleton-row" aria-hidden="true">' +
                    '<td><span class="skeleton skeleton-text skeleton-wide"></span></td>' +
                    '<td><span class="skeleton skeleton-text"></span></td>' +
                    '<td><span class="skeleton skeleton-text skeleton-wide"></span></td>' +
                    '<td><span class="skeleton skeleton-badge"></span></td>' +
                    '<td><span class="skeleton skeleton-text skeleton-wide"></span></td>' +
                    '<td><span class="skeleton skeleton-text skeleton-wide"></span></td>' +
                    '<td><span class="skeleton skeleton-text skeleton-wide"></span></td>' +
                    '<td><span class="skeleton skeleton-text"></span></td>' +
                    '<td><span class="skeleton skeleton-actions"></span></td>' +
                '</tr>'
            );
        }

        elements.assetTableBody.innerHTML = rows.join('');
    }

    function renderAssetRows(assets) {
        if (!Array.isArray(assets) || assets.length === 0) {
            renderTableMessage('No assets found.');
            return;
        }

        elements.assetTableBody.innerHTML = assets.map(renderAssetRow).join('');
    }

    function renderAssetRow(asset) {
        const statusLabel = asset.status_label || asset.status || '';
        const statusClass = String(statusLabel).toLowerCase().replace(/\s+/g, '');
        const assignee = formatAssignee(asset.assigned_employee);

        return (
            '<tr>' +
                '<td><a href="/assets/' + encodeURIComponent(asset.id) + '/" class="asset-name-link">' + escapeHtml(asset.name) + '</a></td>' +
                '<td>' + escapeHtml(asset.type) + '</td>' +
                '<td>' + escapeHtml(asset.serial_number) + '</td>' +
                '<td><span class="badge badge-' + escapeHtml(statusClass) + '">' + escapeHtml(statusLabel) + '</span></td>' +
                '<td>' + assignee + '</td>' +
                '<td class="date-cell">' + formatDate(asset.date_created) + '</td>' +
                '<td class="date-cell">' + formatDate(asset.date_assigned) + '</td>' +
                '<td class="date-cell">' + formatDate(asset.date_returned) + '</td>' +
                '<td class="actions-cell">' +
                    '<a href="/assets/' + encodeURIComponent(asset.id) + '/" class="btn btn-sm btn-primary">View</a>' +
                    '<a href="/assets/' + encodeURIComponent(asset.id) + '/edit/" class="btn btn-sm btn-secondary">Edit</a>' +
                    '<a href="/assets/' + encodeURIComponent(asset.id) + '/delete/" class="btn btn-sm btn-danger">Delete</a>' +
                '</td>' +
            '</tr>'
        );
    }

    function formatAssignee(employee) {
        if (!employee) {
            return '—';
        }

        const abbreviation = employee.department_abbreviation || abbreviateDepartment(employee.department);

        return (
            '<div class="assignee-cell">' +
                '<span class="assignee-name">' + escapeHtml(employee.name) + '</span>' +
                '<span class="department-abbreviation">' + escapeHtml(abbreviation) + '</span>' +
            '</div>'
        );
    }

    function abbreviateDepartment(department) {
        const abbreviations = {
            'Technical & Core Programme Directorates': 'TCPD',
            'Capacity Building & Innovation Directorates': 'CBID',
            'Institutional Support & Advisory Operations': 'ISAO'
        };

        if (abbreviations[department]) {
            return abbreviations[department];
        }

        return String(department || '')
            .replace(/&/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .map(function(word) {
                return word.charAt(0).toUpperCase();
            })
            .join('');
    }

    function renderTableMessage(message) {
        elements.assetTableBody.innerHTML =
            '<tr>' +
                '<td colspan="9" class="empty-state">' +
                    '<div class="empty-state-content">' +
                        '<h3>' + escapeHtml(message) + '</h3>' +
                    '</div>' +
                '</td>' +
            '</tr>';
    }

    function formatDate(value) {
        if (!value) {
            return '—';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '—';
        }

        const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();

        return month + ' ' + day + ', ' + year;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    // ============================================
    // Setup Filter Form
    // ============================================
    function setupFilterForm() {
        if (elements.filterForm) {
            const selectors = elements.filterForm.querySelectorAll('select');
            selectors.forEach(function(select) {
                select.addEventListener('change', function() {
                    elements.filterForm.submit();
                });
            });
        }
    }
    
    // ============================================
    // Setup Action Buttons
    // ============================================
    function setupActionButtons() {
        // Assign buttons
        elements.assignButtons.forEach(function(button) {
            button.addEventListener('click', function(event) {
                const assetId = this.dataset.id;
                const assetName = this.dataset.name;
                handleAssign(assetId, assetName);
            });
        });
        
        // Return buttons
        elements.returnButtons.forEach(function(button) {
            button.addEventListener('click', function(event) {
                const assetId = this.dataset.id;
                const assetName = this.dataset.name;
                handleReturn(assetId, assetName);
            });
        });
        
        // Delete buttons
        elements.deleteButtons.forEach(function(button) {
            button.addEventListener('click', function(event) {
                const assetId = this.dataset.id;
                const assetName = this.dataset.name;
                if (!confirm('Are you sure you want to delete "' + assetName + '"? This action cannot be undone.')) {
                    event.preventDefault();
                }
            });
        });
    }
    
    // ============================================
    // Handle Assign Action
    // ============================================
    function handleAssign(assetId, assetName) {
        const employeeId = prompt('Enter the Employee ID to assign "' + assetName + '":');
        
        if (!employeeId) return;
        
        if (!employeeId.match(/^\d+$/)) {
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Please enter a valid Employee ID.', 'error');
            }
            return;
        }
        
        if (confirm('Assign "' + assetName + '" to Employee ID ' + employeeId + '?')) {
            performAssign(assetId, employeeId);
        }
    }
    
    // ============================================
    // Perform Assign API Call
    // ============================================
    async function performAssign(assetId, employeeId) {
        try {
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Assigning asset...', 'info');
            }
            
            const url = '/api/assets/' + assetId + '/assign/';
            const data = { employee_id: employeeId };
            
            const result = await window.Utils.apiRequest(url, 'POST', data);
            
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Asset assigned successfully!', 'success');
            }
            
            // Refresh the page to update the list
            setTimeout(function() {
                window.location.reload();
            }, 1000);
            
        } catch (error) {
            console.error('Assignment failed:', error);
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Assignment failed: ' + error.message, 'error');
            }
        }
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
            
            const url = '/api/assets/' + assetId + '/return/';
            
            await window.Utils.apiRequest(url, 'POST');
            
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Asset returned successfully!', 'success');
            }
            
            // Refresh the page to update the list
            setTimeout(function() {
                window.location.reload();
            }, 1000);
            
        } catch (error) {
            console.error('Return failed:', error);
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Return failed: ' + error.message, 'error');
            }
        }
    }
    
    // ============================================
    // Export
    // ============================================
    window.AssetManager = {
        init: init,
        handleAssign: handleAssign,
        handleReturn: handleReturn
    };
    
})();