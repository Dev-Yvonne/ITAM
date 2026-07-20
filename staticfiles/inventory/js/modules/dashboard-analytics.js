/**
 * DASHBOARD ANALYTICS - Insight cards, bento tabs, chart orchestration
 */
(function() {
    'use strict';

    var tabsReady = false;
    var tabsElRef = null;
    var gliderObserver = null;
    var growthSwitcherReady = false;
    var weeklyGrowth = null;
    var selectedMonthKey = null;

    function monthSeries(rows) {
        return {
            labels: (rows || []).map(function(d) { return d.month; }),
            values: (rows || []).map(function(d) { return d.count; })
        };
    }

    /** Shorten "Feb 2026" → "Feb", keeping the year when it changes across the series. */
    function shortMonthLabels(labels) {
        var years = {};
        var parsed = (labels || []).map(function(label) {
            var parts = String(label || '').trim().split(/\s+/);
            var month = parts[0] || label;
            var year = parts[1] || '';
            if (year) years[year] = true;
            return { month: month, year: year };
        });
        var multiYear = Object.keys(years).length > 1;
        return parsed.map(function(item, index) {
            if (!item.year) return item.month;
            if (multiYear) {
                var prevYear = index > 0 ? parsed[index - 1].year : '';
                if (item.year !== prevYear) {
                    return item.month + ' \'' + String(item.year).slice(-2);
                }
            }
            return item.month;
        });
    }

    function sumSeries(values) {
        return (values || []).reduce(function(total, value) {
            var n = Number(value);
            return total + (isNaN(n) ? 0 : n);
        }, 0);
    }

    function updateMaintenanceMeta(values) {
        var hint = document.getElementById('dashMaintenanceHint');
        var empty = document.getElementById('dashMaintenanceEmpty');
        var wrap = document.getElementById('dashMaintenanceWrap');
        var total = sumSeries(values);
        if (hint) {
            hint.textContent = total === 1
                ? 'Last 6 months · 1 event'
                : 'Last 6 months · ' + total + ' events';
        }
        if (empty) {
            empty.hidden = total > 0;
        }
        if (wrap) {
            wrap.classList.toggle('is-empty', total === 0);
        }
    }

    function renderDeptLegend(labels, values) {
        var mount = document.getElementById('dashDeptLegend');
        if (!mount || !window.ChartCore) return;
        var total = values.reduce(function(a, b) { return a + b; }, 0) || 1;
        mount.innerHTML = labels.map(function(label, i) {
            var pct = Math.round((values[i] / total) * 100);
            var color = ChartCore.getBlueShades(labels.length)[i];
            return '<div class="dept-legend-item">' +
                '<span class="dept-legend-dot" style="background:' + color + '"></span>' +
                '<span class="dept-legend-name">' + label + '</span>' +
                '<span class="dept-legend-pct">' + pct + '%</span>' +
            '</div>';
        }).join('');
    }

    function getSelectedMonth() {
        if (!weeklyGrowth || !weeklyGrowth.months || !weeklyGrowth.months.length) {
            return null;
        }
        var months = weeklyGrowth.months;
        for (var i = 0; i < months.length; i += 1) {
            if (months[i].key === selectedMonthKey) {
                return { month: months[i], index: i };
            }
        }
        selectedMonthKey = weeklyGrowth.default_month || months[months.length - 1].key;
        return getSelectedMonth();
    }

    function updateGrowthSwitcher() {
        var selected = getSelectedMonth();
        var label = document.querySelector('[data-growth-month-label]');
        var prevBtn = document.querySelector('[data-growth-prev]');
        var nextBtn = document.querySelector('[data-growth-next]');
        if (!selected) {
            if (label) label.textContent = 'No data';
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        if (label) label.textContent = selected.month.label;
        if (prevBtn) prevBtn.disabled = selected.index <= 0;
        if (nextBtn) nextBtn.disabled = selected.index >= weeklyGrowth.months.length - 1;
    }

    function renderGrowthChart() {
        if (!window.ChartCore) return;
        var selected = getSelectedMonth();
        updateGrowthSwitcher();
        if (!selected) {
            ChartCore.createLine(
                'dashMonthlyChart',
                [0, 0, 0, 0],
                ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                '#2563eb',
                true,
                { yAxisTitle: 'Asset Count', xAxisTitle: 'Week' }
            );
            return;
        }
        var weeks = selected.month.weeks || [];
        ChartCore.createLine(
            'dashMonthlyChart',
            weeks.map(function(week) { return week.count || 0; }),
            weeks.map(function(week) { return week.label || ('Week ' + week.week); }),
            '#2563eb',
            true,
            { yAxisTitle: 'Asset Count', xAxisTitle: 'Week' }
        );
    }

    function shiftGrowthMonth(delta) {
        if (!weeklyGrowth || !weeklyGrowth.months || !weeklyGrowth.months.length) {
            return;
        }
        var selected = getSelectedMonth();
        if (!selected) return;
        var nextIndex = selected.index + delta;
        if (nextIndex < 0 || nextIndex >= weeklyGrowth.months.length) {
            return;
        }
        selectedMonthKey = weeklyGrowth.months[nextIndex].key;
        renderGrowthChart();
    }

    function setupGrowthSwitcher() {
        if (growthSwitcherReady) return;
        var root = document.querySelector('[data-growth-month-switcher]');
        if (!root) return;
        growthSwitcherReady = true;
        var prevBtn = root.querySelector('[data-growth-prev]');
        var nextBtn = root.querySelector('[data-growth-next]');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                shiftGrowthMonth(-1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                shiftGrowthMonth(1);
            });
        }
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function employeeInitials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function renderTopEmployees(employees) {
        var mount = document.getElementById('dashTopEmployees');
        if (!mount) return;

        if (!employees || !employees.length) {
            mount.innerHTML = '<p class="employee-rank-empty">No active assignments yet.</p>';
            return;
        }

        var maxAssets = Math.max.apply(null, employees.map(function(row) {
            return row.assets || 0;
        })) || 1;

        mount.innerHTML = employees.map(function(row, index) {
            var assets = row.assets || 0;
            var width = Math.max(8, Math.round((assets / maxAssets) * 100));
            var label = assets === 1 ? '1 asset' : assets + ' assets';
            return '<div class="employee-rank-row">' +
                '<span class="employee-rank-pos">' + (index + 1) + '</span>' +
                '<span class="employee-rank-avatar" aria-hidden="true">' +
                    escapeHtml(employeeInitials(row.name)) +
                '</span>' +
                '<div class="employee-rank-meta">' +
                    '<div class="employee-rank-top">' +
                        '<span class="employee-rank-name">' + escapeHtml(row.name) + '</span>' +
                        '<span class="employee-rank-count">' + escapeHtml(label) + '</span>' +
                    '</div>' +
                    '<span class="employee-rank-dept">' + escapeHtml(row.department || 'Unassigned') + '</span>' +
                    '<div class="employee-rank-track" aria-hidden="true">' +
                        '<span class="employee-rank-bar" style="width:' + width + '%"></span>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderCharts(analytics) {
        if (!analytics) return;

        if (window.ChartCore) {
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
                var typeEntries = Object.keys(analytics.asset_by_type).map(function(label) {
                    return { label: label, value: analytics.asset_by_type[label] || 0 };
                }).sort(function(a, b) {
                    return b.value - a.value;
                });
                var typeTotal = typeEntries.reduce(function(sum, entry) {
                    return sum + entry.value;
                }, 0);
                var typeHint = document.getElementById('dashTypeHint');
                if (typeHint) {
                    typeHint.textContent = typeEntries.length === 1
                        ? '1 type · ' + typeTotal + ' assets'
                        : typeEntries.length + ' types · ' + typeTotal + ' assets';
                }
                ChartCore.createBar(
                    'dashTypeChart',
                    typeEntries.map(function(entry) { return entry.value; }),
                    typeEntries.map(function(entry) { return entry.label; }),
                    true,
                    null,
                    {
                        unit: 'assets',
                        maxBarThickness: 28,
                        categoryPercentage: 0.7,
                        barPercentage: 0.82
                    }
                );
            }

            weeklyGrowth = analytics.weekly_asset_growth || null;
            if (weeklyGrowth && weeklyGrowth.default_month) {
                selectedMonthKey = weeklyGrowth.default_month;
            }
            setupGrowthSwitcher();
            renderGrowthChart();

            if (analytics.maintenance_by_month && analytics.maintenance_by_month.length) {
                var maintenance = monthSeries(analytics.maintenance_by_month);
                updateMaintenanceMeta(maintenance.values);
                ChartCore.createBar(
                    'dashMaintenanceChart',
                    maintenance.values,
                    shortMonthLabels(maintenance.labels),
                    false,
                    '#f59e0b',
                    {
                        unit: 'events',
                        minMax: 4,
                        maxBarThickness: 42,
                        categoryPercentage: 0.7,
                        barPercentage: 0.82
                    }
                );
            } else {
                updateMaintenanceMeta([]);
            }

            if (analytics.department_counts && Object.keys(analytics.department_counts).length) {
                var deptLabels = Object.keys(analytics.department_counts);
                var deptValues = Object.values(analytics.department_counts);
                ChartCore.createDoughnut(
                    'dashDepartmentChart',
                    deptValues,
                    deptLabels,
                    ChartCore.getBlueShades(deptLabels.length),
                    false
                );
                renderDeptLegend(deptLabels, deptValues);
            }
        }

        renderTopEmployees(analytics.top_employees || []);
    }

    function updateInsights(data) {
        var utilization = document.getElementById('utilization-rate-value');
        if (utilization) utilization.textContent = (data.utilization_rate || 0) + '%';

        var employees = document.getElementById('employee-count-value');
        if (employees) employees.textContent = data.employee_count;

        var health = document.getElementById('asset-health-value');
        if (health) {
            health.textContent = (data.asset_health_rate || 0) + '%';
        }

        var assignments = document.getElementById('total-assignments-value');
        if (assignments) assignments.textContent = data.total_assignments || 0;

        var overdueCount = document.getElementById('overdue-count-value');
        if (overdueCount) {
            overdueCount.textContent = data.overdue_assets_count || 0;
            var overdueMetric = document.getElementById('overdue-metric') || overdueCount.closest('[data-state]');
            if (overdueMetric) {
                overdueMetric.setAttribute(
                    'data-state',
                    (data.overdue_assets_count || 0) > 0 ? 'alert' : 'clear'
                );
            }
        }
    }

    function syncTabGlider(tabsEl, activeTab, animate) {
        if (!tabsEl || !activeTab) return;
        var glider = tabsEl.querySelector('.dash-tab-glider');
        if (!glider) return;

        var tabsRect = tabsEl.getBoundingClientRect();
        var tabRect = activeTab.getBoundingClientRect();
        var x = tabRect.left - tabsRect.left;
        var y = tabRect.top - tabsRect.top;

        if (animate === false) {
            glider.style.transition = 'none';
        }
        glider.style.width = tabRect.width + 'px';
        glider.style.height = tabRect.height + 'px';
        glider.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
        if (animate === false) {
            // Force reflow so the next move can animate from this position.
            void glider.offsetWidth;
            glider.style.transition = '';
        }
    }

    function syncActiveTabGlider(animate) {
        if (!tabsElRef) {
            tabsElRef = document.querySelector('.dash-chart-tabs');
        }
        if (!tabsElRef) return;
        var activeTab = tabsElRef.querySelector('.dash-tab.active');
        syncTabGlider(tabsElRef, activeTab, animate === false ? false : true);
    }

    function scheduleGliderSync() {
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                syncActiveTabGlider(false);
            });
        });
    }

    function attachGliderObserver(tabsEl) {
        if (gliderObserver || !tabsEl || !window.ResizeObserver) return;
        gliderObserver = new ResizeObserver(function() {
            syncActiveTabGlider(false);
        });
        gliderObserver.observe(tabsEl);
        tabsEl.querySelectorAll('.dash-tab').forEach(function(tab) {
            gliderObserver.observe(tab);
        });
    }

    function setupTabs() {
        if (tabsReady) return;
        tabsReady = true;
        var tabsEl = document.querySelector('.dash-chart-tabs');
        tabsElRef = tabsEl;
        var tabs = document.querySelectorAll('.dash-tab');
        var panels = document.querySelectorAll('.bento-panel');
        var activeTab = tabsEl ? tabsEl.querySelector('.dash-tab.active') : null;

        if (!activeTab && tabs.length) {
            activeTab = tabs[0];
            activeTab.classList.add('active');
            activeTab.setAttribute('aria-selected', 'true');
        }

        syncTabGlider(tabsEl, activeTab, false);
        scheduleGliderSync();
        attachGliderObserver(tabsEl);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function() {
                syncActiveTabGlider(false);
            });
        }

        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                var target = tab.getAttribute('data-tab');
                tabs.forEach(function(t) {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                panels.forEach(function(p) {
                    p.classList.toggle('active', p.getAttribute('data-panel') === target);
                });
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                syncTabGlider(tabsEl, tab, true);
                if (window.ChartCore) ChartCore.resizeAll();
            });
        });

        window.addEventListener('resize', function() {
            syncActiveTabGlider(false);
        });
    }

    function setLoading(loading) {
        var el = document.getElementById('analytics-loading');
        var bento = document.getElementById('analytics-bento');
        if (el) el.classList.toggle('hidden', !loading);
        if (bento) bento.classList.toggle('loaded', !loading);
        if (!loading) {
            scheduleGliderSync();
        }
    }

    function applyData(data) {
        setupTabs();
        if (!data) {
            setLoading(true);
            return;
        }
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
