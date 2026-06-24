/**
 * ============================================================
 * EMPLOYEE MANAGEMENT MODULE - ITAM SYSTEM
 * ============================================================
 * Handles:
 * - Listing all employees with search filters
 * - Creating new employees
 * - Editing existing employees
 * - Deleting employees (with confirmation)
 * - Viewing employee details
 * ============================================================
 */

// ============================================================
// 1. CONFIGURATION & CONSTANTS
// ============================================================

const API_BASE = '/api';
const EMPLOYEES_API_URL = `${API_BASE}/employees`;

// ============================================================
// 2. API HELPER FUNCTIONS
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

async function getEmployees(search = '') {
    const url = search ? `${EMPLOYEES_API_URL}?search=${encodeURIComponent(search)}` : EMPLOYEES_API_URL;
    return apiRequest(url);
}

async function getEmployeeById(id) {
    return apiRequest(`${EMPLOYEES_API_URL}/${id}/`);
}

async function createEmployee(employeeData) {
    return apiRequest(EMPLOYEES_API_URL, 'POST', employeeData);
}

async function updateEmployee(id, employeeData) {
    return apiRequest(`${EMPLOYEES_API_URL}/${id}/`, 'PUT', employeeData);
}

async function deleteEmployee(id) {
    return apiRequest(`${EMPLOYEES_API_URL}/${id}/`, 'DELETE');
}

async function getEmployeeAssets(employeeId) {
    try {
        return await apiRequest(`${EMPLOYEES_API_URL}/${employeeId}/assets/`);
    } catch {
        return [];
    }
}

// ============================================================
// 3. UI RENDERER
// ============================================================

function renderEmployeeList(employees, containerId = 'employee-list-container') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found!`);
        return;
    }

    if (!employees || employees.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center p-4">
                No employees found. Add your first employee using the "Add Employee" button.
            </div>
        `;
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover employee-table">
                <thead class="table-light">
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Department</th>
                        <th>Assigned Assets</th>
                        <th style="min-width: 180px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    employees.forEach((emp) => {
        const assetCount = emp.assigned_assets_count || emp.assigned_assets?.length || 0;
        const assignedAssets = emp.assigned_assets || [];

        html += `
            <tr>
                <td><strong>${emp.name || 'Unnamed'}</strong></td>
                <td>${emp.email || '—'}</td>
                <td>${emp.department || '—'}</td>
                <td>
                    <span class="badge bg-primary">${assetCount}</span>
                    ${assetCount > 0 ? `<small class="text-muted d-block">${assignedAssets.map(a => a.name).join(', ')}</small>` : ''}
                </td>
                <td>
                    <div class="btn-group btn-group-sm flex-wrap" role="group">
                        <button class="btn btn-outline-primary action-view" data-id="${emp.id}">View</button>
                        <button class="btn btn-outline-secondary action-edit" data-id="${emp.id}">Edit</button>
                        <button class="btn btn-outline-danger action-delete" data-id="${emp.id}" data-name="${emp.name}">Delete</button>
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
// 4. EVENT HANDLING
// ============================================================

function attachTableEventListeners(container) {
    container.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const action = target.className.split(' ').find(cls => cls.startsWith('action-'));
        if (!action) return;

        const employeeId = target.dataset.id;
        const employeeName = target.dataset.name || 'Employee';

        e.preventDefault();

        try {
            switch (action) {
                case 'action-view':
                    await showEmployeeDetails(employeeId);
                    break;

                case 'action-edit':
                    await loadEmployeeIntoForm(employeeId);
                    break;

                case 'action-delete':
                    await handleDeleteEmployee(employeeId, employeeName);
                    break;

                default:
                    break;
            }
        } catch (error) {
            alert(`Action failed: ${error.message}`);
        }
    });
}

// ============================================================
// 5. ACTION HANDLERS
// ============================================================

async function handleDeleteEmployee(employeeId, employeeName) {
    if (!confirm(`Permanently delete employee "${employeeName}"? This may affect assigned assets.`)) {
        return;
    }

    await deleteEmployee(employeeId);
    alert(`Employee "${employeeName}" has been deleted.`);
    refreshEmployeeList();
}

// ============================================================
// 6. EMPLOYEE DETAIL VIEW
// ============================================================

async function showEmployeeDetails(employeeId) {
    try {
        const employee = await getEmployeeById(employeeId);
        if (!employee) {
            alert('Employee not found.');
            return;
        }

        const assets = employee.assigned_assets || await getEmployeeAssets(employeeId);

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.id = 'employee-detail-modal';

        let assetsHtml = '';
        if (assets && assets.length > 0) {
            assetsHtml = `
                <h6 class="mt-3">Assigned Assets</h6>
                <ul class="list-group">
                    ${assets.map(a => `<li class="list-group-item">${a.name} (${a.type || 'N/A'}) - ${a.serial_number || 'No SN'}</li>`).join('')}
                </ul>
            `;
        } else {
            assetsHtml = `<p class="text-muted mt-3">No assets currently assigned.</p>`;
        }

        modalOverlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Employee Details</h5>
                    <button type="button" class="modal-close-btn" id="close-detail-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>Name:</strong> ${employee.name}</p>
                    <p><strong>Email:</strong> ${employee.email || '—'}</p>
                    <p><strong>Department:</strong> ${employee.department || '—'}</p>
                    ${assetsHtml}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="close-detail-btn">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);
        document.body.style.overflow = 'hidden';

        const closeModal = () => {
            if (modalOverlay.parentNode) {
                modalOverlay.parentNode.removeChild(modalOverlay);
            }
            document.body.style.overflow = '';
        };

        document.getElementById('close-detail-modal')?.addEventListener('click', closeModal);
        document.getElementById('close-detail-btn')?.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });

    } catch (error) {
        alert(`Could not load employee details: ${error.message}`);
    }
}

// ============================================================
// 7. FORM HANDLING
// ============================================================

async function loadEmployeeIntoForm(employeeId) {
    const employee = await getEmployeeById(employeeId);
    if (!employee) {
        alert('Employee not found!');
        return;
    }

    const form = document.getElementById('employee-form');
    if (!form) {
        console.warn('Form #employee-form not found.');
        return;
    }

    document.getElementById('employee-id').value = employee.id || '';
    document.getElementById('employee-name').value = employee.name || '';
    document.getElementById('employee-email').value = employee.email || '';
    document.getElementById('employee-department').value = employee.department || '';

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Update Employee';
        submitBtn.dataset.mode = 'edit';
    }

    form.scrollIntoView({ behavior: 'smooth' });
}

function resetEmployeeForm() {
    const form = document.getElementById('employee-form');
    if (!form) return;

    form.reset();
    document.getElementById('employee-id').value = '';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Create Employee';
        submitBtn.dataset.mode = 'create';
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const form = document.getElementById('employee-form');
    const employeeId = document.getElementById('employee-id').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    const mode = submitBtn?.dataset?.mode || 'create';

    const formData = {
        name: document.getElementById('employee-name').value.trim(),
        email: document.getElementById('employee-email').value.trim(),
        department: document.getElementById('employee-department').value.trim(),
    };

    if (!formData.name) {
        alert('Please enter the employee name.');
        return;
    }

    try {
        let result;
        if (mode === 'edit' && employeeId) {
            result = await updateEmployee(employeeId, formData);
            alert(`Employee "${result.name}" updated successfully!`);
        } else {
            result = await createEmployee(formData);
            alert(`Employee "${result.name}" created successfully!`);
        }

        resetEmployeeForm();
        refreshEmployeeList();

    } catch (error) {
        alert(`Failed to save employee: ${error.message}`);
    }
}

// ============================================================
// 8. SEARCH / FILTER
// ============================================================

function getSearchTerm() {
    const searchInput = document.getElementById('employee-search');
    return searchInput ? searchInput.value.trim() : '';
}

// ============================================================
// 9. MAIN REFRESH
// ============================================================

async function refreshEmployeeList() {
    const container = document.getElementById('employee-list-container');
    if (!container) return;

    container.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div><p>Loading employees...</p></div>`;

    try {
        const search = getSearchTerm();
        const employees = await getEmployees(search);
        renderEmployeeList(employees);
    } catch (error) {
        container.innerHTML = `
            <div class="alert alert-danger">
                <strong>Error loading employees:</strong> ${error.message}
            </div>
        `;
        console.error(error);
    }
}

// ============================================================
// 10. INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    refreshEmployeeList();

    const searchInput = document.getElementById('employee-search');
    if (searchInput) {
        let debounceTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(refreshEmployeeList, 300);
        });
    }

    const form = document.getElementById('employee-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
        const resetBtn = form.querySelector('[type="reset"]');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetEmployeeForm);
        }
    }

    const addBtn = document.getElementById('add-employee-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            resetEmployeeForm();
            document.getElementById('employee-form')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    console.log('Employee Module initialized successfully.');
});

// ============================================================
// 11. EXPOSE
// ============================================================

window.EmployeeManager = {
    getEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    refresh: refreshEmployeeList,
    resetForm: resetEmployeeForm,
};

window.fetchEmployees = getEmployees;