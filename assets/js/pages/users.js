/**
 * Users Page Logic
 * Admin-only: list users, add users, change roles, activate/deactivate,
 * reset another user's password.
 *
 * This page trusts nothing from the client for authorization — every IPC
 * handler behind it (get-users, add-user, update-user-role, set-user-active,
 * change-password) re-checks the role of the CURRENT MAIN-PROCESS SESSION in
 * main.js before doing anything. The checks here are only so a non-admin who
 * somehow lands on this page sees a clear message instead of a confusing one.
 */

let allUsers = [];
let currentUserId = null;

const ROLE_LABELS = {
    Admin: 'مسؤول',
    Store_Keeper: 'أمين مخزن',
    Viewer: 'مستعرض (قراءة فقط)'
};

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout({ showRefresh: true, refreshAction: 'loadUsers()' });
    layout.init();
});

window.addEventListener('DOMContentLoaded', () => {
    const session = checkSession();
    if (!session) return;
    currentUserId = session.userId;

    if (session.role !== 'Admin') {
        // فرض الصلاحية الفعلي يجري في main.js؛ هذا مجرد توضيح للمستخدم لماذا لا يرى الصفحة
        document.querySelector('main.content').innerHTML = `
            <div class="empty-state" style="padding: 60px;">
                <div class="empty-state-icon"><i class="fas fa-lock"></i></div>
                <h3>هذه الصفحة متاحة للمسؤول (Admin) فقط</h3>
                <p><a href="dashboard.html">العودة إلى لوحة التحكم</a></p>
            </div>
        `;
        return;
    }

    loadUsers();
});

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    try {
        const users = await window.api.getUsers();
        if (users && users.success === false) {
            renderUsers([], users.message || 'تعذّر جلب قائمة المستخدمين');
            showToast(users.message || 'تعذّر جلب قائمة المستخدمين', 'error');
            return;
        }
        allUsers = Array.isArray(users) ? users : [];
        renderUsers(allUsers);
    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        renderUsers([], 'حدث خطأ أثناء جلب قائمة المستخدمين');
        showToast('حدث خطأ أثناء جلب قائمة المستخدمين', 'error');
    }
}

function renderUsers(users, errorMessage = null) {
    const tbody = document.getElementById('usersTableBody');
    document.getElementById('usersCount').textContent = (users ? users.length : 0) + ' مستخدم';

    if (!users || users.length === 0) {
        const icon = errorMessage ? 'fa-triangle-exclamation' : 'fa-users';
        const title = errorMessage || 'لا يوجد مستخدمون بعد';
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px;"><div class="empty-state"><div class="empty-state-icon"><i class="fas ${icon}"></i></div><h3>${escapeHtml(title)}</h3></div></td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => {
        const isSelf = u.user_id === currentUserId;
        const roleLabel = ROLE_LABELS[u.role] || escapeHtml(u.role);
        const statusBadge = u.is_active
            ? '<span class="badge badge-available"><i class="fas fa-check"></i> نشط</span>'
            : '<span class="badge badge-low"><i class="fas fa-ban"></i> معطّل</span>';

        const roleCell = isSelf
            ? `${roleLabel} <span style="color: var(--text-muted); font-size: 12px;">(أنت)</span>`
            : `<select class="filter-select" style="min-width:160px;" onchange="changeUserRole(${u.user_id}, this.value)">
                ${Object.keys(ROLE_LABELS).map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
               </select>`;

        const actions = isSelf
            ? `<span style="color: var(--text-muted); font-size: 13px;">استخدم "تغيير كلمة المرور" من القائمة الجانبية</span>`
            : `
                <div class="row-actions">
                    <button class="row-action-btn" title="إعادة تعيين كلمة المرور" onclick="openResetPasswordModal(${u.user_id})"><i class="fas fa-key"></i></button>
                    <button class="row-action-btn ${u.is_active ? 'delete' : ''}" title="${u.is_active ? 'إلغاء التفعيل' : 'تفعيل'}" onclick="toggleUserActive(${u.user_id}, ${u.is_active ? 'false' : 'true'})">
                        <i class="fas ${u.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i>
                    </button>
                </div>
            `;

        return `<tr>
            <td style="font-weight:600;">${escapeHtml(u.full_name)}</td>
            <td>${roleCell}</td>
            <td>${statusBadge}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

// ===== Add user =====
function openAddUserModal() {
    document.getElementById('addUserForm').reset();
    document.getElementById('addUserError').style.display = 'none';
    const modal = document.getElementById('addUserModal');
    modal.hidden = false;
    modal.classList.add('active');
    document.getElementById('newUserName').focus();
}

function closeAddUserModal() {
    const modal = document.getElementById('addUserModal');
    modal.hidden = true;
    modal.classList.remove('active');
}

async function submitAddUser() {
    const fullName = document.getElementById('newUserName').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const errorEl = document.getElementById('addUserError');
    const submitBtn = document.getElementById('addUserSubmitBtn');

    errorEl.style.display = 'none';
    if (!fullName || !password) {
        errorEl.textContent = 'يرجى تعبئة جميع الحقول';
        errorEl.style.display = 'block';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإضافة...';
    try {
        const result = await window.api.addUser({ fullName, password, role });
        if (result && result.success) {
            showToast(result.message, 'success');
            closeAddUserModal();
            loadUsers();
        } else {
            errorEl.textContent = (result && result.message) || 'تعذّر إضافة المستخدم';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = 'حدث خطأ أثناء إضافة المستخدم';
        errorEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'إضافة';
    }
}

// ===== Role change =====
async function changeUserRole(userId, role) {
    try {
        const result = await window.api.updateUserRole({ userId, role });
        if (result && result.success) {
            showToast(result.message, 'success');
        } else {
            showToast((result && result.message) || 'تعذّر تحديث الدور', 'error');
        }
    } catch (error) {
        showToast('حدث خطأ أثناء تحديث الدور', 'error');
    } finally {
        loadUsers(); // إعادة التحميل تعيد القيمة الصحيحة سواء نجح التعديل أو فشل
    }
}

// ===== Activate / deactivate =====
async function toggleUserActive(userId, makeActive) {
    const confirmMsg = makeActive
        ? 'تفعيل هذا المستخدم مجدداً؟'
        : 'إلغاء تفعيل هذا المستخدم؟ لن يتمكن من تسجيل الدخول حتى تُعاد تفعيله.';
    if (!confirm(confirmMsg)) return;

    try {
        const result = await window.api.setUserActive({ userId, isActive: makeActive });
        if (result && result.success) {
            showToast(result.message, 'success');
        } else {
            showToast((result && result.message) || 'تعذّر تحديث حالة المستخدم', 'error');
        }
    } catch (error) {
        showToast('حدث خطأ أثناء تحديث حالة المستخدم', 'error');
    } finally {
        loadUsers();
    }
}

// ===== Reset another user's password =====
let resetPasswordTargetId = null;

// اسم المستخدم يُقرأ من allUsers (بالمعرّف الرقمي) بدل تمريره داخل سمة onclick:
// تهريب HTML لا يحمي من الخروج من نص جافاسكربت داخل سمة HTML — المتصفح يفكّ
// ترميز السمة (فيعيد &#039; إلى ') قبل تنفيذها كجافاسكربت.
function openResetPasswordModal(userId) {
    const user = allUsers.find(u => u.user_id === userId);
    const fullName = user ? user.full_name : '';
    resetPasswordTargetId = userId;
    document.getElementById('resetPasswordUserName').textContent = `تعيين كلمة مرور جديدة لـ «${fullName}»`;
    document.getElementById('resetNewPassword').value = '';
    const modal = document.getElementById('resetPasswordModal');
    modal.hidden = false;
    modal.classList.add('active');
    document.getElementById('resetNewPassword').focus();
}

function closeResetPasswordModal() {
    resetPasswordTargetId = null;
    const modal = document.getElementById('resetPasswordModal');
    modal.hidden = true;
    modal.classList.remove('active');
}

async function submitResetPassword() {
    const newPassword = document.getElementById('resetNewPassword').value;
    if (!newPassword) {
        showToast('يرجى إدخال كلمة مرور جديدة', 'error');
        return;
    }

    const btn = document.getElementById('resetPasswordSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التعيين...';
    try {
        // Admin يُعيد تعيين كلمة مرور مستخدم آخر — لا حاجة لكلمة المرور الحالية،
        // main.js يتحقق من أن currentSession.role === 'Admin' قبل القبول.
        const result = await window.api.changePassword({
            userId: resetPasswordTargetId,
            newPassword
        });
        if (result && result.success) {
            showToast(result.message, 'success');
            closeResetPasswordModal();
        } else {
            showToast((result && result.message) || 'تعذّر تعيين كلمة المرور', 'error');
        }
    } catch (error) {
        showToast('حدث خطأ أثناء تعيين كلمة المرور', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'تعيين كلمة المرور';
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAddUserModal();
    closeResetPasswordModal();
});
