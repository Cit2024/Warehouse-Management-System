/**
 * PrintLayout Component
 * Reusable print header + summary bar for report and receipt pages.
 *
 * Usage:
 *   const layout = new PrintLayout({
 *       layout: 'report', // or 'receipt'
 *       title: 'تقرير حالة المخزون',
 *       subtitle: '',      // used in receipt layout
 *       showDates: true,
 *       summaryItems: [
 *           { id: 'printReportName', label: 'اسم التقرير', defaultValue: '-' },
 *           { id: 'printRecordCount', label: 'عدد السجلات', defaultValue: '0' }
 *       ]
 *   });
 *   layout.setTitle('تقرير الجرد');
 *   layout.setSummary({ printReportName: '...', printRecordCount: '...' });
 *   layout.setDates(new Date());
 */
class PrintLayout {
    constructor(options = {}) {
        this.options = {
            layout: 'report',
            title: '',
            subtitle: '',
            showDates: true,
            summaryItems: [],
            ...options
        };
        this.render();
    }

    render() {
        if (document.getElementById('printLayoutRoot')) return;

        const headerHtml = this.options.layout === 'receipt'
            ? this.renderReceiptHeader()
            : this.renderReportHeader();

        const summaryHtml = this.options.summaryItems.length
            ? this.renderSummaryBar()
            : '';

        document.body.insertAdjacentHTML('afterbegin', `
            <div id="printLayoutRoot">
                ${headerHtml}
                ${summaryHtml}
            </div>
        `);
    }

    renderReportHeader() {
        return `
            <div class="print-header print-only">
                <div class="print-logo-area">
                    <img src="assets/images/logo.png" alt="شعار الكلية"
                         onerror="this.style.display='none'; this.parentElement.querySelector('.print-logo-fallback').style.display='flex';">
                    <div class="print-logo-fallback" style="display:none;">
                        <i class="fas fa-university" style="font-size:48px; color:#FF6B00;"></i>
                    </div>
                </div>
                <div class="print-title-area">
                    <div class="print-college-name">كلية التقنية الصناعية - مصراتة</div>
                    <div class="print-system-name">منظومة إدارة المخازن</div>
                    <h1 class="print-report-title" id="printTitle">${this.escapeHtml(this.options.title)}</h1>
                </div>
                <div class="print-date-area">
                    <div class="print-gregorian" id="printGregorianDate"></div>
                    <div class="print-hijri-label">الموافق</div>
                    <div class="print-hijri" id="printHijriDate"></div>
                </div>
            </div>
        `;
    }

    renderReceiptHeader() {
        const subtitleHtml = this.options.subtitle
            ? `<span style="font-size:12pt;font-weight:400;color:#64748B;display:block;margin-top:2px;">${this.escapeHtml(this.options.subtitle)}</span>`
            : '';
        return `
            <div class="print-header">
                <div class="print-header-top">
                    <div class="print-logo">
                        <img src="assets/images/logo.png" alt="شعار الكلية"
                             onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\'font-size:36px;\'><i class=\'fas fa-university\'></i></span>';">
                    </div>
                    <div class="print-header-titles">
                        <div class="print-college">كلية التقنية الصناعية - مصراتة</div>
                        <div class="print-system">منظومة إدارة المخازن</div>
                        <h1 id="printReceiptTitle">${this.escapeHtml(this.options.title)} ${subtitleHtml}</h1>
                        <div id="printReceiptDate"></div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSummaryBar() {
        const itemsHtml = this.options.summaryItems.map(item => `
            <div class="print-summary-item">
                <span class="print-summary-label">${this.escapeHtml(item.label)}</span>
                <span class="print-summary-value" id="${item.id}">${this.escapeHtml(item.defaultValue || '-')}</span>
            </div>
        `).join('');

        const className = this.options.layout === 'receipt' ? 'print-summary-bar print-only' : 'print-summary print-only';
        return `<div class="${className}">${itemsHtml}</div>`;
    }

    setTitle(title) {
        const id = this.options.layout === 'receipt' ? 'printReceiptTitle' : 'printTitle';
        const el = document.getElementById(id);
        if (el) {
            if (this.options.layout === 'receipt' && this.options.subtitle) {
                el.innerHTML = `${this.escapeHtml(title)} <span style="font-size:12pt;font-weight:400;color:#64748B;display:block;margin-top:2px;">${this.escapeHtml(this.options.subtitle)}</span>`;
            } else {
                el.textContent = title;
            }
        }
    }

    setSummary(values) {
        if (!values) return;
        Object.entries(values).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value ?? '-';
        });
    }

    setDates(date) {
        const d = date || new Date();
        const gregorianDate = d.toLocaleDateString('ar-LY', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        let hijriDate = '';
        try {
            const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            hijriDate = hijriFormatter.format(d);
        } catch (e) {
            hijriDate = '';
        }

        if (this.options.layout === 'receipt') {
            const el = document.getElementById('printReceiptDate');
            if (el) el.textContent = 'تاريخ الطباعة: ' + gregorianDate;
        } else {
            const gregEl = document.getElementById('printGregorianDate');
            const hijriEl = document.getElementById('printHijriDate');
            if (gregEl) gregEl.textContent = gregorianDate;
            if (hijriEl) hijriEl.textContent = hijriDate;
        }
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
    module.exports = PrintLayout;
}
