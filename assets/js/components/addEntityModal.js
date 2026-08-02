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
            // أنواع الجهات المسموح إنشاؤها من هذه الصفحة — صفحة الموردين تمرر
            // ['Supplier'] وصفحة الجهات ['Department','Employee']. نوع واحد فقط
            // يخفي حقل التصنيف بالكامل.
            allowedTypes: ['Supplier', 'Department', 'Employee'],
            title: 'إضافة جهة جديدة',
            ...options
        };
        this.modalId = 'addModal';
        this.formId = 'addEntityForm';
        this.render();
        this.attachEvents();
    }

    typeLabel(type) {
        if (type === 'Supplier') return 'مورد (شركة/تاجر)';
        if (type === 'Department') return 'قسم (داخل الكلية)';
        return 'موظف / عضو هيئة تدريس';
    }

    render() {
        if (document.getElementById(this.modalId)) return;

        const types = this.options.allowedTypes;
        const typeOptions = types.map(t => `<option value="${t}">${this.typeLabel(t)}</option>`).join('');
        const singleType = types.length === 1;

        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal" id="${this.modalId}" role="dialog" aria-modal="true" aria-labelledby="addModalTitle" hidden>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title" id="addModalTitle">${this.options.title}</h3>
                        <button class="modal-close" aria-label="إغلاق" data-action="close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <form id="${this.formId}" class="form-grid" onsubmit="event.preventDefault();" novalidate>
                            <div class="form-group">
                                <label for="entityName">اسم الجهة (الشركة / القسم / الموظف) *</label>
                                <input type="text" id="entityName" placeholder="أدخل اسم الجهة..." required>
                                <div class="error-message" id="entityNameError">يرجى إدخال اسم الجهة</div>
                            </div>
                            <div class="form-group" id="entityTypeGroup" ${singleType ? 'hidden' : ''}>
                                <label for="entityType">نوع الجهة *</label>
                                <select id="entityType" required>
                                    ${typeOptions}
                                </select>
                            </div>
                            <div class="form-group" id="entityParentGroup" hidden>
                                <label for="entityParent">الجهة الأم (اختياري)</label>
                                <select id="entityParent">
                                    <option value="">— بدون (جهة رئيسية) —</option>
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

        // المورد لا يتبع جهة أم — نخفي حقل الأب لهذا النوع.
        // نستخدم الخاصية hidden وليس style.display: عناصر اختبار DOM الوهمية
        // لا تملك style.
        const typeSelect = document.getElementById('entityType');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => this.updateParentVisibility());
        }

        this.handleKeydown = (e) => {
            if (e.key === 'Escape') this.close();
        };
    }

    open() {
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

        this.updateParentVisibility();
        this.loadParentOptions();

        document.addEventListener('keydown', this.handleKeydown);
    }

    updateParentVisibility() {
        const typeSelect = document.getElementById('entityType');
        const group = document.getElementById('entityParentGroup');
        if (typeSelect && group) group.hidden = (typeSelect.value === 'Supplier');
    }

    // تعبئة قائمة الجهات الأم — الأقسام فقط، بإزاحة حسب العمق.
    async loadParentOptions() {
        const select = document.getElementById('entityParent');
        if (!select || typeof window.api?.getAllEntities !== 'function') return;
        try {
            const entities = await window.api.getAllEntities();
            if (!Array.isArray(entities)) return;
            select.innerHTML = '<option value="">— بدون (جهة رئيسية) —</option>';
            entities.filter(e => e.entity_type === 'Department').forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.entity_id;
                const depth = e.depth || 0;
                opt.textContent = (depth ? '—'.repeat(depth) + ' ' : '') + e.entity_name;
                select.appendChild(opt);
            });
        } catch (error) {
            console.error('AddEntityModal loadParentOptions error:', error);
        }
    }

    close() {
        if (!this.modal) this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        this.modal.hidden = true;
        this.modal.classList.remove('active');
        document.removeEventListener('keydown', this.handleKeydown);
    }

    async submit() {
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

            const parentRaw = document.getElementById('entityParent')?.value;
            const parentId = (type !== 'Supplier' && parentRaw) ? parseInt(parentRaw, 10) : null;

            const result = await window.api.addEntity({ name, type, phone, parentId });

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
