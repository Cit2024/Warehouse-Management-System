/**
 * Suppliers Page Logic
 * قائمة الموردين فقط — الجهات الداخلية (الأقسام والموظفون) لها صفحة مستقلة
 * (entities.html). المصدر واحد: جدول entities مرشّحاً على entity_type.
 */

let printLayout;
let addEntityModal;

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();

    printLayout = new PrintLayout({
        layout: 'report',
        title: 'تقرير الموردين',
        showDates: true,
        summaryItems: [
            { id: 'printReportName', label: 'اسم التقرير', defaultValue: 'تقرير الموردين' },
            { id: 'printRecordCount', label: 'عدد الموردين', defaultValue: '0' },
            { id: 'printDateValue', label: 'تاريخ الطباعة', defaultValue: '-' }
        ]
    });

    addEntityModal = new AddEntityModal({
        onSuccess: loadSuppliers,
        allowedTypes: ['Supplier'],
        title: 'إضافة مورد جديد'
    });
});

let allSuppliers = [];

// ===== PRINT FUNCTION =====
function printSuppliers() {
    const now = new Date();
    const gregorianDate = now.toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });

    printLayout.setDates(now);
    printLayout.setSummary({
        printReportName: 'تقرير الموردين',
        printRecordCount: allSuppliers.length,
        printDateValue: gregorianDate
    });

    window.print();
}

// ===== LOAD & RENDER =====
async function loadSuppliers() {
    const tbody = document.getElementById('suppliersTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px;">جاري التحميل...</td></tr>';

    try {
        const entities = await window.api.getAllEntities();
        if (entities && entities.success === false) {
            allSuppliers = [];
            renderSuppliers([], entities.message || 'حدث خطأ في جلب الموردين');
            showToast(entities.message || 'حدث خطأ في جلب الموردين', 'error');
            return;
        }
        allSuppliers = (entities || []).filter(e => e.entity_type === 'Supplier');
        renderSuppliers(allSuppliers);
    } catch (error) {
        console.error('Error loading suppliers:', error);
        allSuppliers = [];
        renderSuppliers([], 'حدث خطأ أثناء جلب الموردين');
        showToast('حدث خطأ أثناء جلب الموردين', 'error');
    }
}

// errorMessage يميّز بين "لا يوجد موردون بعد" (نتيجة سليمة) و"تعذّر الجلب" (فشل)
function renderSuppliers(suppliers, errorMessage = null) {
    const tbody = document.getElementById('suppliersTableBody');
    document.getElementById('suppliersCount').textContent = (suppliers ? suppliers.length : 0) + ' مورد مسجل';

    if (!suppliers || suppliers.length === 0) {
        const icon = errorMessage ? 'fa-triangle-exclamation' : 'fa-truck';
        const title = errorMessage ? 'تعذّر تحميل الموردين' : 'لا يوجد موردون مسجلون بعد';
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 40px;"><div class="empty-state"><div class="empty-state-icon"><i class="fas ${icon}"></i></div><h3>${escapeHtml(title)}</h3></div></td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    suppliers.forEach(sup => {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td><span class="item-id">' + sup.entity_id + '</span></td>' +
            '<td style="font-weight: 600;">' + escapeHtml(sup.entity_name) + '</td>' +
            '<td dir="ltr" style="text-align: right;">' + (sup.phone ? escapeHtml(sup.phone) : '<span style="color: var(--text-muted);">-</span>') + '</td>' +
            '<td>' +
                '<div class="row-actions">' +
                    '<button class="row-action-btn delete" title="حذف" onclick="deleteSupplier(' + sup.entity_id + ')"><i class="fas fa-trash"></i></button>' +
                '</div>' +
            '</td>';
        fragment.appendChild(tr);
    });
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function filterSuppliers() {
    const term = document.getElementById('supplierSearch').value.toLowerCase().trim();
    if (!term) { renderSuppliers(allSuppliers); return; }
    const filtered = allSuppliers.filter(s =>
        (s.entity_name || '').toLowerCase().includes(term) ||
        (s.phone || '').includes(term)
    );
    renderSuppliers(filtered);
}

function openModal() {
    addEntityModal.open();
}

async function deleteSupplier(id) {
    const confirmed = await confirmModal({ title: 'حذف مورد', message: 'هل أنت متأكد من حذف هذا المورد؟', confirmLabel: 'حذف', danger: true });
    if (confirmed) {
        try {
            const result = await window.api.deleteEntity(id);
            if (result.success) { loadSuppliers(); showToast('تم الحذف بنجاح', 'success'); }
            else { showToast(result.message, 'error'); }
        } catch (error) { showToast('حدث خطأ أثناء الحذف', 'error'); }
    }
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
    loadSuppliers();
});
