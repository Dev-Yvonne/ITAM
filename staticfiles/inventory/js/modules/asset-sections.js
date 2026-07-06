/**
 * ASSET SECTIONS - async-rendered section tables
 */
(function() {
    'use strict';

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatDate(value) {
        if (!value) {
            return '—';
        }
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return escapeHtml(value);
        }
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function statusBadge(status) {
        var css = String(status || '').toLowerCase().replace(/\s+/g, '');
        return '<span class="badge badge-' + escapeHtml(css) + '">' + escapeHtml(status) + '</span>';
    }

    function tableHead(columns) {
        var bulkHead = window.AssetBulkSelect
            ? window.AssetBulkSelect.headerCellHtml()
            : '';
        var actionsHead = window.AssetRowMenu
            ? window.AssetRowMenu.headerCellHtml()
            : '';
        return bulkHead + columns + actionsHead;
    }

    function rowMenuCell(assetPk, label, status) {
        if (!window.AssetRowMenu) {
            return '';
        }
        return window.AssetRowMenu.cellHtml(assetPk, label, {
            canAssign: window.AssetRowMenu.canAssignFromStatus(status)
        });
    }

    function clickableRow(assetPk, cells, label, status) {
        var bulkCell = window.AssetBulkSelect
            ? window.AssetBulkSelect.rowCellHtml(assetPk, label)
            : '';
        return '<tr class="asset-table-row" data-asset-id="' + encodeURIComponent(assetPk) + '" tabindex="0" role="button" aria-label="View details for ' + escapeHtml(label) + '">' +
            bulkCell +
            cells +
            rowMenuCell(assetPk, label, status) +
            '</tr>';
    }

    function sectionHeader(id, icon, title, count) {
        return '' +
            '<section class="asset-section" id="' + id + '">' +
                '<div class="asset-section-header">' +
                    '<div class="asset-section-title">' +
                        '<i class="fas ' + icon + '"></i>' +
                        '<h2>' + title + '</h2>' +
                    '</div>' +
                    '<span class="asset-section-count">' + count + ' item' + (count === 1 ? '' : 's') + '</span>' +
                '</div>';
    }

    function renderAssigned(rows) {
        var html = sectionHeader('assigned-assets', 'fa-user-check', 'Assigned Assets', rows.length);
        if (!rows.length) {
            return html + '<div class="asset-section-empty">No assets are currently assigned.</div></section>';
        }
        html += '<div class="table-wrapper asset-section-table"><table><thead><tr>' +
            tableHead('<th>Asset Name</th><th>Type</th><th>Assignee</th><th>Date Assigned</th><th>Return Date</th>') +
            '</tr></thead><tbody>';
        rows.forEach(function(row) {
            html += clickableRow(
                row.asset_pk,
                '<td><span class="asset-name-text">' + escapeHtml(row.name) + '</span></td>' +
                    '<td>' + escapeHtml(row.type) + '</td>' +
                    '<td>' + escapeHtml(row.assignee) + '</td>' +
                    '<td>' + formatDate(row.date_assigned) + '</td>' +
                    '<td>' + formatDate(row.expected_return_date) + '</td>',
                row.name,
                'Assigned'
            );
        });
        return html + '</tbody></table></div></section>';
    }

    function renderAvailable(rows) {
        var html = sectionHeader('available-assets', 'fa-check-circle', 'Available Assets', rows.length);
        if (!rows.length) {
            return html + '<div class="asset-section-empty">No available assets right now.</div></section>';
        }
        html += '<div class="table-wrapper asset-section-table"><table><thead><tr>' +
            tableHead('<th>Asset Name</th><th>Type</th><th>Available Since</th>') +
            '</tr></thead><tbody>';
        rows.forEach(function(row) {
            html += clickableRow(
                row.asset_pk,
                '<td><span class="asset-name-text">' + escapeHtml(row.name) + '</span></td>' +
                    '<td>' + escapeHtml(row.type) + '</td>' +
                    '<td>' + escapeHtml(row.available_since) + '</td>',
                row.name,
                'Available'
            );
        });
        return html + '</tbody></table></div></section>';
    }

    function renderMaintenance(rows) {
        var html = sectionHeader('maintenance-assets', 'fa-tools', 'Under Maintenance Assets', rows.length);
        if (!rows.length) {
            return html + '<div class="asset-section-empty">No assets are currently under maintenance.</div></section>';
        }
        html += '<div class="table-wrapper asset-section-table"><table><thead><tr>' +
            tableHead('<th>Asset Name</th><th>Type</th><th>Repair Shop</th><th>Maintenance Worker Contact</th><th>Period Till Full Repair</th>') +
            '</tr></thead><tbody>';
        rows.forEach(function(row) {
            html += clickableRow(
                row.asset_pk,
                '<td><span class="asset-name-text">' + escapeHtml(row.name) + '</span></td>' +
                    '<td>' + escapeHtml(row.type) + '</td>' +
                    '<td>' + escapeHtml(row.repair_shop) + '</td>' +
                    '<td>' + escapeHtml(row.worker_contact) + '</td>' +
                    '<td>' + escapeHtml(row.repair_period) + '</td>',
                row.name,
                'Under Maintenance'
            );
        });
        return html + '</tbody></table></div></section>';
    }

    function renderTypeSection(id, icon, title, rows) {
        var html = sectionHeader(id, icon, title, rows.length);
        if (!rows.length) {
            return html + '<div class="asset-section-empty">No ' + title.toLowerCase() + ' found.</div></section>';
        }
        html += '<div class="table-wrapper asset-section-table"><table><thead><tr>' +
            tableHead('<th>Asset Name</th><th>Type</th><th>Serial Number</th><th>Status</th>') +
            '</tr></thead><tbody>';
        rows.forEach(function(row) {
            html += clickableRow(
                row.asset_pk,
                '<td><span class="asset-name-text">' + escapeHtml(row.name) + '</span></td>' +
                    '<td>' + escapeHtml(row.type) + '</td>' +
                    '<td>' + escapeHtml(row.serial_number) + '</td>' +
                    '<td>' + statusBadge(row.status) + '</td>',
                row.name,
                row.status
            );
        });
        return html + '</tbody></table></div></section>';
    }

    function renderAll(data) {
        return '<div class="asset-sections">' +
            renderAssigned(data.assigned_asset_rows || []) +
            renderAvailable(data.available_asset_rows || []) +
            renderMaintenance(data.maintenance_asset_rows || []) +
            '<div class="asset-type-grid">' +
                renderTypeSection('laptop-assets', 'fa-laptop', 'Laptops', data.laptop_rows || []) +
                renderTypeSection('monitor-assets', 'fa-desktop', 'Monitors', data.monitor_rows || []) +
                renderTypeSection('printer-assets', 'fa-print', 'Printers', data.printer_rows || []) +
                renderTypeSection('router-assets', 'fa-network-wired', 'Routers', data.router_rows || []) +
            '</div></div>';
    }

    function scrollToHashTarget() {
        if (!window.location.hash) {
            return;
        }
        var target = document.querySelector(window.location.hash);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function init() {
        var mount = document.getElementById('asset-sections-mount');
        if (!mount) {
            return;
        }

        var dataEl = document.getElementById('asset-sections-data');
        if (dataEl && dataEl.textContent) {
            try {
                mount.classList.remove('async-loading');
                mount.innerHTML = renderAll(JSON.parse(dataEl.textContent));
                if (window.AssetTableExpand && typeof window.AssetTableExpand.refresh === 'function') {
                    window.AssetTableExpand.refresh(mount);
                }
                if (window.AssetBulkSelect && typeof window.AssetBulkSelect.refresh === 'function') {
                    window.AssetBulkSelect.refresh(mount);
                }
                scrollToHashTarget();
                return;
            } catch (error) {
                console.error('Failed to render server asset sections:', error);
            }
        }

        if (!window.BackgroundJobs) {
            mount.classList.remove('async-loading');
            if (window.Utils && typeof window.Utils.showAsyncError === 'function') {
                window.Utils.showAsyncError(
                    mount,
                    'Unable to load asset sections. Refresh the page to try again.'
                );
            }
            return;
        }

        window.BackgroundJobs.run('asset_sections', {
            onProgress: function(job) {
                if (job.status === 'running') {
                    mount.classList.add('async-loading');
                }
            }
        }).then(function(job) {
            mount.classList.remove('async-loading');
            mount.innerHTML = renderAll(job.result || {});
            if (window.AssetTableExpand && typeof window.AssetTableExpand.refresh === 'function') {
                window.AssetTableExpand.refresh(mount);
            }
            if (window.AssetBulkSelect && typeof window.AssetBulkSelect.refresh === 'function') {
                window.AssetBulkSelect.refresh(mount);
            }
            scrollToHashTarget();
        }).catch(function(error) {
            console.error('Asset sections async load failed:', error);
            if (window.Utils && typeof window.Utils.showAsyncError === 'function') {
                window.Utils.showAsyncError(
                    mount,
                    window.Utils.getUserFacingError(
                        error,
                        'Unable to load asset sections. Refresh the page to try again.'
                    ),
                    { onRetry: init }
                );
            }
        });
    }

    window.AssetSections = {
        init: init,
        renderAll: renderAll
    };
})();
