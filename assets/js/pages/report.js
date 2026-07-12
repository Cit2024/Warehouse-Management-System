/**
 * Report Page Logic
 * Handles report generation, printing, and column visibility.
 */

document.addEventListener('DOMContentLoaded', async () => {
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

    // Load data first; generateReport() is called after allItems is populated
    await loadReportData();
});

let allItems = [];
let allTransactions = [];
let currentReportData = [];
let printLayout;
let reportGenerationId = 0;

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

// ========== Empty / error row (never fabricated data) ==========
// An empty result and a failed query must never look the same: empty is a
// silent, neutral state; a failure is announced with an icon and real text
// (never colour alone, per PRODUCT.md), and never papered over with invented
// numbers that could end up on a printed official document.
function reportMessageRow(colspan, message, isError = false) {
    const icon = isError ? 'fa-triangle-exclamation' : 'fa-inbox';
    const cls = isError ? 'report-message-row report-message-error' : 'report-message-row';
    return `<tr><td colspan="${colspan}" class="${cls}">
        <i class="fas ${icon}" aria-hidden="true"></i>
        <span>${escapeHtml(message)}</span>
    </td></tr>`;
}

// ========== Category badge helper ==========
function getCategoryClass(category) {
    const cat = (category || '').toLowerCase();
    if (cat.includes('إلكترون') || cat.includes('electronic')) return 'cat-electronics';
    if (cat.includes('قرطاس') || cat.includes('station')) return 'cat-stationery';
    if (cat.includes('شبك') || cat.includes('network')) return 'cat-network';
    if (cat.includes('سلامة') || cat.includes('safety')) return 'cat-safety';
    if (cat.includes('عدة') || cat.includes('أدوات') || cat.includes('tool')) return 'cat-tools';
    if (cat.includes('حبر') || cat.includes('طباع') || cat.includes('ink')) return 'cat-ink';
    return 'cat-default';
}

// ========== Consistent number formatter ==========
function fmtNumber(num, digits = 2) {
    const n = parseFloat(num);
    if (isNaN(n)) return digits === 0 ? '0' : '0.' + '0'.repeat(digits);
    return n.toLocaleString('ar-LY', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

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
async function onReportTypeChange() {
    const type = document.getElementById('reportType').value;
    const needsItem = type === 'item_card';
    const needsDates = ['stock', 'items_base', 'lowstock', 'inventory_count', 'movements_log', 'item_card'].includes(type);
    const needsReceipt = type === 'supply_receipt' || type === 'dispense_receipt';

    document.getElementById('itemSelectGroup').style.display = needsItem ? 'block' : 'none';
    document.getElementById('dateFromGroup').style.display = needsDates ? 'block' : 'none';
    document.getElementById('dateToGroup').style.display = needsDates ? 'block' : 'none';

    const receiptGroup = document.getElementById('receiptSelectGroup');
    if (receiptGroup) receiptGroup.style.display = needsReceipt ? 'block' : 'none';

    // خيار عرض الأذونات الملغاة يخص سجل الحركات وحده
    const voidedGroup = document.getElementById('includeVoidedGroup');
    if (voidedGroup) voidedGroup.style.display = (type === 'movements_log') ? 'flex' : 'none';
    hiddenColumns = new Set(); // كل نوع تقرير له أعمدة مختلفة، فنبدأ من جديد بكل الأعمدة ظاهرة

    // القائمة يجب أن تُملأ قبل أن يحاول التقرير قراءة قيمتها
    if (needsReceipt) {
        await loadReceiptOptions(type === 'supply_receipt' ? 'In' : 'Out');
    }
    generateReport();
}

// تعبئة قائمة الأذونات الحقيقية (توريد أو صرف) لاختيار إذن لعرضه وطباعته.
// كانت هذه القائمة غير موجودة أصلاً؛ تبويبا "إذن توريد"/"إذن صرف" كانا يعرضان
// دائماً إذناً وهمياً ثابتاً بدل السماح باختيار إذن حقيقي.
async function loadReceiptOptions(transactionType) {
    const select = document.getElementById('receiptSelect');
    if (!select) return;
    select.innerHTML = '<option value="">جاري التحميل...</option>';
    try {
        const history = await window.api.getTransactionsHistory({ includeVoided: false });
        const list = Array.isArray(history) ? history.filter(t => t.transaction_type === transactionType) : [];
        if (list.length === 0) {
            select.innerHTML = '<option value="">لا توجد أذونات مسجلة</option>';
            return;
        }
        select.innerHTML = '<option value="">اختر إذناً</option>' + list.map(t => {
            const dateStr = t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('ar-LY') : '-';
            return `<option value="${t.transaction_id}">#${t.transaction_id} — ${dateStr} — ${escapeHtml(t.entity_name || 'غير محدد')}</option>`;
        }).join('');
    } catch (error) {
        console.error('[Report] تعذّر تحميل قائمة الأذونات:', error);
        select.innerHTML = '<option value="">تعذّر تحميل القائمة</option>';
    }
}

// ========== MAIN PRINT FUNCTION ==========
async function handlePrintReport() {
    const btn = document.getElementById('printReportBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';
    }
    try {
        // Ensure data is generated
        await generateReport();

        const reportType = document.getElementById('reportType').value;
        const reportName = document.getElementById('reportName').textContent || 'تقرير';
        const reportMeta = document.getElementById('reportTableMeta').textContent || '';

        switch (reportType) {
            case 'stock':
            case 'items_base':
            case 'lowstock':
            case 'inventory_count':
                window.printReport.printInventoryTable(currentReportData, {
                    title: reportName,
                    subtitle: reportMeta,
                    reportType: reportType
                });
                break;

            case 'movements_log': {
                const dateFrom = document.getElementById('dateFrom').value;
                const dateTo = document.getElementById('dateTo').value;
                // الأذونات الملغاة لا تُطبع: المستند المطبوع رسمي، وطباعة إذن ملغى
                // دون تمييز تجعله يبدو سارياً. تظهر على الشاشة فقط للتدقيق.
                const printable = (currentReportData || []).filter(t => t.is_deleted !== 1);
                window.printReport.printMovementsTable(printable, {
                    title: reportName,
                    dateRange: `${dateFrom} إلى ${dateTo}`
                });
                break;
            }

            case 'supply_receipt': {
                if (!currentReportData || currentReportData.length === 0) {
                    showToast('يرجى اختيار إذن توريد أولاً', 'warning');
                    return;
                }
                const supplyData = buildSupplyReceiptData();
                window.printReport.printReceipt(supplyData, { type: 'supply' });
                break;
            }

            case 'dispense_receipt': {
                if (!currentReportData || currentReportData.length === 0) {
                    showToast('يرجى اختيار إذن صرف أولاً', 'warning');
                    return;
                }
                const dispenseData = buildDispenseReceiptData();
                window.printReport.printReceipt(dispenseData, { type: 'dispense' });
                break;
            }

            case 'item_card': {
                const itemSelect = document.getElementById('itemSelect');
                const itemId = itemSelect.value;
                if (!itemId) {
                    showToast('يرجى اختيار صنف أولاً', 'warning');
                    return;
                }
                const itemName = itemSelect.selectedOptions[0]?.text || '';
                const itemData = await window.api.getItemTransactions(parseInt(itemId, 10));
                if (itemData && itemData.success === false) {
                    showToast(itemData.message || 'فشل في جلب حركات الصنف', 'error');
                    return;
                }
                window.printReport.printItemCard(itemData || [], {
                    title: reportName,
                    itemName
                });
                break;
            }

            case 'suppliers':
                window.printReport.printSuppliersTable(currentReportData, {
                    title: reportName
                });
                break;

            default:
                window.print();
        }
    } catch (error) {
        console.error('[Print] Error:', error);
        showToast('فشل في الطباعة: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-print"></i> طباعة التقرير';
        }
    }
}

// ========== Receipt data helpers for print routing ==========
function buildSupplyReceiptData() {
    const headerRow = document.querySelector('#reportTableBody tr:first-child td');
    let supplier = 'غير محدد', store = 'المخزن الرئيسي', notes = '';

    if (headerRow) {
        const text = headerRow.textContent || '';
        const supplierMatch = text.match(/المورد:\s*([^\n]+)/);
        const storeMatch = text.match(/المخزن:\s*([^\n]+)/);
        const notesMatch = text.match(/ملاحظات:\s*([^\n]+)/);
        if (supplierMatch) supplier = supplierMatch[1].trim();
        if (storeMatch) store = storeMatch[1].trim();
        if (notesMatch) notes = notesMatch[1].trim();
    }

    return {
        supplier,
        store,
        notes,
        items: currentReportData || []
    };
}

function buildDispenseReceiptData() {
    const headerRow = document.querySelector('#reportTableBody tr:first-child td');
    let requester = 'غير محدد', store = 'المخزن الرئيسي', reason = '';

    if (headerRow) {
        const text = headerRow.textContent || '';
        const requesterMatch = text.match(/الجهة الطالبة:\s*([^\n]+)/);
        const storeMatch = text.match(/المخزن:\s*([^\n]+)/);
        const reasonMatch = text.match(/سبب الصرف:\s*([^\n]+)/);
        if (requesterMatch) requester = requesterMatch[1].trim();
        if (storeMatch) store = storeMatch[1].trim();
        if (reasonMatch) reason = reasonMatch[1].trim();
    }

    return {
        requester,
        store,
        notes: reason,
        items: currentReportData || []
    };
}

// Table sorting is provided by common.js

// ========== Generate Report ==========
async function generateReport() {
    const currentId = ++reportGenerationId;
    const type = document.getElementById('reportType').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    switch(type) {
        case 'stock': await generateStockReport(currentId); break;
        case 'items_base': await generateItemsBaseReport(currentId); break;
        case 'lowstock': await generateLowStockReport(currentId); break;
        case 'inventory_count': await generateInventoryCountReport(currentId); break;
        case 'movements_log': await generateMovementsReport(currentId, dateFrom, dateTo); break;
        case 'supply_receipt': await generateSupplyReceiptReport(currentId); break;
        case 'dispense_receipt': await generateDispenseReceiptReport(currentId); break;
        case 'item_card': await generateItemCardReport(currentId); break;
        case 'suppliers': await generateSuppliersReport(currentId); break;
    }
    applyColumnVisibility(); // إعادة تطبيق حالة إخفاء الأعمدة بعد إعادة رسم الجدول
}

async function generateStockReport(expectedId) {
    let mergedItems = [];
    let apiError = null;

    try {
        // Fetch stock data (returns current quantities)
        let stockItems = await window.api.getStock();
        // Handle {success: false} response
        if (stockItems && stockItems.success === false) {
            console.warn('[Report] getStock returned error:', stockItems.message);
            stockItems = [];
        }
        // Ensure it's an array
        if (!Array.isArray(stockItems)) {
            console.warn('[Report] getStock did not return array:', stockItems);
            stockItems = [];
        }

        // Fetch full items data (returns unit_price, category, etc.)
        let fullItems = await window.api.getItems();
        if (fullItems && fullItems.success === false) {
            console.warn('[Report] getItems returned error:', fullItems.message);
            fullItems = [];
        }
        if (!Array.isArray(fullItems)) {
            console.warn('[Report] getItems did not return array:', fullItems);
            fullItems = [];
        }

        // If we have full items but no stock data, use full items with zero quantities
        if (fullItems.length > 0 && stockItems.length === 0) {
            console.log('[Report] No stock data, using full items with zero quantities');
            mergedItems = fullItems.map(fi => ({
                item_id: fi.item_id || '-',
                item_name: fi.item_name || 'غير معروف',
                category: fi.category || 'غير مصنف',
                unit: fi.unit || 'قطعة',
                current_quantity: 0,
                min_order_qty: fi.min_order_qty || 0,
                unit_price: parseFloat(fi.unit_price || 0),
            }));
        } else if (stockItems.length > 0) {
            // Merge stock with full item details
            mergedItems = mergeStockWithItems(stockItems, fullItems);
        }

        // If still empty, fall back to the cached items list (a real fetch
        // from earlier in the session), never to invented data.
        if (mergedItems.length === 0 && allItems.length > 0) {
            console.log('[Report] Using cached allItems');
            mergedItems = allItems;
        }

    } catch (e) {
        console.error('[Report] Error loading stock report:', e);
        apiError = e.message || 'حدث خطأ أثناء جلب بيانات المخزون';
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateStockReport ignored');
        return;
    }

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

    renderStockTable(mergedItems, apiError);
    if (apiError) showToast(apiError, 'error');
}

function mergeStockWithItems(stockItems, fullItems) {
    // Handle non-array inputs
    if (!Array.isArray(stockItems)) stockItems = [];
    if (!Array.isArray(fullItems)) fullItems = [];

    return stockItems.map(stockItem => {
        // Find matching full item by item_id (handle both string and number IDs)
        const fullItem = fullItems.find(fi =>
            String(fi.item_id) === String(stockItem.item_id)
        ) || {};

        return {
            item_id: stockItem.item_id || fullItem.item_id || '-',
            item_name: stockItem.item_name || fullItem.item_name || 'غير معروف',
            category: fullItem.category || stockItem.category || 'غير مصنف',
            unit: stockItem.unit || fullItem.unit || 'قطعة',
            current_quantity: stockItem.current_quantity ?? 0,
            min_order_qty: stockItem.min_order_qty ?? fullItem.min_order_qty ?? 0,
            unit_price: parseFloat(fullItem.unit_price || stockItem.unit_price || 0),
        };
    });
}

function renderStockTable(items, errorMessage = null) {
    const tbody = document.getElementById('reportTableBody');
    currentReportData = [];
    if (!items || items.length === 0) {
        tbody.innerHTML = reportMessageRow(9, errorMessage || 'لا توجد أصناف مسجلة بعد', !!errorMessage);
        updateStats(0, '0 د.ل');
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

        const catClass = getCategoryClass(item.category);
        const statusClass = isLow ? 'status-low' : 'status-available';
        const statusText = isLow ? 'منخفض' : 'متوفر';

        return `<tr>
            <td><span class="item-id">${item.item_id || '-'}</span></td>
            <td style="font-weight: 700;">${item.item_name || 'غير معروف'}</td>
            <td><span class="badge-category ${catClass}">${item.category || 'غير مصنف'}</span></td>
            <td>${item.unit || 'قطعة'}</td>
            <td class="td-number">${fmtNumber(qty, 0)}</td>
            <td class="td-number">${fmtNumber(minQty, 0)}</td>
            <td class="td-price">${fmtNumber(price)} د.ل</td>
            <td class="td-price">${fmtNumber(value)} د.ل</td>
            <td><span class="badge-status ${statusClass}">${statusText}</span></td>
        </tr>`;
    }).join('');

    updateStats(items.length, fmtNumber(totalValue) + ' د.ل');
}

async function generateItemsBaseReport(expectedId) {
    let items = [];
    let apiError = null;
    try {
        items = await window.api.getItems();
        if (items && items.success === false) {
            console.warn('[Report] getItems returned error:', items.message);
            apiError = items.message || 'تعذّر جلب بيانات الأصناف';
            items = [];
        }
        if (!Array.isArray(items)) {
            console.warn('[Report] getItems did not return array:', items);
            items = [];
        }
    } catch (e) {
        console.error('[Report] Error loading items base report:', e);
        apiError = e.message || 'حدث خطأ أثناء جلب بيانات الأصناف';
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateItemsBaseReport ignored');
        return;
    }

    if (!apiError && (!items || items.length === 0) && allItems.length > 0) {
        items = allItems; // نسخة مخزّنة من جلب سابق ناجح، وليست بيانات وهمية
    }

    setReportMeta('دليل الأصناف الأساسي', 'بيانات الأصناف الأساسية بدون كميات أو قيم');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true },
        { text: 'اسم الصنف', sortable: true },
        { text: 'الوحدة', sortable: true },
        { text: 'التصنيف', sortable: true },
        { text: 'الحد الأدنى', sortable: true }
    ]);
    renderItemsBaseTable(items, apiError);
    if (apiError) showToast(apiError, 'error');
}

function renderItemsBaseTable(items, errorMessage = null) {
    const tbody = document.getElementById('reportTableBody');
    currentReportData = items || [];
    if (!items || items.length === 0) {
        tbody.innerHTML = reportMessageRow(5, errorMessage || 'لا توجد أصناف مسجلة بعد', !!errorMessage);
        updateStats(0, '0 صنف');
        return;
    }
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

async function generateInventoryCountReport(expectedId) {
    let items = [];
    let apiError = null;
    try {
        items = await window.api.getStock();
        if (items && items.success === false) {
            console.warn('[Report] getStock returned error:', items.message);
            apiError = items.message || 'تعذّر جلب بيانات المخزون';
            items = [];
        }
        if (!Array.isArray(items)) {
            console.warn('[Report] getStock did not return array:', items);
            items = [];
        }
    } catch (e) {
        console.error('[Report] Error loading inventory count report:', e);
        apiError = e.message || 'حدث خطأ أثناء جلب بيانات المخزون';
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateInventoryCountReport ignored');
        return;
    }

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
    renderInventoryCountTable(items, apiError);
    if (apiError) showToast(apiError, 'error');
}

function renderInventoryCountTable(items, errorMessage = null) {
    const tbody = document.getElementById('reportTableBody');
    currentReportData = items || [];
    if (!items || items.length === 0) {
        tbody.innerHTML = reportMessageRow(7, errorMessage || 'لا توجد أصناف في المخزون بعد', !!errorMessage);
        updateStats(0, 'جرد حسب الفعلي');
        return;
    }
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

async function generateSupplyReceiptReport(expectedId) {
    setReportMeta('إذن توريد', 'اختر إذن توريد من القائمة أعلاه لعرض تفاصيله');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true },
        { text: 'اسم الصنف', sortable: true },
        { text: 'الوحدة', sortable: true },
        { text: 'الكمية', sortable: true },
        { text: 'سعر الوحدة', sortable: true },
        { text: 'الإجمالي', sortable: true }
    ]);

    const receiptId = document.getElementById('receiptSelect')?.value;
    if (!receiptId) {
        if (reportGenerationId !== expectedId) return;
        currentReportData = [];
        document.getElementById('reportTableBody').innerHTML =
            reportMessageRow(6, 'اختر إذن توريد من القائمة أعلاه لعرض تفاصيله');
        updateStats(0, '-');
        return;
    }

    let receipt = null;
    let apiError = null;
    try {
        const result = await window.api.getSupplyReceipt(parseInt(receiptId, 10));
        if (result && result.success) {
            receipt = result.receipt;
        } else {
            apiError = (result && result.message) || 'تعذّر جلب بيانات الإذن';
        }
    } catch (e) {
        console.error('[Report] Error loading supply receipt:', e);
        apiError = 'حدث خطأ أثناء جلب بيانات الإذن';
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateSupplyReceiptReport ignored');
        return;
    }

    if (apiError || !receipt) {
        currentReportData = [];
        document.getElementById('reportTableBody').innerHTML = reportMessageRow(6, apiError || 'تعذّر جلب بيانات الإذن', true);
        updateStats(0, '-');
        if (apiError) showToast(apiError, 'error');
        return;
    }

    renderSupplyReceipt(receipt);
}

function renderSupplyReceipt(receipt) {
    const tbody = document.getElementById('reportTableBody');
    const items = receipt.items || [];
    currentReportData = items;
    let totalValue = 0;
    const rows = items.map(item => {
        const lineTotal = (item.quantity || 0) * (item.price || 0);
        totalValue += lineTotal;
        return `<tr>
            <td><span class="item-id">${item.item_id}</span></td>
            <td style="font-weight: 600;">${escapeHtml(item.item_name)}</td>
            <td>${escapeHtml(item.unit)}</td>
            <td style="font-weight: 700;">${item.quantity}</td>
            <td>${(item.price || 0).toLocaleString('ar-LY', {minimumFractionDigits: 2})} د.ل</td>
            <td style="font-weight: 600;">${lineTotal.toLocaleString('ar-LY', {minimumFractionDigits: 2})} د.ل</td>
        </tr>`;
    }).join('');

    const dateStr = receipt.date ? new Date(receipt.date).toLocaleDateString('ar-LY') : '-';

    tbody.innerHTML = `
        <tr><td colspan="6" style="padding: 16px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color);">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 13px;">
                <div><strong>رقم الحركة:</strong> إذن-توريد-#${receipt.transaction_id}</div>
                <div><strong>التاريخ:</strong> ${dateStr}</div>
                <div><strong>المورد:</strong> ${escapeHtml(receipt.supplier || 'غير محدد')}</div>
                <div><strong>المخزن:</strong> ${escapeHtml(receipt.store || 'غير محدد')}</div>
                <div style="grid-column: span 2;"><strong>ملاحظات:</strong> ${escapeHtml(receipt.notes || '-')}</div>
            </div>
        </td></tr>
        ${rows}
        <tr><td colspan="6" style="padding: 0; border: none;">
            <div class="print-grand-total">
                <span>إجمالي قيمة الإذن</span>
                <span class="total-value">${totalValue.toLocaleString('ar-LY', {minimumFractionDigits: 2})} د.ل</span>
            </div>
            ${PrintSignatures.html(['المورد', 'أمين المخزن', 'مدير الإدارة / الاعتماد'])}
        </td></tr>
    `;
    updateStats(items.length, totalValue.toLocaleString('ar-LY', {minimumFractionDigits: 2}) + ' د.ل');
}

async function generateDispenseReceiptReport(expectedId) {
    setReportMeta('إذن صرف مخزني', 'اختر إذن صرف من القائمة أعلاه لعرض تفاصيله');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true },
        { text: 'اسم الصنف', sortable: true },
        { text: 'الوحدة', sortable: true },
        { text: 'الكمية المصروفة', sortable: true }
    ]);

    const receiptId = document.getElementById('receiptSelect')?.value;
    if (!receiptId) {
        if (reportGenerationId !== expectedId) return;
        currentReportData = [];
        document.getElementById('reportTableBody').innerHTML =
            reportMessageRow(4, 'اختر إذن صرف من القائمة أعلاه لعرض تفاصيله');
        updateStats(0, '-');
        return;
    }

    let receipt = null;
    let apiError = null;
    try {
        const result = await window.api.getDispenseReceipt(parseInt(receiptId, 10));
        if (result && result.success) {
            receipt = result.receipt;
        } else {
            apiError = (result && result.message) || 'تعذّر جلب بيانات الإذن';
        }
    } catch (e) {
        console.error('[Report] Error loading dispense receipt:', e);
        apiError = 'حدث خطأ أثناء جلب بيانات الإذن';
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateDispenseReceiptReport ignored');
        return;
    }

    if (apiError || !receipt) {
        currentReportData = [];
        document.getElementById('reportTableBody').innerHTML = reportMessageRow(4, apiError || 'تعذّر جلب بيانات الإذن', true);
        updateStats(0, '-');
        if (apiError) showToast(apiError, 'error');
        return;
    }

    renderDispenseReceipt(receipt);
}

function renderDispenseReceipt(receipt) {
    const tbody = document.getElementById('reportTableBody');
    const items = receipt.items || [];
    currentReportData = items;
    const rows = items.map(item => `
        <tr>
            <td><span class="item-id">${item.item_id}</span></td>
            <td style="font-weight: 600;">${escapeHtml(item.item_name)}</td>
            <td>${escapeHtml(item.unit)}</td>
            <td style="font-weight: 700; color: var(--danger);">- ${item.quantity}</td>
        </tr>
    `).join('');

    const dateStr = receipt.date ? new Date(receipt.date).toLocaleDateString('ar-LY') : '-';

    tbody.innerHTML = `
        <tr><td colspan="4" style="padding: 16px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color);">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 13px;">
                <div><strong>رقم الحركة:</strong> إذن-صرف-#${receipt.transaction_id}</div>
                <div><strong>التاريخ:</strong> ${dateStr}</div>
                <div><strong>الجهة الطالبة:</strong> ${escapeHtml(receipt.requester || 'غير محدد')}</div>
                <div><strong>المخزن:</strong> ${escapeHtml(receipt.store || 'غير محدد')}</div>
                <div style="grid-column: span 2;"><strong>سبب الصرف:</strong> ${escapeHtml(receipt.reason || '-')}</div>
            </div>
        </td></tr>
        ${rows}
        <tr><td colspan="4" style="padding: 0; border: none;">
            <div class="print-grand-total">
                <span>عدد الأصناف المصروفة</span>
                <span class="total-value">${items.length} صنف</span>
            </div>
            ${PrintSignatures.html(['المستلم (الجهة الطالبة)', 'أمين المخزن', 'مدير الإدارة / الاعتماد'])}
        </td></tr>
    `;
    updateStats(items.length, items.length + ' صنف');
}

async function generateLowStockReport(expectedId) {
    let items = [];
    let apiError = null;
    try {
        items = await window.api.getStock();
        if (items && items.success === false) {
            console.warn('[Report] getStock returned error:', items.message);
            apiError = items.message || 'تعذّر جلب بيانات المخزون';
            items = [];
        }
        if (!Array.isArray(items)) {
            console.warn('[Report] getStock did not return array:', items);
            items = [];
        }
    } catch (e) {
        console.error('[Report] Error loading low stock report:', e);
        apiError = e.message || 'حدث خطأ أثناء جلب بيانات المخزون';
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateLowStockReport ignored');
        return;
    }

    setReportMeta('الأصناف منخفضة الرصيد', 'أصناف وصلت أو قاربت على الحد الأدنى');
    setTableHeaders([
        { text: 'رقم الصنف', sortable: true }, { text: 'اسم الصنف', sortable: true },
        { text: 'التصنيف', sortable: true }, { text: 'الوحدة', sortable: true },
        { text: 'الرصيد الحالي', sortable: true }, { text: 'الحد الأدنى', sortable: true },
        { text: 'النقص', sortable: true }, { text: 'الحالة', sortable: true }
    ]);
    // صفر أصناف منخفضة هو النتيجة الجيدة، وليس فشلاً — لا يجوز أن يبدوا متطابقين
    const low = items.filter(i => (i.current_quantity || 0) <= (i.min_order_qty || 0));
    renderLowStockTable(low, apiError);
    if (apiError) showToast(apiError, 'error');
}

function renderLowStockTable(items, errorMessage = null) {
    const tbody = document.getElementById('reportTableBody');
    currentReportData = items || [];
    if (!items || items.length === 0) {
        tbody.innerHTML = reportMessageRow(8, errorMessage || 'لا توجد أصناف منخفضة الرصيد حالياً', !!errorMessage);
        updateStats(0, '0 صنف');
        return;
    }
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

async function generateMovementsReport(expectedId, dateFrom, dateTo) {
    let transactions = [];
    let apiError = null;
    try {
        transactions = await window.api.getTransactionsHistory({ includeVoided: shouldIncludeVoided() });
        if (transactions && transactions.success === false) {
            apiError = transactions.message || 'حدث خطأ في جلب سجل الحركات';
            transactions = [];
        }
        if (!Array.isArray(transactions)) {
            console.warn('[Report] getTransactionsHistory did not return array:', transactions);
            transactions = [];
        }
    } catch (e) {
        console.error('[Report] Error loading movements report:', e);
        apiError = e.message || 'حدث خطأ أثناء جلب سجل الحركات';
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateMovementsReport ignored');
        return;
    }

    setReportMeta('حركات التوريد والصرف', `الفترة: ${dateFrom} إلى ${dateTo}`);
    setTableHeaders([
        { text: 'رقم الحركة', sortable: true }, { text: 'النوع', sortable: true },
        { text: 'التاريخ', sortable: true }, { text: 'الجهة / المورد', sortable: true },
        { text: 'المخزن', sortable: true }, { text: 'القيمة', sortable: true },
        { text: 'إجراء', sortable: false }
    ]);

    renderMovementsTable(transactions, apiError);
    if (apiError) showToast(apiError, 'error');
}

function shouldIncludeVoided() {
    const toggle = document.getElementById('includeVoided');
    return !!(toggle && toggle.checked);
}

function renderMovementsTable(transactions, errorMessage = null) {
    const tbody = document.getElementById('reportTableBody');
    currentReportData = transactions || [];
    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = reportMessageRow(7, errorMessage || 'لا توجد حركات مسجلة بعد', !!errorMessage);
        updateStats(0, '0 د.ل');
        return;
    }
    let totalValue = 0;
    tbody.innerHTML = transactions.map(t => {
        const isSupply = t.transaction_type === 'In';
        const isVoided = t.is_deleted === 1;
        const typeBadge = isSupply ? '<span class="badge badge-supply"><i class="fas fa-arrow-down"></i> توريد</span>' : '<span class="badge badge-dispense"><i class="fas fa-arrow-up"></i> صرف</span>';
        const dateStr = new Date(t.transaction_date).toLocaleDateString('ar-LY');
        const val = t.total_value || 0;
        // الأذونات الملغاة لا تُحتسب في إجمالي القيمة — هي خارج الدفتر أصلاً
        if (!isVoided) totalValue += val;

        // الحالة لا تُنقل باللون وحده: شارة نصية + أيقونة (PRODUCT.md)
        const actionCell = isVoided
            ? `<span class="badge badge-low"><i class="fas fa-ban"></i> ملغى</span>
               <div class="void-reason">${escapeHtml(t.void_reason || '')}</div>`
            : `<button type="button" class="btn btn-sm btn-danger"
                       onclick="voidTransactionRow(${t.transaction_id})">إلغاء الإذن</button>`;

        return `<tr${isVoided ? ' class="row-voided"' : ''}>
            <td style="font-weight: 600; font-family: monospace;">#${t.transaction_id || '-'}</td>
            <td>${typeBadge}</td>
            <td>${dateStr}</td>
            <td>${escapeHtml(t.entity_name || 'غير محدد')}</td>
            <td>${escapeHtml(t.store_name || 'المخزن الرئيسي')}</td>
            <td style="font-weight: 600;">${val.toLocaleString('ar-LY', {minimumFractionDigits: 2})} د.ل</td>
            <td class="no-print">${actionCell}</td>
        </tr>`;
    }).join('');
    updateStats(transactions.length, totalValue.toLocaleString('ar-LY', {minimumFractionDigits: 2}) + ' د.ل');
}

// إلغاء إذن: إجراء مدمّر (يُعيد احتساب الأرصدة)، فيمر ببوابة كلمة المرور
// نفسها المستخدمة في النسخ الاحتياطي والاسترجاع.
async function voidTransactionRow(transactionId) {
    const reason = await promptForText({
        title: 'إلغاء إذن',
        message: `سيتم إلغاء الإذن رقم #${transactionId} وإعادة احتساب الأرصدة. لا يمكن التراجع عن هذا الإجراء — التصحيح يتم بإعادة إدخال الإذن.`,
        label: 'سبب الإلغاء (مطلوب)',
        placeholder: 'مثال: أُدخل الإذن بكمية خاطئة'
    });

    if (reason === null) return; // أُلغي من المستخدم

    if (!reason.trim()) {
        showToast('يجب إدخال سبب الإلغاء', 'error');
        return;
    }

    promptForPassword(async () => {
        try {
            const session = checkSession();
            const result = await window.api.voidTransaction({
                transactionId,
                reason,
                voidedBy: session ? session.userId : null
            });

            if (result && result.success) {
                showToast(result.message, 'success');
                generateReport(); // إعادة التحميل لتعكس الأرصدة الجديدة
            } else {
                showToast((result && result.message) || 'تعذّر إلغاء الإذن', 'error');
            }
        } catch (error) {
            console.error('خطأ في إلغاء الإذن:', error);
            showToast('حدث خطأ أثناء إلغاء الإذن', 'error');
        }
    });
}

async function generateItemCardReport(expectedId) {
    const itemSelect = document.getElementById('itemSelect');
    const itemId = itemSelect ? itemSelect.value : '';

    if (!itemId) {
        if (reportGenerationId !== expectedId) {
            console.log('[Report] Stale generateItemCardReport ignored');
            return;
        }
        setReportMeta('بطاقة حركة صنف', 'تفاصيل حركات صنف محدد');
        setTableHeaders([
            { text: 'التاريخ', sortable: true }, { text: 'نوع الحركة', sortable: true },
            { text: 'رقم الحركة', sortable: true }, { text: 'الجهة', sortable: true },
            { text: 'الكمية', sortable: true }, { text: 'الرصيد', sortable: true }
        ]);
        document.getElementById('reportTableBody').innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">اختر صنفاً من القائمة أعلاه ثم اضغط طباعة التقرير</td></tr>';
        updateStats(0, '-');
        currentReportData = [];
        return;
    }

    let movements = [];
    try {
        movements = await window.api.getItemTransactions(parseInt(itemId, 10));
        if (movements && movements.success === false) {
            console.warn('[Report] getItemTransactions error:', movements.message);
            movements = [];
        }
        if (!Array.isArray(movements)) {
            console.warn('[Report] getItemTransactions did not return array:', movements);
            movements = [];
        }
    } catch (e) {
        console.error('[Report] Error loading item card report:', e);
        movements = [];
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateItemCardReport ignored');
        return;
    }

    setReportMeta('بطاقة حركة صنف', 'تفاصيل حركات صنف محدد');
    setTableHeaders([
        { text: 'التاريخ', sortable: true }, { text: 'نوع الحركة', sortable: true },
        { text: 'رقم الحركة', sortable: true }, { text: 'الجهة', sortable: true },
        { text: 'الكمية', sortable: true }, { text: 'الرصيد', sortable: true }
    ]);
    renderItemCardTable(movements);
}

function renderItemCardTable(movements) {
    const tbody = document.getElementById('reportTableBody');
    currentReportData = movements;

    if (!movements || movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">لا توجد حركات مسجلة لهذا الصنف</td></tr>';
        updateStats(0, '-');
        return;
    }

    tbody.innerHTML = movements.map(m => {
        const dateStr = m.transaction_date ? new Date(m.transaction_date).toLocaleDateString('ar-LY') : '-';
        const typeText = m.transaction_type === 'In' ? 'توريد' : m.transaction_type === 'Out' ? 'صرف' : 'رصيد افتتاحي';
        const typeClass = m.transaction_type === 'In' ? 'badge-supply' : 'badge-dispense';
        return `<tr>
            <td>${dateStr}</td>
            <td><span class="badge ${typeClass}">${typeText}</span></td>
            <td style="font-weight: 600; font-family: monospace;">#${m.transaction_id || '-'}</td>
            <td>${m.entity_name || '-'}</td>
            <td style="font-weight: 700;">${m.quantity || 0}</td>
            <td style="font-weight: 700;">${m.running_balance || 0}</td>
        </tr>`;
    }).join('');
    updateStats(movements.length, movements.length + ' حركة');
}

async function generateSuppliersReport(expectedId) {
    let entities = [];
    let apiError = null;
    try {
        entities = await window.api.getAllEntities();
        if (entities && entities.success === false) {
            console.warn('[Report] getAllEntities returned error:', entities.message);
            apiError = entities.message || 'تعذّر جلب قائمة الجهات';
            entities = [];
        }
        if (!Array.isArray(entities)) {
            console.warn('[Report] getAllEntities did not return array:', entities);
            entities = [];
        }
    } catch (e) {
        console.error('[Report] Error loading suppliers report:', e);
        apiError = e.message || 'حدث خطأ أثناء جلب قائمة الجهات';
    }

    if (reportGenerationId !== expectedId) {
        console.log('[Report] Stale generateSuppliersReport ignored');
        return;
    }

    setReportMeta('دليل الموردين والجهات', 'قائمة الموردين والجهات المسجلة');
    setTableHeaders([
        { text: 'الكود', sortable: true }, { text: 'الاسم', sortable: true },
        { text: 'النوع', sortable: true }, { text: 'رقم الهاتف', sortable: true },
        { text: 'العنوان', sortable: true }
    ]);

    renderSuppliersTable(entities, apiError);
    if (apiError) showToast(apiError, 'error');
}

function renderSuppliersTable(entities, errorMessage = null) {
    const tbody = document.getElementById('reportTableBody');
    currentReportData = entities || [];
    if (!entities || entities.length === 0) {
        tbody.innerHTML = reportMessageRow(5, errorMessage || 'لا توجد جهات مسجلة بعد', !!errorMessage);
        updateStats(0, '0 جهة');
        return;
    }
    tbody.innerHTML = entities.map(e => {
        const typeBadge = e.entity_type === 'Supplier' ? '<span class="badge badge-supplier">مورد</span>' : '<span class="badge badge-dept">جهة</span>';
        return `<tr>
            <td><span class="item-id">${e.code || e.entity_id}</span></td>
            <td style="font-weight: 600;">${escapeHtml(e.entity_name)}</td>
            <td>${typeBadge}</td>
            <td>${escapeHtml(e.phone || '-')}</td>
            <td>${escapeHtml(e.address || '-')}</td>
        </tr>`;
    }).join('');
    updateStats(entities.length, entities.length + ' جهة');
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
// كانت هذه الدالة تستخدم window.prompt، وهو غير مُنفّذ في Electron أصلاً:
// يعود بلا شيء بصمت، فكان الزر يبدو عاملاً ولا يحفظ شيئاً على الإطلاق.
async function saveColumnsPreset() {
    const name = await promptForText({
        title: 'حفظ إعداد الأعمدة',
        label: 'اسم الإعداد',
        placeholder: 'مثال: تقرير الجرد المختصر'
    });
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
        if (items && items.success === false) {
            console.warn('[Report] loadReportData getItems error:', items.message);
            showToast(items.message || 'تعذّر جلب قائمة الأصناف', 'error');
            allItems = [];
        } else if (Array.isArray(items)) {
            allItems = items;
        } else {
            allItems = [];
        }
    } catch (error) {
        console.error('[Report] loadReportData error:', error);
        showToast('حدث خطأ أثناء جلب قائمة الأصناف', 'error');
        allItems = [];
    }

    // Populate item select dropdown
    const select = document.getElementById('itemSelect');
    if (select) {
        select.innerHTML = '<option value="">اختر صنفاً</option>' +
            allItems.map(item => `<option value="${item.item_id}">${escapeHtml(item.item_name)}</option>`).join('');
    }

    // Render the report that matches the currently selected report type
    await generateReport();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeColumnsModal();
    }
});
