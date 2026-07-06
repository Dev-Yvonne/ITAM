// inventory/static/inventory/js/assets.js

(function() {
    'use strict';

    // ---- Dependencies ----
    // We assume `showToast` and `confirmDialog` are globally available.
    // If not, we'll fallback to alert/confirm.

    function getCSRFToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // ---- API Calls ----
    async function returnAsset(assetId) {
        if (window.Utils && typeof window.Utils.fetchJson === 'function') {
            return window.Utils.fetchJson('/api/assets/' + assetId + '/return/', { method: 'POST' });
        }
        const response = await fetch('/api/assets/' + assetId + '/return/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRFToken': getCSRFToken(),
            },
            credentials: 'same-origin',
        });
        const parser = window.Utils && window.Utils.parseJsonResponse
            ? window.Utils.parseJsonResponse(response)
            : response.json();
        const data = await parser;
        if (!response.ok) {
            throw new Error(
                window.Utils
                    ? window.Utils.extractApiError(data, 'Unable to return asset.')
                    : 'Unable to return asset.'
            );
        }
        return data;
    }

    function friendlyError(error, fallback) {
        if (window.Utils && typeof window.Utils.getUserFacingError === 'function') {
            return window.Utils.getUserFacingError(error, fallback);
        }
        return fallback;
    }

    async function requestAsset(data) {
        // Example: POST to /api/asset-requests/
        // For now, we simulate success.
        return new Promise((resolve) => {
            setTimeout(() => resolve({ status: 'requested', data }), 500);
        });
    }

    // ---- UI Functions ----
    function renderAssetTable(assets, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!assets || assets.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info text-center">
                    <i class="fas fa-box-open"></i> You have no assets assigned.
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>Name</th>
                            <th>Serial</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        assets.forEach(asset => {
            html += `
                <tr data-id="${asset.id}">
                    <td><strong>${asset.name}</strong></td>
                    <td><code>${asset.serial_number || '—'}</code></td>
                    <td>${asset.type || '—'}</td>
                    <td><span class="badge bg-primary">Assigned</span></td>
                    <td>
                        <button class="btn btn-sm btn-warning return-btn" data-id="${asset.id}" data-name="${asset.name}">
                            Return
                        </button>
                    </td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;

        // Bind return buttons
        container.querySelectorAll('.return-btn').forEach(btn => {
            btn.addEventListener('click', handleReturnClick);
        });
    }

    async function handleReturnClick(e) {
        const btn = e.currentTarget;
        const assetId = btn.dataset.id;
        const assetName = btn.dataset.name || 'Asset';

        // Use confirm dialog if available
        const confirmed = window.confirmDialog ? 
            await window.confirmDialog(`Return "${assetName}" to inventory?`) :
            confirm(`Return "${assetName}" to inventory?`);

        if (!confirmed) return;

        try {
            const result = await returnAsset(assetId);
            if (window.showToast) {
                window.showToast(`✅ "${assetName}" returned successfully!`, 'success');
            }
            // Refresh the asset list (trigger custom event)
            document.dispatchEvent(new CustomEvent('assets-updated'));
        } catch (error) {
            const message = friendlyError(error, 'Unable to return asset.');
            if (window.showToast) {
                window.showToast(message, 'error');
            } else {
                console.error(message);
            }
        }
    }

    // ---- Request Asset ----
    function setupRequestAsset(buttonId) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        btn.addEventListener('click', async function() {
            // Use a modal or prompt
            const type = prompt('What type of asset do you need? (e.g., Laptop, Monitor)');
            if (!type) return;
            try {
                await requestAsset({ type, employee_id: window.employeeId });
                if (window.showToast) {
                    window.showToast(`📨 Request for "${type}" sent to IT.`, 'info');
                }
            } catch (error) {
                if (window.showToast) {
                    window.showToast(friendlyError(error, 'Request failed. Please try again.'), 'error');
                }
            }
        });
    }

    // ---- Public API ----
    window.AssetsModule = {
        renderAssetTable,
        returnAsset,
        requestAsset,
        setupRequestAsset,
        refresh: function() {
            // Reload the page or fetch fresh data
            window.location.reload();
        }
    };

    // ---- Auto-init if element exists ----
    document.addEventListener('DOMContentLoaded', function() {
        // The dashboard will call renderAssetTable explicitly with data from the view.
        // We'll just set up the request button.
        setupRequestAsset('request-asset-btn');
    });

})();