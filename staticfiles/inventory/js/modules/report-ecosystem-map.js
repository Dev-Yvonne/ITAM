/**
 * ITAM ecosystem overview map for Reports — orchestration + interaction.
 */
(function() {
    'use strict';

    var ANIMATION_MS = 420;
    var Layout = window.EcosystemMapLayout;
    var Render = window.EcosystemMapRender;
    var Gestures = window.EcosystemMapGestures;

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function EcosystemMap(container, graph) {
        this.container = container;
        this._handlers = {};
        this._themeObserver = null;
        this._animFrame = null;
        this._resetGraph(graph);
        this._buildDom();
        this._layout();
        this._render();
        this._bind();
        this._watchTheme();
        this.fitToView();
    }

    EcosystemMap.prototype._resetGraph = function(graph) {
        this.graph = graph || { nodes: [], edges: [], expansions: {}, meta: {} };
        this.nodes = (this.graph.nodes || []).slice();
        this.edges = this.graph.edges || [];
        this.expansions = this.graph.expansions || {};
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.selectedId = null;
        this.hoveredId = null;
        this.expandedIds = {};
        this.dynamicNodes = [];
        this.dynamicEdges = [];
        this.positions = {};
    };

    EcosystemMap.prototype._allNodes = function() {
        return this.nodes.concat(this.dynamicNodes);
    };

    EcosystemMap.prototype._allEdges = function() {
        return this.edges.concat(this.dynamicEdges);
    };

    EcosystemMap.prototype._nodeById = function(id) {
        return this.positions[id];
    };

    EcosystemMap.prototype._isExpandable = function(node) {
        if (!node) {
            return false;
        }
        var children = this.expansions[node.id];
        return !!(children && children.length && (node.meta || {}).expandable !== false);
    };

    EcosystemMap.prototype._buildDom = function() {
        this.container.innerHTML = Render.shellHtml(this.graph.meta);
        this.stage = this.container.querySelector('[data-map-stage]');
        this.world = this.container.querySelector('.ecosystem-map-world');
        this.detail = this.container.querySelector('[data-map-detail]');
        this.zoomLabel = this.container.querySelector('[data-map-zoom]');
    };

    EcosystemMap.prototype._layout = function() {
        this.positions = {};
        Layout.layoutBaseNodes(this.nodes, this.positions);
        this.dynamicNodes.forEach(function(node) {
            this.positions[node.id] = node;
        }, this);
    };

    EcosystemMap.prototype._renderState = function() {
        var self = this;
        var expandableIds = {};
        var highlightedIds = {};
        this._allNodes().forEach(function(node) {
            if (self._isExpandable(node)) {
                expandableIds[node.id] = true;
            }
        });
        var focus = this.hoveredId || this.selectedId;
        if (focus) {
            highlightedIds[focus] = true;
            var focusNode = this._nodeById(focus);
            if (focusNode && focusNode.parentId) {
                highlightedIds[focusNode.parentId] = true;
            }
            this._allEdges().forEach(function(edge) {
                if (edge.source === focus) {
                    highlightedIds[edge.target] = true;
                }
                if (edge.target === focus) {
                    highlightedIds[edge.source] = true;
                }
            });
        }
        return {
            selectedId: this.selectedId,
            hoveredId: this.hoveredId,
            expandedIds: this.expandedIds,
            expandableIds: expandableIds,
            highlightedIds: highlightedIds
        };
    };

    EcosystemMap.prototype._render = function() {
        if (!this.world) {
            return;
        }
        this.world.innerHTML = Render.worldHtml(
            this._allNodes(),
            this._allEdges(),
            this.positions,
            this._renderState()
        );
        this._updateTransform();
    };

    EcosystemMap.prototype._applyPositions = function() {
        Render.applyPositions(this.world, this._allNodes(), this._allEdges(), this.positions);
    };

    EcosystemMap.prototype._refreshNodeStates = function() {
        Render.refreshNodeStates(this.world, this._renderState(), this._allEdges());
    };

    EcosystemMap.prototype._toggleExpand = function(nodeId) {
        if (this.expandedIds[nodeId]) {
            this._collapseNode(nodeId);
            return;
        }
        this._expandNode(nodeId);
    };

    EcosystemMap.prototype._clearExpandedGraph = function() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        this.dynamicNodes.forEach(function(node) {
            delete this.positions[node.id];
        }, this);
        this.expandedIds = {};
        this.dynamicNodes = [];
        this.dynamicEdges = [];
    };

    EcosystemMap.prototype._expandNode = function(parentId) {
        var parent = this._nodeById(parentId);
        var children = this.expansions[parentId];
        if (!parent || !children || !children.length) {
            return;
        }

        this._clearExpandedGraph();
        this.expandedIds[parentId] = true;
        var targets = Layout.expansionTargets(parent, children);
        var self = this;

        targets.forEach(function(target) {
            var child = target.child;
            var leafId = parentId + '::' + child.id;
            var node = {
                id: leafId,
                label: child.label,
                type: 'leaf',
                icon: child.icon || 'fa-circle',
                url: child.url || '',
                meta: child.meta || {},
                parentId: parentId,
                layer: 3,
                x: parent.x,
                y: parent.y,
                targetX: target.x,
                targetY: target.y,
                visible: true,
                opacity: 0.01
            };
            self.dynamicNodes.push(node);
            self.positions[leafId] = node;
            self.dynamicEdges.push({
                id: parentId + '->' + leafId,
                source: parentId,
                target: leafId,
                opacity: 0.01
            });
        });

        this._render();
        this._animateExpansion(parentId, true);
    };

    EcosystemMap.prototype._collapseNode = function(parentId) {
        var parent = this._nodeById(parentId);
        if (!parent) {
            return;
        }

        delete this.expandedIds[parentId];

        var collapsing = this.dynamicNodes.filter(function(node) {
            return node.parentId === parentId;
        });
        if (!collapsing.length) {
            return;
        }

        var self = this;
        collapsing.forEach(function(node) {
            node.targetX = parent.x;
            node.targetY = parent.y;
            node.opacity = 1;
        });

        this._animateExpansion(parentId, false, function() {
            self.dynamicNodes = self.dynamicNodes.filter(function(node) {
                return node.parentId !== parentId;
            });
            self.dynamicEdges = self.dynamicEdges.filter(function(edge) {
                return edge.source !== parentId;
            });
            collapsing.forEach(function(node) {
                delete self.positions[node.id];
            });
            self._render();
        });
    };

    EcosystemMap.prototype._animateExpansion = function(parentId, expanding, onComplete) {
        var self = this;
        var nodes = this.dynamicNodes.filter(function(node) {
            return node.parentId === parentId;
        });
        var edges = this.dynamicEdges.filter(function(edge) {
            return edge.source === parentId;
        });
        var start = null;

        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }

        function frame(timestamp) {
            if (!start) {
                start = timestamp;
                nodes.forEach(function(node) {
                    node._animFromX = node.x;
                    node._animFromY = node.y;
                });
            }
            var progress = Math.min(1, (timestamp - start) / ANIMATION_MS);
            var eased = easeOutCubic(progress);

            nodes.forEach(function(node) {
                node.x = node._animFromX + (node.targetX - node._animFromX) * eased;
                node.y = node._animFromY + (node.targetY - node._animFromY) * eased;
                node.opacity = expanding ? eased : 1 - eased;
            });
            edges.forEach(function(edge) {
                edge.opacity = expanding ? eased : 1 - eased;
            });

            self._applyPositions();
            self._refreshNodeStates();

            if (progress < 1) {
                self._animFrame = requestAnimationFrame(frame);
                return;
            }

            self._animFrame = null;
            nodes.forEach(function(node) {
                node.x = node.targetX;
                node.y = node.targetY;
                node.opacity = expanding ? 1 : 0;
                delete node._animFromX;
                delete node._animFromY;
            });
            edges.forEach(function(edge) {
                edge.opacity = expanding ? 1 : 0;
            });
            self._applyPositions();
            self._refreshNodeStates();
            if (typeof onComplete === 'function') {
                onComplete();
            }
        }

        this._animFrame = requestAnimationFrame(frame);
    };

    EcosystemMap.prototype._updateTransform = function() {
        if (!this.world) {
            return;
        }
        this.world.setAttribute(
            'transform',
            'translate(' + this.panX + ',' + this.panY + ') scale(' + this.scale + ')'
        );
        if (this.zoomLabel) {
            this.zoomLabel.textContent = Math.round(this.scale * 100) + '%';
        }
    };

    EcosystemMap.prototype._zoomAt = function(clientX, clientY, scaleFactor) {
        if (!this.stage) {
            return;
        }
        var rect = this.stage.getBoundingClientRect();
        var mx = clientX - rect.left;
        var my = clientY - rect.top;
        var worldX = (mx - this.panX) / this.scale;
        var worldY = (my - this.panY) / this.scale;
        var newScale = Math.max(0.35, Math.min(1.6, this.scale * scaleFactor));
        if (newScale === this.scale) {
            return;
        }
        this.panX = mx - worldX * newScale;
        this.panY = my - worldY * newScale;
        this.scale = newScale;
        this._updateTransform();
    };

    EcosystemMap.prototype.fitToView = function() {
        var visible = this._allNodes().filter(function(node) {
            return node.visible !== false;
        });
        if (!visible.length || !this.stage) {
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
            minX = Math.min(minX, node.x - 80);
            minY = Math.min(minY, node.y - 40);
            maxX = Math.max(maxX, node.x + 80);
            maxY = Math.max(maxY, node.y + 40);
        });
        var stageRect = this.stage.getBoundingClientRect();
        var graphWidth = Math.max(maxX - minX, 1);
        var graphHeight = Math.max(maxY - minY, 1);
        var padding = 48;
        var scaleX = (stageRect.width - padding * 2) / graphWidth;
        var scaleY = (stageRect.height - padding * 2) / graphHeight;
        this.scale = Math.max(0.35, Math.min(1.1, Math.min(scaleX, scaleY)));
        this.panX = (stageRect.width - graphWidth * this.scale) / 2 - minX * this.scale;
        this.panY = (stageRect.height - graphHeight * this.scale) / 2 - minY * this.scale;
        this._updateTransform();
    };

    EcosystemMap.prototype._showDetail = function(node) {
        if (!this.detail || !node) {
            return;
        }
        this.detail.hidden = false;
        this.detail.innerHTML = Render.detailHtml(node, this._isExpandable(node));
        var closeBtn = this.detail.querySelector('.ecosystem-map-detail-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                this.detail.hidden = true;
                this.selectedId = null;
                this._refreshNodeStates();
            }.bind(this));
        }
    };

    EcosystemMap.prototype._handleNodeClick = function(nodeId) {
        var node = this._nodeById(nodeId);
        if (!node) {
            return;
        }
        this.selectedId = nodeId;
        if (this._isExpandable(node)) {
            this._toggleExpand(nodeId);
        }
        this._showDetail(node);
        this._refreshNodeStates();
    };

    EcosystemMap.prototype._clearSelection = function() {
        this.selectedId = null;
        if (this.detail) {
            this.detail.hidden = true;
        }
        this._refreshNodeStates();
    };

    EcosystemMap.prototype._isNodeDraggable = function(node) {
        return !!node && (node.type === 'module' || node.type === 'metric' || node.type === 'leaf');
    };

    EcosystemMap.prototype._nodeDragIds = function(node) {
        var ids = [node.id];
        if (this.expandedIds[node.id]) {
            this.dynamicNodes.forEach(function(child) {
                if (child.parentId === node.id) {
                    ids.push(child.id);
                }
            });
        }
        return ids;
    };

    EcosystemMap.prototype._resolveNodeEl = function(event) {
        if (!event || !event.target) {
            return null;
        }
        var nodeEl = event.target.closest('.ecosystem-node');
        if (nodeEl && this.world && this.world.contains(nodeEl)) {
            return nodeEl;
        }
        return null;
    };

    EcosystemMap.prototype._watchTheme = function() {
        if (this._themeObserver) {
            return;
        }
        var self = this;
        this._themeObserver = new MutationObserver(function() {
            if (!self._animFrame) {
                self._refreshNodeStates();
            }
        });
        this._themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'class']
        });
    };

    EcosystemMap.prototype._bind = function() {
        var self = this;

        this._handlers.toolbarClick = function(event) {
            var button = event.target.closest('[data-map-action]');
            if (!button || !self.container.contains(button)) {
                return;
            }
            var action = button.getAttribute('data-map-action');
            if (action === 'zoom-in' || action === 'zoom-out') {
                var rect = self.stage.getBoundingClientRect();
                var cx = rect.left + rect.width / 2;
                var cy = rect.top + rect.height / 2;
                self._zoomAt(cx, cy, action === 'zoom-in' ? 1.12 : 1 / 1.12);
            } else if (action === 'fit') {
                self.fitToView();
            }
        };

        this._handlers.wheel = function(event) {
            event.preventDefault();
            self._zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 0.92 : 1.08);
        };

        this._handlers.stageMouseMove = function(event) {
            if (self._animFrame || self.gestures.isActive()) {
                return;
            }
            var nodeEl = self._resolveNodeEl(event);
            var nextId = nodeEl ? nodeEl.getAttribute('data-node-id') : null;
            if (nextId === self.hoveredId) {
                return;
            }
            self.hoveredId = nextId;
            self._refreshNodeStates();
        };

        this._handlers.stageMouseLeave = function() {
            if (self._animFrame || self.gestures.isActive()) {
                return;
            }
            self.hoveredId = null;
            self._refreshNodeStates();
        };

        this._handlers.stageDblClick = function(event) {
            var nodeEl = self._resolveNodeEl(event);
            if (!nodeEl) {
                return;
            }
            var node = self._nodeById(nodeEl.getAttribute('data-node-id'));
            if (node && node.url) {
                window.location.href = node.url;
            }
        };

        this.gestures = new Gestures.Controller(this);
        this.container.addEventListener('click', this._handlers.toolbarClick);
        this.stage.addEventListener('wheel', this._handlers.wheel, { passive: false });
        this.stage.addEventListener('mousemove', this._handlers.stageMouseMove);
        this.stage.addEventListener('mouseleave', this._handlers.stageMouseLeave);
        this.stage.addEventListener('dblclick', this._handlers.stageDblClick);
    };

    EcosystemMap.prototype.destroy = function() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        if (this._themeObserver) {
            this._themeObserver.disconnect();
            this._themeObserver = null;
        }
        if (this.gestures) {
            this.gestures.destroy();
            this.gestures = null;
        }
        if (this._handlers.toolbarClick) {
            this.container.removeEventListener('click', this._handlers.toolbarClick);
        }
        if (this.stage) {
            this.stage.removeEventListener('wheel', this._handlers.wheel);
            this.stage.removeEventListener('mousemove', this._handlers.stageMouseMove);
            this.stage.removeEventListener('mouseleave', this._handlers.stageMouseLeave);
            this.stage.removeEventListener('dblclick', this._handlers.stageDblClick);
        }
        this._handlers = {};
        this.container.innerHTML = '';
        this.stage = null;
        this.world = null;
        this.detail = null;
        this.zoomLabel = null;
    };

    EcosystemMap.prototype.replaceGraph = function(graph) {
        this._clearExpandedGraph();
        this._resetGraph(graph);
        this._layout();
        this._render();
        this.fitToView();
    };

    var activeMap = null;

    function init(containerId, graph) {
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container || !graph || !graph.nodes || !graph.nodes.length) {
            return null;
        }
        if (!Layout || !Render || !Gestures) {
            console.error('Ecosystem map helpers failed to load');
            return null;
        }
        if (activeMap && activeMap.container === container) {
            activeMap.replaceGraph(graph);
            return activeMap;
        }
        if (activeMap) {
            activeMap.destroy();
            activeMap = null;
        }
        activeMap = new EcosystemMap(container, graph);
        return activeMap;
    }

    window.ReportEcosystemMap = {
        init: init,
        destroy: function() {
            if (activeMap) {
                activeMap.destroy();
                activeMap = null;
            }
        }
    };
})();
