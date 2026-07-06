/**
 * DASHBOARD ANALYTICS - Insight cards, bento tabs, chart orchestration
 */
(function() {
    'use strict';

    var tabsReady = false;

    function monthSeries(rows) {
        return {
            labels: (rows || []).map(function(d) { return d.month; }),
            values: (rows || []).map(function(d) { return d.count; })
        };
    }

    function renderDeptLegend(labels, values) {
        var mount = document.getElementById('dashDeptLegend');
        if (!mount || !window.ChartCore) return;
        var total = values.reduce(function(a, b) { return a + b; }, 0) || 1;
        mount.innerHTML = labels.map(function(label, i) {
            var pct = Math.round((values[i] / total) * 100);
            var color = ChartCore.chartColors[i % ChartCore.chartColors.length];
            return '<div class="dept-legend-item">' +
                '<span class="dept-legend-dot" style="background:' + color + '"></span>' +
                '<span class="dept-legend-name">' + label + '</span>' +
                '<span class="dept-legend-pct">' + pct + '%</span>' +
            '</div>';
        }).join('');
    }

    function renderCharts(analytics) {
        if (!window.ChartCore || !analytics) return;
        ChartCore.destroyAll();

        if (analytics.asset_by_status && Object.keys(analytics.asset_by_status).length) {
            var statusLabels = Object.keys(analytics.asset_by_status);
            ChartCore.createDoughnut(
                'dashStatusChart',
                Object.values(analytics.asset_by_status),
                statusLabels,
                ChartCore.statusColors(statusLabels),
                'assets'
            );
        }

        if (analytics.asset_by_type && Object.keys(analytics.asset_by_type).length) {
            ChartCore.createBar(
                'dashTypeChart',
                Object.values(analytics.asset_by_type),
                Object.keys(analytics.asset_by_type),
                false
            );
        }

        if (analytics.monthly_assets && analytics.monthly_assets.length) {
            var monthly = monthSeries(analytics.monthly_assets);
            ChartCore.createLine('dashMonthlyChart', monthly.values, monthly.labels, '#3b82f6', true);
        }

        if (analytics.maintenance_by_month && analytics.maintenance_by_month.length) {
            var maintenance = monthSeries(analytics.maintenance_by_month);
            ChartCore.createBar(
                'dashMaintenanceChart',
                maintenance.values,
                maintenance.labels,
                false,
                '#f59e0b'
            );
        }

        if (analytics.top_assets && analytics.top_assets.length) {
            var top = analytics.top_assets.slice().reverse();
            ChartCore.createBar(
                'dashTopAssetsChart',
                top.map(function(d) { return d.assignments; }),
                top.map(function(d) { return d.name; }),
                true,
                '#8b5cf6'
            );
        }

        if (analytics.department_counts && Object.keys(analytics.department_counts).length) {
            var deptLabels = Object.keys(analytics.department_counts);
            var deptValues = Object.values(analytics.department_counts);
            ChartCore.createDoughnut('dashDepartmentChart', deptValues, deptLabels, null, false);
            renderDeptLegend(deptLabels, deptValues);
        }
    }

    function updateInsights(data) {
        var utilization = document.getElementById('utilization-rate-value');
        if (utilization) utilization.textContent = (data.utilization_rate || 0) + '%';

        var employees = document.getElementById('employee-count-value');
        if (employees) employees.textContent = data.employee_count;

        var health = document.getElementById('asset-health-value');
        if (health) {
            health.textContent = (data.asset_health_rate || 0) + '%';
            health.classList.toggle('healthy', data.asset_health_rate < 10);
            health.classList.toggle('warning', data.asset_health_rate >= 10);
        }

        var assignments = document.getElementById('total-assignments-value');
        if (assignments) assignments.textContent = data.total_assignments || 0;

        var overdueCount = document.getElementById('overdue-count-value');
        if (overdueCount) {
            overdueCount.textContent = data.overdue_assets_count || 0;
            var opsItem = overdueCount.closest('.insight-ops-item');
            if (opsItem) {
                opsItem.classList.toggle('danger', (data.overdue_assets_count || 0) > 0);
                opsItem.classList.toggle('success', !(data.overdue_assets_count || 0));
            }
        }
    }

    function setupTabs() {
        if (tabsReady) return;
        tabsReady = true;
        var tabs = document.querySelectorAll('.dash-tab');
        var panels = document.querySelectorAll('.bento-panel');
        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                var target = tab.getAttribute('data-tab');
                tabs.forEach(function(t) { t.classList.remove('active'); });
                panels.forEach(function(p) {
                    p.classList.toggle('active', p.getAttribute('data-panel') === target);
                });
                tab.classList.add('active');
                if (window.ChartCore) ChartCore.resizeAll();
            });
        });
    }

    function setLoading(loading) {
        var el = document.getElementById('analytics-loading');
        var bento = document.getElementById('analytics-bento');
        if (el) el.classList.toggle('hidden', !loading);
        if (bento) bento.classList.toggle('loaded', !loading);
    }

    function applyData(data) {
        if (!data) return;
        setupTabs();
        if (!data.analytics) {
            setLoading(true);
            return;
        }
        updateInsights(data);
        requestAnimationFrame(function() {
            renderCharts(data.analytics);
            setLoading(false);
        });
    }

    window.DashboardAnalytics = {
        applyData: applyData,
        initTabs: setupTabs
    };
})();
