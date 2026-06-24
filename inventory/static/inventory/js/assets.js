/**
 * ============================================================
 * ASSET MANAGEMENT MODULE - ITAM SYSTEM
 * ============================================================
 * Handles:
 * - Listing assets with filters
 * - Creating, Editing, Deleting assets
 * - Assigning assets to employees
 * - Returning assets to inventory
 * ============================================================
 */

// ============================================================
// 1. CONFIGURATION & CONSTANTS
// ============================================================

const API_BASE = '/api';
const ASSET_API_URL = `${API_BASE}/assets`;

const STATUS = {
    AVAILABLE: 'available',
    ASSIGNED: 'assigned',
    MAINTENANCE: 'maintenance',
    DISPOSED: 'disposed',
};

const STATUS_LABELS = {
    [STATUS.AVAILABLE]: 'Available',
    [STATUS.ASSIGNED]: 'Assigned',
    [STATUS.MAINTENANCE]: 'Under Maintenance',
    [STATUS.DISPOSED]: 'Disposed',
};

const STATUS_BADGE_CLASSES = {
    [STATUS.AVAILABLE]: 'badge-available',
    [STATUS.ASSIGNED]: 'badge-assigned',
    [STATUS.MAINTENANCE]: 'badge-under-maintenance',
    [STATUS.DISPOSED]: 'badge-overdue',
};

function getCSRFToken() {
    const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('csrftoken='));
    return token ? decodeURIComponent(token.split('=')[1]) : '';
}

// ============================================================
// 2. API HELPER FUNCTIONS
// ============================================================

async function request(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken(),
        },
        credentials: 'same-origin', // Includes cookies for session auth
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);
        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
            const errorMsg = responseData.message || responseData.detail || JSON.stringify(responseData);
            throw new Error(`Request failed (${response.status}): ${errorMsg}`);
        }

        return responseData;
    } catch (error) {
        console.error(`API Error [${method} ${url}]:`, error);
        throw error;
    }
}

async function getAssets(filters = {}) {
    const queryString = new URLSearchParams(filters).toString();
    const url = queryString ? `${ASSET_API_URL}?${queryString}` : ASSET_API_URL;
    return request(url);
}

async function getAssetById(id) {
    return request(`${ASSET_API_URL}/${id}/`);
}

async function createAsset(assetData) {
    return request(ASSET_API_URL, 'POST', assetData);
}

async function updateAsset(id, assetData) {
    return request(`${ASSET_API_URL}/${id}/`, 'PUT', assetData);
}

async function deleteAsset(id) {
    return request(`${ASSET_API_URL}/${id}/`, 'DELETE');
}

async function assignAsset(assetId, employeeId) {
    return request(`${ASSET_API_URL}/${assetId}/assign/`, 'POST', { employee_id: employeeId });
}

async function returnAsset(assetId) {
    return request(`${ASSET_API_URL}/${assetId}/return/`, 'POST');
}

async function getAssignableEmployees() {
    return request('/api/employees/');
}

// ============================================================
// 3. BUSINESS LOGIC
// ============================================================

function canAssign(status) {
    return status === STATUS.AVAILABLE;
}

function canReturn(status) {
    return status === STATUS.ASSIGNED;
}

function canDelete(status) {
    return status === STATUS.AVAILABLE || status === STATUS.DISPOSED;
}

function formatCalendarDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
}

// ============================================================
// 4. UI RENDERER
// ============================================================

function renderAssetList(assets, containerId = 'asset-list-container') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found!`);
        return;
    }

    if (!assets || assets.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center p-4">
                No assets found. Create your first asset using the "Add New Asset" button.
            </div>
        `;
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover asset-table">
                <thead class="table-light">
                    <tr>
                        <th>Name</th>
                        <th>Serial Number</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Assigned To</th>
                        <th>Assigned Date</th>
                        <th>Returned Date</th>
                        <th style="min-width: 200px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    assets.forEach((asset) => {
        const statusLabel = STATUS_LABELS[asset.status] || asset.status;
        const badgeClass = STATUS_BADGE_CLASSES[asset.status] || 'badge-secondary';
        const assignedTo = asset.assigned_employee?.name || asset.assigned_employee?.username || '—';
        const assignedDate = formatCalendarDate(asset.assignment_calendar?.date_assigned || asset.date_assigned);
        const returnedDate = formatCalendarDate(asset.assignment_calendar?.date_returned || asset.date_returned);

        let actionsHtml = `
            <button class="btn btn-sm btn-outline-primary action-edit" data-id="${asset.id}">Edit</button>
            <button class="btn btn-sm btn-outline-info action-view" data-id="${asset.id}">View</button>
        `;

        if (canAssign(asset.status)) {
            actionsHtml += `
                <button class="btn btn-sm btn-success action-assign" data-id="${asset.id}" data-name="${asset.name}">Assign</button>
            `;
        }

        if (canReturn(asset.status)) {
            actionsHtml += `
                <button class="btn btn-sm btn-warning action-return" data-id="${asset.id}" data-name="${asset.name}">Return</button>
            `;
        }

        if (canDelete(asset.status)) {
            actionsHtml += `
                <button class="btn btn-sm btn-danger action-delete" data-id="${asset.id}" data-name="${asset.name}">Delete</button>
            `;
        }

        html += `
            <tr>
                <td><strong>${asset.name || 'Unnamed'}</strong></td>
                <td><code>${asset.serial_number || '—'}</code></td>
                <td>${asset.type || '—'}</td>
                <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
                <td>${assignedTo}</td>
                <td>${assignedDate}</td>
                <td>${returnedDate}</td>
                <td>
                    <div class="btn-group btn-group-sm flex-wrap" role="group">
                        ${actionsHtml}
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
    attachTableEventListeners(container);
}

// ============================================================
// 5. EVENT HANDLING
// ============================================================

function attachTableEventListeners(container) {
    container.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const action = target.className.split(' ').find(cls => cls.startsWith('action-'));
        if (!action) return;

        const assetId = target.dataset.id;
        const assetName = target.dataset.name || 'Asset';

        e.preventDefault();

        try {
            switch (action) {
                case 'action-view':
                    window.location.href = `/assets/${assetId}/`;
                    break;

                case 'action-edit':
                    window.location.href = `/assets/${assetId}/edit/`;
                    break;

                case 'action-assign':
                    await handleAssignAction(assetId, assetName);
                    break;

                case 'action-return':
                    await handleReturnAction(assetId, assetName);
                    break;

                case 'action-delete':
                    await handleDeleteAction(assetId, assetName);
                    break;

                default:
                    break;
            }
        } catch (error) {
            showActionMessage(`Action failed: ${error.message}`, 'error');
        }
    });
}

// ============================================================
// 6. ACTION HANDLERS
// ============================================================

async function handleAssignAction(assetId, assetName) {
    const employees = await getAssignableEmployees();
    const employeeOptions = employees
        .map((employee) => (
            `<option value="${employee.id}">${employee.name} (${employee.department || 'No department'})</option>`
        ))
        .join('');

    const result = await showAssetConfirmationCard({
        title: 'Confirm Asset Assignment',
        message: `Assign "${assetName}" to an employee?`,
        details: `
            <div class="detail-field">
                <span class="field-label">Asset ID</span>
                <span class="field-value">${assetId}</span>
            </div>
        `,
        bodyHtml: `
            <label for="confirmation-employee" class="form-label">Employee</label>
            <select id="confirmation-employee" name="employee_id" class="filter-select" required>
                <option value="">Select employee</option>
                ${employeeOptions}
            </select>
        `,
        confirmLabel: 'Assign Asset',
    });

    if (!result.confirmed || !result.values.employee_id) {
        return;
    }

    await assignAsset(assetId, result.values.employee_id);
    showActionMessage(`"${assetName}" was assigned successfully.`, 'success');
    refreshAssetList();
}

async function handleReturnAction(assetId, assetName) {
    const result = await showAssetConfirmationCard({
        title: 'Confirm Asset Return',
        message: `Return "${assetName}" back to inventory storage?`,
        details: `
            <div class="detail-field">
                <span class="field-label">Asset ID</span>
                <span class="field-value">${assetId}</span>
            </div>
        `,
        confirmLabel: 'Return Asset',
        variant: 'warning',
    });

    if (!result.confirmed) {
        return;
    }

    await returnAsset(assetId);
    showActionMessage(`"${assetName}" was returned to inventory.`, 'success');
    refreshAssetList();
}

async function handleDeleteAction(assetId, assetName) {
    if (!confirm(`Permanently delete "${assetName}"? This action cannot be undone.`)) {
        return;
    }

    await deleteAsset(assetId);
    alert(`"${assetName}" has been deleted.`);
    refreshAssetList();
}

function showAssetForm() {
    const form = document.getElementById('asset-form');
    if (!form) return;
    form.hidden = false;
    form.setAttribute('aria-hidden', 'false');
    document.getElementById('asset-name')?.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideAssetForm() {
    const form = document.getElementById('asset-form');
    if (!form) return;
    form.hidden = true;
    form.setAttribute('aria-hidden', 'true');
}

function showAssetConfirmationCard(options) {
    if (window.showConfirmationCard) {
        return window.showConfirmationCard(options);
    }
    showActionMessage('Confirmation cards are not available. Please reload the page and try again.', 'error');
    return Promise.resolve({ confirmed: false, values: {} });
}

function showActionMessage(message, type = 'info') {
    if (window.showToast) {
        window.showToast(message, type);
        return;
    }
    console.log(`[${type}] ${message}`);
}

// ============================================================
// 7. FORM HANDLING
// ============================================================

function resetAssetForm({ hide = false } = {}) {
    const form = document.getElementById('asset-form');
    if (!form) return;

    form.reset();
    if (hide) hideAssetForm();
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('asset-name').value.trim(),
        serial_number: document.getElementById('asset-serial').value.trim(),
        type: document.getElementById('asset-type').value.trim(),
    };

    if (!formData.name) {
        alert('Please enter an Asset Name.');
        return;
    }

    try {
        const result = await createAsset(formData);
        showActionMessage(`Asset "${result.name}" created successfully.`, 'success');

        resetAssetForm({ hide: true });
        refreshAssetList();

    } catch (error) {
        showActionMessage(`Failed to create asset: ${error.message}`, 'error');
    }
}

// ============================================================
// 8. FILTER HANDLING
// ============================================================

function getFilterValues() {
    const filterForm = document.getElementById('filter-form');
    if (!filterForm) return {};

    const formData = new FormData(filterForm);
    const filters = {};
    for (const [key, value] of formData.entries()) {
        if (value.trim()) {
            filters[key] = value.trim();
        }
    }
    return filters;
}

// ============================================================
// 9. MAIN REFRESH
// ============================================================

let currentFilters = {};

async function refreshAssetList() {
    const container = document.getElementById('asset-list-container');
    if (!container) return;

    container.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><p>Loading assets...</p></div>`;

    try {
        currentFilters = getFilterValues();
        const assets = await getAssets(currentFilters);
        renderAssetList(assets);
    } catch (error) {
        container.innerHTML = `
            <div class="alert alert-danger">
                <strong>Error loading assets:</strong> ${error.message}
            </div>
        `;
        console.error(error);
    }
}

// ============================================================
// 10. INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    refreshAssetList();

    const filterForm = document.getElementById('filter-form');
    if (filterForm) {
        filterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            refreshAssetList();
        });

        const resetBtn = filterForm.querySelector('[type="reset"]');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                setTimeout(refreshAssetList, 10);
            });
        }
    }

    const assetForm = document.getElementById('asset-form');
    if (assetForm) {
        assetForm.addEventListener('submit', handleFormSubmit);

        const cancelBtn = assetForm.querySelector('[type="reset"]');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => resetAssetForm({ hide: true }));
        }
    }

    const addBtn = document.getElementById('add-asset-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            resetAssetForm();
            showAssetForm();
        });
    }

    console.log('Asset Management Module initialized successfully.');
});

// ============================================================
// 11. EXPOSE
// ============================================================

window.assetManager = {
    getAssets,
    createAsset,
    updateAsset,
    deleteAsset,
    assignAsset,
    returnAsset,
    refreshAssetList,
    resetAssetForm,
};