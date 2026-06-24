/**
 * ============================================================
 * GENERIC FORM HANDLER - ITAM SYSTEM
 * ============================================================
 * Handles form validation, submission, and error display
 * ============================================================
 */

// ============================================================
// 1. CSRF TOKEN
// ============================================================

function getCSRFToken() {
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

// ============================================================
// 2. FORM HANDLER CLASS
// ============================================================

class FormHandler {
    constructor(options) {
        this.form = document.querySelector(options.formSelector);
        if (!this.form) {
            throw new Error(`Form not found: ${options.formSelector}`);
        }

        this.submitUrl = options.submitUrl;
        this.method = options.method || 'POST';
        this.validators = options.validators || {};
        this.onSuccess = options.onSuccess || (() => {});
        this.onError = options.onError || (() => {});
        this.beforeSubmit = options.beforeSubmit || ((data) => data);
        this.idField = options.idField || 'id';
        this.clearOnSuccess = options.clearOnSuccess !== undefined ? options.clearOnSuccess : true;
        this.includeCSRF = options.includeCSRF !== undefined ? options.includeCSRF : true;

        this.isSubmitting = false;

        this.form.addEventListener('submit', this.handleSubmit.bind(this));

        this.fields = {};
        this.form.querySelectorAll('[name]').forEach((el) => {
            this.fields[el.name] = el;
        });

        console.log(`FormHandler initialized for ${this.form.id || this.form.className}`);
    }

    getFormData() {
        const formData = new FormData(this.form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            const field = this.fields[key];
            if (field && field.type === 'checkbox') {
                if (!data[key]) data[key] = [];
                if (field.checked) data[key].push(value);
            } else if (field && field.type === 'radio') {
                if (field.checked) data[key] = value;
            } else {
                data[key] = value;
            }
        }
        return data;
    }

    setFormData(data) {
        for (const [key, value] of Object.entries(data)) {
            const field = this.fields[key];
            if (!field) continue;

            if (field.type === 'checkbox') {
                const values = Array.isArray(value) ? value : [value];
                field.checked = values.includes(field.value);
            } else if (field.type === 'radio') {
                field.checked = (field.value == value);
            } else if (field.tagName === 'SELECT') {
                const options = field.options;
                for (let i = 0; i < options.length; i++) {
                    options[i].selected = (options[i].value == value);
                }
            } else {
                field.value = value || '';
            }
        }

        const idInput = this.form.querySelector(`[name="${this.idField}"]`);
        if (idInput && data[this.idField]) {
            idInput.value = data[this.idField];
        }

        if (data[this.idField]) {
            this.method = 'PUT';
            const submitBtn = this.form.querySelector('[type="submit"]');
            if (submitBtn) {
                submitBtn.textContent = submitBtn.dataset.updateLabel || 'Update';
                submitBtn.dataset.mode = 'edit';
            }
        }
    }

    resetForm() {
        this.form.reset();
        const idInput = this.form.querySelector(`[name="${this.idField}"]`);
        if (idInput) idInput.value = '';

        this.method = 'POST';
        const submitBtn = this.form.querySelector('[type="submit"]');
        if (submitBtn) {
            submitBtn.textContent = submitBtn.dataset.createLabel || 'Create';
            submitBtn.dataset.mode = 'create';
        }

        this.clearErrors();
    }

    validate() {
        const errors = {};

        const requiredFields = this.form.querySelectorAll('[required]');
        requiredFields.forEach((el) => {
            const value = el.value ? el.value.trim() : '';
            if (!value) {
                errors[el.name] = `${el.name} is required.`;
            }
        });

        const patternFields = this.form.querySelectorAll('[pattern]');
        patternFields.forEach((el) => {
            const value = el.value ? el.value.trim() : '';
            if (value && el.pattern) {
                const regex = new RegExp(el.pattern);
                if (!regex.test(value)) {
                    errors[el.name] = el.title || `Invalid format for ${el.name}.`;
                }
            }
        });

        for (const [fieldName, validatorFn] of Object.entries(this.validators)) {
            const field = this.fields[fieldName];
            if (!field) continue;
            const value = field.value ? field.value.trim() : '';
            const result = validatorFn(value, field);
            if (result !== true) {
                errors[fieldName] = result || `Invalid value for ${fieldName}.`;
            }
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors,
        };
    }

    showErrors(errors) {
        this.clearErrors();

        for (const [fieldName, message] of Object.entries(errors)) {
            const field = this.fields[fieldName];
            if (!field) continue;

            field.classList.add('is-invalid');

            let errorContainer = field.parentElement.querySelector('.field-error-message');
            if (!errorContainer) {
                errorContainer = document.createElement('div');
                errorContainer.className = 'field-error-message text-danger small';
                field.parentElement.appendChild(errorContainer);
            }
            errorContainer.textContent = message;
        }
    }

    clearErrors() {
        this.form.querySelectorAll('.is-invalid').forEach((el) => {
            el.classList.remove('is-invalid');
        });
        this.form.querySelectorAll('.field-error-message').forEach((el) => {
            el.remove();
        });
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (this.isSubmitting) {
            console.warn('Form submission already in progress.');
            return;
        }

        this.clearErrors();

        const validation = this.validate();
        if (!validation.valid) {
            this.showErrors(validation.errors);
            if (this.onError) this.onError({ errors: validation.errors });
            return;
        }

        let data = this.getFormData();

        const idValue = data[this.idField];
        if (!idValue) {
            delete data[this.idField];
        }

        data = this.beforeSubmit(data) || data;

        let url = this.submitUrl;
        let method = this.method;

        if (idValue && (method === 'PUT' || method === 'PATCH')) {
            url = `${this.submitUrl}${idValue}/`;
        }

        this.isSubmitting = true;
        const submitBtn = this.form.querySelector('[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Saving...';
        }

        try {
            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(data),
            };

            if (this.includeCSRF) {
                const token = getCSRFToken();
                if (token) {
                    options.headers['X-CSRFToken'] = token;
                }
            }

            const response = await fetch(url, options);
            const responseData = await response.json().catch(() => ({}));

            if (!response.ok) {
                const fieldErrors = responseData;
                const errors = {};
                if (fieldErrors && typeof fieldErrors === 'object') {
                    for (const [key, value] of Object.entries(fieldErrors)) {
                        if (Array.isArray(value)) {
                            errors[key] = value.join(', ');
                        } else {
                            errors[key] = value;
                        }
                    }
                    if (Object.keys(errors).length > 0) {
                        this.showErrors(errors);
                    }
                    throw new Error(JSON.stringify(errors));
                } else {
                    throw new Error(responseData.message || responseData.detail || `HTTP ${response.status}`);
                }
            }

            if (this.clearOnSuccess) {
                this.resetForm();
            }

            if (this.onSuccess) {
                this.onSuccess(responseData);
            }

        } catch (error) {
            console.error('Form submission error:', error);
            if (!error.message.startsWith('{')) {
                alert(`Error: ${error.message}`);
                if (this.onError) {
                    this.onError({ message: error.message });
                }
            }
        } finally {
            this.isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                const mode = submitBtn.dataset.mode || 'create';
                submitBtn.textContent = mode === 'edit' ? 'Update' : 'Create';
            }
        }
    }
}

// ============================================================
// 3. EXPOSE
// ============================================================

window.FormHandler = FormHandler;
window.getCSRFToken = getCSRFToken;

console.log('FormHandler utility loaded.');