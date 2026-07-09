/**
 * Supply Receipt Page Logic
 * Handles supply receipt creation, row management, save, and print.
 */

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();
});

let allItems = [];
let receiptRows = [];

window.addEventListener('DOMContentLoaded', async () => {
    // تعيين تاريخ اليوم كافتراضي
    document.getElementById('receiptDate').valueAsDate = new Date();
    document.getElementById('receiptDate').max = new Date().toISOString().split('T')[0];

    // جلب البيانات من قاعدة البيانات لتعبئة القوائم المنسدلة
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
        const storeFragment = document.createDocumentFragment();
        stores.forEach(s => {
            const option = document.createElement('option');
            option.value = s.store_id;
            option.textContent = s.store_name;
            storeFragment.appendChild(option);
        });
        storeSelect.appendChild(storeFragment);

        // تعبئة الموردين
        const supplierSelect = document.getElementById('supplierSelect');
        const supplierFragment = document.createDocumentFragment();
        suppliers.forEach(sup => {
            const option = document.createElement('option');
            option.value = sup.entity_id;
            option.textContent = sup.entity_name;
            supplierFragment.appendChild(option);
        });
        supplierSelect.appendChild(supplierFragment);

        // تعبئة الأصناف
        const itemSelect = document.getElementById('itemSelect');
        const itemFragment = document.createDocumentFragment();
        allItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.item_id;
            option.textContent = item.item_name + ' (' + item.unit + ')';
            itemFragment.appendChild(option);
        });
        itemSelect.appendChild(itemFragment);

    } catch (error) {
        console.error("خطأ في التحميل الأولي", error);
        alert("حدث خطأ في جلب البيانات الأساسية.");
    }
});

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
            document.getElementById('successMessage').textContent = result.message;
            openPrintModal();
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
    closePrintModal();
    if (choice === 'direct') {
        const dateEl = document.getElementById('printReceiptDate');
        if (dateEl) dateEl.textContent = 'تاريخ الطباعة: ' + new Date().toLocaleDateString('ar-LY');

        const dateValueEl = document.getElementById('printReceiptDateValue');
        if (dateValueEl) dateValueEl.textContent = document.getElementById('receiptDate').value || '-';

        const countEl = document.getElementById('printItemCount');
        if (countEl) countEl.textContent = receiptRows.length.toString();

        const sel = document.getElementById('itemsSel');
        const sel2 = document.getElementById('rem2');
        sel.style.display  = "none";
        sel2.style.display = "none";
        window.print();
        sel.style.display  = "block";
        sel2.style.display = "block";
    }
    setTimeout(() => resetForm(), 1000);
}

function openPrintModal() {
    const modal = document.getElementById('printModal');
    modal.hidden = false;
    modal.classList.add('active');
    document.getElementById('printModalTitle').focus();
}

function closePrintModal() {
    const modal = document.getElementById('printModal');
    modal.hidden = true;
    modal.classList.remove('active');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closePrintModal();
    }
});
