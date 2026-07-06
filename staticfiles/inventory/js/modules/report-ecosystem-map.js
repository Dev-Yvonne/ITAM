/**
 * Interactive ITAM ecosystem relationship map for Reports
 */
(function() {
    'use strict';

    var TYPE_STYLES = {
        hub: { fill: '#2563eb', ring: '#93c5fd', size: 36 },
        admin: { fill: '#7c3aed', ring: '#c4b5fd', size: 30 },
        view: { fill: '#0ea5e9', ring: '#7dd3fc', size: 26 },
        section: { fill: '#38bdf8', ring: '#bae6fd', size: 22 },
        table: { fill: '#64748b', ring: '#cbd5e1', size: 24 },
        employee: { fill: '#10b981', ring: '#6ee7b7', size: 22 },
        asset: { fill: '#f59e0b', ring: '#fcd34d', size: 22 },
        catalog: { fill: '#8b5cf6', ring: '#c4b5fd', size: 22 },
        cluster: { fill: '#475569', ring: '#94a3b8', size: 20 },
        portal: { fill: '#14b8a6', ring: '#5eead4', size: 26 }
    };

    var FILTER_GROUPS = {
        all: function() { return true; },
        application: function(node) {
            return ['application', 'portal'].indexOf(node.group) !== -1 || node.type === 'hub' || node.type === 'admin';
        },
        data: function(node) {
            return node.group === 'data' || node.type === 'table';
        },
        live: function(node) {
            return node.group === 'live' || node.type === 'employee' || node.type === 'asset' || node.type === 'catalog' || node.type === 'cluster';
        }
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function EcosystemMap(container, graph) {
        this.container = container;
        this.graph = graph || { nodes: [], edges: [], meta: {} };
        this.nodes = (this.graph.nodes || []).map(function(node) {
            return Object.assign({ x: 0, y: 0, vx: 0, vy: 0 }, node);
        });
        this.edges = this.graph.edges || [];
        this.filterKey = 'all';
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.dragging = false;
        this.dragStart = null;
        this.selectedId = null;
        this.hoveredId = null;
        this.positions = {};
        this._buildDom();
        this._layout();
        this._render();
        this._bind();
        this.fitToView();
    }

    EcosystemMap.prototype._buildDom = function() {
        var meta = this.graph.meta || {};
        this.container.innerHTML =
            '<div class="ecosystem-map-shell">' +
                '<div class="ecosystem-map-toolbar">' +
                    '<div class="ecosystem-map-toolbar-left">' +
                        '<label class="ecosystem-map-view-select">' +
                            '<span>Business view</span>' +
                            '<select id="ecosystem-map-filter" aria-label="Filter map view">' +
                                '<option value="all">Full ecosystem</option>' +
                                '<option value="application">Application views</option>' +
                                '<option value="data">Data model</option>' +
                                '<option value="live">Live inventory</option>' +
                            '</select>' +
                        '</label>' +
                        '<div class="ecosystem-map-base-ci">' +
                            '<span class="ecosystem-map-base-label">BASE CI</span>' +
                            '<strong>' + escapeHtml(meta.base_label || 'ITAM 3.0 Ecosystem') + '</strong>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ecosystem-map-toolbar-right">' +
                        '<button type="button" class="ecosystem-map-tool-btn" data-map-action="fit" title="Fit to screen"><i class="fas fa-compress-arrows-alt"></i></button>' +
                        '<button type="button" class="ecosystem-map-tool-btn" data-map-action="zoom-out" title="Zoom out"><i class="fas fa-minus"></i></button>' +
                        '<span class="ecosystem-map-zoom-label" data-map-zoom>100%</span>' +
                        '<button type="button" class="ecosystem-map-tool-btn" data-map-action="zoom-in" title="Zoom in"><i class="fas fa-plus"></i></button>' +
                    '</div>' +
                '</div>' +
                '<div class="ecosystem-map-stage" data-map-stage>' +
                    '<svg class="ecosystem-map-svg" role="img" aria-label="ITAM ecosystem relationship map">' +
                        '<defs>' +
                            '<pattern id="ecosystem-map-grid" width="24" height="24" patternUnits="userSpaceOnUse">' +
                                '<circle cx="1" cy="1" r="1" fill="rgba(148,163,184,0.35)"></circle>' +
                            '</pattern>' +
                            '<marker id="ecosystem-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
                                '<path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(100,116,139,0.8)"></path>' +
                            '</marker>' +
                        '</defs>' +
                        '<rect class="ecosystem-map-bg" width="100%" height="100%" fill="url(#ecosystem-map-grid)"></rect>' +
                        '<g class="ecosystem-map-world"></g>' +
                    '</svg>' +
                    '<aside class="ecosystem-map-legend" aria-label="Map legend">' +
                        this._legendHtml() +
                    '</aside>' +
                    '<div class="ecosystem-map-detail" data-map-detail hidden></div>' +
                '</div>' +
            '</div>';

        this.stage = this.container.querySelector('[data-map-stage]');
        this.svg = this.container.querySelector('.ecosystem-map-svg');
        this.world = this.container.querySelector('.ecosystem-map-world');
        this.detail = this.container.querySelector('[data-map-detail]');
        this.zoomLabel = this.container.querySelector('[data-map-zoom]');
    };

    EcosystemMap.prototype._legendHtml = function() {
        var items = [
            ['hub', 'Platform'],
            ['view', 'App views'],
            ['table', 'Data tables'],
            ['employee', 'Employees'],
            ['asset', 'Assets'],
            ['cluster', 'Groups']
        ];
        return '<h4>Legend</h4><ul>' + items.map(function(item) {
            var style = TYPE_STYLES[item[0]] || TYPE_STYLES.cluster;
            return '<li><span class="ecosystem-legend-swatch" style="background:' + style.fill + '"></span>' + escapeHtml(item[1]) + '</li>';
        }).join('') + '</ul>';
    };

    EcosystemMap.prototype._visibleNode = function(node) {
        var predicate = FILTER_GROUPS[this.filterKey] || FILTER_GROUPS.all;
        return predicate(node);
    };

    EcosystemMap.prototype._visibleEdge = function(edge) {
        var source = this.positions[edge.source];
        var target = this.positions[edge.target];
        return source && target && source.visible && target.visible;
    };

    EcosystemMap.prototype._layout = function() {
        var width = 1200;
        var height = 720;
        var centerX = width / 2;
        var centerY = height / 2;
        var groups = {
            hub: { angle: 0, radius: 0 },
            admin: { angle: -Math.PI / 2, radius: 120 },
            application: { angle: -Math.PI / 6, radius: 220 },
            portal: { angle: Math.PI / 2, radius: 220 },
            data: { angle: Math.PI * 0.75, radius: 260 },
            live: { angle: Math.PI * 0.15, radius: 300 }
        };

        var groupCounts = {};
        this.nodes.forEach(function(node) {
            var key = node.type === 'hub' ? 'hub' : (node.type === 'admin' ? 'admin' : node.group);
            groupCounts[key] = (groupCounts[key] || 0) + 1;
        });
        var groupIndexes = {};

        this.nodes.forEach(function(node) {
            var key = node.type === 'hub' ? 'hub' : (node.type === 'admin' ? 'admin' : node.group);
            var layout = groups[key] || groups.live;
            var index = groupIndexes[key] || 0;
            groupIndexes[key] = index + 1;
            var total = groupCounts[key] || 1;
            var spread = key === 'hub' ? 0 : Math.PI / 4;
            var angle = layout.angle + ((index / Math.max(total - 1, 1)) - 0.5) * spread;
            var radius = layout.radius + (index % 3) * 18;
            node.x = centerX + Math.cos(angle) * radius;
            node.y = centerY + Math.sin(angle) * radius;
        });

        for (var tick = 0; tick < 140; tick += 1) {
            var alpha = 1 - tick / 140;
            this.nodes.forEach(function(a) {
                a.vx = 0;
                a.vy = 0;
            });

            for (var i = 0; i < this.nodes.length; i += 1) {
                for (var j = i + 1; j < this.nodes.length; j += 1) {
                    var a = this.nodes[i];
                    var b = this.nodes[j];
                    var dx = b.x - a.x;
                    var dy = b.y - a.y;
                    var dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
                    var force = (120 * alpha) / dist;
                    var fx = (dx / dist) * force;
                    var fy = (dy / dist) * force;
                    a.vx -= fx;
                    a.vy -= fy;
                    b.vx += fx;
                    b.vy += fy;
                }
            }

            this.edges.forEach(function(edge) {
                var source = this._nodeById(edge.source);
                var target = this._nodeById(edge.target);
                if (!source || !target) {
                    return;
                }
                var dx = target.x - source.x;
                var dy = target.y - source.y;
                var dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
                var desired = 130;
                var force = (dist - desired) * 0.02 * alpha;
                var fx = (dx / dist) * force;
                var fy = (dy / dist) * force;
                source.vx += fx;
                source.vy += fy;
                target.vx -= fx;
                target.vy -= fy;
            }, this);

            this.nodes.forEach(function(node) {
                node.vx += (centerX - node.x) * 0.001 * alpha;
                node.vy += (centerY - node.y) * 0.001 * alpha;
                node.x += node.vx;
                node.y += node.vy;
            });
        }

        this.nodes.forEach(function(node) {
            this.positions[node.id] = node;
        }, this);
    };

    EcosystemMap.prototype._nodeById = function(id) {
        return this.positions[id];
    };

    EcosystemMap.prototype._render = function() {
        var self = this;
        var edgeHtml = '';
        var nodeHtml = '';

        this.edges.forEach(function(edge) {
            if (!self._visibleEdge(edge)) {
                return;
            }
            var source = self.positions[edge.source];
            var target = self.positions[edge.target];
            var highlighted = self._isHighlighted(edge.source) || self._isHighlighted(edge.target);
            var mx = (source.x + target.x) / 2;
            var my = (source.y + target.y) / 2;
            edgeHtml +=
                '<g class="ecosystem-edge' + (highlighted ? ' is-highlighted' : '') + '">' +
                    '<line x1="' + source.x + '" y1="' + source.y + '" x2="' + target.x + '" y2="' + target.y + '" marker-end="url(#ecosystem-arrow)"></line>' +
                    '<text class="ecosystem-edge-label" x="' + mx + '" y="' + my + '">' + escapeHtml(edge.label) + '</text>' +
                '</g>';
        });

        this.nodes.forEach(function(node) {
            if (!self._visibleNode(node)) {
                node.visible = false;
                return;
            }
            node.visible = true;
            var style = TYPE_STYLES[node.type] || TYPE_STYLES.cluster;
            var size = style.size;
            var selected = self.selectedId === node.id;
            var hovered = self.hoveredId === node.id;
            var highlighted = self._isHighlighted(node.id);
            nodeHtml +=
                '<g class="ecosystem-node ecosystem-node-' + escapeHtml(node.type) +
                    (selected ? ' is-selected' : '') +
                    (hovered ? ' is-hovered' : '') +
                    (highlighted ? ' is-highlighted' : '') +
                    '" data-node-id="' + escapeHtml(node.id) + '" transform="translate(' + node.x + ',' + node.y + ')">' +
                    '<circle class="ecosystem-node-ring" r="' + (size + 8) + '" style="stroke:' + style.ring + '"></circle>' +
                    '<circle class="ecosystem-node-core" r="' + size + '" style="fill:' + style.fill + '"></circle>' +
                    '<foreignObject x="-11" y="-11" width="22" height="22">' +
                        '<div class="ecosystem-node-icon"><i class="fas ' + escapeHtml(node.icon || 'fa-circle') + '"></i></div>' +
                    '</foreignObject>' +
                    (node.badge ? '<g class="ecosystem-node-badge"><circle cx="' + (size - 2) + '" cy="' + (-size + 4) + '" r="10"></circle><text x="' + (size - 2) + '" y="' + (-size + 8) + '">' + escapeHtml(node.badge) + '</text></g>' : '') +
                    '<text class="ecosystem-node-label" y="' + (size + 18) + '">' + escapeHtml(node.label) + '</text>' +
                '</g>';
        });

        this.world.innerHTML = edgeHtml + nodeHtml;
        this._updateTransform();
    };

    EcosystemMap.prototype._isHighlighted = function(nodeId) {
        if (!this.hoveredId && !this.selectedId) {
            return false;
        }
        var focus = this.hoveredId || this.selectedId;
        if (focus === nodeId) {
            return true;
        }
        return this.edges.some(function(edge) {
            return (edge.source === focus && edge.target === nodeId) ||
                (edge.target === focus && edge.source === nodeId);
        });
    };

    EcosystemMap.prototype._updateTransform = function() {
        this.world.setAttribute('transform', 'translate(' + this.panX + ',' + this.panY + ') scale(' + this.scale + ')');
        if (this.zoomLabel) {
            this.zoomLabel.textContent = Math.round(this.scale * 100) + '%';
        }
    };

    EcosystemMap.prototype.fitToView = function() {
        var visible = this.nodes.filter(function(node) { return node.visible !== false && this._visibleNode(node); }, this);
        if (!visible.length) {
            this.scale = 1;
            this.panX = 40;
            this.panY = 40;
            this._updateTransform();
            return;
        }
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;
        visible.forEach(function(node) {
            minX = Math.min(minX, node.x - 50);
            minY = Math.min(minY, node.y - 50);
            maxX = Math.max(maxX, node.x + 50);
            maxY = Math.max(maxY, node.y + 50);
        });
        var stageRect = this.stage.getBoundingClientRect();
        var graphWidth = Math.max(maxX - minX, 1);
        var graphHeight = Math.max(maxY - minY, 1);
        var padding = 60;
        var scaleX = (stageRect.width - padding * 2) / graphWidth;
        var scaleY = (stageRect.height - padding * 2) / graphHeight;
        this.scale = Math.max(0.35, Math.min(1.2, Math.min(scaleX, scaleY)));
        this.panX = (stageRect.width - graphWidth * this.scale) / 2 - minX * this.scale;
        this.panY = (stageRect.height - graphHeight * this.scale) / 2 - minY * this.scale;
        this._updateTransform();
    };

    EcosystemMap.prototype._showDetail = function(node) {
        if (!this.detail || !node) {
            return;
        }
        var meta = node.meta || {};
        var metaHtml = Object.keys(meta).map(function(key) {
            return '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(meta[key]) + '</dd>';
        }).join('');
        this.detail.hidden = false;
        this.detail.innerHTML =
            '<button type="button" class="ecosystem-map-detail-close" aria-label="Close details"><i class="fas fa-times"></i></button>' +
            '<h4>' + escapeHtml(node.label) + '</h4>' +
            '<p class="ecosystem-map-detail-type">' + escapeHtml(node.type) + '</p>' +
            (metaHtml ? '<dl>' + metaHtml + '</dl>' : '') +
            (node.url ? '<a class="btn btn-secondary btn-sm" href="' + escapeHtml(node.url) + '">Open</a>' : '');
        var closeBtn = this.detail.querySelector('.ecosystem-map-detail-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                this.detail.hidden = true;
                this.selectedId = null;
                this._render();
            }.bind(this));
        }
    };

    EcosystemMap.prototype._bind = function() {
        var self = this;

        this.container.querySelector('#ecosystem-map-filter').addEventListener('change', function(event) {
            self.filterKey = event.target.value;
            self.selectedId = null;
            self.hoveredId = null;
            if (self.detail) {
                self.detail.hidden = true;
            }
            self._render();
            self.fitToView();
        });

        this.container.querySelectorAll('[data-map-action]').forEach(function(button) {
            button.addEventListener('click', function() {
                var action = button.getAttribute('data-map-action');
                if (action === 'zoom-in') {
                    self.scale = Math.min(2, self.scale * 1.15);
                } else if (action === 'zoom-out') {
                    self.scale = Math.max(0.25, self.scale / 1.15);
                } else if (action === 'fit') {
                    self.fitToView();
                    return;
                }
                self._updateTransform();
            });
        });

        this.stage.addEventListener('wheel', function(event) {
            event.preventDefault();
            var delta = event.deltaY > 0 ? 0.92 : 1.08;
            self.scale = Math.max(0.25, Math.min(2, self.scale * delta));
            self._updateTransform();
        }, { passive: false });

        this.stage.addEventListener('mousedown', function(event) {
            if (event.target.closest('.ecosystem-node')) {
                return;
            }
            self.dragging = true;
            self.dragStart = { x: event.clientX - self.panX, y: event.clientY - self.panY };
        });

        window.addEventListener('mousemove', function(event) {
            if (!self.dragging || !self.dragStart) {
                return;
            }
            self.panX = event.clientX - self.dragStart.x;
            self.panY = event.clientY - self.dragStart.y;
            self._updateTransform();
        });

        window.addEventListener('mouseup', function() {
            self.dragging = false;
            self.dragStart = null;
        });

        this.world.addEventListener('mouseover', function(event) {
            var nodeEl = event.target.closest('.ecosystem-node');
            self.hoveredId = nodeEl ? nodeEl.getAttribute('data-node-id') : null;
            self._render();
        });

        this.world.addEventListener('mouseleave', function() {
            self.hoveredId = null;
            self._render();
        });

        this.world.addEventListener('click', function(event) {
            var nodeEl = event.target.closest('.ecosystem-node');
            if (!nodeEl) {
                return;
            }
            event.stopPropagation();
            var nodeId = nodeEl.getAttribute('data-node-id');
            var node = self._nodeById(nodeId);
            if (!node) {
                return;
            }
            self.selectedId = nodeId;
            self._showDetail(node);
            self._render();
        });

        this.world.addEventListener('dblclick', function(event) {
            var nodeEl = event.target.closest('.ecosystem-node');
            if (!nodeEl) {
                return;
            }
            var node = self._nodeById(nodeEl.getAttribute('data-node-id'));
            if (node && node.url) {
                window.location.href = node.url;
            }
        });
    };

    var activeMap = null;

    function init(containerId, graph) {
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container || !graph || !graph.nodes || !graph.nodes.length) {
            return null;
        }
        if (activeMap && activeMap.container === container) {
            activeMap.graph = graph;
            activeMap.nodes = graph.nodes.map(function(node) {
                return Object.assign({ x: 0, y: 0, vx: 0, vy: 0 }, node);
            });
            activeMap.edges = graph.edges || [];
            activeMap._layout();
            activeMap._render();
            activeMap.fitToView();
            return activeMap;
        }
        activeMap = new EcosystemMap(container, graph);
        return activeMap;
    }

    window.ReportEcosystemMap = {
        init: init,
        destroy: function() {
            activeMap = null;
        }
    };
})();
