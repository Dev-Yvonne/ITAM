/**
 * ASSET MODULE
 * Handles asset management: list, detail card, assign, and return
 */

(function() {
    'use strict';

    let elements = {};
    let isInitialized = false;
    let assetCache = new Map();
    let activeAssetId = null;
    let employeeList = [];
    let isAdmin = false;

    function bulkHeaderHtml() {
        return window.AssetBulkSelect && isAdmin
            ? window.AssetBulkSelect.headerCellHtml()
            : '';
    }

    function bulkRowHtml(assetId, assetName) {
        return window.AssetBulkSelect && isAdmin
            ? window.AssetBulkSelect.rowCellHtml(assetId, assetName)
            : '';
    }

    function tableColspan(base) {
        return isAdmin ? base + 1 : base;
    }

    function refreshTableHelpers(root) {
        if (window.AssetTableExpand && typeof window.AssetTableExpand.refresh === 'function') {
            window.AssetTableExpand.refresh(root || document.getElementById('all-assets'));
        }
        if (window.AssetBulkSelect && typeof window.AssetBulkSelect.refresh === 'function') {
            window.AssetBulkSelect.refresh(root || document);
        }
    }

    function init() {
        if (isInitialized) {
            return;
        }
        isInitialized = true;

        const adminHost = document.querySelector('[data-user-is-admin]');
        isAdmin = adminHost && adminHost.getAttribute('data-user-is-admin') === 'true';

        elements = {
            assetTable: document.querySelector('.asset-table'),
            assetTableBody: document.querySelector('#asset-table-body'),
            filterForm: document.querySelector('.filter-form'),
            detailCard: document.getElementById('asset-detail-card'),
            assignButtons: document.querySelectorAll('.action-assign'),
            returnButtons: document.querySelectorAll('.action-return'),
            deleteButtons: document.querySelectorAll('.action-delete')
        };

        setupFilterForm();
        setupActionButtons();
        setupGlobalRowInteractions();
        setupDetailCard();
        loadAssetTable();

        if (isAdmin) {
            loadEmployees();
        }

        console.log('Asset module initialized.');
    }

    async function loadEmployees() {
        if (!window.Utils || typeof window.Utils.apiRequest !== 'function') {
            return;
        }

        try {
            const employees = await window.Utils.apiRequest('/api/employees/');
            employeeList = Array.isArray(employees)
                ? employees.slice().sort(function(a, b) {
                    return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
                        sensitivity: 'base'
                    });
                })
                : [];
        } catch (error) {
            console.error('Failed to load employees:', error);
        }
    }

    async function loadAssetTable() {
        if (!elements.assetTableBody || !window.Utils || typeof window.Utils.apiRequest !== 'function') {
            return;
        }

        renderSkeletonRows();

        try {
            const assets = await window.Utils.apiRequest(getAssetListUrl());
            cacheAssets(assets);
            renderAssetRows(assets);
        } catch (error) {
            console.error('Failed to load assets:', error);
            renderTableMessage('Unable to load assets. Please refresh the page.');

            if (typeof window.Utils.showToast === 'function') {
                window.Utils.showToast(
                    window.Utils.getUserFacingError(error, 'Unable to load assets.'),
                    'error'
                );
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
                    (isAdmin ? '<td><span class="skeleton skeleton-text"></span></td>' : '') +
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

    function cacheAssets(assets) {
        assetCache = new Map();
        if (!Array.isArray(assets)) {
            return;
        }
        assets.forEach(function(asset) {
            assetCache.set(String(asset.id), asset);
        });
    }

    function renderAssetRows(assets) {
        if (!Array.isArray(assets) || assets.length === 0) {
            renderTableMessage('No assets found.');
            return;
        }

        elements.assetTableBody.innerHTML = assets.map(renderAssetRow).join('');
        refreshTableHelpers(document.getElementById('all-assets'));
    }

    function renderAssetRow(asset) {
        const statusLabel = asset.status_label || asset.status || '';
        const statusClass = String(statusLabel).toLowerCase().replace(/\s+/g, '');
        const assignee = formatAssignee(asset.assigned_employee);

        return (
            '<tr class="asset-table-row" data-asset-id="' + encodeURIComponent(asset.id) + '" tabindex="0" role="button" aria-label="View details for ' + escapeHtml(asset.name) + '">' +
                bulkRowHtml(asset.id, asset.name) +
                '<td><span class="asset-name-text">' + escapeHtml(asset.name) + '</span></td>' +
                '<td>' + escapeHtml(asset.type) + '</td>' +
                '<td>' + escapeHtml(asset.serial_number) + '</td>' +
                '<td><span class="badge badge-' + escapeHtml(statusClass) + '">' + escapeHtml(statusLabel) + '</span></td>' +
                '<td>' + assignee + '</td>' +
                '<td class="date-cell">' + formatDate(asset.date_created) + '</td>' +
                '<td class="date-cell">' + formatDate(asset.date_assigned) + '</td>' +
                '<td class="date-cell">' + formatDate(asset.date_returned) + '</td>' +
                (window.AssetRowMenu
                    ? window.AssetRowMenu.cellHtml(asset.id, asset.name, {
                        canAssign: window.AssetRowMenu.canAssignAsset(asset)
                    })
                    : '<td class="actions-cell" data-row-action="true"></td>') +
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
                '<td colspan="' + tableColspan(9) + '" class="empty-state">' +
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

    function setupGlobalRowInteractions() {
        document.addEventListener('click', function(event) {
            if (event.target.closest('[data-row-action="true"]') || event.target.closest('[data-bulk-select="true"]') || event.target.closest('.asset-row-menu')) {
                return;
            }
            if (event.target.closest('.asset-detail-card-panel')) {
                return;
            }

            const row = event.target.closest('.asset-table-row');
            if (!row) {
                return;
            }

            event.preventDefault();
            handleRowActivation(row);
        });

        document.addEventListener('keydown', function(event) {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            const row = event.target.closest('.asset-table-row');
            if (!row) {
                return;
            }
            if (event.target.closest('[data-bulk-select="true"]')) {
                return;
            }

            event.preventDefault();
            handleRowActivation(row);
        });
    }

    function handleRowActivation(row) {
        const assetId = row.dataset.assetId;
        if (assetId) {
            openAssetDetailCard(assetId);
            return;
        }

        if (row.classList.contains('asset-catalog-row')) {
            openCatalogOnlyDetailCard(row);
        }
    }

    function openCatalogOnlyDetailCard(row) {
        if (!elements.detailCard) {
            return;
        }

        activeAssetId = null;
        const title = elements.detailCard.querySelector('#asset-detail-card-title');
        const subtitle = elements.detailCard.querySelector('.asset-detail-card-subtitle');
        const body = elements.detailCard.querySelector('.asset-detail-card-body');
        const footer = elements.detailCard.querySelector('.asset-detail-card-footer');

        if (title) {
            title.textContent = row.dataset.catalogName || 'Catalog Asset';
        }
        if (subtitle) {
            subtitle.innerHTML = '<span class="badge badge-' + escapeHtml(String(row.dataset.catalogStatus || '').toLowerCase().replace(/\s+/g, '')) + '">' +
                escapeHtml(row.dataset.catalogStatus || '') + '</span>';
        }
        if (body) {
            body.innerHTML =
                '<div class="asset-detail-grid">' +
                    detailField('Type', row.dataset.catalogType) +
                    detailField('Serial Number', row.dataset.serialNumber, true) +
                    detailField('Status', row.dataset.catalogStatus) +
                '</div>' +
                '<section class="asset-detail-section">' +
                    '<p class="asset-detail-empty">This catalog entry is not linked to a live inventory asset yet.</p>' +
                '</section>';
        }
        if (footer) {
            footer.innerHTML = '';
        }

        showDetailCard();
    }

    function setupDetailCard() {
        if (!elements.detailCard) {
            return;
        }

        elements.detailCard.querySelectorAll('[data-close-card]').forEach(function(node) {
            node.addEventListener('click', closeAssetDetailCard);
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && elements.detailCard.classList.contains('open')) {
                closeAssetDetailCard();
            }
        });
    }

    async function openAssetDetailCard(assetId) {
        if (!elements.detailCard) {
            return;
        }

        let asset = assetCache.get(String(assetId));

        if (!asset && window.Utils && typeof window.Utils.apiRequest === 'function') {
            try {
                asset = await window.Utils.apiRequest('/api/assets/' + encodeURIComponent(assetId) + '/');
                assetCache.set(String(assetId), asset);
            } catch (error) {
                if (typeof window.Utils.showToast === 'function') {
                    window.Utils.showToast(
                        window.Utils.getUserFacingError(error, 'Unable to load asset details.'),
                        'error'
                    );
                }
                return;
            }
        }

        if (!asset) {
            return;
        }

        activeAssetId = String(assetId);
        renderAssetDetailCard(asset);
        showDetailCard();

        document.querySelectorAll('.asset-table-row').forEach(function(row) {
            row.classList.toggle('selected', row.dataset.assetId === activeAssetId);
        });
    }

    async function openAssetDetailCardForAssign(assetId) {
        await openAssetDetailCard(assetId);
        const select = elements.detailCard && elements.detailCard.querySelector('.asset-assign-select');
        if (select) {
            select.focus();
        }
    }

    function showDetailCard() {
        elements.detailCard.classList.add('open');
        elements.detailCard.setAttribute('aria-hidden', 'false');
        document.body.classList.add('asset-detail-card-open');

        const closeButton = elements.detailCard.querySelector('.asset-detail-card-close');
        if (closeButton) {
            closeButton.focus();
        }
    }

    function closeAssetDetailCard() {
        if (!elements.detailCard) {
            return;
        }

        activeAssetId = null;
        elements.detailCard.classList.remove('open');
        elements.detailCard.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('asset-detail-card-open');

        document.querySelectorAll('.asset-table-row.selected').forEach(function(row) {
            row.classList.remove('selected');
        });
    }

    function renderAssetDetailCard(asset) {
        const statusLabel = asset.status_label || asset.status || '';
        const statusClass = String(statusLabel).toLowerCase().replace(/\s+/g, '');
        const employee = asset.assigned_employee;
        const title = elements.detailCard.querySelector('#asset-detail-card-title');
        const subtitle = elements.detailCard.querySelector('.asset-detail-card-subtitle');
        const body = elements.detailCard.querySelector('.asset-detail-card-body');
        const footer = elements.detailCard.querySelector('.asset-detail-card-footer');

        if (title) {
            title.textContent = asset.name || 'Asset';
        }
        if (subtitle) {
            subtitle.innerHTML = '<span class="badge badge-' + escapeHtml(statusClass) + '">' +
                escapeHtml(statusLabel) + '</span>';
        }

        if (body) {
            body.innerHTML =
                '<div class="asset-detail-grid">' +
                    detailField('Type', asset.type) +
                    detailField('Serial Number', asset.serial_number, true) +
                    detailField('Status', statusLabel) +
                    detailField('Created', formatDateTime(asset.date_created)) +
                    detailField('Last Assigned', formatDateTime(asset.date_assigned)) +
                    detailField('Last Returned', formatDateTime(asset.date_returned)) +
                '</div>' +
                renderAssignmentSection(employee);
        }

        renderAssetDetailCardFooter(asset, footer);
    }

    function isAssetAssigned(asset) {
        if (asset.assigned_employee) {
            return true;
        }
        if (asset.assignment_calendar && asset.assignment_calendar.currently_assigned) {
            return true;
        }
        const status = String(asset.status_label || asset.status || '').toLowerCase();
        return status === 'assigned';
    }

    function renderAssetDetailCardFooter(asset, footer) {
        if (!footer) {
            return;
        }

        if (!isAdmin) {
            footer.innerHTML = '';
            return;
        }

        const assigned = isAssetAssigned(asset);
        let html = '';

        if (!assigned) {
            html += '<div class="asset-detail-assign">' +
                '<select class="asset-assign-select" aria-label="Select employee to assign">' +
                    '<option value="">Select employee...</option>' +
                    employeeList.map(function(employee) {
                        return '<option value="' + encodeURIComponent(employee.id) + '">' +
                            escapeHtml(employee.name) + '</option>';
                    }).join('') +
                '</select>' +
                '<button type="button" class="btn btn-primary asset-detail-assign-btn">Assign</button>' +
            '</div>';
        }

        if (assigned) {
            html += '<button type="button" class="btn btn-warning asset-detail-return-btn">Return Asset</button>';
        }

        html += '<a href="/assets/' + encodeURIComponent(asset.id) + '/delete/" class="btn btn-danger">Delete</a>';
        footer.innerHTML = html;

        const assignBtn = footer.querySelector('.asset-detail-assign-btn');
        if (assignBtn) {
            assignBtn.addEventListener('click', function() {
                const select = footer.querySelector('.asset-assign-select');
                const employeeId = select ? select.value : '';
                if (!employeeId) {
                    if (window.Utils && typeof window.Utils.showToast === 'function') {
                        window.Utils.showToast('Select an employee before assigning.', 'warning');
                    }
                    return;
                }
                performAssign(asset.id, employeeId, asset.name);
            });
        }

        const returnBtn = footer.querySelector('.asset-detail-return-btn');
        if (returnBtn) {
            returnBtn.addEventListener('click', function() {
                if (!confirm('Return "' + asset.name + '" to inventory?')) {
                    return;
                }
                performReturn(asset.id);
            });
        }
    }

    function detailField(label, value, emphasize) {
        const displayValue = value ? escapeHtml(value) : '—';
        const valueClass = emphasize ? 'asset-detail-value asset-detail-value-strong' : 'asset-detail-value';
        return '' +
            '<div class="asset-detail-field">' +
                '<span class="asset-detail-label">' + escapeHtml(label) + '</span>' +
                '<span class="' + valueClass + '">' + displayValue + '</span>' +
            '</div>';
    }

    function renderAssignmentSection(employee) {
        if (!employee) {
            return '' +
                '<section class="asset-detail-section">' +
                    '<h4>Assignment</h4>' +
                    '<p class="asset-detail-empty">This asset is not currently assigned.</p>' +
                '</section>';
        }

        const abbreviation = employee.department_abbreviation || abbreviateDepartment(employee.department);

        return '' +
            '<section class="asset-detail-section">' +
                '<h4>Current Assignee</h4>' +
                '<div class="asset-detail-grid">' +
                    detailField('Name', employee.name) +
                    detailField('Department', employee.department) +
                    detailField('Department Code', abbreviation) +
                    detailField('Email', employee.email) +
                '</div>' +
            '</section>';
    }

    function formatDateTime(value) {
        if (!value) {
            return '—';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '—';
        }

        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }).format(date);
    }

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

    function setupActionButtons() {
        elements.assignButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                const assetId = this.dataset.id;
                const assetName = this.dataset.name;
                handleAssign(assetId, assetName);
            });
        });

        elements.returnButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                const assetId = this.dataset.id;
                const assetName = this.dataset.name;
                handleReturn(assetId, assetName);
            });
        });

        elements.deleteButtons.forEach(function(button) {
            button.addEventListener('click', function(event) {
                const assetName = this.dataset.name;
                if (!confirm('Are you sure you want to delete "' + assetName + '"? This action cannot be undone.')) {
                    event.preventDefault();
                }
            });
        });
    }

    function handleAssign(assetId, assetName) {
        const employeeId = prompt('Enter the Employee ID to assign "' + assetName + '":');

        if (!employeeId) {
            return;
        }

        if (!employeeId.match(/^\d+$/)) {
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Please enter a valid Employee ID.', 'error');
            }
            return;
        }

        if (confirm('Assign "' + assetName + '" to Employee ID ' + employeeId + '?')) {
            performAssign(assetId, employeeId, assetName);
        }
    }

    async function performAssign(assetId, employeeId, assetName) {
        try {
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Assigning asset...', 'info');
            }

            const url = '/api/assets/' + assetId + '/assign/';
            const result = await window.Utils.apiRequest(url, 'POST', { employee_id: employeeId });

            assetCache.set(String(assetId), result);

            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast(
                    assetName ? ('"' + assetName + '" assigned successfully!') : 'Asset assigned successfully!',
                    'success'
                );
            }

            await refreshAllTables();
            if (activeAssetId === String(assetId)) {
                renderAssetDetailCard(result);
            }
            if (window.Notifications && typeof window.Notifications.fetchNotifications === 'function') {
                window.Notifications.fetchNotifications();
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

    function handleReturn(assetId, assetName) {
        if (!confirm('Return "' + assetName + '" to inventory?')) {
            return;
        }

        performReturn(assetId);
    }

    async function performReturn(assetId) {
        try {
            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Returning asset...', 'info');
            }

            const url = '/api/assets/' + assetId + '/return/';
            const result = await window.Utils.apiRequest(url, 'POST');

            assetCache.set(String(assetId), result);

            if (window.Utils && typeof window.Utils.showToast === 'function') {
                window.Utils.showToast('Asset returned successfully!', 'success');
            }

            await refreshAllTables();
            if (activeAssetId === String(assetId)) {
                renderAssetDetailCard(result);
            }
            if (window.Notifications && typeof window.Notifications.fetchNotifications === 'function') {
                window.Notifications.fetchNotifications();
            }
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

    async function refreshAllTables() {
        await loadAssetTable();

        const mount = document.getElementById('asset-sections-mount');
        if (!mount || !window.BackgroundJobs || !window.AssetSections) {
            return;
        }

        try {
            const job = await window.BackgroundJobs.run('asset_sections', { force: true });
            mount.innerHTML = window.AssetSections.renderAll(job.result || {});
            refreshTableHelpers(mount);
        } catch (error) {
            console.error('Failed to refresh asset sections:', error);
        }
    }

    window.AssetManager = {
        init: init,
        handleAssign: handleAssign,
        handleReturn: handleReturn,
        openAssetDetailCard: openAssetDetailCard,
        openAssetDetailCardForAssign: openAssetDetailCardForAssign,
        closeAssetDetailCard: closeAssetDetailCard,
        refreshAllTables: refreshAllTables,
        activateRow: handleRowActivation
    };
})();
