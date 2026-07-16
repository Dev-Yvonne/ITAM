/**
 * CHART CORE - Shared Chart.js helpers for dashboard and reports
 */
(function() {
    'use strict';

    var chartInstances = {};
    var colorScheme = {
        light: { text: '#1e293b', grid: '#e2e8f0', border: '#cbd5e1' },
        dark: { text: '#f1f5f9', grid: '#334155', border: '#475569' }
    };
    var chartColors = [
        '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
        '#6366f1', '#84cc16'
    ];
    var colorMap = {
        'Available': '#1e40af',
        'Assigned': '#3b82f6',
        'Under Maintenance': '#f59e0b',
        'Maintenance': '#f59e0b',
        'Retired': '#ef4444',
        'Lost': '#ec4899',
        'Damaged': '#f97316'
    };

    function getTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function getColors() {
        return colorScheme[getTheme()] || colorScheme.light;
    }

    function getChartColors(count) {
        var colors = [];
        for (var i = 0; i < count; i++) {
            colors.push(chartColors[i % chartColors.length]);
        }
        return colors;
    }

    function statusColors(labels) {
        return labels.map(function(label, index) {
            return colorMap[label] || chartColors[index % chartColors.length];
        });
    }

    function centerTextPlugin(id, total, centerLabel) {
        return {
            id: 'centerText_' + id,
            beforeDraw: function(chart) {
                var area = chart.chartArea;
                var c = chart.ctx;
                var fs = Math.min(chart.width, chart.height) / 5;
                c.save();
                c.font = 'bold ' + fs + 'px system-ui, sans-serif';
                c.textBaseline = 'middle';
                c.textAlign = 'center';
                var cx = (area.left + area.right) / 2;
                var cy = (area.top + area.bottom) / 2 - (centerLabel ? 6 : 0);
                c.fillStyle = getColors().text;
                c.fillText(total, cx, cy);
                if (centerLabel) {
                    c.font = (fs / 2.5) + 'px system-ui, sans-serif';
                    c.globalAlpha = 0.6;
                    c.fillText(centerLabel, cx, cy + fs / 1.8);
                    c.globalAlpha = 1;
                }
                c.restore();
            }
        };
    }

    /**
     * Draw doughnut segments as round-cap strokes with clockwise overlap,
     * framed by a tight outer border ring against the arc outer edge.
     */
    function overlappingRingPlugin(id, colors) {
        return {
            id: 'overlappingRing_' + id,
            beforeDatasetsDraw: function(chart) {
                var meta = chart.getDatasetMeta(0);
                if (!meta || !meta.data) {
                    return;
                }
                // Keep hit-targets; hide default fills (rounded-rect arcs leave gaps).
                meta.data.forEach(function(arc) {
                    arc.options.backgroundColor = 'rgba(0,0,0,0)';
                    arc.options.borderWidth = 0;
                });
            },
            afterDatasetsDraw: function(chart) {
                var meta = chart.getDatasetMeta(0);
                if (!meta || !meta.data || !meta.data.length) {
                    return;
                }
                var c = chart.ctx;
                var isDark = getTheme() === 'dark';
                var first = meta.data[0].getProps(['x', 'y', 'outerRadius', 'innerRadius'], true);
                if (!first.outerRadius) {
                    return;
                }

                var midRadius = (first.outerRadius + first.innerRadius) / 2;
                var lineWidth = Math.max(first.outerRadius - first.innerRadius, 1);
                // Clockwise tip length: enough for a round cap to cover the next start.
                var tip = Math.min(0.28, (lineWidth * 0.55) / Math.max(midRadius, 1));

                var segments = meta.data.map(function(arc, index) {
                    var props = arc.getProps(
                        ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
                        true
                    );
                    return {
                        index: index,
                        props: props,
                        span: props.endAngle - props.startAngle,
                        color: colors[index % colors.length]
                    };
                }).filter(function(segment) {
                    return segment.span > 0;
                });

                function strokeArc(segment, fromAngle, toAngle) {
                    if (!(toAngle > fromAngle)) {
                        return;
                    }
                    c.beginPath();
                    c.strokeStyle = segment.color;
                    c.arc(segment.props.x, segment.props.y, midRadius, fromAngle, toAngle);
                    c.stroke();
                }

                c.save();
                c.lineCap = 'round';
                c.lineJoin = 'round';
                c.lineWidth = lineWidth;

                // Base pass: full segments in data order.
                segments.forEach(function(segment) {
                    strokeArc(
                        segment,
                        segment.props.startAngle,
                        segment.props.endAngle
                    );
                });

                // Second pass: redraw only the clockwise trailing tip of every
                // segment so each joint overlaps in the same clockwise direction.
                // Assigned's tip covers Available's start; Available's tip covers
                // Assigned's start.
                segments.forEach(function(segment) {
                    var end = segment.props.endAngle;
                    var start = Math.max(segment.props.startAngle, end - tip);
                    strokeArc(segment, start, end + tip * 0.35);
                });

                // Tight border: ring sits flush on the outer edge of the strokes.
                var ringWidth = 1.25;
                c.beginPath();
                c.lineCap = 'butt';
                c.lineWidth = ringWidth;
                c.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.7)';
                c.arc(first.x, first.y, first.outerRadius + ringWidth / 2, 0, Math.PI * 2);
                c.stroke();
                c.restore();
            }
        };
    }

    function createDoughnut(id, data, labels, colors, centerLabel) {
        var ctx = document.getElementById(id);
        if (!ctx || typeof Chart === 'undefined') return;

        if (chartInstances[id] && typeof chartInstances[id].destroy === 'function') {
            chartInstances[id].destroy();
            delete chartInstances[id];
        }

        var total = data.reduce(function(a, b) { return a + b; }, 0);
        var filteredLabels = [];
        var filteredData = [];
        var filteredColors = [];
        var colorSet = colors || getChartColors(data.length);
        data.forEach(function(value, index) {
            if (!value) {
                return;
            }
            filteredData.push(value);
            filteredLabels.push(labels[index]);
            filteredColors.push(colorSet[index % colorSet.length]);
        });
        if (!filteredData.length) {
            filteredData = data.slice();
            filteredLabels = labels.slice();
            filteredColors = colorSet.slice();
        }

        var plugins = [overlappingRingPlugin(id, filteredColors)];
        if (centerLabel !== false) {
            plugins.push(centerTextPlugin(id, total, centerLabel));
        }

        chartInstances[id] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: filteredLabels,
                datasets: [{
                    data: filteredData,
                    backgroundColor: filteredColors,
                    borderWidth: 0,
                    hoverOffset: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                rotation: -90,
                circumference: 360,
                layout: {
                    padding: 8
                },
                elements: {
                    arc: {
                        borderWidth: 0,
                        borderRadius: 0
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: getColors().text,
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                var value = context.parsed || 0;
                                var pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return context.label + ': ' + value + ' (' + pct + '%)';
                            }
                        }
                    }
                },
                animation: { duration: 1000 }
            },
            plugins: plugins
        });
    }

    function createBar(id, data, labels, horizontal, color) {
        var ctx = document.getElementById(id);
        if (!ctx || typeof Chart === 'undefined') return;

        var isDark = getTheme() === 'dark';
        var colors = color ? [color] : getChartColors(data.length);
        var backgroundColors = color
            ? data.map(function() { return color + 'd9'; })
            : colors.map(function(c) { return c + '80'; });

        chartInstances[id] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: color ? color : colors,
                    borderWidth: color ? 0 : 1.5,
                    borderRadius: 6,
                    maxBarThickness: 50
                }]
            },
            options: {
                indexAxis: horizontal ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: (function() {
                    var gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
                    var valueScale = {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { color: getColors().text, font: { size: 10 }, stepSize: 1 }
                    };
                    var categoryScale = {
                        grid: { display: false },
                        ticks: { color: getColors().text, font: { size: 10 }, maxRotation: 0 }
                    };
                    var scales = {};
                    scales[horizontal ? 'x' : 'y'] = valueScale;
                    scales[horizontal ? 'y' : 'x'] = categoryScale;
                    return scales;
                })(),
                animation: { duration: 800 }
            }
        });
    }

    function createLine(id, data, labels, color, fill, options) {
        var ctx = document.getElementById(id);
        if (!ctx || typeof Chart === 'undefined') return;

        if (chartInstances[id] && typeof chartInstances[id].destroy === 'function') {
            chartInstances[id].destroy();
            delete chartInstances[id];
        }

        options = options || {};
        var isDark = getTheme() === 'dark';
        var baseColor = color || '#3b82f6';
        var grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, baseColor + '40');
        grad.addColorStop(1, baseColor + '00');

        chartInstances[id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    borderColor: baseColor,
                    backgroundColor: fill !== false ? grad : 'transparent',
                    fill: fill !== false,
                    tension: 0.4,
                    pointBackgroundColor: baseColor,
                    pointBorderColor: isDark ? '#1e293b' : '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { intersect: false, mode: 'index' }
                },
                scales: {
                    x: {
                        grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', drawBorder: false },
                        ticks: { color: getColors().text, font: { size: 10 } },
                        title: options.xAxisTitle ? {
                            display: true,
                            text: options.xAxisTitle,
                            color: getColors().text,
                            font: { size: 11, weight: '600' }
                        } : undefined
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', drawBorder: false },
                        ticks: {
                            color: getColors().text,
                            font: { size: 10 },
                            stepSize: 1,
                            precision: 0
                        },
                        title: options.yAxisTitle ? {
                            display: true,
                            text: options.yAxisTitle,
                            color: getColors().text,
                            font: { size: 11, weight: '600' }
                        } : undefined
                    }
                },
                interaction: { intersect: false, mode: 'index' },
                animation: { duration: 1000 }
            }
        });
    }

    function destroyAll() {
        Object.keys(chartInstances).forEach(function(key) {
            if (chartInstances[key] && typeof chartInstances[key].destroy === 'function') {
                chartInstances[key].destroy();
                delete chartInstances[key];
            }
        });
    }

    function resizeAll() {
        Object.keys(chartInstances).forEach(function(key) {
            if (chartInstances[key]) chartInstances[key].resize();
        });
    }

    function updateAll() {
        var colors = getColors();
        var isDark = getTheme() === 'dark';
        Object.keys(chartInstances).forEach(function(key) {
            var chart = chartInstances[key];
            if (!chart) return;
            if (chart.options && chart.options.plugins && chart.options.plugins.legend) {
                chart.options.plugins.legend.labels.color = colors.text;
            }
            if (chart.options && chart.options.scales) {
                ['x', 'y'].forEach(function(axis) {
                    if (chart.options.scales[axis]) {
                        chart.options.scales[axis].ticks.color = colors.text;
                        if (chart.options.scales[axis].grid) {
                            chart.options.scales[axis].grid.color = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
                        }
                    }
                });
            }
            if (chart.config && (chart.config.type === 'doughnut' || chart.config.type === 'pie')) {
                chart.data.datasets.forEach(function(ds) {
                    ds.borderColor = isDark ? '#1e293b' : '#ffffff';
                });
            }
            chart.update();
        });
    }

    document.addEventListener('theme-changed', function() {
        setTimeout(updateAll, 150);
    });

    window.ChartCore = {
        colorMap: colorMap,
        chartColors: chartColors,
        getColors: getColors,
        getChartColors: getChartColors,
        statusColors: statusColors,
        createDoughnut: createDoughnut,
        createBar: createBar,
        createLine: createLine,
        destroyAll: destroyAll,
        resizeAll: resizeAll,
        updateAll: updateAll
    };
})();
