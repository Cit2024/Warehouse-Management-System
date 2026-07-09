/**
 * Dispense Receipt Page Logic
 * Handles dispense receipt creation, stock badge, row management, save, and print.
 */

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();
});

let availableStock = [];
let receiptRows = [];

window.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('receiptDate').valueAsDate = new Date();
    document.getElementById('receiptDate').max = new Date().toISOString().split('T')[0];

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePrintModal();
        }
    });

    try {
        const stores = await window.api.getStores();
        if (stores && stores.success === false) {
            showToast(stores.message || 'حدث خطأ في جلب المخازن', 'error');
            return;
        }

        const requesters = await window.api.getRequesters();
        if (requesters && requesters.success === false) {
            showToast(requesters.message || 'حدث خطأ في جلب الجهات الطالبة', 'error');
            return;
        }

        availableStock = await window.api.getStock(); // نجلب الأصناف التي لها رصيد فقط
        if (availableStock && availableStock.success === false) {
            showToast(availableStock.message || 'حدث خطأ في جلب الأرصدة', 'error');
            return;
        }

        const storeSelect = document.getElementById('storeSelect');
        const storeFragment = document.createDocumentFragment();
        stores.forEach(s => {
            const option = document.createElement('option');
            option.value = s.store_id;
            option.textContent = s.store_name;
            storeFragment.appendChild(option);
        });
        storeSelect.appendChild(storeFragment);

        const requesterSelect = document.getElementById('requesterSelect');
        const requesterFragment = document.createDocumentFragment();
        requesters.forEach(req => {
            const option = document.createElement('option');
            option.value = req.entity_id;
            option.textContent = req.entity_name + ' (' + (req.entity_type === 'Department' ? 'قسم' : 'موظف') + ')';
            requesterFragment.appendChild(option);
        });
        requesterSelect.appendChild(requesterFragment);

        const itemSelect = document.getElementById('itemSelect');
        const itemFragment = document.createDocumentFragment();
        availableStock.forEach(item => {
            const option = document.createElement('option');
            option.value = item.item_id;
            option.textContent = item.item_name + ' (' + item.unit + ')';
            itemFragment.appendChild(option);
        });
        itemSelect.appendChild(itemFragment);

    } catch (error) {
        console.error(error);
        alert("حدث خطأ في جلب البيانات.");
    }
});

function updateStockBadge() {
    const itemId = parseInt(document.getElementById('itemSelect').value);
    const badge = document.getElementById('stockBadge');
    if (!itemId) { badge.textContent = "المتاح: 0"; return; }
    const item = availableStock.find(i => i.item_id === itemId);
    badge.textContent = `المتاح: ${item.current_quantity} ${item.unit}`;
    document.getElementById('itemQty').max = item.current_quantity;
}

function addRow() {
    const itemSelect = document.getElementById('itemSelect');
    const qtyInput = document.getElementById('itemQty');
    const itemId = parseInt(itemSelect.value);
    const qty = parseFloat(qtyInput.value);

    if (!itemId || !qty || qty <= 0) { showToast('الرجاء اختيار صنف وإدخال كمية صحيحة', 'warning'); return; }

    const itemData = availableStock.find(i => i.item_id === itemId);
    if (qty > itemData.current_quantity) { showToast(`الكمية المتاحة (${itemData.current_quantity}) لا تكفي`, 'error'); return; }
    if (receiptRows.find(r => r.itemId === itemId)) { showToast('هذا الصنف مضاف مسبقاً', 'warning'); return; }

    receiptRows.push({ itemId, itemName: itemData.item_name, quantity: qty });
    itemSelect.value = ''; qtyInput.value = ''; updateStockBadge(); renderTable();
}

function removeRow(itemId) { receiptRows = receiptRows.filter(r => r.itemId !== itemId); renderTable(); }

function renderTable() {
    const tbody = document.getElementById('receiptTableBody');
    if (receiptRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 32px; color: var(--text-muted);">لم تتم إضافة أصناف بعد</td></tr>';
        return;
    }
    tbody.innerHTML = receiptRows.map(row => `
        <tr>
            <td><span class="item-id">${row.itemId}</span></td>
            <td style="font-weight: 600;">${row.itemName}</td>
            <td style="font-weight: 700; color: var(--danger);">- ${row.quantity}</td>
            <td><button type="button" class="btn btn-sm btn-danger" onclick="removeRow(${row.itemId})">حذف</button></td>
        </tr>
    `).join('');
}

function resetForm() {
    document.getElementById('receiptDate').valueAsDate = new Date();
    document.getElementById('requesterSelect').value = '';
    document.getElementById('storeSelect').value = '';
    document.getElementById('receiptNotes').value = '';
    document.getElementById('itemSelect').value = '';
    document.getElementById('itemQty').value = '';
    document.getElementById('stockBadge').textContent = 'المتاح: 0';
    receiptRows = [];
    renderTable();
}

async function saveReceipt() {
    const saveBtn = document.querySelector('.btn-success[type="submit"]');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

    const receiptDate = document.getElementById('receiptDate').value;
    const requesterId = document.getElementById('requesterSelect').value;
    const storeId = document.getElementById('storeSelect').value;
    const notes = document.getElementById('receiptNotes').value.trim();

    if (!receiptDate || !requesterId || !storeId) {
        showToast('الرجاء تعبئة كافة البيانات الأساسية', 'warning');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        return;
    }
    if (receiptRows.length === 0) {
        showToast('لا يمكن حفظ إذن صرف فارغ', 'warning');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        return;
    }

    try {
        const session = JSON.parse(localStorage.getItem('userSession'));
        const result = await window.api.saveDispenseReceipt({
            date: receiptDate + ' 00:00:00',
            requesterId: parseInt(requesterId), storeId: parseInt(storeId),
            notes, createdBy: session ? session.userId : 1,
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
