/**
 * ============================================================
 * ASSIGNMENT MODULE - ITAM SYSTEM
 * ============================================================
 * Handles asset assignment and return operations
 * ============================================================
 */

// ============================================================
// 1. CONFIGURATION
// ============================================================

const API_BASE = '/api';
const ASSIGNMENTS_API_URL = `${API_BASE}/assignments`;

// ============================================================
// 2. API FUNCTIONS
// ============================================================

async function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
    };
    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
        const errorMsg = responseData.message || responseData.detail || JSON.stringify(responseData);
        throw new Error(`API Error (${response.status}): ${errorMsg}`);
    }
    return responseData;
}

async function getAssignments(filters = {}) {
    const queryString = new URLSearchParams(filters).toString();
    const url = queryString ? `${ASSIGNMENTS_API_URL}?${queryString}` : ASSIGNMENTS_API_URL;
    return apiRequest(url);
}

async function createAssignment(assignmentData) {
    return apiRequest(ASSIGNMENTS_API_URL, 'POST', assignmentData);
}

async function returnAssignment(assignmentId) {
    return apiRequest(`${ASSIGNMENTS_API_URL}/${assignmentId}/return/`, 'POST');
}

// ============================================================
// 3. UI FUNCTIONS
// ============================================================

function renderAssignmentList(assignments, containerId = 'assignment-list-container') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found!`);
        return;
    }

    if (!assignments || assignments.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center p-4">
                No active assignments found.
            </div>
        `;
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover assignment-table">
                <thead class="table-light">
                    <tr>
                        <th>Asset</th>
                        <th>Assigned To</th>
                        <th>Department</th>
                        <th>Date Assigned</th>
                        <th style="min-width: 100px;">Action</th>
                    </tr>
                </thead>
                <tbody>
    `;

    assignments.forEach((assignment) => {
        const assetName = assignment.asset?.name || 'Unknown Asset';
        const employeeName = assignment.employee?.name || 'Unknown Employee';
        const department = assignment.employee?.department || '—';
        const assignedDate = assignment.date_assigned ? new Date(assignment.date_assigned).toLocaleDateString() : '—';

        html += `
            <tr>
                <td><strong>${assetName}</strong></td>
                <td>${employeeName}</td>
                <td>${department}</td>
                <td>${assignedDate}</td>
                <td>
                    <button class="btn btn-sm btn-success action-return" 
                            data-id="${assignment.id}" 
                            data-asset="${assetName}">
                        Return
                    </button>
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
    attachAssignmentEventListeners(container);
}

// ============================================================
// 4. EVENT HANDLING
// ============================================================

function attachAssignmentEventListeners(container) {
    container.addEventListener('click', async (e) => {
        const target = e.target.closest('.action-return');
        if (!target) return;

        const assignmentId = target.dataset.id;
        const assetName = target.dataset.asset || 'Asset';

        e.preventDefault();

        if (!confirm(`Return "${assetName}" to inventory?`)) {
            return;
        }

        try {
            await returnAssignment(assignmentId);
            alert(`"${assetName}" successfully returned!`);
            refreshAssignmentList();
        } catch (error) {
            alert(`Failed to return asset: ${error.message}`);
        }
    });
}

// ============================================================
// 5. MAIN REFRESH
// ============================================================

async function refreshAssignmentList() {
    const container = document.getElementById('assignment-list-container');
    if (!container) return;

    container.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><p>Loading assignments...</p></div>`;

    try {
        const assignments = await getAssignments({ active: true });
        renderAssignmentList(assignments);
    } catch (error) {
        container.innerHTML = `
            <div class="alert alert-danger">
                <strong>Error loading assignments:</strong> ${error.message}
            </div>
        `;
        console.error(error);
    }
}

// ============================================================
// 6. ASSIGNMENT MODAL (Reusable)
// ============================================================

function openAssignmentModal(assetId, assetName, onSuccess) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'assignment-modal';

    // Fetch employees for dropdown
    const employeeSelect = document.createElement('select');
    employeeSelect.className = 'form-control';
    employeeSelect.id = 'assignment-employee-select';
    employeeSelect.innerHTML = '<option value="">Loading employees...</option>';

    // Load employees
    if (window.EmployeeManager) {
        window.EmployeeManager.getEmployees()
            .then(employees => {
                employeeSelect.innerHTML = '<option value="">Select Employee</option>';
                employees.forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp.id;
                    option.textContent = `${emp.name} (${emp.department || 'No Dept'})`;
                    employeeSelect.appendChild(option);
                });
            })
            .catch(() => {
                employeeSelect.innerHTML = '<option value="">Error loading employees</option>';
            });
    } else {
        employeeSelect.innerHTML = '<option value="">Employee manager not loaded</option>';
    }

    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Assign Asset</h5>
                <button type="button" class="modal-close-btn" id="close-assignment-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p><strong>Asset:</strong> ${assetName}</p>
                <p><strong>Asset ID:</strong> ${assetId}</p>
                <div class="form-group">
                    <label for="assignment-employee-select">Select Employee</label>
                </div>
                <div id="assignment-employee-container"></div>
                <div id="assignment-error" class="text-danger mt-2" style="display:none;"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="cancel-assignment-btn">Cancel</button>
                <button type="button" class="btn btn-primary" id="confirm-assignment-btn">Assign</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Insert the select into the container
    document.getElementById('assignment-employee-container').appendChild(employeeSelect);

    const closeModal = () => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        document.body.style.overflow = '';
    };

    document.getElementById('close-assignment-modal')?.addEventListener('click', closeModal);
    document.getElementById('cancel-assignment-btn')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.getElementById('confirm-assignment-btn')?.addEventListener('click', async () => {
        const employeeId = employeeSelect.value;
        const errorDiv = document.getElementById('assignment-error');

        if (!employeeId) {
            errorDiv.textContent = 'Please select an employee.';
            errorDiv.style.display = 'block';
            return;
        }

        try {
            if (window.assetManager) {
                await window.assetManager.assignAsset(assetId, employeeId);
                alert(`Asset successfully assigned!`);
                closeModal();
                if (onSuccess) onSuccess();
            } else {
                alert('Asset manager not available.');
            }
        } catch (error) {
            errorDiv.textContent = error.message || 'Assignment failed. Please try again.';
            errorDiv.style.display = 'block';
        }
    });
}

// ============================================================
// 7. INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Only load assignments if we're on the assignments page
    if (document.getElementById('assignment-list-container')) {
        refreshAssignmentList();
    }

    console.log('Assignment Module initialized successfully.');
});

// ============================================================
// 8. EXPOSE
// ============================================================

window.Assignment = {
    getAssignments,
    createAssignment,
    returnAssignment,
    refresh: refreshAssignmentList,
    openModal: openAssignmentModal,
};

console.log('Assignment Module loaded.');