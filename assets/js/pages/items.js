/**
 * Items Page Logic
 * Dedicated inventory items management: list, filter, add, edit, delete.
 */

let allItems = [];
let itemModal = null;

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout({ showRefresh: true, refreshAction: 'loadItemsData()' });
    layout.init();
});

// ========== Data Loading ==========
async function loadItemsData() {
    try {
        let items = await window.api.getItems();
        let apiError = null;
        if (items && items.success === false) {
            apiError = items.message || 'حدث خطأ في جلب الأصناف';
            items = [];
        }
        allItems = items || [];
        updateStats(allItems);
        populateCategoryFilter(allItems);
        renderItemsTable(allItems, apiError);
        if (apiError) showToast(apiError, 'error');
    } catch (error) {
        console.error('Error loading items:', error);
        allItems = [];
        updateStats(allItems);
        populateCategoryFilter(allItems);
        renderItemsTable(allItems, 'حدث خطأ أثناء جلب بيانات الأصناف');
        showToast('حدث خطأ أثناء جلب بيانات الأصناف', 'error');
    }
}

function updateStats(items) {
    const totalItems = items.length;
    const totalUnits = items.reduce((sum, item) => sum + (item.current_quantity || 0), 0);
    const totalValue = items.reduce((sum, item) => sum + ((item.current_quantity || 0) * (item.unit_price || 0)), 0);
    const lowStock = items.filter(item => (item.current_quantity || 0) <= (item.min_order_qty || 0)).length;

    const totalItemsEl = document.getElementById('statTotalItems');
    const totalUnitsEl = document.getElementById('statTotalUnits');
    const totalValueEl = document.getElementById('statInventoryValue');
    const lowStockEl = document.getElementById('statLowStock');

    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (totalUnitsEl) totalUnitsEl.textContent = totalUnits.toLocaleString('ar-LY') + ' وحدة';
    if (totalValueEl) totalValueEl.textContent = totalValue.toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' د.ل';
    if (lowStockEl) lowStockEl.textContent = lowStock;
}

function populateCategoryFilter(items) {
    const select = document.getElementById('categoryFilter');
    if (!select) return;

    const categories = [...new Set(items.map(item => item.category).filter(Boolean))].sort();
    const currentValue = select.value;

    select.innerHTML = '<option value="">كل التصنيفات</option>' +
        categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>
        `).join('');

    select.value = currentValue;
}

// ========== Table Rendering ==========
// errorMessage يميّز بين "لا توجد أصناف بعد" (نتيجة سليمة) و"تعذّر الجلب" (فشل)
// — يجب ألا يبدو الاثنان متطابقين للمستخدم.
function renderItemsTable(items, errorMessage = null) {
    const tbody = document.getElementById('itemsTableBody');
    const countEl = document.getElementById('itemsCount');

    if (countEl) countEl.textContent = (items ? items.length : 0) + ' صنف مسجل';

    if (!items || items.length === 0) {
        const icon = errorMessage ? 'fa-triangle-exclamation' : 'fa-inbox';
        const title = errorMessage ? 'تعذّر تحميل الأصناف' : 'لا توجد أصناف حالياً';
        const desc = errorMessage || 'قم بإضافة صنف جديد للبدء';
        tbody.innerHTML = `
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fas ${icon}"></i></div>
                        <h3>${title}</h3>
                        <p>${escapeHtml(desc)}</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        const quantity = item.current_quantity || 0;
        const minQty = item.min_order_qty || 0;
        const unitPrice = item.unit_price || 0;
        const totalValue = quantity * unitPrice;
        const isLow = quantity <= minQty;
        const statusClass = isLow ? 'badge-low' : 'badge-available';
        const statusText = isLow ? 'منخفض' : 'متوفر';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="width: 32px; height: 32px; background: var(--primary-light); color: var(--primary); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;">${item.item_name.charAt(0)}</span>
                    <div>
                        <div style="font-weight: 600;">${escapeHtml(item.item_name)}</div>
                        <span class="item-id">${item.item_id}</span>
                    </div>
                </div>
            </td>
            <td><span class="badge badge-supplier">${escapeHtml(item.category || 'غير مصنف')}</span></td>
            <td>${escapeHtml(item.unit)}</td>
            <td style="font-weight: 700;">${quantity.toLocaleString('ar-LY')}</td>
            <td>${minQty.toLocaleString('ar-LY')}</td>
            <td class="numeric currency">${unitPrice.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل</td>
            <td class="numeric currency">${totalValue.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>
                <div class="row-actions">
                    <button class="row-action-btn edit" title="تعديل" onclick="openEditModal(${item.item_id})"><i class="fas fa-edit"></i></button>
                    <button class="row-action-btn delete" title="حذف" onclick="deleteItem(${item.item_id})"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function filterItems() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const statusFilter = document.getElementById('statusFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;

    let filtered = allItems;

    if (searchTerm) {
        filtered = filtered.filter(item =>
            (item.item_name || '').toLowerCase().includes(searchTerm) ||
            (item.item_id || '').toString().toLowerCase().includes(searchTerm) ||
            (item.category || '').toLowerCase().includes(searchTerm)
        );
    }

    if (categoryFilter) {
        filtered = filtered.filter(item => (item.category || '') === categoryFilter);
    }

    if (statusFilter) {
        filtered = filtered.filter(item => {
            const isLow = (item.current_quantity || 0) <= (item.min_order_qty || 0);
            return statusFilter === 'منخفض' ? isLow : !isLow;
        });
    }

    renderItemsTable(filtered);
}

// ========== Actions ==========
function openAddModal() {
    const session = checkSession();
    if (session && session.role === 'Viewer') {
        showToast('لا تملك صلاحية الإضافة', 'error');
        return;
    }

    if (!itemModal) itemModal = new ItemModal({ onSuccess: loadItemsData });
    itemModal.options.mode = 'add';
    itemModal.options.item = null;
    itemModal.open();
}

function openEditModal(itemId) {
    const session = checkSession();
    if (session && session.role === 'Viewer') {
        showToast('لا تملك صلاحية التعديل', 'error');
        return;
    }

    const item = allItems.find(i => i.item_id === itemId);
    if (!item) {
        showToast('الصنف غير موجود', 'error');
        return;
    }

    if (!itemModal) itemModal = new ItemModal({ onSuccess: loadItemsData });
    itemModal.options.mode = 'edit';
    itemModal.options.item = item;
    itemModal.open();
}

// الاسم يُقرأ من allItems بالمعرّف الرقمي بدل تمريره داخل سمة onclick: تهريب
// HTML لا يحمي هنا — المتصفح يفكّ ترميز السمة قبل تنفيذها كجافاسكربت، فيصل
// الاسم غير مُهرَّب أصلاً إلى هذه الدالة، ومن هناك إلى showToast غير المُهرَّبة.
async function deleteItem(id) {
    const session = checkSession();
    if (session && session.role === 'Viewer') {
        showToast('لا تملك صلاحية الحذف', 'error');
        return;
    }

    const item = allItems.find(i => i.item_id === id);
    const name = item ? item.item_name : '';

    const confirmed = await confirmModal({
        title: 'حذف صنف',
        message: `هل أنت متأكد من حذف الصنف "${name}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
        confirmLabel: 'حذف',
        danger: true
    });
    if (confirmed) {
        try {
            await window.api.deleteItem(id);
            showToast(`تم حذف الصنف "${name}" بنجاح`, 'success');
            await loadItemsData();
        } catch (error) {
            showToast('فشل في حذف الصنف', 'error');
        }
    }
}

// ========== Print ==========
function printItems() {
    if (window.printReport && typeof window.printReport.printInventoryTable === 'function') {
        window.printReport.printInventoryTable(allItems, {
            title: 'قائمة الأصناف والمخزون',
            subtitle: 'جميع الأصناف المسجلة في المنظومة'
        });
    } else {
        console.warn('PrintReport component not available, falling back to raw print');
        window.print();
    }
}

// ========== Helpers ==========
function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ========== Init ==========
window.addEventListener('DOMContentLoaded', () => {
    const session = checkSession();
    if (session) {
        loadItemsData();
    }
});
