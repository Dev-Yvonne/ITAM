/**
 * UTILITY FUNCTIONS
 * Core utility functions used across the application
 */

// ============================================
// CSRF Token Helper
// ============================================
function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.getAttribute('content')) {
        return meta.getAttribute('content');
    }

    const name = 'csrftoken';
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function isNetworkError(error) {
    return error instanceof TypeError && String(error.message || '').toLowerCase().indexOf('fetch') !== -1;
}

function isUnexpectedResponseError(error) {
    if (!error || !error.message) {
        return false;
    }
    var message = String(error.message);
    return message.indexOf('Unexpected token') !== -1 ||
        message.indexOf('not valid JSON') !== -1 ||
        error instanceof SyntaxError;
}

function getUserFacingError(error, fallback) {
    fallback = fallback || 'Something went wrong. Please try again.';
    if (!error) {
        return fallback;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (isNetworkError(error)) {
        return 'Unable to reach the server. Check your connection and try again.';
    }
    if (isUnexpectedResponseError(error)) {
        return 'The server returned an unexpected response. Refresh the page and try again.';
    }

    var message = String(error.message || '').trim();
    if (!message || message.length > 240 || message.indexOf('Traceback') !== -1) {
        return fallback;
    }
    return message;
}

function extractApiError(data, fallback) {
    fallback = fallback || 'Request failed. Please try again.';
    if (!data || typeof data !== 'object') {
        return fallback;
    }
    if (typeof data.message === 'string' && data.message) {
        return data.message;
    }
    if (typeof data.detail === 'string' && data.detail) {
        return data.detail;
    }
    if (typeof data.error === 'string' && data.error) {
        return data.error;
    }
    if data.errors && typeof data.errors === 'object') {
        var firstKey = Object.keys(data.errors)[0];
        if (firstKey) {
            var value = data.errors[firstKey];
            if (Array.isArray(value) && value.length) {
                var firstError = value[0];
                if (typeof firstError === 'string') {
                    return firstError;
                }
                if (firstError && typeof firstError.message === 'string') {
                    return firstError.message;
                }
                return String(firstError);
            }
            if (typeof value === 'string') {
                return value;
            }
        }
    }

    var flatKeys = Object.keys(data).filter(function(key) {
        return key !== 'success' && key !== 'code';
    });
    if (flatKeys.length === 1) {
        var flatValue = data[flatKeys[0]];
        if (Array.isArray(flatValue) && flatValue.length) {
            return String(flatValue[0]);
        }
    }

    return fallback;
}

function parseJsonResponse(response) {
    var contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('application/json') === -1) {
        return response.text().then(function() {
            if (response.status === 403) {
                throw new Error('Your session may have expired. Refresh the page and try again.');
            }
            if (response.status === 404) {
                throw new Error('The requested resource was not found.');
            }
            if (response.status >= 500) {
                throw new Error('The server encountered a problem. Please try again in a moment.');
            }
            throw new Error('The server returned an unexpected response. Refresh the page and try again.');
        });
    }

    return response.json().catch(function() {
        throw new Error('The server returned an unexpected response. Refresh the page and try again.');
    });
}

function showAsyncError(mount, message, options) {
    options = options || {};
    if (!mount) {
        return;
    }

    mount.classList.remove('async-loading');
    var retryLabel = options.retryLabel || 'Refresh page';
    mount.innerHTML =
        '<div class="async-job-error">' +
            '<div class="async-job-error-copy">' +
                '<i class="fas fa-exclamation-circle" aria-hidden="true"></i>' +
                '<p>' + escapeHtml(message) + '</p>' +
            '</div>' +
            '<button type="button" class="btn btn-secondary btn-sm async-error-retry">' +
                escapeHtml(retryLabel) +
            '</button>' +
        '</div>';

    var retryBtn = mount.querySelector('.async-error-retry');
    if (retryBtn) {
        retryBtn.addEventListener('click', function() {
            if (typeof options.onRetry === 'function') {
                options.onRetry();
                return;
            }
            window.location.reload();
        });
    }
}

// ============================================
// Toast Notification System
// ============================================
function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    message = getUserFacingError({ message: message }, String(message || 'Something went wrong.'));

    var container = document.getElementById('toast-container');
    if (!container) {
        var newContainer = document.createElement('div');
        newContainer.id = 'toast-container';
        newContainer.className = 'toast-container';
        document.body.appendChild(newContainer);
        container = newContainer;
    }

    var icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    var icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = icons[type] || 'ℹ';

    var text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;

    var closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Close toast');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function() {
        toast.remove();
    });

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    setTimeout(function() {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            setTimeout(function() {
                toast.remove();
            }, 300);
        }
    }, duration);
}

// ============================================
// Form Validation Helpers
// ============================================
function validateEmail(email) {
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(email);
}

function validateRequired(value) {
    return value !== null && value !== undefined && value.trim() !== '';
}

function validateMinLength(value, minLength) {
    return value && value.length >= minLength;
}

function validateMaxLength(value, maxLength) {
    return value && value.length <= maxLength;
}

function validatePattern(value, pattern) {
    const regex = new RegExp(pattern);
    return regex.test(value);
}

function validateNumber(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
}

// ============================================
// Form Error Display
// ============================================
function showFieldError(field, message) {
    const formGroup = field.closest('.form-group');
    if (!formGroup) return;

    clearFieldError(field);

    field.classList.add('is-invalid');

    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error-message';
    errorDiv.textContent = message;
    formGroup.appendChild(errorDiv);
}

function clearFieldError(field) {
    field.classList.remove('is-invalid');
    const formGroup = field.closest('.form-group');
    if (!formGroup) return;
    const errorDiv = formGroup.querySelector('.field-error-message');
    if (errorDiv) {
        errorDiv.remove();
    }
}

function clearAllErrors(form) {
    form.querySelectorAll('.is-invalid').forEach(function(el) {
        el.classList.remove('is-invalid');
    });
    form.querySelectorAll('.field-error-message').forEach(function(el) {
        el.remove();
    });
}

// ============================================
// API Request Helper
// ============================================
async function apiRequest(url, method, data) {
    method = method || 'GET';
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        credentials: 'same-origin',
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
    }

    const csrfToken = getCSRFToken();
    if (csrfToken) {
        options.headers['X-CSRFToken'] = csrfToken;
    }

    try {
        const response = await fetch(url, options);
        const responseData = await parseJsonResponse(response);

        if (!response.ok) {
            throw new Error(extractApiError(responseData, 'Request failed. Please try again.'));
        }

        if (responseData && responseData.success === false) {
            throw new Error(extractApiError(responseData, 'Request failed. Please try again.'));
        }

        return responseData;
    } catch (error) {
        console.error('API Request Error:', error);
        throw new Error(getUserFacingError(error, 'Request failed. Please try again.'));
    }
}

async function fetchJson(url, options) {
    options = options || {};
    options.credentials = options.credentials || 'same-origin';
    options.headers = Object.assign({ 'Accept': 'application/json' }, options.headers || {});

    if (!options.headers['X-CSRFToken']) {
        var token = getCSRFToken();
        if (token) {
            options.headers['X-CSRFToken'] = token;
        }
    }

    const response = await fetch(url, options);
    const data = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(extractApiError(data, 'Request failed. Please try again.'));
    }
    if (data && data.success === false) {
        throw new Error(extractApiError(data, 'Request failed. Please try again.'));
    }
    return data;
}

// ============================================
// Debounce Helper
// ============================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction() {
        const context = this;
        const args = arguments;
        const later = function() {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// DOM Ready Helper
// ============================================
function domReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

// ============================================
// Export for use in other modules
// ============================================
window.Utils = {
    getCSRFToken: getCSRFToken,
    escapeHtml: escapeHtml,
    getUserFacingError: getUserFacingError,
    extractApiError: extractApiError,
    showAsyncError: showAsyncError,
    showToast: showToast,
    validateEmail: validateEmail,
    validateRequired: validateRequired,
    validateMinLength: validateMinLength,
    validateMaxLength: validateMaxLength,
    validatePattern: validatePattern,
    validateNumber: validateNumber,
    showFieldError: showFieldError,
    clearFieldError: clearFieldError,
    clearAllErrors: clearAllErrors,
    apiRequest: apiRequest,
    fetchJson: fetchJson,
    parseJsonResponse: parseJsonResponse,
    debounce: debounce,
    domReady: domReady
};
