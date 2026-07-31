/**
 * AddItemModal Component
 * Reusable modal for adding new items. Can be used on any page that needs item creation.
 *
 * Usage:
 *   const modal = new AddItemModal({ onSuccess: () => loadDashboardData() });
 *   modal.open();
 */
class AddItemModal {
    constructor(options = {}) {
        this.options = {
            onSuccess: () => {},
            ...options
        };
        this.modalId = 'addModal';
        this.formId = 'addItemForm';
        this.render();
        this.attachEvents();
    }

    /**
     * Inject the modal HTML into the document body if not already present
     */
    render() {
        if (document.getElementById(this.modalId)) return;

        const modalHtml = `
            <div class="modal" id="${this.modalId}" role="dialog" aria-modal="true" aria-labelledby="addModalTitle" hidden>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title" id="addModalTitle">إضافة صنف جديد</h3>
                        <button class="modal-close" aria-label="إغلاق" data-action="close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <form id="${this.formId}" class="form-grid" onsubmit="event.preventDefault();" novalidate>
                            <div class="form-group">
                                <label for="itemName">اسم الصنف *</label>
                                <input type="text" id="itemName" placeholder="أدخل اسم الصنف" required minlength="3">
                                <div class="error-message" id="nameError">يجب أن يكون اسم الصنف 3 أحرف على الأقل</div>
                            </div>
                            <div class="form-group">
                                <label for="itemUnit">الوحدة *</label>
                                <select id="itemUnit" required>
                                    <option value="">اختر الوحدة...</option>
                                    <option value="قطعة">قطعة</option>
                                    <option value="كرتونة">كرتونة</option>
                                    <option value="كيلوجرام">كيلوجرام</option>
                                    <option value="لتر">لتر</option>
                                    <option value="متر">متر</option>
                                    <option value="صندوق">صندوق</option>
                                    <option value="رزمة">رزمة</option>
                                    <option value="زوج">زوج</option>
                                    <option value="لفة">لفة</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="itemCategory">التصنيف *</label>
                                <select id="itemCategory" required>
                                    <option value="">اختر التصنيف...</option>
                                    <option value="قرطاسية">قرطاسية</option>
                                    <option value="أحبار وطباعة">أحبار وطباعة</option>
                                    <option value="شبكات">شبكات</option>
                                    <option value="سلامة مهنية">سلامة مهنية</option>
                                    <option value="عدد وأدوات">عدد وأدوات</option>
                                    <option value="كهرباء">كهرباء</option>
                                    <option value="مواد خام">مواد خام</option>
                                    <option value="مستهلكات">مستهلكات</option>
                                    <option value="قطع غيار">قطع غيار</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="itemMinQty">نقطة إعادة الطلب (الحد الأدنى)</label>
                                <input type="number" id="itemMinQty" value="0" min="0" required>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">إلغاء</button>
                        <button type="button" class="btn btn-primary" data-action="submit">
                            <i class="fas fa-check-circle"></i> حفظ الصنف
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * Attach event listeners for close/submit/escape/backdrop
     */
    attachEvents() {
        this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        // Close buttons and submit button
        this.modal.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                if (action === 'close') this.close();
                if (action === 'submit') this.submit();
            });
        });

        // Form submit via Enter
        const form = document.getElementById(this.formId);
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submit();
            });
        }

        // Escape key
        this.handleKeydown = (e) => {
            if (e.key === 'Escape') this.close();
        };

        // Backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    /**
     * Open the modal and reset the form
     */
    open() {
        if (!this.modal) this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        this.modal.hidden = false;
        this.modal.classList.add('active');

        const form = document.getElementById(this.formId);
        if (form) {
            form.reset();
            document.querySelectorAll('.error-message').forEach(el => el.classList.remove('visible'));
        }

        const nameInput = document.getElementById('itemName');
        if (nameInput) nameInput.focus();

        document.addEventListener('keydown', this.handleKeydown);
    }

    /**
     * Close the modal
     */
    close() {
        if (!this.modal) this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        this.modal.hidden = true;
        this.modal.classList.remove('active');
        document.removeEventListener('keydown', this.handleKeydown);
    }

    /**
     * Submit the form and add the item
     */
    async submit() {
        const saveBtn = this.modal.querySelector('[data-action="submit"]');
        const originalText = saveBtn ? saveBtn.innerHTML : '';

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        }

        try {
            const itemName = document.getElementById('itemName').value.trim();
            const itemUnit = document.getElementById('itemUnit').value;
            const itemCategory = document.getElementById('itemCategory').value;
            const itemMinQty = parseFloat(document.getElementById('itemMinQty').value) || 0;

            if (itemName.length < 3) {
                document.getElementById('nameError').classList.add('visible');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalText;
                }
                return;
            }
            document.getElementById('nameError').classList.remove('visible');

            if (!itemUnit || !itemCategory) {
                showToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalText;
                }
                return;
            }

            const result = await window.api.addItem({
                item_name: itemName,
                unit: itemUnit,
                category: itemCategory,
                min_order_qty: itemMinQty
            });

            if (result && result.success) {
                this.close();
                showToast('تمت إضافة الصنف بنجاح', 'success');
                if (typeof this.options.onSuccess === 'function') {
                    this.options.onSuccess();
                }
            } else {
                showToast(result?.message || 'فشل في إضافة الصنف', 'error');
            }
        } catch (error) {
            showToast('حدث خطأ أثناء الحفظ', 'error');
            console.error('AddItemModal submit error:', error);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }
        }
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AddItemModal;
}
