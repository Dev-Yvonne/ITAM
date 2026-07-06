/**
 * Asset CSV Import — modal wizard
 */
(function() {
    'use strict';

    var MAPPING_FIELDS = [
        { key: 'name', selectId: 'import-map-name', required: true },
        { key: 'type', selectId: 'import-map-type', required: true },
        { key: 'serial_number', selectId: 'import-map-serial', required: true },
        { key: 'status', selectId: 'import-map-status', required: false },
        { key: 'employee', selectId: 'import-map-employee', required: false },
        { key: 'last_maintenance_date', selectId: 'import-map-maintenance', required: false }
    ];

    var state = {
        rows: [],
        conflicts: [],
        resolutions: {},
        mode: 'merge',
        catalogName: '',
        pendingFile: null,
        headers: [],
        columnMapping: {},
        suggestedMapping: {},
        assignmentReviews: [],
        employees: [],
        assignmentConfirmations: {},
        hasEmployeeColumn: false
    };

    var els = {};

    function getCsrf() {
        if (window.Utils && typeof window.Utils.getCSRFToken === 'function') {
            return window.Utils.getCSRFToken();
        }
        var match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    }

    function toast(message, type) {
        if (window.Utils && typeof window.Utils.showToast === 'function') {
            window.Utils.showToast(message, type);
        }
    }

    function cacheElements() {
        els.modal = document.getElementById('import-csv-modal');
        if (!els.modal) return false;
        els.backdrop = els.modal.querySelector('[data-import-close]');
        els.closeBtn = els.modal.querySelector('.import-modal-close');
        els.dropzone = document.getElementById('import-dropzone');
        els.fileInput = document.getElementById('import-file-input');
        els.chooseBtn = document.getElementById('import-choose-file-btn');
        els.uploadError = document.getElementById('import-upload-error');
        els.columnList = document.getElementById('import-column-list');
        els.columnError = document.getElementById('import-column-error');
        els.assignmentList = document.getElementById('import-assignment-list');
        els.assignmentIntro = document.getElementById('import-assignment-intro');
        els.conflictBulkActions = document.getElementById('import-conflict-bulk-actions');
        els.replaceAllBtn = document.getElementById('import-replace-all-btn');
        els.addAllBtn = document.getElementById('import-add-all-btn');
        els.conflictList = document.getElementById('import-conflict-list');
        els.catalogNameWrap = document.getElementById('import-catalog-name-wrap');
        els.catalogNameInput = document.getElementById('import-catalog-name');
        els.nextBtn = document.getElementById('import-next-btn');
        els.doneBtn = document.getElementById('import-done-btn');
        return true;
    }

    function showStep(stepId) {
        els.modal.querySelectorAll('.import-step').forEach(function(step) {
            step.classList.toggle('active', step.id === stepId);
        });
        els.nextBtn.hidden = stepId === 'import-step-upload' ||
            stepId === 'import-step-processing' ||
            stepId === 'import-step-success';

        els.doneBtn.hidden = stepId !== 'import-step-success';

        if (stepId === 'import-step-columns') {
            els.nextBtn.textContent = 'Continue';
        } else if (stepId === 'import-step-assignments') {
            els.nextBtn.textContent = 'Continue';
        } else if (stepId === 'import-step-conflicts') {
            els.nextBtn.textContent = 'Continue';
        } else if (stepId === 'import-step-destination') {
            els.nextBtn.textContent = 'Import Assets';
        } else {
            els.nextBtn.textContent = 'Continue';
        }
    }

    function openModal() {
        resetState();
        els.modal.classList.add('open');
        els.modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('import-modal-open');
        showStep('import-step-upload');
    }

    function closeModal() {
        els.modal.classList.remove('open');
        els.modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('import-modal-open');
    }

    function resetState() {
        state.rows = [];
        state.conflicts = [];
        state.resolutions = {};
        state.mode = 'merge';
        state.catalogName = '';
        state.pendingFile = null;
        state.headers = [];
        state.columnMapping = {};
        state.suggestedMapping = {};
        state.assignmentReviews = [];
        state.employees = [];
        state.assignmentConfirmations = {};
        state.hasEmployeeColumn = false;
        if (els.uploadError) els.uploadError.hidden = true;
        if (els.columnError) els.columnError.hidden = true;
        if (els.fileInput) els.fileInput.value = '';
        if (els.catalogNameInput) els.catalogNameInput.value = '';
        if (els.catalogNameWrap) els.catalogNameWrap.classList.remove('visible');
        els.modal.querySelectorAll('input[name="import-mode"]').forEach(function(radio) {
            radio.checked = radio.value === 'merge';
        });
    }

    function showUploadError(message) {
        els.uploadError.textContent = message;
        els.uploadError.hidden = false;
    }

    function showColumnError(message) {
        els.columnError.textContent = message;
        els.columnError.hidden = false;
    }

    function validateFile(file) {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showUploadError('The chosen file was not a CSV, Try again.');
            return;
        }
        state.pendingFile = file;
        uploadFile(file);
    }

    function handleValidateResponse(result) {
        if (!result.ok) {
            showStep('import-step-upload');
            showUploadError(result.data.detail || 'Unable to read CSV file.');
            return;
        }

        if (result.data.needs_column_mapping) {
            state.headers = result.data.headers || [];
            state.suggestedMapping = result.data.suggested_mapping || {};
            renderColumnMapping();
            showStep('import-step-columns');
            return;
        }

        state.rows = result.data.rows || [];
        state.conflicts = result.data.conflicts || [];
        state.resolutions = {};
        state.columnMapping = result.data.column_mapping || {};
        state.assignmentReviews = result.data.assignment_reviews || [];
        state.employees = result.data.employees || [];
        state.hasEmployeeColumn = Boolean(result.data.has_employee_column);
        state.assignmentConfirmations = {};
        updateSummary(result.data);
        proceedAfterValidation();
    }

    function proceedAfterValidation() {
        if (state.conflicts.length) {
            renderConflicts();
            showStep('import-step-conflicts');
            return;
        }
        if (state.assignmentReviews.length) {
            renderAssignments();
            showStep('import-step-assignments');
            return;
        }
        showStep('import-step-destination');
    }

    function proceedAfterConflicts() {
        if (state.assignmentReviews.length) {
            renderAssignments();
            showStep('import-step-assignments');
            return;
        }
        showStep('import-step-destination');
    }

    function uploadFile(file, columnMapping) {
        els.uploadError.hidden = true;
        if (els.columnError) els.columnError.hidden = true;
        showStep('import-step-processing');
        els.modal.querySelector('#import-processing-label').textContent =
            columnMapping ? 'Applying column mapping...' : 'Validating CSV...';

        var formData = new FormData();
        formData.append('file', file);
        if (columnMapping) {
            formData.append('column_mapping', JSON.stringify(columnMapping));
        }

        fetch(els.modal.dataset.validateUrl, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
            headers: { 'X-CSRFToken': getCsrf() }
        })
            .then(function(response) {
                return response.json().then(function(data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(handleValidateResponse)
            .catch(function() {
                if (columnMapping) {
                    showStep('import-step-columns');
                    showColumnError('Validation failed. Please try again.');
                } else {
                    showStep('import-step-upload');
                    showUploadError('Upload failed. Please try again.');
                }
            });
    }

    function populateMappingSelect(select, headers, selectedValue, includeEmpty) {
        if (!select) return;
        var emptyLabel = includeEmpty ? 'Not mapped' : 'Select column';
        var options = ['<option value="">' + emptyLabel + '</option>'];
        headers.forEach(function(header) {
            var selected = header === selectedValue ? ' selected' : '';
            options.push(
                '<option value="' + escapeHtml(header) + '"' + selected + '>' +
                escapeHtml(header) +
                '</option>'
            );
        });
        select.innerHTML = options.join('');
    }

    function renderColumnMapping() {
        if (els.columnList) {
            els.columnList.innerHTML = state.headers.map(function(header) {
                return '<li>' + escapeHtml(header) + '</li>';
            }).join('');
        }

        MAPPING_FIELDS.forEach(function(field) {
            var select = document.getElementById(field.selectId);
            var suggested = state.suggestedMapping[field.key] || '';
            populateMappingSelect(select, state.headers, suggested, !field.required);
        });
    }

    function readColumnMappingFromForm() {
        var mapping = {};
        MAPPING_FIELDS.forEach(function(field) {
            var select = document.getElementById(field.selectId);
            if (!select) return;
            var value = select.value.trim();
            if (value) {
                mapping[field.key] = value;
            }
        });
        return mapping;
    }

    function mappingIsComplete(mapping) {
        return Boolean(mapping.name && mapping.type && mapping.serial_number);
    }

    function submitColumnMapping() {
        var mapping = readColumnMappingFromForm();
        if (!mappingIsComplete(mapping)) {
            showColumnError('Please map Asset name, Type, and Serial number before continuing.');
            return;
        }
        state.columnMapping = mapping;
        if (!state.pendingFile) {
            showColumnError('The uploaded file is no longer available. Please choose the file again.');
            showStep('import-step-upload');
            return;
        }
        uploadFile(state.pendingFile, mapping);
    }

    function renderAssignments() {
        if (!els.assignmentList) return;

        if (els.assignmentIntro) {
            els.assignmentIntro.textContent = state.hasEmployeeColumn
                ? 'These assets are marked as assigned in your file. Confirm each asset is linked to the correct employee.'
                : 'These assets are marked as assigned. Link each one to an employee currently in the system.';
        }

        els.assignmentList.innerHTML = state.assignmentReviews.map(function(review) {
            var message = '';
            if (review.source === 'csv' && review.csv_employee_name) {
                message = 'File lists <strong>' + escapeHtml(review.csv_employee_name) + '</strong> for this asset.';
                if (review.suggested_employee_name &&
                    review.suggested_employee_name.toLowerCase() !== review.csv_employee_name.toLowerCase()) {
                    message += ' Matched to <strong>' + escapeHtml(review.suggested_employee_name) + '</strong> in the system.';
                } else if (!review.suggested_employee_name) {
                    message += ' Select the matching employee below.';
                }
            } else if (review.source === 'system' && review.suggested_employee_name) {
                message = 'Currently assigned to <strong>' + escapeHtml(review.suggested_employee_name) + '</strong> in the system. Confirm or change below.';
            } else {
                message = 'Select the employee this asset should be assigned to.';
            }

            var options = [];
            if (!review.suggested_employee_id) {
                options.push('<option value="">Select employee</option>');
            }
            options.push('<option value="available">Import as Available (no assignment)</option>');
            state.employees.forEach(function(employee) {
                var selected = String(review.suggested_employee_id) === String(employee.id) ? ' selected' : '';
                options.push(
                    '<option value="' + employee.id + '"' + selected + '>' +
                    escapeHtml(employee.name) + ' · ' + escapeHtml(employee.email) +
                    '</option>'
                );
            });

            return '<div class="import-assignment-card" data-serial="' + escapeHtml(review.serial) + '">' +
                '<h4>' + escapeHtml(review.asset_name) + ' · ' + escapeHtml(review.serial) + '</h4>' +
                '<p>' + message + '</p>' +
                '<select class="import-assignment-select" aria-label="Employee for ' + escapeHtml(review.asset_name) + '">' +
                    options.join('') +
                '</select>' +
            '</div>';
        }).join('');

        els.assignmentList.querySelectorAll('.import-assignment-select').forEach(function(select) {
            var card = select.closest('.import-assignment-card');
            var serial = card.getAttribute('data-serial');
            state.assignmentConfirmations[serial] = select.value;
            select.addEventListener('change', function() {
                state.assignmentConfirmations[serial] = select.value;
            });
        });
    }

    function allAssignmentsResolved() {
        return state.assignmentReviews.every(function(review) {
            var value = state.assignmentConfirmations[review.serial];
            return value !== undefined && value !== null && value !== '';
        });
    }

    function updateSummary(data) {
        var summary = document.getElementById('import-parse-summary');
        if (!summary) return;
        var valid = data.valid_count || 0;
        var errors = data.error_count || 0;
        summary.textContent = valid + ' valid row' + (valid === 1 ? '' : 's') +
            (errors ? ' · ' + errors + ' row' + (errors === 1 ? '' : 's') + ' skipped' : '');
    }

    function setConflictResolution(card, resolution) {
        if (!card) return;
        var serial = card.getAttribute('data-serial');
        state.resolutions[serial] = resolution;
        card.querySelectorAll('.import-resolution-btns .btn').forEach(function(btn) {
            btn.classList.toggle('selected', btn.getAttribute('data-resolution') === resolution);
        });
    }

    function applyBulkResolution(mode) {
        if (!els.conflictList) return;

        els.conflictList.querySelectorAll('.import-conflict-card').forEach(function(card) {
            var serial = card.getAttribute('data-serial');
            var conflict = state.conflicts.find(function(item) {
                return item.serial === serial;
            });
            if (!conflict) return;

            var resolution = mode === 'replace' && conflict.conflict_type === 'existing_asset'
                ? 'replace'
                : 'add_new';
            setConflictResolution(card, resolution);
        });
    }

    function renderConflicts() {
        if (!els.conflictList) return;
        if (els.conflictBulkActions) {
            els.conflictBulkActions.hidden = !state.conflicts.length;
        }
        els.conflictList.innerHTML = state.conflicts.map(function(conflict) {
            var existingBlock = '';
            if (conflict.conflict_type === 'existing_asset') {
                existingBlock =
                    '<div class="import-conflict-item">' +
                        '<strong>' + escapeHtml(conflict.existing_name) + '</strong>' +
                        '<span>Existing · ' + escapeHtml(conflict.serial) + '</span>' +
                    '</div>' +
                    '<div class="import-conflict-vs">vs</div>';
            } else {
                existingBlock =
                    '<div class="import-conflict-item">' +
                        '<strong>' + escapeHtml(conflict.other_upload_name || 'Duplicate row') + '</strong>' +
                        '<span>Also in file · ' + escapeHtml(conflict.serial) + '</span>' +
                    '</div>' +
                    '<div class="import-conflict-vs">vs</div>';
            }

            return '<div class="import-conflict-card" data-serial="' + escapeHtml(conflict.serial) + '">' +
                '<h4>Serial conflict</h4>' +
                '<div class="import-conflict-pair">' +
                    '<div class="import-conflict-item">' +
                        '<strong>' + escapeHtml(conflict.upload_name) + '</strong>' +
                        '<span>From upload · ' + escapeHtml(conflict.serial) + '</span>' +
                    '</div>' +
                    existingBlock +
                '</div>' +
                '<div class="import-resolution-btns">' +
                    (conflict.conflict_type === 'existing_asset'
                        ? '<button type="button" class="btn btn-secondary" data-resolution="replace">Replace existing</button>'
                        : '') +
                    '<button type="button" class="btn btn-secondary" data-resolution="add_new">Add as new</button>' +
                '</div>' +
            '</div>';
        }).join('');

        els.conflictList.querySelectorAll('.import-resolution-btns .btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var card = btn.closest('.import-conflict-card');
                setConflictResolution(card, btn.getAttribute('data-resolution'));
            });
        });
    }

    function escapeHtml(value) {
        var div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function allConflictsResolved() {
        return state.conflicts.every(function(conflict) {
            return Boolean(state.resolutions[conflict.serial]);
        });
    }

    function executeImport() {
        showStep('import-step-processing');
        els.modal.querySelector('#import-processing-label').textContent = 'Importing assets...';

        var payload = {
            rows: state.rows,
            mode: state.mode,
            catalog_name: state.catalogName,
            resolutions: state.resolutions,
            assignment_confirmations: state.assignmentConfirmations
        };

        fetch(els.modal.dataset.executeUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrf()
            },
            body: JSON.stringify(payload)
        })
            .then(function(response) {
                return response.json().then(function(data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function(result) {
                if (!result.ok) {
                    toast(result.data.detail || 'Import failed.', 'error');
                    showStep('import-step-destination');
                    return;
                }
                renderSuccess(result.data);
                if (result.data.mode === 'catalog' && result.data.catalog) {
                    renderCatalogSection(result.data.catalog);
                }
                showStep('import-step-success');
                if (state.mode === 'merge' && window.AssetManager && typeof window.AssetManager.loadAssetTable === 'function') {
                    window.AssetManager.loadAssetTable();
                }
                if (window.AssetSections && typeof window.AssetSections.init === 'function') {
                    window.AssetSections.init();
                }
            })
            .catch(function() {
                toast('Import failed. Please try again.', 'error');
                showStep('import-step-destination');
            });
    }

    function renderSuccess(data) {
        var mount = document.getElementById('import-success-body');
        if (!mount) return;
        if (data.mode === 'catalog') {
            mount.innerHTML =
                '<h3>Directory created</h3>' +
                '<p><strong>' + escapeHtml(data.catalog_name) + '</strong> saved with ' +
                data.created + ' asset' + (data.created === 1 ? '' : 's') + '.</p>';
        } else {
            mount.innerHTML =
                '<h3>Import complete</h3>' +
                '<p>' + data.created + ' created · ' + data.updated + ' updated' +
                (data.skipped ? ' · ' + data.skipped + ' skipped' : '') + '.</p>';
        }
    }

    function formatDate(value) {
        if (!value) return '—';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function renderCatalogSection(catalog) {
        var mount = document.getElementById('asset-catalog-sections');
        var allAssets = document.getElementById('all-assets');
        if (!mount || !allAssets || !catalog) return;

        var sectionId = 'asset-catalog-' + catalog.id;
        var existing = document.getElementById(sectionId);
        if (existing) existing.remove();

        var rows = (catalog.assets || []).map(function(asset) {
            var badgeClass = String(asset.status || '').toLowerCase().replace(/\s+/g, '');
            return '<tr>' +
                '<td><span class="asset-name-text">' + escapeHtml(asset.name) + '</span></td>' +
                '<td>' + escapeHtml(asset.type) + '</td>' +
                '<td>' + escapeHtml(asset.serial_number) + '</td>' +
                '<td><span class="badge badge-' + badgeClass + '">' + escapeHtml(asset.status) + '</span></td>' +
                '<td class="date-cell">' + escapeHtml(formatDate(asset.last_maintenance_date)) + '</td>' +
                '<td class="date-cell">' + escapeHtml(formatDate(asset.imported_at)) + '</td>' +
            '</tr>';
        }).join('');

        if (!rows) {
            rows = '<tr><td colspan="6" class="empty-state">No assets in this directory.</td></tr>';
        }

        var wrapper = document.createElement('div');
        wrapper.innerHTML =
            '<section class="asset-section asset-catalog-section" id="' + sectionId + '">' +
                '<div class="asset-section-header">' +
                    '<div class="asset-section-title">' +
                        '<i class="fas fa-table"></i>' +
                        '<h2>' + escapeHtml(catalog.name) + '</h2>' +
                    '</div>' +
                    '<span class="asset-section-count">' + (catalog.asset_count || 0) + ' item' + ((catalog.asset_count || 0) === 1 ? '' : 's') + '</span>' +
                '</div>' +
                '<div class="table-wrapper asset-section-table">' +
                    '<table class="asset-table">' +
                        '<thead>' +
                            '<tr>' +
                                '<th>Name</th>' +
                                '<th>Type</th>' +
                                '<th>Serial Number</th>' +
                                '<th>Status</th>' +
                                '<th>Last Maintenance</th>' +
                                '<th>Imported</th>' +
                            '</tr>' +
                        '</thead>' +
                        '<tbody>' + rows + '</tbody>' +
                    '</table>' +
                '</div>' +
            '</section>';

        mount.prepend(wrapper.firstElementChild);
    }

    function bindEvents() {
        document.getElementById('import-csv-btn').addEventListener('click', openModal);
        els.closeBtn.addEventListener('click', closeModal);
        els.backdrop.addEventListener('click', closeModal);
        els.doneBtn.addEventListener('click', closeModal);

        els.chooseBtn.addEventListener('click', function() {
            els.fileInput.click();
        });

        els.fileInput.addEventListener('change', function() {
            if (els.fileInput.files && els.fileInput.files[0]) {
                validateFile(els.fileInput.files[0]);
            }
        });

        ['dragenter', 'dragover'].forEach(function(eventName) {
            els.dropzone.addEventListener(eventName, function(e) {
                e.preventDefault();
                els.dropzone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(function(eventName) {
            els.dropzone.addEventListener(eventName, function(e) {
                e.preventDefault();
                els.dropzone.classList.remove('dragover');
            });
        });
        els.dropzone.addEventListener('drop', function(e) {
            var file = e.dataTransfer.files && e.dataTransfer.files[0];
            validateFile(file);
        });
        els.dropzone.addEventListener('click', function() {
            els.fileInput.click();
        });

        if (els.replaceAllBtn) {
            els.replaceAllBtn.addEventListener('click', function() {
                applyBulkResolution('replace');
            });
        }
        if (els.addAllBtn) {
            els.addAllBtn.addEventListener('click', function() {
                applyBulkResolution('add_new');
            });
        }

        MAPPING_FIELDS.forEach(function(field) {
            var select = document.getElementById(field.selectId);
            if (!select) return;
            select.addEventListener('change', function() {
                if (els.columnError) els.columnError.hidden = true;
            });
        });

        els.modal.querySelectorAll('input[name="import-mode"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                state.mode = radio.value;
                els.catalogNameWrap.classList.toggle('visible', state.mode === 'catalog');
                els.modal.querySelectorAll('.import-destination-option').forEach(function(option) {
                    var input = option.querySelector('input[name="import-mode"]');
                    option.classList.toggle('selected', input && input.checked);
                });
            });
        });
        els.modal.querySelectorAll('.import-destination-option').forEach(function(option) {
            option.addEventListener('click', function() {
                var input = option.querySelector('input[type="radio"]');
                if (input) {
                    input.checked = true;
                    input.dispatchEvent(new Event('change'));
                }
            });
        });

        els.nextBtn.addEventListener('click', function() {
            var active = els.modal.querySelector('.import-step.active');
            if (!active) return;
            if (active.id === 'import-step-columns') {
                submitColumnMapping();
            } else if (active.id === 'import-step-conflicts') {
                if (!allConflictsResolved()) {
                    toast('Please resolve all serial conflicts before continuing.', 'warning');
                    return;
                }
                proceedAfterConflicts();
            } else if (active.id === 'import-step-assignments') {
                els.assignmentList.querySelectorAll('.import-assignment-card').forEach(function(card) {
                    var serial = card.getAttribute('data-serial');
                    var select = card.querySelector('.import-assignment-select');
                    state.assignmentConfirmations[serial] = select ? select.value : '';
                });
                if (!allAssignmentsResolved()) {
                    toast('Please confirm an employee for each assigned asset.', 'warning');
                    return;
                }
                showStep('import-step-destination');
            } else if (active.id === 'import-step-destination') {
                state.catalogName = els.catalogNameInput ? els.catalogNameInput.value.trim() : '';
                if (state.mode === 'catalog' && !state.catalogName) {
                    toast('Enter a name for the new directory.', 'warning');
                    return;
                }
                executeImport();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && els.modal.classList.contains('open')) {
                closeModal();
            }
        });
    }

    function init() {
        if (!cacheElements()) return;
        bindEvents();
    }

    window.AssetImport = { init: init, open: openModal };
})();
