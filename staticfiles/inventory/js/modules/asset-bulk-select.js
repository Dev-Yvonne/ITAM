/**
 * Admin bulk asset selection across asset page tables
 */
(function() {
    'use strict';

    var selectedIds = new Set();
    var bound = false;

    function isAdmin() {
        return !!document.querySelector('[data-user-is-admin="true"]');
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function headerCellHtml() {
        if (!isAdmin()) {
            return '';
        }
        return '<th class="asset-bulk-select-col" scope="col">' +
            '<input type="checkbox" class="asset-bulk-checkbox-all" data-bulk-select="true" aria-label="Select all assets in this table">' +
            '</th>';
    }

    function rowCellHtml(assetId, label) {
        if (!isAdmin() || !assetId) {
            return '';
        }
        var id = String(assetId);
        var checked = selectedIds.has(id) ? ' checked' : '';
        return '<td class="asset-bulk-select-col" data-row-action="true">' +
            '<input type="checkbox" class="asset-bulk-checkbox" data-bulk-select="true" data-asset-id="' +
            escapeHtml(id) + '" aria-label="Select ' + escapeHtml(label || 'asset') + '"' + checked + '>' +
            '</td>';
    }

    function getSelectableRows(table) {
        if (!table) {
            return [];
        }
        return Array.from(table.querySelectorAll('tbody tr.asset-table-row[data-asset-id]'));
    }

    function syncRowVisual(row, checked) {
        if (!row) {
            return;
        }
        row.classList.toggle('asset-row-bulk-selected', !!checked);
    }

    function syncTableHeader(table) {
        if (!table) {
            return;
        }
        var header = table.querySelector('.asset-bulk-checkbox-all');
        var rows = getSelectableRows(table);
        if (!header || !rows.length) {
            if (header) {
                header.checked = false;
                header.indeterminate = false;
            }
            return;
        }

        var checkedCount = rows.filter(function(row) {
            return selectedIds.has(String(row.dataset.assetId));
        }).length;

        header.checked = checkedCount > 0 && checkedCount === rows.length;
        header.indeterminate = checkedCount > 0 && checkedCount < rows.length;
    }

    function syncAllCheckboxes(root) {
        if (!isAdmin()) {
            return;
        }

        var scope = root || document;
        scope.querySelectorAll('.asset-bulk-checkbox[data-asset-id]').forEach(function(input) {
            var id = String(input.dataset.assetId || '');
            var checked = selectedIds.has(id);
            input.checked = checked;
            syncRowVisual(input.closest('.asset-table-row'), checked);
        });

        scope.querySelectorAll('table').forEach(syncTableHeader);
        updateBulkBar();
    }

    function updateBulkBar() {
        var bar = document.getElementById('asset-bulk-action-bar');
        if (!bar) {
            return;
        }

        var count = selectedIds.size;
        var countNode = bar.querySelector('[data-bulk-count]');
        if (countNode) {
            countNode.textContent = String(count);
        }

        if (count > 0) {
            bar.classList.add('visible');
            bar.setAttribute('aria-hidden', 'false');
            document.body.classList.add('asset-bulk-bar-open');
        } else {
            bar.classList.remove('visible');
            bar.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('asset-bulk-bar-open');
        }
    }

    function ensureBulkBar() {
        if (!isAdmin() || document.getElementById('asset-bulk-action-bar')) {
            return;
        }

        var bar = document.createElement('div');
        bar.id = 'asset-bulk-action-bar';
        bar.className = 'asset-bulk-action-bar';
        bar.setAttribute('aria-hidden', 'true');
        bar.innerHTML =
            '<div class="asset-bulk-action-bar-inner">' +
                '<div class="asset-bulk-action-copy">' +
                    '<i class="fas fa-check-square" aria-hidden="true"></i>' +
                    '<span><strong data-bulk-count>0</strong> asset<span class="asset-bulk-plural-s">s</span> selected</span>' +
                '</div>' +
                '<div class="asset-bulk-action-buttons">' +
                    '<button type="button" class="btn btn-secondary btn-sm" id="asset-bulk-clear-btn">Clear selection</button>' +
                    '<button type="button" class="btn btn-danger btn-sm" id="asset-bulk-delete-btn">' +
                        '<i class="fas fa-trash-alt"></i> Delete selected' +
                    '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(bar);

        bar.querySelector('#asset-bulk-clear-btn').addEventListener('click', clearSelection);
        bar.querySelector('#asset-bulk-delete-btn').addEventListener('click', deleteSelected);
    }

    function updatePluralLabel() {
        var plural = document.querySelector('#asset-bulk-action-bar .asset-bulk-plural-s');
        if (plural) {
            plural.style.display = selectedIds.size === 1 ? 'none' : 'inline';
        }
    }

    function setSelected(assetId, checked) {
        var id = String(assetId);
        if (!id) {
            return;
        }
        if (checked) {
            selectedIds.add(id);
        } else {
            selectedIds.delete(id);
        }
    }

    function clearSelection() {
        selectedIds.clear();
        document.querySelectorAll('.asset-bulk-checkbox').forEach(function(input) {
            input.checked = false;
        });
        document.querySelectorAll('.asset-bulk-checkbox-all').forEach(function(input) {
            input.checked = false;
            input.indeterminate = false;
        });
        document.querySelectorAll('.asset-row-bulk-selected').forEach(function(row) {
            row.classList.remove('asset-row-bulk-selected');
        });
        updateBulkBar();
        updatePluralLabel();
    }

    function getCsrfToken() {
        if (window.Utils && typeof window.Utils.getCSRFToken === 'function') {
            return window.Utils.getCSRFToken();
        }
        var match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function deleteSelected() {
        var ids = Array.from(selectedIds);
        if (!ids.length) {
            return;
        }

        var message = ids.length === 1
            ? 'Delete the selected asset? This cannot be undone.'
            : 'Delete ' + ids.length + ' selected assets? This cannot be undone.';

        if (!window.confirm(message)) {
            return;
        }

        var deleteBtn = document.getElementById('asset-bulk-delete-btn');
        if (deleteBtn) {
            deleteBtn.disabled = true;
        }

        try {
            var response = await fetch('/api/assets/bulk-delete/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                credentials: 'same-origin',
                body: JSON.stringify({ ids: ids.map(Number) })
            });

            var parser = window.Utils && window.Utils.parseJsonResponse
                ? window.Utils.parseJsonResponse(response)
                : response.json();
            var data = await parser;

            if (!response.ok || !data.success) {
                throw new Error(
                    window.Utils
                        ? window.Utils.extractApiError(data, 'Unable to delete selected assets.')
                        : 'Unable to delete selected assets.'
                );
            }

            (data.deleted || []).forEach(function(id) {
                selectedIds.delete(String(id));
            });

            var failed = data.failed || [];
            if (failed.length) {
                var detail = failed.map(function(item) {
                    return 'Asset #' + item.id + ': ' + item.detail;
                }).join(' ');
                if (window.Utils && window.Utils.showToast) {
                    window.Utils.showToast(detail, 'warning');
                }
            }

            if ((data.deleted || []).length && window.Utils && window.Utils.showToast) {
                window.Utils.showToast(
                    (data.deleted.length === 1 ? '1 asset deleted.' : data.deleted.length + ' assets deleted.'),
                    'success'
                );
            }

            clearSelection();

            if (window.AssetManager && typeof window.AssetManager.refreshAllTables === 'function') {
                await window.AssetManager.refreshAllTables();
            } else if (window.location && window.location.reload) {
                window.location.reload();
            }
        } catch (error) {
            if (window.Utils && window.Utils.showToast) {
                window.Utils.showToast(
                    window.Utils.getUserFacingError(error, 'Unable to delete selected assets.'),
                    'error'
                );
            }
        } finally {
            if (deleteBtn) {
                deleteBtn.disabled = false;
            }
        }
    }

    function bindEvents() {
        if (bound || !isAdmin()) {
            return;
        }
        bound = true;

        document.addEventListener('change', function(event) {
            var target = event.target;
            if (!target || !target.matches('input[data-bulk-select="true"]')) {
                return;
            }

            if (target.matches('.asset-bulk-checkbox')) {
                var row = target.closest('.asset-table-row');
                setSelected(target.dataset.assetId, target.checked);
                syncRowVisual(row, target.checked);
                syncTableHeader(target.closest('table'));
                updateBulkBar();
                updatePluralLabel();
                return;
            }

            if (target.matches('.asset-bulk-checkbox-all')) {
                var table = target.closest('table');
                getSelectableRows(table).forEach(function(row) {
                    var checkbox = row.querySelector('.asset-bulk-checkbox');
                    if (!checkbox) {
                        return;
                    }
                    checkbox.checked = target.checked;
                    setSelected(row.dataset.assetId, target.checked);
                    syncRowVisual(row, target.checked);
                });
                target.indeterminate = false;
                updateBulkBar();
                updatePluralLabel();
            }
        });

        document.addEventListener('click', function(event) {
            if (event.target.closest('[data-bulk-select="true"]')) {
                event.stopPropagation();
            }
        });
    }

    function refresh(root) {
        if (!isAdmin()) {
            return;
        }
        ensureBulkBar();
        bindEvents();
        syncAllCheckboxes(root);
        updatePluralLabel();
    }

    function init() {
        refresh(document);
    }

    window.AssetBulkSelect = {
        init: init,
        refresh: refresh,
        clearSelection: clearSelection,
        headerCellHtml: headerCellHtml,
        rowCellHtml: rowCellHtml,
        isEnabled: isAdmin,
        getSelectedIds: function() {
            return Array.from(selectedIds);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
