/**
 * Row actions menu (vertical dots) for asset tables
 */
(function() {
    'use strict';

    var bound = false;
    var openMenu = null;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function isAdminHost() {
        var host = document.querySelector('[data-user-is-admin]');
        return host && host.getAttribute('data-user-is-admin') === 'true';
    }

    function canAssignFromStatus(status) {
        if (!isAdminHost()) {
            return false;
        }
        var normalized = String(status || '').toLowerCase().trim();
        return normalized === 'available';
    }

    function canAssignAsset(asset) {
        if (!asset || !isAdminHost()) {
            return false;
        }
        if (asset.assigned_employee) {
            return false;
        }
        return canAssignFromStatus(asset.status_label || asset.status);
    }

    function closeOpenMenu() {
        if (!openMenu) {
            return;
        }
        var dropdown = openMenu.querySelector('.asset-row-menu-dropdown');
        var trigger = openMenu.querySelector('.asset-row-menu-trigger');
        if (dropdown) {
            dropdown.hidden = true;
            dropdown.classList.remove('open');
        }
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
        openMenu.classList.remove('is-open');
        openMenu = null;
    }

    function positionDropdown(trigger, dropdown) {
        var rect = trigger.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.minWidth = '9.5rem';
        dropdown.style.zIndex = '1300';

        var top = rect.bottom + 4;
        var left = rect.right - dropdown.offsetWidth;

        if (left < 8) {
            left = 8;
        }
        if (top + dropdown.offsetHeight > window.innerHeight - 8) {
            top = Math.max(8, rect.top - dropdown.offsetHeight - 4);
        }

        dropdown.style.top = top + 'px';
        dropdown.style.left = left + 'px';
    }

    function openMenuFor(wrapper) {
        closeOpenMenu();
        var trigger = wrapper.querySelector('.asset-row-menu-trigger');
        var dropdown = wrapper.querySelector('.asset-row-menu-dropdown');
        if (!trigger || !dropdown) {
            return;
        }

        dropdown.hidden = false;
        dropdown.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        wrapper.classList.add('is-open');
        positionDropdown(trigger, dropdown);
        openMenu = wrapper;
    }

    function menuItemHtml(action, label, icon, extraClass) {
        return '<button type="button" class="asset-row-menu-item' + (extraClass ? ' ' + extraClass : '') +
            '" data-action="' + action + '" role="menuitem">' +
            '<i class="fas ' + icon + '" aria-hidden="true"></i>' +
            '<span>' + escapeHtml(label) + '</span>' +
            '</button>';
    }

    function cellHtml(assetId, assetName, options) {
        options = options || {};
        var id = String(assetId || '');
        var name = String(assetName || 'asset');
        var catalogOnly = !id;
        var showAdmin = options.showAdminActions !== false && isAdminHost();
        var canAssign = !!options.canAssign && showAdmin && !catalogOnly;

        var items = menuItemHtml('view', 'View', 'fa-eye');
        if (canAssign) {
            items += menuItemHtml('assign', 'Assign', 'fa-user-plus');
        }
        if (showAdmin && !catalogOnly) {
            items += menuItemHtml('delete', 'Delete', 'fa-trash-alt', 'asset-row-menu-item-danger');
        }

        return '<td class="actions-cell" data-row-action="true">' +
            '<div class="asset-row-menu"' +
                (id ? ' data-asset-id="' + escapeHtml(id) + '"' : ' data-catalog-only="true"') +
                ' data-asset-name="' + escapeHtml(name) + '">' +
                '<button type="button" class="asset-row-menu-trigger" data-row-action="true" aria-label="Actions for ' + escapeHtml(name) + '" aria-haspopup="true" aria-expanded="false">' +
                    '<i class="fas fa-ellipsis-v" aria-hidden="true"></i>' +
                '</button>' +
                '<div class="asset-row-menu-dropdown" role="menu" hidden>' + items + '</div>' +
            '</div>' +
        '</td>';
    }

    function headerCellHtml() {
        return '<th scope="col" class="actions-col">Actions</th>';
    }

    function handleAction(action, assetId, assetName, wrapper) {
        if (action === 'view') {
            if (assetId) {
                if (window.AssetManager && typeof window.AssetManager.openAssetDetailCard === 'function') {
                    window.AssetManager.openAssetDetailCard(assetId);
                }
                return;
            }
            if (wrapper && window.AssetManager && typeof window.AssetManager.activateRow === 'function') {
                var row = wrapper.closest('.asset-table-row');
                if (row) {
                    window.AssetManager.activateRow(row);
                }
            }
            return;
        }

        if (!assetId) {
            return;
        }

        if (action === 'assign') {
            if (window.AssetManager && typeof window.AssetManager.openAssetDetailCardForAssign === 'function') {
                window.AssetManager.openAssetDetailCardForAssign(assetId);
            } else if (window.AssetManager && typeof window.AssetManager.openAssetDetailCard === 'function') {
                window.AssetManager.openAssetDetailCard(assetId);
            }
            return;
        }

        if (action === 'delete') {
            var message = 'Delete "' + assetName + '"? You will be taken to the confirmation page.';
            if (!window.confirm(message)) {
                return;
            }
            window.location.href = '/assets/' + encodeURIComponent(assetId) + '/delete/';
        }
    }

    function bindEvents() {
        if (bound) {
            return;
        }
        bound = true;

        document.addEventListener('click', function(event) {
            var item = event.target.closest('.asset-row-menu-item');
            if (item) {
                event.preventDefault();
                event.stopPropagation();
                var wrapper = item.closest('.asset-row-menu');
                if (!wrapper) {
                    return;
                }
                handleAction(
                    item.dataset.action,
                    wrapper.dataset.assetId,
                    wrapper.dataset.assetName || 'asset',
                    wrapper
                );
                closeOpenMenu();
                return;
            }

            var trigger = event.target.closest('.asset-row-menu-trigger');
            if (trigger) {
                event.preventDefault();
                event.stopPropagation();
                var menu = trigger.closest('.asset-row-menu');
                if (!menu) {
                    return;
                }
                if (openMenu === menu) {
                    closeOpenMenu();
                } else {
                    openMenuFor(menu);
                }
                return;
            }

            if (!event.target.closest('.asset-row-menu-dropdown')) {
                closeOpenMenu();
            }
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closeOpenMenu();
            }
        });

        window.addEventListener('resize', closeOpenMenu);
        window.addEventListener('scroll', closeOpenMenu, true);
    }

    function init() {
        bindEvents();
    }

    window.AssetRowMenu = {
        init: init,
        cellHtml: cellHtml,
        headerCellHtml: headerCellHtml,
        canAssignAsset: canAssignAsset,
        canAssignFromStatus: canAssignFromStatus,
        close: closeOpenMenu
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
