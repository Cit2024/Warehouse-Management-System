/**
 * PrintReport -- Unified Print Component
 * Handles ALL print output for the CIT Warehouse Management System.
 *
 * Usage:
 *   const printer = new PrintReport();
 *   printer.printInventoryTable(items, { title: 'تقرير حالة المخزون' });
 *   printer.printReceipt(receiptData, { type: 'supply' });
 *   printer.printDashboardSummary(stats, items);
 */
class PrintReport {
    constructor() {
        this.printWindow = null;
    }

    // ============================================================
    // Utility: escape HTML for safe injection into print document
    // ============================================================
    escapeHtml(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ============================================================
    // CORE: Build a complete printable HTML document
    // ============================================================
    buildPrintDocument(contentHtml, options = {}) {
        const title = this.escapeHtml(options.title || 'تقرير');
        const date = new Date().toLocaleDateString('ar-LY', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        const now = new Date();
        let hijriDate = '';
        try {
            hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
                year: 'numeric', month: 'long', day: 'numeric'
            }).format(now);
        } catch (e) { hijriDate = ''; }

        return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
@page {
    size: A4 ${options.landscape ? 'landscape' : 'portrait'};
    margin: 10mm 10mm 35mm 10mm;  /* Increased bottom margin to 35mm for signatures */
}
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
body {
    font-family: 'Segoe UI', 'Tahoma', 'Arial', sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #000;
    direction: rtl;
    text-align: right;
    background: white;
}

/* ===== HEADER ===== */
.print-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1.5pt solid #333;
    padding-bottom: 8pt;
    margin-bottom: 8pt;
}
.print-header-logo {
    width: 50px;
    height: 50px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
.print-header-logo img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}
.print-header-center {
    flex: 1;
    text-align: center;
    padding: 0 8pt;
}
.print-header-center .college {
    font-size: 11pt;
    font-weight: 700;
    color: #000;
}
.print-header-center .system {
    font-size: 9pt;
    font-weight: 600;
    color: #444;
    margin: 1pt 0;
}
.print-header-center .title {
    font-size: 13pt;
    font-weight: 700;
    color: #000;
    margin: 2pt 0 0;
}
.print-header-date {
    text-align: left;
    font-size: 8pt;
    color: #555;
    line-height: 1.6;
}
.print-header-date .hijri {
    font-size: 7pt;
    color: #777;
}

/* ===== SUMMARY BAR ===== */
.print-summary {
    display: flex;
    justify-content: center;
    gap: 20pt;
    border: 0.5pt solid #999;
    border-radius: 3pt;
    padding: 4pt 10pt;
    margin-bottom: 8pt;
    page-break-inside: avoid;
}
.print-summary-item {
    text-align: center;
}
.print-summary-item .label {
    font-size: 7pt;
    color: #777;
    display: block;
}
.print-summary-item .value {
    font-size: 9pt;
    font-weight: 700;
    display: block;
}

/* ===== META BLOCK (Supplier/Store) ===== */
.print-meta {
    margin-bottom: 6pt;
    page-break-inside: avoid;
}
.print-meta-row {
    display: flex;
    gap: 20pt;
    margin-bottom: 3pt;
    padding-bottom: 3pt;
    border-bottom: 0.5pt solid #ddd;
}
.print-meta-item {
    display: flex;
    align-items: baseline;
    gap: 4pt;
}
.print-meta-label {
    font-size: 8pt;
    font-weight: 600;
    color: #555;
}
.print-meta-value {
    font-size: 9pt;
    font-weight: 700;
    color: #000;
}

/* ===== TABLE -- Clean, NO colors ===== */
.print-table {
    width: 100%;
    border-collapse: collapse;
    margin: 4pt 0 6pt 0;
    font-size: 9pt;
    page-break-inside: auto;
}
.print-table thead {
    display: table-header-group;
}
.print-table thead th {
    background-color: #E0E0E0 !important;
    border: 0.5pt solid #777;
    border-bottom: 1.5pt solid #333;
    padding: 5pt 6pt;
    font-weight: 700;
    font-size: 8.5pt;
    text-align: right;
    vertical-align: middle;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.print-table tbody td {
    border: 0.5pt solid #999;
    padding: 4pt 6pt;
    text-align: right;
    vertical-align: middle;
    font-size: 9pt;
}
.print-table tbody tr {
    page-break-inside: avoid;
}
/* Zebra: use gray, not colored */
.print-table tbody tr:nth-child(even) {
    background-color: #F5F5F5 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}

/* ===== BADGE -- Text only, NO color backgrounds ===== */
.print-badge {
    display: inline-block;
    padding: 1pt 6pt;
    border: 0.5pt solid #888;
    border-radius: 8pt;
    font-size: 8pt;
    font-weight: 600;
    white-space: nowrap;
}
.print-badge-available { border-color: #666; }
.print-badge-low { border-color: #666; font-weight: 700; }

/* ===== ITEM ID ===== */
.print-item-id {
    font-family: 'Courier New', monospace;
    font-size: 8pt;
    font-weight: 700;
    padding: 1pt 4pt;
    border: 0.5pt solid #bbb;
    border-radius: 2pt;
}

/* ===== NUMERIC CELLS ===== */
.print-num {
    text-align: center;
    font-weight: 600;
    font-family: 'Courier New', monospace;
    direction: ltr;
    unicode-bidi: embed;
}
.print-price {
    text-align: left;
    font-weight: 600;
    font-family: 'Courier New', monospace;
    direction: ltr;
    unicode-bidi: embed;
}

/* ===== GRAND TOTAL ===== */
.print-total {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8pt;
    border: 0.5pt solid #999;
    border-top: 1.5pt solid #333;
    padding: 4pt 10pt;
    margin: 2pt 0 10pt 0;
    page-break-inside: avoid;
    background: #F5F5F5;
}
.print-total-label {
    font-size: 9pt;
    font-weight: 600;
    color: #444;
}
.print-total-value {
    font-size: 11pt;
    font-weight: 700;
    color: #000;
    direction: ltr;
    unicode-bidi: embed;
}

/* ===== SIGNATURES -- Fixed at bottom, compact ===== */
.print-signatures {
    display: flex;
    justify-content: space-between;
    position: fixed;
    bottom: 8mm;
    left: 12mm;
    right: 12mm;
    margin: 0;
    page-break-before: avoid;
}
.print-sig-box {
    width: 30%;
    text-align: center;
}
.print-sig-role {
    display: block;
    font-size: 8pt;
    font-weight: 700;
    color: #000;
    margin-bottom: 2pt;
    padding-top: 2pt;
    border-top: 0.8pt solid #000;
}
.print-sig-name {
    display: block;
    font-size: 7pt;
    color: #555;
    margin-bottom: 1pt;
    direction: rtl;
    text-align: center;
    line-height: 1.3;
}
.print-sig-name .label {
    display: inline;
}
.print-sig-name .line {
    display: inline-block;
    width: 55%;
    border-bottom: 0.5pt dotted #999;
    margin-right: 2pt;
    height: 8pt;
    vertical-align: bottom;
}
.print-sig-signature {
    display: block;
    font-size: 7pt;
    color: #555;
    direction: rtl;
    text-align: center;
    line-height: 1.3;
}
.print-sig-signature .label {
    display: inline;
}
.print-sig-signature .line {
    display: inline-block;
    width: 50%;
    border-bottom: 0.5pt dotted #999;
    margin-right: 2pt;
    height: 8pt;
    vertical-align: bottom;
}

/* ===== SECTION TITLE ===== */
.print-section-title {
    font-size: 10pt;
    font-weight: 700;
    color: #000;
    padding: 4pt 0 2pt 0;
    margin: 4pt 0 2pt 0;
    border-bottom: 1pt solid #333;
    page-break-after: avoid;
}

/* ===== UTILITY ===== */
.text-center { text-align: center; }
.bold { font-weight: 700; }
.mb-4 { margin-bottom: 4pt; }
</style>
</head>
<body>
    <!-- Header -->
    <div class="print-header">
        <div class="print-header-logo">
            <img src="assets/images/logo.png" alt="logo" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=font-size:28px>&#127963;</span>';">
        </div>
        <div class="print-header-center">
            <div class="college">كلية التقنية الصناعية - مصراتة</div>
            <div class="system">منظومة إدارة المخازن</div>
            <h1 class="title">${title}</h1>
        </div>
        <div class="print-header-date">
            <div>${date}</div>
            ${hijriDate ? `<div class="hijri">الموافق ${hijriDate}</div>` : ''}
        </div>
    </div>
    ${contentHtml}
</body>
</html>`;
    }

    // ============================================================
    // Print: Inventory Table Report (used by dashboard + report)
    // ============================================================
    printInventoryTable(items, options = {}) {
        const title = options.title || 'تقرير حالة المخزون';
        const subtitle = options.subtitle || '';
        const reportType = options.reportType || 'stock';

        // ── Column configurations per report type ──
        const columnConfigs = {
            stock: {
                headers: ['رقم الصنف', 'اسم الصنف', 'التصنيف', 'الوحدة', 'الرصيد', 'الحد الأدنى', 'سعر الوحدة', 'القيمة', 'الحالة'],
                sectionTitle: 'الأصناف',
                landscape: true,
                hasPrice: true,
                renderRow: (item) => {
                    const qty = item.current_quantity || 0;
                    const minQty = item.min_order_qty || 0;
                    const price = item.unit_price || 0;
                    const value = qty * price;
                    const isLow = qty <= minQty;
                    return `<td><span class="print-item-id">${this.escapeHtml(item.item_id || '-')}</span></td>
                        <td class="bold">${this.escapeHtml(item.item_name || 'غير معروف')}</td>
                        <td>${this.escapeHtml(item.category || 'غير مصنف')}</td>
                        <td>${this.escapeHtml(item.unit || 'قطعة')}</td>
                        <td class="print-num">${this.fmtInt(qty)}</td>
                        <td class="print-num">${this.fmtInt(minQty)}</td>
                        <td class="print-price">${this.fmt(price)}</td>
                        <td class="print-price bold">${this.fmt(value)}</td>
                        <td><span class="print-badge ${isLow ? 'print-badge-low' : 'print-badge-available'}">${isLow ? 'منخفض' : 'متوفر'}</span></td>`;
                }
            },
            items_base: {
                headers: ['رقم الصنف', 'اسم الصنف', 'الوحدة', 'التصنيف', 'الحد الأدنى'],
                sectionTitle: 'الأصناف الأساسية',
                landscape: false,
                hasPrice: false,
                renderRow: (item) => {
                    return `<td><span class="print-item-id">${this.escapeHtml(item.item_id || '-')}</span></td>
                        <td class="bold">${this.escapeHtml(item.item_name || 'غير معروف')}</td>
                        <td>${this.escapeHtml(item.unit || 'قطعة')}</td>
                        <td>${this.escapeHtml(item.category || 'غير مصنف')}</td>
                        <td class="print-num">${this.fmtInt(item.min_order_qty || 0)}</td>`;
                }
            },
            lowstock: {
                headers: ['رقم الصنف', 'اسم الصنف', 'التصنيف', 'الوحدة', 'الرصيد الحالي', 'الحد الأدنى', 'النقص', 'الحالة'],
                sectionTitle: 'أصناف منخفضة الرصيد',
                landscape: true,
                hasPrice: false,
                renderRow: (item) => {
                    const qty = item.current_quantity || 0;
                    const minQty = item.min_order_qty || 0;
                    const deficit = minQty - qty;
                    return `<td><span class="print-item-id">${this.escapeHtml(item.item_id || '-')}</span></td>
                        <td class="bold">${this.escapeHtml(item.item_name || 'غير معروف')}</td>
                        <td>${this.escapeHtml(item.category || 'غير مصنف')}</td>
                        <td>${this.escapeHtml(item.unit || 'قطعة')}</td>
                        <td class="print-num">${this.fmtInt(qty)}</td>
                        <td class="print-num">${this.fmtInt(minQty)}</td>
                        <td class="print-num">${deficit > 0 ? '+' + this.fmtInt(deficit) : this.fmtInt(deficit)}</td>
                        <td><span class="print-badge print-badge-low">منخفض</span></td>`;
                }
            },
            inventory_count: {
                headers: ['رقم الصنف', 'اسم الصنف', 'الوحدة', 'التصنيف', 'الرصيد الحالي', 'الرصيد الفعلي', 'حالة الجرد'],
                sectionTitle: 'بيانات الجرد',
                landscape: true,
                hasPrice: false,
                renderRow: (item) => {
                    const current = item.current_quantity || 0;
                    return `<td><span class="print-item-id">${this.escapeHtml(item.item_id || '-')}</span></td>
                        <td class="bold">${this.escapeHtml(item.item_name || 'غير معروف')}</td>
                        <td>${this.escapeHtml(item.unit || 'قطعة')}</td>
                        <td>${this.escapeHtml(item.category || 'غير مصنف')}</td>
                        <td class="print-num">${this.fmtInt(current)}</td>
                        <td style="text-align:center;">....................</td>
                        <td style="text-align:center;">-</td>`;
                }
            }
        };

        const config = columnConfigs[reportType] || columnConfigs.stock;

        // Calculate total value only for stock reports
        const totalValue = config.hasPrice
            ? (items || []).reduce((sum, item) => sum + ((item.current_quantity || 0) * (item.unit_price || 0)), 0)
            : 0;

        // Build header row
        const headersHtml = config.headers.map(h => `<th>${h}</th>`).join('');

        // Build data rows
        const rowsHtml = (items || []).map(item => `<tr>${config.renderRow(item)}</tr>`).join('');

        let tableHtml = `
            <div class="print-summary">
                <div class="print-summary-item">
                    <span class="label">عدد السجلات</span>
                    <span class="value">${items.length}</span>
                </div>
                ${config.hasPrice ? `<div class="print-summary-item"><span class="label">إجمالي القيمة</span><span class="value">${this.fmt(totalValue)} د.ل</span></div>` : ''}
            </div>
            ${subtitle ? `<div style="font-size:8pt;color:#666;margin-bottom:4pt;">${this.escapeHtml(subtitle)}</div>` : ''}
            <div class="print-section-title">${config.sectionTitle}</div>
            <table class="print-table">
                <thead><tr>${headersHtml}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>`;

        if (config.hasPrice) {
            tableHtml += `
                <div class="print-total">
                    <span class="print-total-label">إجمالي القيمة الإجمالية:</span>
                    <span class="print-total-value">${this.fmt(totalValue)} د.ل</span>
                </div>`;
        }

        tableHtml += this.buildSignaturesHtml(options.signatures || ['المستلم', 'أمين المخزن', 'المدير']);

        const doc = this.buildPrintDocument(tableHtml, {
            title,
            landscape: config.landscape
        });

        this.openPrintWindow(doc, config.landscape);
    }

    // ============================================================
    // Print: Supply/Dispense Receipt
    // ============================================================
    printReceipt(data, options = {}) {
        const type = options.type || 'supply'; // 'supply' or 'dispense'
        const title = type === 'supply' ? 'إذن توريد' : 'إذن صرف مخزني';
        const sectionLabel = type === 'supply' ? 'الأصناف الموردة' : 'الأصناف المصروفة';
        const totalLabel = type === 'supply' ? 'إجمالي قيمة الإذن' : 'إجمالي الأصناف المصروفة';

        let metaHtml = '';
        if (data.supplier || data.requester) {
            metaHtml += `<div class="print-meta">
                <div class="print-meta-row">
                    <div class="print-meta-item">
                        <span class="print-meta-label">${type === 'supply' ? 'المورد' : 'الجهة الطالبة'}:</span>
                        <span class="print-meta-value">${this.escapeHtml(data.supplier || data.requester || '-')}</span>
                    </div>
                    <div class="print-meta-item">
                        <span class="print-meta-label">${type === 'supply' ? 'المخزن المستلم' : 'المخزن المصدر'}:</span>
                        <span class="print-meta-value">${this.escapeHtml(data.store || '-')}</span>
                    </div>
                </div>
                ${type === 'dispense' && data.recipient ? `<div class="print-meta-row"><div class="print-meta-item"><span class="print-meta-label">اسم المستلم:</span><span class="print-meta-value">${this.escapeHtml(data.recipient)}</span></div></div>` : ''}
                ${data.notes ? `<div class="print-meta-row"><div class="print-meta-item"><span class="print-meta-label">ملاحظات:</span><span class="print-meta-value">${this.escapeHtml(data.notes)}</span></div></div>` : ''}
            </div>`;
        }

        let totalValue = 0;
        let tableHtml = `
            ${metaHtml}
            <div class="print-section-title">${sectionLabel}</div>
            <table class="print-table">
                <thead>
                    <tr>
                        <th>رقم الصنف</th>
                        <th>اسم الصنف</th>
                        <th>الوحدة</th>
                        <th>الكمية</th>
                        ${type === 'supply' ? '<th>سعر الوحدة</th><th>الإجمالي</th>' : ''}
                    </tr>
                </thead>
                <tbody>`;

        (data.items || []).forEach(item => {
            const lineTotal = (item.quantity || 0) * (item.price || item.unit_price || 0);
            totalValue += lineTotal;
            tableHtml += `<tr>
                <td><span class="print-item-id">${this.escapeHtml(item.item_id || '-')}</span></td>
                <td class="bold">${this.escapeHtml(item.item_name || '-')}</td>
                <td>${this.escapeHtml(item.unit || 'قطعة')}</td>
                <td class="print-num">${this.fmtInt(item.quantity || 0)}</td>
                ${type === 'supply' ? `<td class="print-price">${this.fmt(item.price || item.unit_price || 0)}</td><td class="print-price bold">${this.fmt(lineTotal)}</td>` : ''}
            </tr>`;
        });

        tableHtml += `</tbody></table>`;

        if (type === 'supply') {
            tableHtml += `
                <div class="print-total">
                    <span class="print-total-label">${totalLabel}:</span>
                    <span class="print-total-value">${this.fmt(totalValue)} د.ل</span>
                </div>`;
        } else {
            tableHtml += `
                <div class="print-total">
                    <span class="print-total-label">${totalLabel}:</span>
                    <span class="print-total-value">${(data.items || []).length} صنف</span>
                </div>`;
        }

        const sigRoles = type === 'supply'
            ? ['المورد', 'أمين المخزن', 'مدير الإدارة / الاعتماد']
            : [{ role: 'المستلم', name: data.recipient || '' }, 'أمين المخزن', 'مدير الإدارة / الاعتماد'];
        tableHtml += this.buildSignaturesHtml(sigRoles);

        const doc = this.buildPrintDocument(tableHtml, { title, landscape: false });
        this.openPrintWindow(doc, false);
    }

    // ============================================================
    // Print: Dashboard Summary
    // ============================================================
    printDashboardSummary(stats, items, options = {}) {
        const title = options.title || 'ملخص حالة المخزون';
        const summaryItems = items || [];

        let summaryHtml = `
            <div class="print-summary">
                <div class="print-summary-item">
                    <span class="label">إجمالي الأصناف</span>
                    <span class="value">${stats.totalItems || 0}</span>
                </div>
                <div class="print-summary-item">
                    <span class="label">إجمالي الوحدات</span>
                    <span class="value">${this.fmtInt(stats.totalUnits || 0)}</span>
                </div>
                <div class="print-summary-item">
                    <span class="label">قيمة المخزون</span>
                    <span class="value">${this.fmt(stats.totalValue || 0)} د.ل</span>
                </div>
                <div class="print-summary-item">
                    <span class="label">أصناف منخفضة</span>
                    <span class="value">${stats.lowStock || 0}</span>
                </div>
            </div>`;

        if (summaryItems.length > 0) {
            summaryHtml += `
                <div class="print-section-title">تفاصيل الأصناف</div>
                <table class="print-table">
                    <thead>
                        <tr>
                            <th>رقم الصنف</th>
                            <th>اسم الصنف</th>
                            <th>التصنيف</th>
                            <th>الوحدة</th>
                            <th>الرصيد</th>
                            <th>الحد الأدنى</th>
                            <th>الحالة</th>
                        </tr>
                    </thead>
                    <tbody>`;

            summaryItems.forEach(item => {
                const qty = item.current_quantity || 0;
                const minQty = item.min_order_qty || 0;
                const isLow = qty <= minQty;
                summaryHtml += `<tr>
                    <td><span class="print-item-id">${this.escapeHtml(item.item_id || '-')}</span></td>
                    <td class="bold">${this.escapeHtml(item.item_name || '-')}</td>
                    <td>${this.escapeHtml(item.category || '-')}</td>
                    <td>${this.escapeHtml(item.unit || 'قطعة')}</td>
                    <td class="print-num">${this.fmtInt(qty)}</td>
                    <td class="print-num">${this.fmtInt(minQty)}</td>
                    <td><span class="print-badge ${isLow ? 'print-badge-low' : 'print-badge-available'}">${isLow ? 'منخفض' : 'متوفر'}</span></td>
                </tr>`;
            });

            summaryHtml += `</tbody></table>`;
        }

        summaryHtml += this.buildSignaturesHtml(['المستلم', 'أمين المخزن', 'المدير']);

        const doc = this.buildPrintDocument(summaryHtml, { title, landscape: summaryItems.length > 5 });
        this.openPrintWindow(doc, summaryItems.length > 5);
    }

    // ============================================================
    // Print: Movements/Transactions Table
    // ============================================================
    printMovementsTable(transactions, options = {}) {
        const title = options.title || 'حركات التوريد والصرف';
        const dateRange = options.dateRange || '';

        let totalValue = 0;
        let tableHtml = `
            <div class="print-summary">
                <div class="print-summary-item">
                    <span class="label">عدد الحركات</span>
                    <span class="value">${transactions.length}</span>
                </div>
                ${dateRange ? `<div class="print-summary-item"><span class="label">الفترة</span><span class="value">${this.escapeHtml(dateRange)}</span></div>` : ''}
            </div>
            <div class="print-section-title">سجل الحركات</div>
            <table class="print-table">
                <thead>
                    <tr>
                        <th>رقم الحركة</th>
                        <th>النوع</th>
                        <th>التاريخ</th>
                        <th>الجهة / المورد</th>
                        <th>المخزن</th>
                        <th>القيمة</th>
                    </tr>
                </thead>
                <tbody>`;

        transactions.forEach(t => {
            const isSupply = t.transaction_type === 'In';
            const typeText = isSupply ? 'توريد' : 'صرف';
            const dateStr = t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('ar-LY') : '-';
            const val = t.total_value || 0;
            totalValue += val;

            tableHtml += `<tr>
                <td style="font-family:monospace;font-weight:700;">#${t.transaction_id || '-'}</td>
                <td>${typeText}</td>
                <td>${dateStr}</td>
                <td>${this.escapeHtml(t.entity_name || 'غير محدد')}</td>
                <td>${this.escapeHtml(t.store_name || 'المخزن الرئيسي')}</td>
                <td class="print-price">${this.fmt(val)} د.ل</td>
            </tr>`;
        });

        tableHtml += `</tbody></table>`;
        tableHtml += `
            <div class="print-total">
                <span class="print-total-label">إجمالي القيمة:</span>
                <span class="print-total-value">${this.fmt(totalValue)} د.ل</span>
            </div>`;
        tableHtml += this.buildSignaturesHtml(['المستلم', 'أمين المخزن', 'المدير']);

        const doc = this.buildPrintDocument(tableHtml, { title, landscape: true });
        this.openPrintWindow(doc, true);
    }

    // ============================================================
    // Print: Suppliers/Entities Table
    // ============================================================
    printSuppliersTable(entities, options = {}) {
        const title = options.title || 'دليل الموردين والجهات';

        let tableHtml = `
            <div class="print-summary">
                <div class="print-summary-item">
                    <span class="label">عدد الجهات</span>
                    <span class="value">${entities.length}</span>
                </div>
            </div>
            <div class="print-section-title">قائمة الموردين والجهات</div>
            <table class="print-table">
                <thead>
                    <tr>
                        <th>الكود</th>
                        <th>الاسم</th>
                        <th>النوع</th>
                        <th>رقم الهاتف</th>
                    </tr>
                </thead>
                <tbody>`;

        entities.forEach(e => {
            const typeText = e.entity_type === 'Supplier' ? 'مورد' : 'جهة';
            tableHtml += `<tr>
                <td><span class="print-item-id">${this.escapeHtml(e.code || e.entity_id || '-')}</span></td>
                <td class="bold">${this.escapeHtml(e.entity_name || 'غير معروف')}</td>
                <td>${typeText}</td>
                <td>${this.escapeHtml(e.phone || '-')}</td>
            </tr>`;
        });

        tableHtml += `</tbody></table>`;
        tableHtml += this.buildSignaturesHtml(['المستلم', 'أمين المخزن', 'المدير']);

        const doc = this.buildPrintDocument(tableHtml, { title, landscape: false });
        this.openPrintWindow(doc, false);
    }

    // ============================================================
    // Print: Item Card (movement history for one item)
    // ============================================================
    printItemCard(itemData, options = {}) {
        const title = options.title || 'بطاقة حركة صنف';
        const itemName = options.itemName || 'غير معروف';

        let tableHtml = `
            <div class="print-summary">
                <div class="print-summary-item">
                    <span class="label">اسم الصنف</span>
                    <span class="value">${this.escapeHtml(itemName)}</span>
                </div>
                <div class="print-summary-item">
                    <span class="label">عدد الحركات</span>
                    <span class="value">${itemData.length}</span>
                </div>
            </div>
            <div class="print-section-title">سجل حركات الصنف</div>
            <table class="print-table">
                <thead>
                    <tr>
                        <th>التاريخ</th>
                        <th>نوع الحركة</th>
                        <th>رقم الحركة</th>
                        <th>الجهة</th>
                        <th>الكمية</th>
                        <th>الرصيد</th>
                    </tr>
                </thead>
                <tbody>`;

        if (!itemData || itemData.length === 0) {
            tableHtml += '<tr><td colspan="6" style="text-align:center;padding:20pt;">لا توجد حركات مسجلة لهذا الصنف</td></tr>';
        } else {
            itemData.forEach(m => {
                const dateStr = m.transaction_date ? new Date(m.transaction_date).toLocaleDateString('ar-LY') : '-';
                const typeText = m.transaction_type === 'In' ? 'توريد' : m.transaction_type === 'Out' ? 'صرف' : 'رصيد افتتاحي';
                tableHtml += `<tr>
                    <td>${dateStr}</td>
                    <td>${typeText}</td>
                    <td style="font-family:monospace;">#${m.transaction_id || '-'}</td>
                    <td>${this.escapeHtml(m.entity_name || '-')}</td>
                    <td class="print-num">${this.fmtInt(m.quantity || 0)}</td>
                    <td class="print-num">${this.fmtInt(m.running_balance || 0)}</td>
                </tr>`;
            });
        }

        tableHtml += `</tbody></table>`;
        tableHtml += this.buildSignaturesHtml(['المستلم', 'أمين المخزن', 'المدير']);

        const doc = this.buildPrintDocument(tableHtml, { title, landscape: false });
        this.openPrintWindow(doc, false);
    }

    // ============================================================
    // Signatures HTML Builder
    // ============================================================
    // يقبل كل عنصر نصاً (دور فقط، سطر اسم فارغ للكتابة اليدوية) أو كائناً
    // {role, name} فيُطبع الاسم على السطر المنقّط نفسه — لا تغيير في CSS.
    buildSignaturesHtml(roles) {
        if (!roles || roles.length === 0) {
            roles = ['المستلم', 'أمين المخزن', 'المدير'];
        }

        const boxes = roles.map(entry => {
            const role = typeof entry === 'string' ? entry : entry.role;
            const name = typeof entry === 'string' ? '' : (entry.name || '');
            return `
            <div class="print-sig-box">
                <span class="print-sig-role">${this.escapeHtml(role)}</span>
                <span class="print-sig-name">
                    <span class="label">الاسم :</span>
                    <span class="line">${this.escapeHtml(name)}</span>
                </span>
                <span class="print-sig-signature">
                    <span class="label">التوقيع :</span>
                    <span class="line"></span>
                </span>
            </div>
        `;
        }).join('');

        return `<div class="print-signatures">${boxes}</div>`;
    }

    // ============================================================
    // Open print window
    // ============================================================
    openPrintWindow(htmlContent, isLandscape = false) {
        // Close previous window if exists
        if (this.printWindow && !this.printWindow.closed) {
            this.printWindow.close();
        }

        // A4 dimensions at 96 DPI
        const A4_WIDTH = 794;
        const A4_HEIGHT = 1123;

        const width = isLandscape ? A4_HEIGHT + 40 : A4_WIDTH + 40;  // +40 for scrollbar
        const height = isLandscape ? A4_WIDTH + 60 : A4_HEIGHT + 60; // +60 for window chrome

        const features = `width=${width},height=${height},resizable=yes,scrollbars=yes`;
        this.printWindow = window.open('', '_blank', features);

        if (!this.printWindow) {
            if (typeof showToast === 'function') {
                showToast('تم حظر النافذة المنبثقة -- يرجى السماح بالنوافذ المنبثقة', 'error');
            } else {
                alert('تم حظر النافذة المنبثقة -- يرجى السماح بالنوافذ المنبثقة');
            }
            return;
        }

        this.printWindow.document.write(htmlContent);
        this.printWindow.document.close();

        // Wait for content to load then print
        const doPrint = () => {
            if (this.printWindow && !this.printWindow.closed) {
                this.printWindow.print();
            }
        };

        if (this.printWindow.onload) {
            this.printWindow.onload = doPrint;
        }
        setTimeout(doPrint, 800); // Longer delay for complex tables
    }

    // ============================================================
    // Number formatting helpers
    // ============================================================
    fmt(num, digits = 2) {
        const n = parseFloat(num);
        if (isNaN(n)) return '0.' + '0'.repeat(digits);
        return n.toLocaleString('ar-LY', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits
        });
    }
    fmtInt(num) {
        const n = parseInt(num);
        if (isNaN(n)) return '0';
        return n.toLocaleString('ar-LY');
    }
}

// Global instance
window.printReport = new PrintReport();
