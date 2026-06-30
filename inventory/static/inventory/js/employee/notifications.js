// inventory/static/inventory/js/notification.js

(function() {
    'use strict';

    function showToast(message, type = 'info', duration = 3000) {
        // If main.js is loaded, use its showToast
        if (window.showToast && typeof window.showToast === 'function') {
            window.showToast(message, type, duration);
            return;
        }

        // Fallback: create a simple toast using Bootstrap
        const container = document.getElementById('toast-container');
        if (!container) {
            alert(message);
            return;
        }

        const colors = {
            success: 'bg-success text-white',
            error: 'bg-danger text-white',
            warning: 'bg-warning text-dark',
            info: 'bg-primary text-white',
        };

        const toast = document.createElement('div');
        toast.className = `toast align-items-center ${colors[type] || colors.info} border-0 show`;
        toast.role = 'alert';
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, duration);
    }

    window.showToast = showToast;

})();