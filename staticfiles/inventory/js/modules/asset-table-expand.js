/**
 * Progressive table expand: 5 rows -> 10 rows -> all rows
 */
(function() {
    'use strict';

    var LIMITS = [5, 10, Infinity];

    function getDataRows(tbody) {
        return Array.from(tbody.querySelectorAll('tr')).filter(function(row) {
            if (row.classList.contains('skeleton-row')) {
                return false;
            }
            if (row.classList.contains('empty-state')) {
                return false;
            }
            if (row.querySelector('.empty-state-content')) {
                return false;
            }
            return true;
        });
    }

    function getLimitForLevel(level) {
        var index = Math.max(0, Math.min(level, LIMITS.length - 1));
        return LIMITS[index];
    }

    function shouldShowExpandButton(level, total) {
        if (total <= LIMITS[0]) {
            return false;
        }
        if (level === 0) {
            return true;
        }
        if (level === 1 && total > LIMITS[1]) {
            return true;
        }
        return false;
    }

    function getExpandButtonLabel(level, total) {
        if (level === 0) {
            return 'Expand';
        }
        if (level === 1 && total > LIMITS[1]) {
            return 'Expand';
        }
        return 'Expand';
    }

    function applyExpandLevel(tbody, level) {
        var rows = getDataRows(tbody);
        var limit = getLimitForLevel(level);

        rows.forEach(function(row, index) {
            var hidden = index >= limit;
            row.hidden = hidden;
            row.classList.toggle('asset-table-row-hidden', hidden);
        });

        return rows.length;
    }

    function getTableHost(section) {
        return section.querySelector('.table-wrapper.asset-section-table')
            || section.querySelector('.table-wrapper')
            || section.querySelector('.asset-section-table');
    }

    function removeExpandFooter(host) {
        if (!host) {
            return;
        }
        var footer = host.querySelector('.asset-table-expand-footer');
        if (footer) {
            footer.remove();
        }
    }

    function setupSection(section, options) {
        options = options || {};
        var host = getTableHost(section);
        var tbody = section.querySelector('tbody');

        if (!host || !tbody) {
            return;
        }

        if (!options.preserveLevel) {
            section.setAttribute('data-expand-level', '0');
        }

        var level = parseInt(section.getAttribute('data-expand-level') || '0', 10);
        var total = applyExpandLevel(tbody, level);

        removeExpandFooter(host);

        if (!shouldShowExpandButton(level, total)) {
            return;
        }

        var footer = document.createElement('div');
        footer.className = 'asset-table-expand-footer';

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary btn-sm asset-table-expand-btn';
        button.textContent = getExpandButtonLabel(level, total);
        button.setAttribute('aria-expanded', level > 0 ? 'true' : 'false');

        button.addEventListener('click', function() {
            var currentLevel = parseInt(section.getAttribute('data-expand-level') || '0', 10);
            var nextLevel = Math.min(currentLevel + 1, LIMITS.length - 1);
            section.setAttribute('data-expand-level', String(nextLevel));
            setupSection(section, { preserveLevel: true });
        });

        footer.appendChild(button);
        host.appendChild(footer);
    }

    function init(root, options) {
        options = options || {};
        var scope = root || document;
        var sections = scope.querySelectorAll('.asset-section, .asset-catalog-section, #all-assets');

        sections.forEach(function(section) {
            setupSection(section, { preserveLevel: options.preserveLevel });
        });
    }

    window.AssetTableExpand = {
        init: init,
        refresh: function(root) {
            init(root, { preserveLevel: false });
        }
    };

    function boot() {
        if (document.getElementById('asset-catalog-sections')
            || document.getElementById('all-assets')
            || document.getElementById('asset-sections-mount')) {
            init(document, { preserveLevel: false });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
