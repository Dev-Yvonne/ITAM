/**
 * DASHBOARD ANALYTICS - Chart rendering & bento interactions
 */
(function() {
    'use strict';

    var charts = {};
    var colorScheme = {
        light: { text: '#1e293b', grid: '#e2e8f0', muted: '#94a3b8' },
        dark: { text: '#f1f5f9', grid: '#334155', muted: '#64748b' }
    };
    var chartColors = [
        '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
    ];
    var statusColors = { Available: '#22c55e', Assigned: '#3b82f6', 'Under Maintenance': '#f59e0b' };

    function getColors() {
        var theme = document.documentElement.getAttribute('data-theme');
        return theme === 'dark' ? colorScheme.dark : colorScheme.light;
    }

    function destroyCharts() {
        Object.keys(charts).forEach(function(key) {
            if (charts[key]) {
                charts[key].destroy();
                charts[key] = null;
            }
        });
    }

    function baseLegend() {
        return {
            position: 'bottom',
            labels: {
                color: getColors().text,
                padding: 12,
                font: { size: 11, family: 'system-ui, -apple-system, sans-serif' },
                usePointStyle: true,
                pointStyle: 'circle'
            }
        };
    }

    function createStatusChart(data, total) {
        var ctx = document.getElementById('dashStatusChart');
        if (!ctx || typeof Chart === 'undefined') return;

        var labels = Object.keys(data || {});
        var values = Object.values(data || {});
        var colors = labels.map(function(l) { return statusColors[l] || chartColors[0]; });

        charts.status = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: baseLegend(),
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        padding: 12,
                        cornerRadius: 8
                    }
                },
                animation: { animateRotate: true, duration: 900 }
            }
        });

        var center = document.getElementById('dashStatusTotal');
        if (center) center.textContent = total != null ? total : values.reduce(function(a, b) { return a + b; }, 0);
    }

    function createTypeChart(data) {
        var ctx = document.getElementById('dashTypeChart');
        if (!ctx) return;
        var labels = Object.keys(data || {});
        var values = Object.values(data || {});

        charts.type = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: chartColors.slice(0, labels.length),
                    borderRadius: 8,
                    borderSkipped: false,
                    barThickness: 'flex',
                    maxBarThickness: 36
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: getColors().muted, font: { size: 10 } },
                        grid: { color: getColors().grid, drawBorder: false }
                    },
                    x: {
                        ticks: { color: getColors().muted, font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function createMonthlyChart(data) {
        var ctx = document.getElementById('dashMonthlyChart');
        if (!ctx) return;
        var labels = (data || []).map(function(d) { return d.month; });
        var values = (data || []).map(function(d) { return d.count; });

        charts.monthly = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Created',
                    data: values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    fill: true,
                    tension: 0.42,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: getColors().muted, stepSize: 1 },
                        grid: { color: getColors().grid, drawBorder: false }
                    },
                    x: {
                        ticks: { color: getColors().muted },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function createMaintenanceChart(data) {
        var ctx = document.getElementById('dashMaintenanceChart');
        if (!ctx) return;
        var labels = (data || []).map(function(d) { return d.month; });
        var values = (data || []).map(function(d) { return d.count; });

        charts.maintenance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Logs',
                    data: values,
                    backgroundColor: 'rgba(245, 158, 11, 0.85)',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: getColors().muted, stepSize: 1 },
                        grid: { color: getColors().grid, drawBorder: false }
                    },
                    x: {
                        ticks: { color: getColors().muted },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function createTopAssetsChart(data) {
        var ctx = document.getElementById('dashTopAssetsChart');
        if (!ctx) return;
        var items = (data || []).slice();
        var labels = items.map(function(d) { return d.name; }).reverse();
        var values = items.map(function(d) { return d.assignments; }).reverse();

        charts.topAssets = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: 'rgba(139, 92, 246, 0.85)',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { color: getColors().muted, stepSize: 1 },
                        grid: { color: getColors().grid, drawBorder: false }
                    },
                    y: {
                        ticks: { color: getColors().text, font: { size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function createDepartmentChart(data) {
        var ctx = document.getElementById('dashDepartmentChart');
        if (!ctx) return;
        var labels = Object.keys(data || {});
        var values = Object.values(data || {});

        charts.department = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: chartColors.slice(0, labels.length),
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '58%',
                plugins: { legend: { display: false } }
            }
        });

        renderDeptLegend(labels, values);
    }

    function renderDeptLegend(labels, values) {
        var mount = document.getElementById('dashDeptLegend');
        if (!mount) return;
        var total = values.reduce(function(a, b) { return a + b; }, 0) || 1;
        mount.innerHTML = labels.map(function(label, i) {
            var pct = Math.round((values[i] / total) * 100);
            return '<div class="dept-legend-item">' +
                '<span class="dept-legend-dot" style="background:' + chartColors[i % chartColors.length] + '"></span>' +
                '<span class="dept-legend-name">' + label + '</span>' +
                '<span class="dept-legend-pct">' + pct + '%</span>' +
            '</div>';
        }).join('');
    }

    function updateUtilizationRing(rate) {
        var ring = document.getElementById('utilization-ring');
        var valueEl = document.getElementById('utilization-rate-value');
        if (ring) ring.style.setProperty('--progress', rate + '%');
        if (valueEl) valueEl.textContent = rate + '%';
    }

    function setupTabs() {
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
                Object.keys(charts).forEach(function(key) {
                    if (charts[key]) charts[key].resize();
                });
            });
        });
    }

    function hideLoading() {
        var el = document.getElementById('analytics-loading');
        if (el) el.classList.add('hidden');
        var bento = document.getElementById('analytics-bento');
        if (bento) bento.classList.add('loaded');
    }

    function showLoading() {
        var el = document.getElementById('analytics-loading');
        if (el) el.classList.remove('hidden');
    }

    function initTabsOnce() {
        if (initTabsOnce.done) return;
        initTabsOnce.done = true;
        setupTabs();
    }

    function render(data) {
        if (!data) return;
        destroyCharts();
        var analytics = data.analytics || {};
        createStatusChart(analytics.asset_by_status, data.total_assets);
        createTypeChart(analytics.asset_by_type);
        createMonthlyChart(analytics.monthly_assets);
        createMaintenanceChart(analytics.maintenance_by_month);
        createTopAssetsChart(analytics.top_assets);
        createDepartmentChart(analytics.department_counts);
        updateUtilizationRing(data.utilization_rate || 0);
        hideLoading();
    }

    function initFromPayload(data) {
        initTabsOnce();
        if (!data || !data.analytics) {
            showLoading();
            return;
        }
        requestAnimationFrame(function() {
            render(data);
        });
    }

    window.DashboardAnalytics = {
        render: render,
        initFromPayload: initFromPayload,
        initTabs: initTabsOnce,
        destroy: destroyCharts
    };
})();
