/**
 * Entities Page Logic
 * Handles loading, rendering, filtering, adding, and deleting entities.
 */

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();
});

let allEntities = [];

// ===== PRINT FUNCTION =====
function printEntities() {
    // Set dates
    var now = new Date();
    var gregorianDate = now.toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('printGregorianDate').textContent = gregorianDate;
    document.getElementById('printDateValue').textContent = gregorianDate;

    // Hijri date
    try {
        var hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        document.getElementById('printHijriDate').textContent = hijriFormatter.format(now);
    } catch(e) {
        document.getElementById('printHijriDate').textContent = '';
    }

    // Set record count
    document.getElementById('printRecordCount').textContent = allEntities.length;

    // Trigger browser print
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
            showToast(entities.message || 'حدث خطأ في جلب الجهات', 'error');
            allEntities = [];
            renderEntities([]);
            return;
        }
        allEntities = entities || [];
        renderEntities(allEntities);
    } catch (error) {
        allEntities = [
            { entity_id: 1, entity_name: 'شركة المدار للتجهيزات', entity_type: 'Supplier', phone: '051-2345678' },
            { entity_id: 2, entity_name: 'مكتبة مصراتة الحديثة', entity_type: 'Supplier', phone: '052-3456789' },
            { entity_id: 3, entity_name: 'قسم الهندسة الكهربائية', entity_type: 'Department', phone: '' },
            { entity_id: 4, entity_name: 'مكتب الشؤون الإدارية', entity_type: 'Department', phone: '' }
        ];
        renderEntities(allEntities);
    }
}

function renderEntities(entities) {
    const tbody = document.getElementById('entitiesTableBody');
    document.getElementById('entitiesCount').textContent = entities.length + ' جهة مسجلة';

    if (!entities || entities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;"><div class="empty-state"><div class="empty-state-icon"><i class="fas fa-users"></i></div><h3>لا توجد جهات مسجلة بعد</h3></div></td></tr>';
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
            '<td style="font-weight: 600;">' + ent.entity_name + '</td>' +
            '<td><span class="badge ' + badgeClass + '">' + typeAr + '</span></td>' +
            '<td dir="ltr" style="text-align: right;">' + (ent.phone || '<span style="color: var(--text-muted);">-</span>') + '</td>' +
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

async function submitAddEntity() {
    const session = checkSession();
    if (session && session.role === 'viewer') { showToast('لا تملك صلاحية الإضافة', 'error'); return; }

    const btn = document.getElementById('saveEntityBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

    const name = document.getElementById('entityName').value.trim();
    const type = document.getElementById('entityType').value;
    const phone = document.getElementById('entityPhone').value.trim();

    if (!name) {
        showToast('يرجى إدخال اسم الجهة', 'warning');
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
    }

    try {
        const result = await window.api.addEntity({ name, type, phone });
        if (result.success) { closeModal(); loadEntities(); showToast('تمت الإضافة بنجاح', 'success'); }
        else { showToast(result.message, 'error'); }
    } catch (error) { showToast('حدث خطأ أثناء الإضافة', 'error'); }
    finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function deleteEntity(id) {
    const session = checkSession();
    if (session && session.role === 'viewer') { showToast('لا تملك صلاحية الحذف', 'error'); return; }

    if (confirm('هل أنت متأكد من حذف هذه الجهة؟')) {
        try {
            const result = await window.api.deleteEntity(id);
            if (result.success) { loadEntities(); showToast('تم الحذف بنجاح', 'success'); }
            else { showToast(result.message, 'error'); }
        } catch (error) { showToast('حدث خطأ أثناء الحذف', 'error'); }
    }
}

function openModal() {
    const session = checkSession();
    if (session && session.role === 'viewer') { showToast('لا تملك صلاحية الإضافة', 'error'); return; }
    const modal = document.getElementById('addModal');
    modal.hidden = false;
    modal.classList.add('active');
    document.getElementById('addEntityForm').reset();
}

function closeModal() {
    const modal = document.getElementById('addModal');
    modal.hidden = true;
    modal.classList.remove('active');
}

const addModal = document.getElementById('addModal');
if (addModal) {
    addModal.addEventListener('click', function(e) { if (e.target === this) closeModal(); });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
    loadEntities();
});
