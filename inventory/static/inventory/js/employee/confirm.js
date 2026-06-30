// inventory/static/inventory/js/confirm.js

(function() {
    'use strict';

    // Use Bootstrap modal if available, else fallback.
    // We assume Bootstrap JS is loaded.

    function createModalHTML(message, title = 'Confirm') {
        return `
            <div class="modal fade" id="confirmModal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>${message}</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmYes">Yes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function confirmDialog(message, title = 'Confirm') {
        return new Promise((resolve) => {
            // If Bootstrap modal is available, show it.
            const modalId = 'confirmModal';
            let modalEl = document.getElementById(modalId);
            if (!modalEl) {
                const html = createModalHTML(message, title);
                document.body.insertAdjacentHTML('beforeend', html);
                modalEl = document.getElementById(modalId);
            } else {
                // Update message
                const body = modalEl.querySelector('.modal-body p');
                if (body) body.textContent = message;
                const header = modalEl.querySelector('.modal-title');
                if (header) header.textContent = title;
            }

            const modal = new bootstrap.Modal(modalEl);
            modalEl.querySelector('#confirmYes').onclick = function() {
                modal.hide();
                resolve(true);
            };
            modalEl.querySelector('[data-bs-dismiss="modal"]').onclick = function() {
                modal.hide();
                resolve(false);
            };
            // Also when modal is hidden via backdrop click
            modalEl.addEventListener('hidden.bs.modal', function() {
                // If not resolved yet, we might have already resolved via buttons.
                // But we need to avoid double resolve.
                // We'll use a flag.
                if (!modalEl._resolved) {
                    modalEl._resolved = true;
                    resolve(false);
                }
            });

            modal.show();
        });
    }

    // Fallback if Bootstrap not loaded
    if (typeof bootstrap === 'undefined') {
        window.confirmDialog = function(message) {
            return Promise.resolve(confirm(message));
        };
        console.warn('Bootstrap not detected, using window.confirm fallback.');
    } else {
        window.confirmDialog = confirmDialog;
    }

})();