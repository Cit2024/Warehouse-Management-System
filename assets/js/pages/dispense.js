/**
 * Dispense Receipt Page Logic
 * Handles dispense receipt creation, stock badge, row management, save, and print.
 */

let printLayout;
let printModal;

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();

    printLayout = new PrintLayout({
        layout: 'receipt',
        title: 'إذن صرف',
        subtitle: 'Dispense Receipt',
        summaryItems: [
            { id: 'printItemCount', label: 'عدد الأصناف', defaultValue: '0' },
            { id: 'printReceiptDateValue', label: 'تاريخ الصرف', defaultValue: '-' }
        ]
    });

    printModal = new PrintModal({
        title: 'تم اعتماد إذن الصرف',
        onPrint: () => executePrint('direct')
    });
});

let availableStock = [];
let receiptRows = [];

window.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('receiptDate').valueAsDate = new Date();
    document.getElementById('receiptDate').max = new Date().toISOString().split('T')[0];

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
        const now = new Date();
        printLayout.setDates(now);

        // Override header date format to "التاريخ: ..."
        const dateEl = document.getElementById('printReceiptDate');
        if (dateEl) {
            const dateStr = now.toLocaleDateString('ar-LY', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            dateEl.textContent = 'التاريخ: ' + dateStr;
        }

        printLayout.setSummary({
            printReceiptDateValue: document.getElementById('receiptDate').value || '-',
            printItemCount: receiptRows.length.toString()
        });

        // --- Receipt Meta Block (NEW) ---
        const requesterSelect = document.getElementById('requesterSelect');
        const storeSelect = document.getElementById('storeSelect');
        const notesInput = document.getElementById('receiptNotes');

        const requesterName = requesterSelect.options[requesterSelect.selectedIndex]?.text || '-';
        const storeName = storeSelect.options[storeSelect.selectedIndex]?.text || '-';
        const notes = notesInput.value.trim();

        // Remove old meta block if exists
        const oldMeta = document.getElementById('printMetaBlock');
        if (oldMeta) oldMeta.remove();
        const oldNotes = document.getElementById('printNotesBlock');
        if (oldNotes) oldNotes.remove();

        // Insert new meta block after summary bar
        const summaryBar = document.querySelector('.print-summary-bar');
        if (summaryBar) {
            const metaHtml = `
                <div class="print-receipt-meta print-only" id="printMetaBlock">
                    <div class="print-meta-item">
                        <span class="print-meta-label">الجهة الطالبة:</span>
                        <span class="print-meta-value">${escapePrintHtml(requesterName)}</span>
                    </div>
                    <div class="print-meta-item">
                        <span class="print-meta-label">المخزن المصدر:</span>
                        <span class="print-meta-value">${escapePrintHtml(storeName)}</span>
                    </div>
                </div>
                ${notes ? `<div class="print-receipt-notes print-only" id="printNotesBlock"><strong>ملاحظات:</strong> ${escapePrintHtml(notes)}</div>` : ''}
            `;
            summaryBar.insertAdjacentHTML('afterend', metaHtml);
        }

        const sel = document.getElementById('itemsSel');
        const sel2 = document.getElementById('rem2');
        sel.style.display  = "none";
        sel2.style.display = "none";
        window.print();
        sel.style.display  = "";
        sel2.style.display = "";

        // Clean up inserted elements
        const cleanupIds = ['printMetaBlock', 'printNotesBlock'];
        cleanupIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
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
