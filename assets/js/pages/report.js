/**
 * Report Page Logic
 * Handles report generation, printing, column visibility, and sample data.
 */

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout({ showRefresh: true, refreshAction: 'loadReportData()' });
    layout.init();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dateFrom').max = today;
    document.getElementById('dateTo').max = today;

    printLayout = new PrintLayout({
        layout: 'report',
        title: 'تقرير حالة المخزون',
        showDates: true,
        summaryItems: [
            { id: 'printReportName', label: 'اسم التقرير', defaultValue: '-' },
            { id: 'printRecordCount', label: 'عدد السجلات', defaultValue: '0' }
        ]
    });
});

let allItems = [];
let allTransactions = [];
let currentReportData = [];
let printLayout;

// ========== Number formatting utility ==========
const Nums = {
    fmt(num, digits = 2) {
        const n = parseFloat(num);
        if (isNaN(n)) return '0.00';
        return n.toLocaleString('ar-LY', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits
        });
    },
    fmtInt(num) {
        const n = parseInt(num);
        if (isNaN(n)) return '0';
        return n.toLocaleString('ar-LY');
    }
};

// ========== Column Visibility (اختيار الأعمدة + الإعدادات المحفوظة) ==========
let hiddenColumns = new Set();
const COLUMN_PRESETS_KEY = 'reportColumnPresets';

// ========== Date Defaults ==========
function setDefaultDates() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), 0, 1);
    document.getElementById('dateTo').value = today.toISOString().split('T')[0];
    document.getElementById('dateFrom').value = firstDay.toISOString().split('T')[0];
}

// ========== Report Type Change ==========
function onReportTypeChange() {
    const type = document.getElementById('reportType').value;
    const needsItem = type === 'item_card';
    const needsDates = ['stock', 'items_base', 'lowstock', 'inventory_count', 'movements_log', 'item_card'].includes(type);

    document.getElementById('itemSelectGroup').style.display = needsItem ? 'block' : 'none';
    document.getElementById('dateFromGroup').style.display = needsDates ? 'block' : 'none';
    document.getElementById('dateToGroup').style.display = needsDates ? 'block' : 'none';
    hiddenColumns = new Set(); // كل نوع تقرير له أعمدة مختلفة، فنبدأ من جديد بكل الأعمدة ظاهرة
    generateReport();
}

// ========== MAIN PRINT FUNCTION ==========
async function printReport() {
    const btn = document.getElementById('printReportBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الطباعة...';
    }
    try {
        await generateReport();
        const reportName = document.getElementById('reportName').textContent || '-';
        const recordCount = document.getElementById('recordCount').textContent || '0';
        const totalValue = document.getElementById('totalValue').textContent || '0 د.ل';
        const dateFrom = document.getElementById('dateFrom').value;
        const dateTo = document.getElementById('dateTo').value;
        const reportType = document.getElementById('reportType').value;
        const needsPeriod = ['movements_log', 'item_card'].includes(reportType);
        let periodText = '-';
        if (needsPeriod && dateFrom && dateTo) {
            periodText = dateFrom + ' إلى ' + dateTo;
        }

        // Set dates and title/summary via PrintLayout component
        const now = new Date();
        printLayout.setTitle(reportName);
        printLayout.setSummary({
            printReportName: reportName,
            printRecordCount: recordCount
        });
        printLayout.setDates(now);

        // Auto-detect landscape: if more than 6 columns, use landscape
        const table = document.getElementById('reportTable');
        const colCount = table ? table.querySelectorAll('thead th:not([style*="display: none"])').length : 0;
        const reportContainer = document.querySelector('.page-content');
        if (colCount > 6 && reportContainer) {
            reportContainer.classList.add('print-landscape');
        }

        window.print();
        // إزالة كلاس الطباعة الأفقية بعد الانتهاء بدلاً من إعادة تحميل الصفحة
        setTimeout(() => {
            const reportContainer = document.querySelector('.page-content');
            if (reportContainer) reportContainer.classList.remove('print-landscape');
        }, 100);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-print"></i> طباعة التقرير';
        }
    }
}

// Table sorting is provided by common.js

// ========== Generate Report ==========
async function generateReport() {
    const type = document.getElementById('reportType').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    switch(type) {
        case 'stock': await generateStockReport(); break;
        case 'items_base': await generateItemsBaseReport(); break;
        case 'lowstock': await generateLowStockReport(); break;
        case 'inventory_count': await generateInventoryCountReport(); break;
        case 'movements_log': await generateMovementsReport(dateFrom, dateTo); break;
        case 'supply_receipt': await generateSupplyReceiptReport(); break;
        case 'dispense_receipt': await generateDispenseReceiptReport(); break;
        case 'item_card': await generateItemCardReport(); break;
        case 'suppliers': await generateSuppliersReport(); break;
    }
    applyColumnVisibility(); // إعادة تطبيق حالة إخفاء الأعمدة بعد إعادة رسم الجدول
}

async function generateStockReport() {
    setReportMeta('تقرير حالة المخزون', 'جميع الأصناف مع الرصيد الحالي والقيمة');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true },
        { text: 'اسم الصنف', sortable: true },
        { text: 'التصنيف', sortable: true },
        { text: 'الوحدة', sortable: true },
        { text: 'الرصيد', sortable: true },
        { text: 'الحد الأدنى', sortable: true },
        { text: 'سعر الوحدة', sortable: true },
        { text: 'القيمة', sortable: true },
        { text: 'الحالة', sortable: true }
    ]);
    try {
        // Fetch BOTH stock and items data to ensure we have all fields
        const stockItems = await window.api.getStock();
        const fullItems = await window.api.getItems(); // This has unit_price, category, etc.

        // Merge stock quantities with full item details
        const mergedItems = mergeStockWithItems(stockItems, fullItems);
        renderStockTable(mergedItems);
    } catch (e) {
        // Fallback: render with what we have
        renderStockTable(allItems);
    }
}

// NEW: Merge function that combines stock quantities with full item details
function mergeStockWithItems(stockItems, fullItems) {
    if (!stockItems || !fullItems) return [];

    return stockItems.map(stockItem => {
        // Find the full item record by item_id
        const fullItem = fullItems.find(fi => fi.item_id === stockItem.item_id) || {};

        // Merge: stock quantities + full item details (price, category, etc.)
        return {
            item_id: stockItem.item_id || fullItem.item_id || '-',
            item_name: stockItem.item_name || fullItem.item_name || 'غير معروف',
            category: fullItem.category || stockItem.category || 'غير مصنف',
            unit: stockItem.unit || fullItem.unit || 'قطعة',
            current_quantity: stockItem.current_quantity || 0,
            min_order_qty: stockItem.min_order_qty || fullItem.min_order_qty || 0,
            unit_price: parseFloat(fullItem.unit_price || stockItem.unit_price || 0),
        };
    });
}

function renderStockTable(items) {
    const tbody = document.getElementById('reportTableBody');
    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px;">لا توجد بيانات للعرض</td></tr>';
        updateStats(0, '0.00 د.ل');
        return;
    }

    let totalValue = 0;
    currentReportData = items;

    tbody.innerHTML = items.map(item => {
        const qty = parseFloat(item.current_quantity) || 0;
        const minQty = parseFloat(item.min_order_qty) || 0;
        const price = parseFloat(item.unit_price) || 0;
        const value = qty * price;
        totalValue += value;
        const isLow = qty <= minQty;

        return `<tr>
            <td><span class="item-id">${item.item_id || '-'}</span></td>
            <td style="font-weight: 600;">${item.item_name || 'غير معروف'}</td>
            <td><span class="badge badge-supplier">${item.category || 'غير مصنف'}</span></td>
            <td>${item.unit || 'قطعة'}</td>
            <td style="font-weight: 700;">${Nums.fmtInt(qty)}</td>
            <td>${Nums.fmtInt(minQty)}</td>
            <td>${Nums.fmt(price)} د.ل</td>
            <td style="font-weight: 600;">${Nums.fmt(value)} د.ل</td>
            <td><span class="badge ${isLow ? 'badge-low' : 'badge-available'}">${isLow ? 'منخفض' : 'متوفر'}</span></td>
        </tr>`;
    }).join('');

    updateStats(items.length, Nums.fmt(totalValue) + ' د.ل');
}

async function generateItemsBaseReport() {
    setReportMeta('دليل الأصناف الأساسي', 'بيانات الأصناف الأساسية بدون كميات أو قيم');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true },
        { text: 'اسم الصنف', sortable: true },
        { text: 'الوحدة', sortable: true },
        { text: 'التصنيف', sortable: true },
        { text: 'الحد الأدنى', sortable: true }
    ]);
    try {
        const items = await window.api.getItems();
        renderItemsBaseTable(items || allItems);
    } catch (e) { renderItemsBaseTable(allItems); }
}

function renderItemsBaseTable(items) {
    if (!items || items.length === 0) {
        showToast('fail to get data to display', 'error');
    }
    const tbody = document.getElementById('reportTableBody');
    currentReportData = items;
    tbody.innerHTML = items.map(item => `
        <tr>
            <td><span class="item-id">${item.item_id}</span></td>
            <td style="font-weight: 600;">${item.item_name}</td>
            <td>${item.unit}</td>
            <td><span class="badge badge-supplier">${item.category}</span></td>
            <td>${item.min_order_qty || 0}</td>
        </tr>
    `).join('');
    updateStats(items.length, items.length + ' صنف');
}

async function generateInventoryCountReport() {
    setReportMeta('تقرير الجرد الفعلي', 'مقارنة الرصيد الحالي بالرصيد الفعلي الممسوح');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true },
        { text: 'اسم الصنف', sortable: true },
        { text: 'الوحدة', sortable: true },
        { text: 'التصنيف', sortable: true },
        { text: 'الرصيد الحالي', sortable: true },
        { text: 'الرصيد الفعلي', sortable: false },
        { text: 'حالة الجرد', sortable: true }
    ]);
    try {
        const items = await window.api.getStock();
        renderInventoryCountTable(items || allItems);
    } catch (e) { renderInventoryCountTable(allItems); }
}

function renderInventoryCountTable(items) {
    if (!items || items.length === 0) {
        showToast('fail to get data to display', 'error');
    }
    const tbody = document.getElementById('reportTableBody');
    currentReportData = items;
    tbody.innerHTML = items.map((item, index) => {
        const current = item.current_quantity || 0;
        return `<tr>
            <td><span class="item-id">${item.item_id}</span></td>
            <td style="font-weight: 600;">${item.item_name}</td>
            <td>${item.unit}</td>
            <td><span class="badge badge-supplier">${item.category}</span></td>
            <td style="font-weight: 700;">${current}</td>
            <td><input type="number" class="filter-select actual-qty" data-index="${index}" data-current="${current}" placeholder="الرصيد الفعلي" min="0" style="min-width: 120px;" oninput="updateCountStatus(this)"></td>
            <td class="count-status">-</td>
        </tr>`;
    }).join('');
    updateStats(items.length, 'جرد حسب الفعلي');
}

function updateCountStatus(input) {
    const current = parseFloat(input.dataset.current) || 0;
    const actual = parseFloat(input.value);
    const cell = input.closest('tr').querySelector('.count-status');
    if (isNaN(actual)) { cell.textContent = '-'; cell.style.color = ''; return; }
    const diff = actual - current;
    if (diff === 0) { cell.innerHTML = '<span class="badge badge-available">متطابق</span>'; }
    else if (diff > 0) { cell.innerHTML = '<span class="badge badge-supply">زيادة ' + diff + '</span>'; }
    else { cell.innerHTML = '<span class="badge badge-low">عجز ' + Math.abs(diff) + '</span>'; }
}

async function generateSupplyReceiptReport() {
    setReportMeta('إذن توريد', 'عرض تفاصيل إذن توريد نموذجي');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true },
        { text: 'اسم الصنف', sortable: true },
        { text: 'الوحدة', sortable: true },
        { text: 'الكمية', sortable: true },
        { text: 'سعر الوحدة', sortable: true },
        { text: 'الإجمالي', sortable: true }
    ]);
    renderSupplyReceipt(null);
}

function renderSupplyReceipt(receipt) {
    const tbody = document.getElementById('reportTableBody');
    const sampleReceipt = receipt || {
        transaction_id: 1,
        date: '2026-06-02',
        supplier: 'شركة المدار للتجهيزات',
        store: 'المخزن الرئيسي',
        notes: 'توريد مستلزمات مكتبية',
        items: [
            { item_id: 'ITM-001', item_name: 'ورق تصوير A4', unit: 'رزمة', quantity: 50, price: 24.50 },
            { item_id: 'ITM-008', item_name: 'ملف حفظ بلاستيكي', unit: 'قطعة', quantity: 100, price: 3.50 },
            { item_id: 'ITM-002', item_name: 'حبر طابعة أسود HP', unit: 'قطعة', quantity: 10, price: 145.00 }
        ]
    };
    currentReportData = sampleReceipt.items;
    let totalValue = 0;
    const rows = sampleReceipt.items.map(item => {
        const lineTotal = (item.quantity || 0) * (item.price || 0);
        totalValue += lineTotal;
        return `<tr>
            <td><span class="item-id">${item.item_id}</span></td>
            <td style="font-weight: 600;">${item.item_name}</td>
            <td>${item.unit}</td>
            <td style="font-weight: 700;">${item.quantity}</td>
            <td>${(item.price || 0).toLocaleString('ar-LY', {minimumFractionDigits: 2})} د.ل</td>
            <td style="font-weight: 600;">${lineTotal.toLocaleString('ar-LY', {minimumFractionDigits: 2})} د.ل</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = `
        <tr><td colspan="6" style="padding: 16px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color);">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 13px;">
                <div><strong>رقم الحركة:</strong> إذن-توريد-#${sampleReceipt.transaction_id}</div>
                <div><strong>التاريخ:</strong> ${sampleReceipt.date}</div>
                <div><strong>المورد:</strong> ${sampleReceipt.supplier}</div>
                <div><strong>المخزن:</strong> ${sampleReceipt.store}</div>
                <div style="grid-column: span 2;"><strong>ملاحظات:</strong> ${sampleReceipt.notes || '-'}</div>
            </div>
        </td></tr>
        ${rows}
        <tr><td colspan="6" style="padding: 0; border: none;">
            <div class="print-grand-total">
                <span>إجمالي قيمة الإذن</span>
                <span class="total-value">${totalValue.toLocaleString('ar-LY', {minimumFractionDigits: 2})} د.ل</span>
            </div>
            <div class="print-signatures">
                <div class="print-signature-box" data-role="المورد">المورد<br><span style="font-size:7pt;color:#999;">الاسم والتوقيع</span></div>
                <div class="print-signature-box" data-role="أمين المخزن">أمين المخزن<br><span style="font-size:7pt;color:#999;">الاسم والتوقيع</span></div>
                <div class="print-signature-box" data-role="مدير الإدارة / الاعتماد">مدير الإدارة / الاعتماد<br><span style="font-size:7pt;color:#999;">الاسم والتوقيع</span></div>
            </div>
        </td></tr>
    `;
    updateStats(sampleReceipt.items.length, totalValue.toLocaleString('ar-LY', {minimumFractionDigits: 2}) + ' د.ل');
}

async function generateDispenseReceiptReport() {
    setReportMeta('إذن صرف مخزني', 'عرض تفاصيل إذن صرف نموذجي');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true },
        { text: 'اسم الصنف', sortable: true },
        { text: 'الوحدة', sortable: true },
        { text: 'الكمية المصروفة', sortable: true }
    ]);
    renderDispenseReceipt(null);
}

function renderDispenseReceipt(receipt) {
    const tbody = document.getElementById('reportTableBody');
    const sampleReceipt = receipt || {
        transaction_id: 1,
        date: '2026-06-10',
        requester: 'قسم الهندسة الكهربائية',
        store: 'المخزن الرئيسي',
        reason: 'احتياجات المعمل',
        items: [
            { item_id: 'ITM-005', item_name: 'مفك كهربائي متعدد', unit: 'قطعة', quantity: 2 },
            { item_id: 'ITM-007', item_name: 'مصباح LED مختبر', unit: 'قطعة', quantity: 5 }
        ]
    };
    currentReportData = sampleReceipt.items;
    const rows = sampleReceipt.items.map(item => `
        <tr>
            <td><span class="item-id">${item.item_id}</span></td>
            <td style="font-weight: 600;">${item.item_name}</td>
            <td>${item.unit}</td>
            <td style="font-weight: 700; color: var(--danger);">- ${item.quantity}</td>
        </tr>
    `).join('');

    tbody.innerHTML = `
        <tr><td colspan="4" style="padding: 16px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color);">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 13px;">
                <div><strong>رقم الحركة:</strong> إذن-صرف-#${sampleReceipt.transaction_id}</div>
                <div><strong>التاريخ:</strong> ${sampleReceipt.date}</div>
                <div><strong>الجهة الطالبة:</strong> ${sampleReceipt.requester}</div>
                <div><strong>المخزن:</strong> ${sampleReceipt.store}</div>
                <div style="grid-column: span 2;"><strong>سبب الصرف:</strong> ${sampleReceipt.reason || '-'}</div>
            </div>
        </td></tr>
        ${rows}
        <tr><td colspan="4" style="padding: 0; border: none;">
            <div class="print-grand-total">
                <span>عدد الأصناف المصروفة</span>
                <span class="total-value">${sampleReceipt.items.length} صنف</span>
            </div>
            <div class="print-signatures">
                <div class="print-signature-box" data-role="المستلم (الجهة الطالبة)">المستلم (الجهة الطالبة)<br><span style="font-size:7pt;color:#999;">الاسم والتوقيع</span></div>
                <div class="print-signature-box" data-role="أمين المخزن">أمين المخزن<br><span style="font-size:7pt;color:#999;">الاسم والتوقيع</span></div>
                <div class="print-signature-box" data-role="مدير الإدارة / الاعتماد">مدير الإدارة / الاعتماد<br><span style="font-size:7pt;color:#999;">الاسم والتوقيع</span></div>
            </div>
        </td></tr>
    `;
    updateStats(sampleReceipt.items.length, sampleReceipt.items.length + ' صنف');
}

async function generateLowStockReport() {
    setReportMeta('الأصناف منخفضة الرصيد', 'أصناف وصلت أو قاربت على الحد الأدنى');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true }, { text: 'اسم الصنف', sortable: true },
        { text: 'التصنيف', sortable: true }, { text: 'الوحدة', sortable: true },
        { text: 'الرصيد الحالي', sortable: true }, { text: 'الحد الأدنى', sortable: true },
        { text: 'النقص', sortable: true }, { text: 'الحالة', sortable: true }
    ]);
    try {
        const items = await window.api.getStock();
        const low = (items || allItems).filter(i => (i.current_quantity || 0) <= (i.min_order_qty || 0));
        renderLowStockTable(low);
    } catch (e) {
        const low = allItems.filter(i => (i.current_quantity || 0) <= (i.min_order_qty || 0));
        renderLowStockTable(low);
    }
}

function renderLowStockTable(items) {
    if (!items || items.length === 0) {
        showToast('fail to get data to display', 'error');
    }
    const tbody = document.getElementById('reportTableBody');
    currentReportData = items;
    tbody.innerHTML = items.map(item => {
        const qty = item.current_quantity || 0;
        const minQty = item.min_order_qty || 0;
        const deficit = minQty - qty;
        return `<tr>
            <td><span class="item-id">${item.item_id}</span></td>
            <td style="font-weight: 600;">${item.item_name}</td>
            <td><span class="badge badge-supplier">${item.category}</span></td>
            <td>${item.unit}</td>
            <td style="font-weight: 700; color: var(--danger);">${qty}</td>
            <td>${minQty}</td>
            <td style="font-weight: 700; color: var(--danger);">${deficit > 0 ? '+' + deficit : deficit}</td>
            <td><span class="badge badge-low">منخفض</span></td>
        </tr>`;
    }).join('');
    updateStats(items.length, items.length + ' صنف');
}

async function generateMovementsReport(dateFrom, dateTo) {
    setReportMeta('حركات التوريد والصرف', `الفترة: ${dateFrom} إلى ${dateTo}`);
    setTableHeaders([
        { text: 'رقم الحركة', sortable: true }, { text: 'النوع', sortable: true },
        { text: 'التاريخ', sortable: true }, { text: 'الجهة / المورد', sortable: true },
        { text: 'المخزن', sortable: true }, { text: 'القيمة', sortable: true }
    ]);
    try {
        let transactions = await window.api.getTransactionsHistory();
        if (transactions && transactions.success === false) {
            showToast(transactions.message || 'حدث خطأ في جلب سجل الحركات', 'error');
            transactions = [];
        }
        renderMovementsTable(transactions || []);
    } catch (e) { renderSampleMovements(); }
}

function renderMovementsTable(transactions) {
    if (!transactions || transactions.length === 0) {
        showToast('fail to get data to display', 'error');
    }
    const tbody = document.getElementById('reportTableBody');
    let totalValue = 0;
    currentReportData = transactions;
    tbody.innerHTML = transactions.map(t => {
        const isSupply = t.transaction_type === 'In';
        const typeBadge = isSupply ? '<span class="badge badge-supply"><i class="fas fa-arrow-down"></i> توريد</span>' : '<span class="badge badge-dispense"><i class="fas fa-arrow-up"></i> صرف</span>';
        const dateStr = new Date(t.transaction_date).toLocaleDateString('ar-LY');
        const val = t.total_value || 0; totalValue += val;
        return `<tr>
            <td style="font-weight: 600; font-family: monospace;">#${t.transaction_id || '-'}</td>
            <td>${typeBadge}</td>
            <td>${dateStr}</td>
            <td>${t.entity_name || 'غير محدد'}</td>
            <td>${t.store_name || 'المخزن الرئيسي'}</td>
            <td style="font-weight: 600;">${val.toLocaleString('ar-LY', {minimumFractionDigits: 2})} د.ل</td>
        </tr>`;
    }).join('');
    updateStats(transactions.length, totalValue.toLocaleString('ar-LY', {minimumFractionDigits: 2}) + ' د.ل');
}

function renderSampleMovements() {
    renderMovementsTable([
        { transaction_id: 4, transaction_type: 'Out', transaction_date: '2026-06-12', entity_name: 'مكتب الشؤون الإدارية', store_name: 'المخزن الرئيسي', total_value: 332.50 },
        { transaction_id: 3, transaction_type: 'Out', transaction_date: '2026-06-10', entity_name: 'قسم الهندسة الكهربائية', store_name: 'المخزن الرئيسي', total_value: 504.00 },
        { transaction_id: 2, transaction_type: 'In', transaction_date: '2026-06-07', entity_name: 'مكتبة مصراتة الحديثة', store_name: 'المخزن الرئيسي', total_value: 1575.00 },
        { transaction_id: 1, transaction_type: 'In', transaction_date: '2026-06-02', entity_name: 'شركة المدار للتجهيزات', store_name: 'المخزن الرئيسي', total_value: 3740.00 }
    ]);
}

async function generateItemCardReport() {
    setReportMeta('بطاقة حركة صنف', 'تفاصيل حركات صنف محدد');
    setTableHeaders([
        { text: 'التاريخ', sortable: true }, { text: 'نوع الحركة', sortable: true },
        { text: 'رقم الحركة', sortable: true }, { text: 'الجهة', sortable: true },
        { text: 'الكمية', sortable: true }, { text: 'الرصيد', sortable: true }
    ]);
    document.getElementById('reportTableBody').innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">اختر صنفاً من القائمة أعلاه ثم اضغط طباعة التقرير</td></tr>';
    updateStats(0, '-');
}

async function generateSuppliersReport() {
    setReportMeta('دليل الموردين والجهات', 'قائمة الموردين والجهات المسجلة');
    setTableHeaders([
        { text: 'الكود', sortable: true }, { text: 'الاسم', sortable: true },
        { text: 'النوع', sortable: true }, { text: 'رقم الهاتف', sortable: true },
        { text: 'العنوان', sortable: true }
    ]);
    try {
        const entities = await window.api.getAllEntities();
        renderSuppliersTable(entities || []);
    } catch (e) { renderSampleSuppliers(); }
}

function renderSuppliersTable(entities) {
    if (!entities || entities.length === 0) {
        entities = [
            { code: 'SUP-001', entity_name: 'شركة المدار للتجهيزات', entity_type: 'Supplier', phone: '051-2345678', address: 'مصراتة - المنطقة الصناعية' },
            { code: 'SUP-002', entity_name: 'مكتبة مصراتة الحديثة', entity_type: 'Supplier', phone: '052-3456789', address: 'مصراتة - وسط المدينة' },
            { code: 'ENT-001', entity_name: 'قسم الهندسة الكهربائية', entity_type: 'Department', phone: '', address: 'الكلية - المبنى الرئيسي' },
            { code: 'ENT-002', entity_name: 'مكتب الشؤون الإدارية', entity_type: 'Department', phone: '', address: 'الكلية - الإدارة' }
        ];
    }
    const tbody = document.getElementById('reportTableBody');
    currentReportData = entities;
    tbody.innerHTML = entities.map(e => {
        const typeBadge = e.entity_type === 'Supplier' ? '<span class="badge badge-supplier">مورد</span>' : '<span class="badge badge-dept">جهة</span>';
        return `<tr>
            <td><span class="item-id">${e.code || e.entity_id}</span></td>
            <td style="font-weight: 600;">${e.entity_name}</td>
            <td>${typeBadge}</td>
            <td>${e.phone || '-'}</td>
            <td>${e.address || '-'}</td>
        </tr>`;
    }).join('');
    updateStats(entities.length, entities.length + ' جهة');
}

function renderSampleSuppliers() {
    renderSuppliersTable([
        { code: 'SUP-001', entity_name: 'شركة المدار للتجهيزات', entity_type: 'Supplier', phone: '051-2345678', address: 'مصراتة - المنطقة الصناعية' },
        { code: 'SUP-002', entity_name: 'مكتبة مصراتة الحديثة', entity_type: 'Supplier', phone: '052-3456789', address: 'مصراتة - وسط المدينة' },
        { code: 'ENT-001', entity_name: 'قسم الهندسة الكهربائية', entity_type: 'Department', phone: '', address: 'الكلية - المبنى الرئيسي' },
        { code: 'ENT-002', entity_name: 'مكتب الشؤون الإدارية', entity_type: 'Department', phone: '', address: 'الكلية - الإدارة' }
    ]);
}

// ========== Helpers ==========
function setReportMeta(name, desc) {
    document.getElementById('reportName').textContent = name;
    document.getElementById('printTitle').textContent = name;
    document.getElementById('reportTableTitle').textContent = name;
    document.getElementById('reportTableMeta').textContent = desc;
}
function updateStats(count, value) {
    document.getElementById('recordCount').textContent = count;
    document.getElementById('totalValue').textContent = value;
}
function setTableHeaders(headers) {
    const thead = document.getElementById('reportTableHead');
    thead.innerHTML = '<tr>' + headers.map((h, i) =>
        `<th class="sortable" onclick="sortTable('reportTable', ${i})">${h.text} <span class="sort-icon">↕</span></th>`
    ).join('') + '</tr>';
    sortDirection = {};
}

// ========== اختيار أعمدة التقرير + الإعدادات المحفوظة ==========

// تطبيق حالة hiddenColumns الحالية على رأس وجسم الجدول المعروض فعلياً
function applyColumnVisibility() {
    const table = document.getElementById('reportTable');
    if (!table) return;
    const headerCells = table.querySelectorAll('thead th');
    headerCells.forEach((th, i) => {
        th.style.display = hiddenColumns.has(i) ? 'none' : '';
    });
    table.querySelectorAll('tbody tr').forEach(row => {
        const cells = row.children;
        // نتجاهل صفوف الرسائل الخاصة (مثل "لا توجد بيانات") التي تستخدم colspan بعدد أعمدة مختلف
        if (cells.length === headerCells.length) {
            Array.from(cells).forEach((td, i) => {
                td.style.display = hiddenColumns.has(i) ? 'none' : '';
            });
        }
    });
}

function getAllColumnPresets() {
    try {
        return JSON.parse(localStorage.getItem(COLUMN_PRESETS_KEY)) || {};
    } catch (e) { return {}; }
}

function getColumnPresetsForType(reportType) {
    const all = getAllColumnPresets();
    return all[reportType] || [];
}

// فتح نافذة اختيار الأعمدة، مبنية على رأس الجدول الحالي المعروض على الشاشة
function openColumnsModal() {
    const thead = document.getElementById('reportTableHead');
    const ths = thead ? thead.querySelectorAll('th') : [];
    if (!ths.length) {
        showToast('لا يوجد تقرير معروض حالياً لاختيار أعمدته', 'error');
        return;
    }

    const existing = document.getElementById('columnsModal');
    if (existing) existing.remove();

    const reportType = document.getElementById('reportType').value;

    const checkboxesHtml = Array.from(ths).map((th, i) => {
        const label = th.textContent.replace(/[↕↑↓]/g, '').trim();
        const checked = hiddenColumns.has(i) ? '' : 'checked';
        return `
            <label style="display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid var(--border-color);">
                <input type="checkbox" data-col-index="${i}" ${checked} style="width:18px;height:18px;">
                <span>${label}</span>
            </label>`;
    }).join('');

    const presets = getColumnPresetsForType(reportType);
    const presetsOptionsHtml = presets.length
        ? presets.map(p => `<option value="${p.name}">${p.name}</option>`).join('')
        : '<option value="">لا توجد إعدادات محفوظة لهذا التقرير</option>';

    const modalHtml = `
        <div class="modal" id="columnsModal" role="dialog" aria-modal="true" aria-labelledby="columnsModalTitle" hidden>
            <div class="modal-content" style="max-width:440px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="columnsModalTitle">🧮 اختيار أعمدة التقرير</h3>
                    <button class="modal-close" aria-label="إغلاق" onclick="closeColumnsModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p style="color:#666; font-size:13px; margin-bottom:15px;">
                        حدد الأعمدة التي تريد ظهورها في الجدول والطباعة.
                    </p>
                    <div id="columnsCheckboxList" style="max-height:280px; overflow-y:auto; margin-bottom:16px;">
                        ${checkboxesHtml}
                    </div>
                    <div style="border-top:1px solid var(--border-color); padding-top:12px;">
                        <label style="font-size:13px; color:#666;">الإعدادات المحفوظة لهذا التقرير</label>
                        <div style="display:flex; gap:8px; margin-top:8px;">
                            <select id="presetSelect" class="filter-select" style="flex:1;">${presetsOptionsHtml}</select>
                            <button class="btn btn-secondary" onclick="loadSelectedColumnPreset()" title="تحميل">تحميل</button>
                            <button class="btn btn-secondary" onclick="deleteSelectedColumnPreset()" title="حذف الإعداد المحدد">🗑️</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeColumnsModal()">إغلاق</button>
                    <button class="btn btn-success" onclick="saveColumnsPreset()">حفظ باسم جديد</button>
                    <button class="btn btn-primary" onclick="applyColumnsFromModal()">تطبيق</button>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('columnsModal');
    modal.classList.add('active');
    modal.hidden = false;
}

function closeColumnsModal() {
    const modal = document.getElementById('columnsModal');
    if (modal) modal.hidden = true;
}

// قراءة الاختيارات من المودال وتطبيقها على الجدول المعروض دون حفظ
function applyColumnsFromModal() {
    const checks = document.querySelectorAll('#columnsCheckboxList input[type="checkbox"]');
    hiddenColumns = new Set();
    checks.forEach(c => {
        if (!c.checked) hiddenColumns.add(parseInt(c.dataset.colIndex, 10));
    });
    applyColumnVisibility();
    closeColumnsModal();
    showToast('تم تحديث أعمدة التقرير', 'success');
}

// حفظ الاختيار الحالي كإعداد جديد باسم يحدده المستخدم
function saveColumnsPreset() {
    const name = prompt('أدخل اسماً لهذا الإعداد لتتمكن من استرجاعه بسرعة لاحقاً:');
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();

    const checks = document.querySelectorAll('#columnsCheckboxList input[type="checkbox"]');
    const hidden = [];
    checks.forEach(c => {
        if (!c.checked) hidden.push(parseInt(c.dataset.colIndex, 10));
    });

    const reportType = document.getElementById('reportType').value;
    const all = getAllColumnPresets();
    if (!all[reportType]) all[reportType] = [];
    // استبدال أي إعداد سابق بنفس الاسم لهذا نوع التقرير
    all[reportType] = all[reportType].filter(p => p.name !== trimmedName);
    all[reportType].push({ name: trimmedName, hidden });
    localStorage.setItem(COLUMN_PRESETS_KEY, JSON.stringify(all));

    hiddenColumns = new Set(hidden);
    applyColumnVisibility();
    closeColumnsModal();
    showToast('تم حفظ إعداد الأعمدة باسم "' + trimmedName + '"', 'success');
}

// تحميل إعداد محفوظ وتطبيقه فوراً على الجدول والمودال
function loadSelectedColumnPreset() {
    const select = document.getElementById('presetSelect');
    const name = select ? select.value : '';
    if (!name) return;

    const reportType = document.getElementById('reportType').value;
    const preset = getColumnPresetsForType(reportType).find(p => p.name === name);
    if (!preset) return;

    hiddenColumns = new Set(preset.hidden);
    document.querySelectorAll('#columnsCheckboxList input[type="checkbox"]').forEach(c => {
        c.checked = !hiddenColumns.has(parseInt(c.dataset.colIndex, 10));
    });
    applyColumnVisibility();
    showToast('تم تطبيق إعداد "' + name + '"', 'success');
}

// حذف إعداد محفوظ لهذا نوع التقرير
function deleteSelectedColumnPreset() {
    const select = document.getElementById('presetSelect');
    const name = select ? select.value : '';
    if (!name) return;
    if (!confirm('هل تريد حذف الإعداد "' + name + '"؟')) return;

    const reportType = document.getElementById('reportType').value;
    const all = getAllColumnPresets();
    if (all[reportType]) {
        all[reportType] = all[reportType].filter(p => p.name !== name);
        localStorage.setItem(COLUMN_PRESETS_KEY, JSON.stringify(all));
    }
    showToast('تم حذف الإعداد', 'success');
    openColumnsModal(); // إعادة فتح المودال لعرض القائمة المحدثة
}

// ========== Load Data ==========
async function loadReportData() {
    try {
        const items = await window.api.getItems();
        allItems = items || [];
        const select = document.getElementById('itemSelect');
        select.innerHTML = '<option value="">اختر صنفاً</option>' +
            allItems.map(item => `<option value="${item.item_id}">${item.item_name}</option>`).join('');
        generateStockReport();
    } catch (error) { loadSampleData(); }
}
function loadSampleData() {
    allItems = [
        { item_id: 'ITM-001', item_name: 'ورق تصوير A4', unit: 'رزمة', category: 'قرطاسية', min_order_qty: 20, current_quantity: 85, unit_price: 24.50 },
        { item_id: 'ITM-002', item_name: 'حبر طابعة أسود HP', unit: 'قطعة', category: 'أحبار وطباعة', min_order_qty: 10, current_quantity: 8, unit_price: 145.00 },
        { item_id: 'ITM-003', item_name: 'كابل شبكة CAT6', unit: 'لفة', category: 'شبكات', min_order_qty: 5, current_quantity: 12, unit_price: 390.00 },
        { item_id: 'ITM-004', item_name: 'قفازات حماية صناعية', unit: 'زوج', category: 'سلامة مهنية', min_order_qty: 30, current_quantity: 120, unit_price: 18.00 },
        { item_id: 'ITM-005', item_name: 'مفك كهربائي متعدد', unit: 'قطعة', category: 'عدد وأدوات', min_order_qty: 8, current_quantity: 6, unit_price: 72.00 },
        { item_id: 'ITM-007', item_name: 'مصباح LED مختبر', unit: 'قطعة', category: 'كهرباء', min_order_qty: 20, current_quantity: 19, unit_price: 15.50 },
        { item_id: 'ITM-008', item_name: 'ملف حفظ بلاستيكي', unit: 'قطعة', category: 'قرطاسية', min_order_qty: 50, current_quantity: 210, unit_price: 3.50 },
        { item_id: 'ITM-009', item_name: 'ورق تصوير A3', unit: 'رزمة', category: 'قرطاسية', min_order_qty: 10, current_quantity: 45, unit_price: 60.00 },
        { item_id: 'ITM-010', item_name: 'وصلة كاميرا', unit: 'قطعة', category: 'شبكات', min_order_qty: 8, current_quantity: 5, unit_price: 68.00 }
    ];
    const select = document.getElementById('itemSelect');
    select.innerHTML = '<option value="">اختر صنفاً</option>' +
        allItems.map(item => `<option value="${item.item_id}">${item.item_name}</option>`).join('');
    generateStockReport();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeColumnsModal();
    }
});
