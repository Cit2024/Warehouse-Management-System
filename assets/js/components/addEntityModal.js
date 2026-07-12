/**
 * AddEntityModal Component
 * Reusable modal for adding new entities (suppliers, departments, employees).
 *
 * Usage:
 *   const modal = new AddEntityModal({ onSuccess: () => loadEntities() });
 *   modal.open();
 */
class AddEntityModal {
    constructor(options = {}) {
        this.options = {
            onSuccess: () => {},
            ...options
        };
        this.modalId = 'addModal';
        this.formId = 'addEntityForm';
        this.render();
        this.attachEvents();
    }

    render() {
        if (document.getElementById(this.modalId)) return;

        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal" id="${this.modalId}" role="dialog" aria-modal="true" aria-labelledby="addModalTitle" hidden>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title" id="addModalTitle">إضافة جهة جديدة</h3>
                        <button class="modal-close" aria-label="إغلاق" data-action="close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <form id="${this.formId}" class="form-grid" onsubmit="event.preventDefault();" novalidate>
                            <div class="form-group">
                                <label for="entityName">اسم الجهة (الشركة / القسم / الموظف) *</label>
                                <input type="text" id="entityName" placeholder="أدخل اسم الجهة..." required>
                                <div class="error-message" id="entityNameError">يرجى إدخال اسم الجهة</div>
                            </div>
                            <div class="form-group">
                                <label for="entityType">نوع الجهة *</label>
                                <select id="entityType" required>
                                    <option value="Supplier">مورد (شركة/تاجر)</option>
                                    <option value="Department">قسم (داخل الكلية)</option>
                                    <option value="Employee">موظف / عضو هيئة تدريس</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="entityPhone">رقم الهاتف (اختياري)</label>
                                <input type="text" id="entityPhone" placeholder="09X-XXXXXXX">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">إلغاء</button>
                        <button type="button" class="btn btn-primary" data-action="submit">
                            <i class="fas fa-save"></i> حفظ
                        </button>
                    </div>
                </div>
            </div>
        `);
    }

    attachEvents() {
        this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        this.modal.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                if (action === 'close') this.close();
                if (action === 'submit') this.submit();
            });
        });

        const form = document.getElementById(this.formId);
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submit();
            });
        }

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        this.handleKeydown = (e) => {
            if (e.key === 'Escape') this.close();
        };
    }

    open() {
        const session = typeof checkSession === 'function' ? checkSession() : null;
        if (session && session.role === 'Viewer') {
            showToast('لا تملك صلاحية الإضافة', 'error');
            return;
        }

        if (!this.modal) this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        this.modal.hidden = false;
        this.modal.classList.add('active');

        const form = document.getElementById(this.formId);
        if (form) {
            form.reset();
            const err = document.getElementById('entityNameError');
            if (err) err.classList.remove('visible');
        }

        const nameInput = document.getElementById('entityName');
        if (nameInput) nameInput.focus();

        document.addEventListener('keydown', this.handleKeydown);
    }

    close() {
        if (!this.modal) this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        this.modal.hidden = true;
        this.modal.classList.remove('active');
        document.removeEventListener('keydown', this.handleKeydown);
    }

    async submit() {
        const session = typeof checkSession === 'function' ? checkSession() : null;
        if (session && session.role === 'Viewer') {
            showToast('لا تملك صلاحية الإضافة', 'error');
            return;
        }

        const saveBtn = this.modal.querySelector('[data-action="submit"]');
        const originalText = saveBtn ? saveBtn.innerHTML : '';

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        }

        try {
            const name = document.getElementById('entityName').value.trim();
            const type = document.getElementById('entityType').value;
            const phone = document.getElementById('entityPhone').value.trim();

            if (!name) {
                const err = document.getElementById('entityNameError');
                if (err) err.classList.add('visible');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalText;
                }
                return;
            }
            const err = document.getElementById('entityNameError');
            if (err) err.classList.remove('visible');

            const result = await window.api.addEntity({ name, type, phone });

            if (result && result.success) {
                this.close();
                showToast('تمت الإضافة بنجاح', 'success');
                if (typeof this.options.onSuccess === 'function') {
                    this.options.onSuccess();
                }
            } else {
                showToast(result?.message || 'فشل في إضافة الجهة', 'error');
            }
        } catch (error) {
            showToast('حدث خطأ أثناء الحفظ', 'error');
            console.error('AddEntityModal submit error:', error);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AddEntityModal;
}
