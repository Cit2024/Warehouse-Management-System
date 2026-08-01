/**
 * Entities Page Logic
 * Handles loading, rendering, filtering, adding, and deleting entities.
 */

let printLayout;
let addEntityModal;

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();

    printLayout = new PrintLayout({
        layout: 'report',
        title: 'تقرير الموردين والجهات',
        showDates: true,
        summaryItems: [
            { id: 'printReportName', label: 'اسم التقرير', defaultValue: 'تقرير الموردين والجهات' },
            { id: 'printRecordCount', label: 'عدد الجهات', defaultValue: '0' },
            { id: 'printDateValue', label: 'تاريخ الطباعة', defaultValue: '-' }
        ]
    });

    addEntityModal = new AddEntityModal({ onSuccess: loadEntities });
});

let allEntities = [];

// ===== PRINT FUNCTION =====
function printEntities() {
    const now = new Date();
    const gregorianDate = now.toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });

    printLayout.setDates(now);
    printLayout.setSummary({
        printReportName: 'تقرير الموردين والجهات',
        printRecordCount: allEntities.length,
        printDateValue: gregorianDate
    });

    window.print();
}

// Table sorting is provided by common.js

// Session helpers are provided by common.js

// ===== LOAD & RENDER =====
async function loadEntities() {
    const tbody = document.getElementById('entitiesTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">جاري التحميل...</td></tr>';

    try {
        let entities = await window.api.getAllEntities();
        if (entities && entities.success === false) {
            allEntities = [];
            renderEntities([], entities.message || 'حدث خطأ في جلب الجهات');
            showToast(entities.message || 'حدث خطأ في جلب الجهات', 'error');
            return;
        }
        allEntities = entities || [];
        renderEntities(allEntities);
    } catch (error) {
        console.error('Error loading entities:', error);
        allEntities = [];
        renderEntities([], 'حدث خطأ أثناء جلب الجهات');
        showToast('حدث خطأ أثناء جلب الجهات', 'error');
    }
}

// errorMessage يميّز بين "لا توجد جهات بعد" (نتيجة سليمة) و"تعذّر الجلب" (فشل)
function renderEntities(entities, errorMessage = null) {
    const tbody = document.getElementById('entitiesTableBody');
    document.getElementById('entitiesCount').textContent = (entities ? entities.length : 0) + ' جهة مسجلة';

    if (!entities || entities.length === 0) {
        const icon = errorMessage ? 'fa-triangle-exclamation' : 'fa-users';
        const title = errorMessage ? 'تعذّر تحميل الجهات' : 'لا توجد جهات مسجلة بعد';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px;"><div class="empty-state"><div class="empty-state-icon"><i class="fas ${icon}"></i></div><h3>${escapeHtml(title)}</h3></div></td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    entities.forEach(ent => {
        let typeAr = '';
        let badgeClass = '';
        if (ent.entity_type === 'Supplier') { typeAr = 'مورد'; badgeClass = 'badge-supplier'; }
        else if (ent.entity_type === 'Department') { typeAr = 'قسم'; badgeClass = 'badge-dept'; }
        else { typeAr = 'موظف'; badgeClass = 'badge-emp'; }

        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td><span class="item-id">' + ent.entity_id + '</span></td>' +
            '<td style="font-weight: 600;">' + escapeHtml(ent.entity_name) + '</td>' +
            '<td><span class="badge ' + badgeClass + '">' + typeAr + '</span></td>' +
            '<td dir="ltr" style="text-align: right;">' + (ent.phone ? escapeHtml(ent.phone) : '<span style="color: var(--text-muted);">-</span>') + '</td>' +
            '<td>' +
                '<div class="row-actions">' +
                    '<button class="row-action-btn delete" title="حذف" onclick="deleteEntity(' + ent.entity_id + ')"><i class="fas fa-trash"></i></button>' +
                '</div>' +
            '</td>';
        fragment.appendChild(tr);
    });
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function filterEntities() {
    const term = document.getElementById('entitySearch').value.toLowerCase().trim();
    if (!term) { renderEntities(allEntities); return; }
    const filtered = allEntities.filter(e =>
        (e.entity_name || '').toLowerCase().includes(term) ||
        (e.entity_type || '').toLowerCase().includes(term) ||
        (e.phone || '').includes(term)
    );
    renderEntities(filtered);
}

function openModal() {
    addEntityModal.open();
}

function closeModal() {
    addEntityModal.close();
}

async function submitAddEntity() {
    await addEntityModal.submit();
}

async function deleteEntity(id) {
    const confirmed = await confirmModal({ title: 'حذف جهة', message: 'هل أنت متأكد من حذف هذه الجهة؟', confirmLabel: 'حذف', danger: true });
    if (confirmed) {
        try {
            const result = await window.api.deleteEntity(id);
            if (result.success) { loadEntities(); showToast('تم الحذف بنجاح', 'success'); }
            else { showToast(result.message, 'error'); }
        } catch (error) { showToast('حدث خطأ أثناء الحذف', 'error'); }
    }
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
    loadEntities();
});
