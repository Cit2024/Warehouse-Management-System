/**
 * Supply Receipt Page Logic
 * Handles supply receipt creation, row management, save, and print.
 */

let printLayout;
let printModal;

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();

    printLayout = new PrintLayout({
        layout: 'receipt',
        title: 'إذن توريد',
        subtitle: 'Supply Receipt',
        summaryItems: [
            { id: 'printItemCount', label: 'عدد الأصناف', defaultValue: '0' },
            { id: 'printReceiptDateValue', label: 'تاريخ التوريد', defaultValue: '-' }
        ]
    });

    printModal = new PrintModal({
        title: 'تم اعتماد إذن التوريد',
        onPrint: () => executePrint('direct')
    });
});

let allItems = [];
let receiptRows = [];

window.addEventListener('DOMContentLoaded', async () => {
    // تعيين تاريخ اليوم كافتراضي
    document.getElementById('receiptDate').valueAsDate = new Date();
    document.getElementById('receiptDate').max = new Date().toISOString().split('T')[0];

    // جلب البيانات من قاعدة البيانات لتعبئة القوائم المنسدلة
    await loadDropdownData();
});

async function loadDropdownData() {
    try {
        const stores = await window.api.getStores();
        if (stores && stores.success === false) {
            showToast(stores.message || 'حدث خطأ في جلب المخازن', 'error');
            return;
        }

        const suppliers = await window.api.getSuppliers();
        if (suppliers && suppliers.success === false) {
            showToast(suppliers.message || 'حدث خطأ في جلب الموردين', 'error');
            return;
        }

        allItems = await window.api.getItems(); // جلبنا الأصناف المعرفة مسبقاً
        if (allItems && allItems.success === false) {
            showToast(allItems.message || 'حدث خطأ في جلب الأصناف', 'error');
            allItems = [];
            return;
        }

        // تعبئة المخازن
        const storeSelect = document.getElementById('storeSelect');
        const previousStore = storeSelect.value;
        storeSelect.innerHTML = '<option value="">-- اختر المخزن --</option>';
        stores.forEach(s => {
            const option = document.createElement('option');
            option.value = s.store_id;
            option.textContent = s.store_name;
            storeSelect.appendChild(option);
        });
        storeSelect.value = previousStore;

        // تعبئة الموردين
        const supplierSelect = document.getElementById('supplierSelect');
        const previousSupplier = supplierSelect.value;
        supplierSelect.innerHTML = '<option value="">-- اختر المورد --</option>';
        suppliers.forEach(sup => {
            const option = document.createElement('option');
            option.value = sup.entity_id;
            option.textContent = sup.entity_name;
            supplierSelect.appendChild(option);
        });
        supplierSelect.value = previousSupplier;

        // تعبئة الأصناف
        const itemSelect = document.getElementById('itemSelect');
        const previousItem = itemSelect.value;
        itemSelect.innerHTML = '<option value="">-- اختر صنفاً لإضافته --</option>';
        allItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.item_id;
            option.textContent = item.item_name + ' (' + item.unit + ')';
            itemSelect.appendChild(option);
        });
        itemSelect.value = previousItem;

    } catch (error) {
        console.error("خطأ في التحميل الأولي", error);
        alert("حدث خطأ في جلب البيانات الأساسية.");
    }
}

function addRow() {
    const itemSelect = document.getElementById('itemSelect');
    const qtyInput = document.getElementById('itemQty');
    const priceInput = document.getElementById('itemPrice');

    const itemId = parseInt(itemSelect.value);
    const qty = parseFloat(qtyInput.value);
    const price = parseFloat(priceInput.value) || 0;

    if (!itemId || !qty || qty <= 0) {
        showToast('الرجاء اختيار صنف وإدخال كمية صحيحة', 'warning');
        return;
    }

    if (receiptRows.find(r => r.itemId === itemId)) {
        showToast('هذا الصنف مضاف مسبقاً', 'warning');
        return;
    }

    const selectedItem = allItems.find(i => i.item_id === itemId);
    receiptRows.push({ itemId, itemName: selectedItem.item_name, quantity: qty, price, total: qty * price });

    itemSelect.value = '';
    qtyInput.value = '';
    priceInput.value = '';
    renderTable();
}

function removeRow(itemId) {
    receiptRows = receiptRows.filter(r => r.itemId !== itemId);
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('receiptTableBody');
    if (receiptRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">لم تتم إضافة أصناف بعد</td></tr>';
        document.getElementById('grandTotal').textContent = '0.00';
        const screenTotal = document.getElementById('grandTotalScreen');
        if (screenTotal) screenTotal.textContent = '0.00';
        return;
    }

    let grandTotal = 0;
    tbody.innerHTML = receiptRows.map(row => {
        grandTotal += row.total;
        return `
            <tr>
                <td><span class="item-id">${row.itemId}</span></td>
                <td style="font-weight: 600;">${row.itemName}</td>
                <td style="font-weight: 700;">${row.quantity}</td>
                <td>${row.price.toFixed(2)} د.ل</td>
                <td style="font-weight: 600;">${row.total.toFixed(2)} د.ل</td>
                <td><button type="button" class="btn btn-sm btn-danger" onclick="removeRow(${row.itemId})">حذف</button></td>
            </tr>
        `;
    }).join('');

    document.getElementById('grandTotal').textContent = grandTotal.toFixed(2);
    const screenTotal = document.getElementById('grandTotalScreen');
    if (screenTotal) screenTotal.textContent = grandTotal.toFixed(2);
}

function resetForm() {
    document.getElementById('receiptDate').valueAsDate = new Date();
    document.getElementById('supplierSelect').value = '';
    document.getElementById('storeSelect').value = '';
    document.getElementById('receiptNotes').value = '';
    document.getElementById('itemSelect').value = '';
    document.getElementById('itemQty').value = '';
    document.getElementById('itemPrice').value = '';
    receiptRows = [];
    renderTable();
}

async function saveReceipt() {
    const saveBtn = document.querySelector('.btn-success[type="submit"]');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span><i class="fas fa-spinner fa-spin"></i></span> <span>جاري الحفظ...</span>';

    const receiptDate = document.getElementById('receiptDate').value;
    const supplierId = document.getElementById('supplierSelect').value;
    const storeId = document.getElementById('storeSelect').value;
    const notes = document.getElementById('receiptNotes').value.trim();

    if (!receiptDate || !supplierId || !storeId) {
        showToast('الرجاء تعبئة كافة البيانات الأساسية', 'warning');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        return;
    }
    if (receiptRows.length === 0) {
        showToast('لا يمكن حفظ إذن توريد فارغ', 'warning');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        return;
    }

    try {
        const session = JSON.parse(localStorage.getItem('userSession'));
        const result = await window.api.saveSupplyReceipt({
            date: receiptDate + ' 00:00:00',
            supplierId: parseInt(supplierId),
            storeId: parseInt(storeId),
            notes,
            createdBy: session ? session.userId : 1,
            items: receiptRows
        });

        if (result.success) {
            // تحديث القوائم المنسدلة لتعكس الكميات الجديدة قبل فتح نافذة الطباعة
            await loadDropdownData();
            printModal.open(result.message);
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('حدث خطأ أثناء الحفظ', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

function executePrint(choice) {
    if (choice === 'direct') {
        const supplierSelect = document.getElementById('supplierSelect');
        const storeSelect = document.getElementById('storeSelect');
        const notesInput = document.getElementById('receiptNotes');

        const supplierName = supplierSelect.options[supplierSelect.selectedIndex]?.text || '-';
        const storeName = storeSelect.options[storeSelect.selectedIndex]?.text || '-';
        const notes = notesInput.value.trim();

        const receiptData = {
            supplier: supplierName,
            store: storeName,
            notes: notes,
            items: receiptRows.map(row => {
                const fullItem = allItems.find(i => i.item_id === row.itemId) || {};
                return {
                    item_id: row.itemId,
                    item_name: row.itemName,
                    unit: row.unit || fullItem.unit,
                    quantity: row.qty,
                    price: row.price
                };
            })
        };

        window.printReport.printReceipt(receiptData, { type: 'supply' });
    }
    setTimeout(() => resetForm(), 1000);
}

function escapePrintHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/\u0026/g, '&amp;')
        .replace(/\u003c/g, '&lt;')
        .replace(/\u003e/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
