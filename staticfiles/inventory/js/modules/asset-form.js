/**
 * ASSET FORM - serial number suggestions via background jobs
 */
(function() {
    'use strict';

    var suggestionPool = [];
    var prefetchPromise = null;
    var PER_TYPE = 8;

    function getTypeField() {
        return document.getElementById('id_type');
    }

    function getSerialField() {
        return document.getElementById('id_serial_number');
    }

    function getSuggestButton() {
        return document.getElementById('suggest-serial-btn');
    }

    function getStatusElement() {
        return document.getElementById('serial-suggest-status');
    }

    function setStatus(message) {
        var status = getStatusElement();
        if (status) {
            status.textContent = message || '';
        }
    }

    function setButtonState(enabled, label) {
        var button = getSuggestButton();
        if (!button) {
            return;
        }
        button.disabled = !enabled;
        if (label) {
            button.innerHTML = label;
        }
    }

    function mergeSuggestions(items) {
        if (!items || !items.length) {
            return;
        }
        var existing = {};
        suggestionPool.forEach(function(item) {
            existing[item.serial_number.toLowerCase()] = true;
        });
        items.forEach(function(item) {
            var key = item.serial_number.toLowerCase();
            if (!existing[key]) {
                suggestionPool.push(item);
                existing[key] = true;
            }
        });
    }

    function prefetchSuggestions(force) {
        if (!window.BackgroundJobs) {
            return Promise.reject(new Error('Background jobs unavailable'));
        }
        if (prefetchPromise && !force) {
            return prefetchPromise;
        }
        prefetchPromise = window.BackgroundJobs.run('serial_suggestions', {
            force: !!force,
            params: { per_type: PER_TYPE }
        }).then(function(job) {
            mergeSuggestions((job.result && job.result.suggestions) || []);
            prefetchPromise = null;
            return suggestionPool;
        }).catch(function(error) {
            prefetchPromise = null;
            throw error;
        });
        return prefetchPromise;
    }

    function takeSuggestionForType(assetType) {
        var index = suggestionPool.findIndex(function(item) {
            return item.asset_type === assetType;
        });
        if (index === -1) {
            return null;
        }
        return suggestionPool.splice(index, 1);
    }

    function applySuggestion() {
        var typeField = getTypeField();
        var serialField = getSerialField();
        if (!typeField || !serialField) {
            return;
        }
        if (!typeField.value) {
            setStatus('Select an asset type first.');
            typeField.focus();
            return;
        }

        var picked = takeSuggestionForType(typeField.value);
        if (!picked) {
            setButtonState(false, '<i class="fas fa-spinner fa-spin"></i> Suggest');
            setStatus('Generating a new suggestion...');
            prefetchSuggestions(true).then(function() {
                var retry = takeSuggestionForType(typeField.value);
                if (!retry) {
                    throw new Error('Could not generate a unique serial number.');
                }
                serialField.value = retry.serial_number;
                setStatus('Suggested serial applied.');
                setButtonState(true, '<i class="fas fa-magic"></i> Suggest');
            }).catch(function(error) {
                setStatus(
                    window.Utils
                        ? window.Utils.getUserFacingError(error, 'Suggestion failed.')
                        : 'Suggestion failed.'
                );
                setButtonState(true, '<i class="fas fa-magic"></i> Suggest');
            });
            return;
        }

        serialField.value = picked.serial_number;
        setStatus('Suggested serial applied.');
        serialField.dispatchEvent(new Event('input', { bubbles: true }));

        var remainingForType = suggestionPool.filter(function(item) {
            return item.asset_type === typeField.value;
        }).length;
        if (remainingForType < 2) {
            prefetchSuggestions(true);
        }
    }

    function init() {
        var root = document.getElementById('asset-create-form');
        if (!root || root.dataset.asyncSerialSuggestions !== 'true') {
            return;
        }
        if (!window.BackgroundJobs) {
            setStatus('Suggestions unavailable.');
            return;
        }

        setButtonState(false, '<i class="fas fa-spinner fa-spin"></i> Preparing...');
        setStatus('Preparing serial number suggestions...');

        prefetchSuggestions(false).then(function() {
            setButtonState(true, '<i class="fas fa-magic"></i> Suggest');
            setStatus('Suggestions ready.');
        }).catch(function(error) {
            setButtonState(true, '<i class="fas fa-magic"></i> Suggest');
            setStatus(
                window.Utils
                    ? window.Utils.getUserFacingError(error, 'Could not preload suggestions.')
                    : 'Could not preload suggestions.'
            );
        });

        var button = getSuggestButton();
        if (button) {
            button.addEventListener('click', applySuggestion);
        }
    }

    window.AssetFormSerialSuggest = {
        init: init
    };
})();
