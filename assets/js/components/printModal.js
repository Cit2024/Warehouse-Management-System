/**
 * PrintModal Component
 * Reusable success/print confirmation modal.
 *
 * Usage:
 *   const modal = new PrintModal({
 *       title: 'تم اعتماد إذن الصرف',
 *       onPrint: () => executePrint('direct')
 *   });
 *   modal.open('تم الحفظ بنجاح');
 */
class PrintModal {
    constructor(options = {}) {
        this.options = {
            title: 'تم اعتماد المستند',
            onPrint: () => {},
            ...options
        };
        this.modalId = 'printModal';
        this.render();
        this.attachEvents();
    }

    render() {
        if (document.getElementById(this.modalId)) return;

        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal" id="${this.modalId}" role="dialog" aria-modal="true" aria-labelledby="printModalTitle" hidden>
                <div class="modal-content" role="document" style="text-align: center; max-width: 420px;">
                    <div class="modal-header" style="border-bottom: none; padding-bottom: 0;">
                        <h2 class="modal-title" id="printModalTitle" tabindex="-1" style="width: 100%; text-align: center;">${this.escapeHtml(this.options.title)}</h2>
                        <button type="button" class="modal-close" aria-label="إغلاق" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="font-size: 56px; margin-bottom: 16px; color: var(--success);"><i class="fas fa-check-circle"></i></div>
                        <h3 style="margin-bottom: 8px; color: var(--success); font-size: 18px;" id="successMessage">تم الحفظ بنجاح</h3>
                        <p style="margin-bottom: 28px; color: var(--text-muted); font-size: 14px;">كيف تود التعامل مع هذا المستند؟</p>

                        <div style="display: flex; gap: 10px; justify-content: center;">
                            <button type="button" class="btn btn-primary" data-action="print">
                                <i class="fas fa-print"></i>
                                <span>طباعة</span>
                            </button>
                        </div>
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
                if (action === 'print') {
                    this.close();
                    if (typeof this.options.onPrint === 'function') {
                        this.options.onPrint();
                    }
                }
            });
        });

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        this.handleKeydown = (e) => {
            if (e.key === 'Escape') this.close();
        };
    }

    open(message) {
        if (!this.modal) this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        const msgEl = document.getElementById('successMessage');
        if (msgEl && message != null) msgEl.textContent = message;

        this.modal.hidden = false;
        this.modal.classList.add('active');
        document.getElementById('printModalTitle').focus();
        document.addEventListener('keydown', this.handleKeydown);
    }

    close() {
        if (!this.modal) this.modal = document.getElementById(this.modalId);
        if (!this.modal) return;

        this.modal.hidden = true;
        this.modal.classList.remove('active');
        document.removeEventListener('keydown', this.handleKeydown);
    }

    escapeHtml(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrintModal;
}
