/**
 * REPORTS MODULE - ITAM SYSTEM
 */
(function() {
    'use strict';

    function parseJson(value, fallback) {
        if (typeof value === 'object') return value;
        try { return JSON.parse(value); } catch (e) { return fallback; }
    }

    function monthSeries(rows) {
        return {
            labels: rows.map(function(d) { return d.month || d.label || ''; }),
            values: rows.map(function(d) { return d.count || d.value || 0; })
        };
    }

    function initMap(graph) {
        var root = document.getElementById('ecosystem-map-root');
        if (!root || !window.ReportEcosystemMap) {
            return;
        }
        root.classList.remove('ecosystem-map-loading');
        if (!graph || !graph.nodes || !graph.nodes.length) {
            root.innerHTML = '<div class="ecosystem-map-loading">No map data available.</div>';
            return;
        }
        window.ReportEcosystemMap.init(root, graph);
    }

    function init(data) {
        if (!data || !window.ChartCore) return;

        ChartCore.destroyAll();

        if (data.assetByStatus && Object.keys(data.assetByStatus).length) {
            var statusLabels = Object.keys(data.assetByStatus);
            ChartCore.createDoughnut(
                'statusChart',
                Object.values(data.assetByStatus),
                statusLabels,
                ChartCore.statusColors(statusLabels),
                ''
            );
        }

        if (data.assetByType && Object.keys(data.assetByType).length) {
            ChartCore.createBar('typeChart', Object.values(data.assetByType), Object.keys(data.assetByType), true);
        }

        if (data.monthlyAssets && data.monthlyAssets.length) {
            var monthly = monthSeries(data.monthlyAssets);
            ChartCore.createLine('monthlyChart', monthly.values, monthly.labels, '#3b82f6', true);
        }

        if (data.maintenanceByMonth && data.maintenanceByMonth.length) {
            var maintenance = monthSeries(data.maintenanceByMonth);
            ChartCore.createLine('maintenanceChart', maintenance.values, maintenance.labels, '#f59e0b', false);
        }

        if (data.topAssets && data.topAssets.length) {
            ChartCore.createBar(
                'topAssetsChart',
                data.topAssets.map(function(d) { return d.assignments || d.count || 0; }),
                data.topAssets.map(function(d) { return d.name || d.label || ''; }),
                true,
                '#8b5cf6'
            );
        }

        if (data.departmentData && Object.keys(data.departmentData).length) {
            ChartCore.createDoughnut(
                'departmentChart',
                Object.values(data.departmentData),
                Object.keys(data.departmentData),
                null,
                ''
            );
        }

        if (data.ecosystemMap) {
            initMap(data.ecosystemMap);
        }
    }

    function updateSummaryCards(data) {
        var map = {
            total_assets: data.total_assets,
            assigned_assets: data.assigned_assets,
            available_assets: data.available_assets,
            maintenance_assets: data.maintenance_assets,
            total_employees: data.total_employees,
            utilization_rate: data.utilization_rate + '%'
        };
        Object.keys(map).forEach(function(key) {
            var el = document.querySelector('[data-summary-key="' + key + '"]');
            if (el) el.textContent = map[key];
        });
    }

    function updateAdditionalStats(data) {
        var stats = {
            overdue_count: data.overdue_count || 0,
            asset_health_rate: (data.asset_health_rate || 0) + '%',
            total_assignments: data.total_assignments || 0
        };
        Object.keys(stats).forEach(function(key) {
            var el = document.querySelector('[data-stat-key="' + key + '"]');
            if (!el) return;
            el.textContent = stats[key];
            if (key === 'overdue_count') {
                el.classList.toggle('danger', data.overdue_count > 0);
                el.classList.toggle('success', data.overdue_count === 0);
            }
        });
    }

    function loadAsync() {
        var container = document.querySelector('.reports-container');
        if (!container || !window.BackgroundJobs) return;

        container.classList.add('async-loading');
        window.BackgroundJobs.run('reports', { force: false })
            .then(function(job) {
                var data = job.result || {};
                container.classList.remove('async-loading');
                updateSummaryCards(data);
                updateAdditionalStats(data);
                init({
                    assetByStatus: parseJson(data.asset_by_status, {}),
                    assetByType: parseJson(data.asset_by_type, {}),
                    monthlyAssets: parseJson(data.monthly_assets, []),
                    maintenanceByMonth: parseJson(data.maintenance_by_month, []),
                    topAssets: parseJson(data.top_assets_data, []),
                    departmentData: parseJson(data.department_counts, {}),
                    ecosystemMap: parseJson(data.ecosystem_map, null)
                });
            })
            .catch(function(error) {
                container.classList.remove('async-loading');
                console.error('Reports async load failed:', error);
                if (window.Utils && typeof window.Utils.showAsyncError === 'function') {
                    window.Utils.showAsyncError(
                        container,
                        window.Utils.getUserFacingError(
                            error,
                            'Unable to load report data. Refresh the page to try again.'
                        ),
                        { onRetry: loadAsync }
                    );
                }
            });
    }

    function bootstrap() {
        var container = document.querySelector('.reports-container');
        if (container && container.dataset.asyncReports === 'true') {
            loadAsync();
        }
    }

    window.Reports = {
        init: init,
        bootstrap: bootstrap,
        refresh: loadAsync,
        updateCharts: function() { if (window.ChartCore) ChartCore.updateAll(); },
        destroy: function() { if (window.ChartCore) ChartCore.destroyAll(); }
    };
})();
