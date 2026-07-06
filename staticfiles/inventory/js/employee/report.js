// inventory/static/inventory/js/report.js

(function() {
    'use strict';

    async function fetchReportData() {
        if (window.Utils && typeof window.Utils.fetchJson === 'function') {
            return window.Utils.fetchJson('/api/reports/asset-usage/');
        }
        const response = await fetch('/api/reports/asset-usage/', {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('Failed to load report');
        return response.json();
    }

    function renderChart(data, canvasId) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded');
            return;
        }
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Assets by Type',
                    data: data.values || [],
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    window.ReportModule = {
        fetchReportData,
        renderChart,
    };

})();