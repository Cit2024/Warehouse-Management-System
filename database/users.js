// ============================================================
// إدارة المستخدمين
//
// دوال خالصة (Pure): تستقبل اتصال قاعدة البيانات وجلسة العملية الرئيسية
// الحالية، ولا تعتمد على Electron أو IPC، لذلك يمكن اختبارها مباشرة.
// كل دالة تفشل بالرمي (throw)؛ المستدعي (main.js) يحوّل ذلك إلى
// {success:false, message}.
// ============================================================

const VALID_ROLES = ['Admin', 'Store_Keeper'];
const MIN_PASSWORD_LENGTH = 4;

function addUser(db, hashPassword, { fullName, password, role } = {}) {
    fullName = String(fullName || '').trim();
    password = String(password || '');

    if (!fullName) throw new Error('اسم المستخدم مطلوب.');
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`);
    }
    if (!VALID_ROLES.includes(role)) {
        throw new Error('الدور المحدد غير صالح.');
    }

    const existing = db.prepare('SELECT user_id FROM users WHERE full_name = ?').get(fullName);
    if (existing) throw new Error('يوجد مستخدم بهذا الاسم بالفعل.');

    const info = db.prepare(
        'INSERT INTO users (full_name, password_hash, role) VALUES (?, ?, ?)'
    ).run(fullName, hashPassword(password), role);

    return info.lastInsertRowid;
}

/**
 * تمنع الأدمن من تغيير دوره الخاص — بدون هذا القيد يمكن لآخر مسؤول نشط في
 * النظام تنزيل صلاحيته عن طريق الخطأ ولا يبقى أي حساب قادر على إدارة المستخدمين.
 */
function updateUserRole(db, currentSession, { userId, role } = {}) {
    if (!VALID_ROLES.includes(role)) {
        throw new Error('الدور المحدد غير صالح.');
    }
    if (currentSession.userId === userId && role !== 'Admin') {
        throw new Error('لا يمكنك تغيير دورك الخاص. اطلب من مسؤول آخر القيام بذلك.');
    }
    const result = db.prepare('UPDATE users SET role = ? WHERE user_id = ?').run(role, userId);
    if (result.changes === 0) throw new Error('لم يتم العثور على المستخدم.');
}

/** تمنع المستخدم من إلغاء تفعيل حسابه الخاص لنفس السبب أعلاه. */
function setUserActive(db, currentSession, { userId, isActive } = {}) {
    const active = isActive ? 1 : 0;
    if (currentSession.userId === userId && !active) {
        throw new Error('لا يمكنك إلغاء تفعيل حسابك الخاص.');
    }
    const result = db.prepare('UPDATE users SET is_active = ? WHERE user_id = ?').run(active, userId);
    if (result.changes === 0) throw new Error('لم يتم العثور على المستخدم.');
}

/**
 * تغيير كلمة مرور: المستخدم يستطيع تغيير كلمة مروره الخاصة (بشرط تقديم
 * الحالية)، والأدمن يستطيع إعادة تعيين كلمة مرور أي مستخدم آخر بلا حاجة لمعرفة
 * القديمة.
 */
function changePassword(db, currentSession, verifyPassword, hashPassword, { userId, newPassword, currentPassword } = {}) {
    newPassword = String(newPassword || '');
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`كلمة المرور الجديدة يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`);
    }

    const isSelf = currentSession.userId === userId;
    if (!isSelf && currentSession.role !== 'Admin') {
        throw new Error('لا تملك صلاحية تغيير كلمة مرور مستخدم آخر.');
    }

    const user = db.prepare('SELECT user_id, password_hash FROM users WHERE user_id = ?').get(userId);
    if (!user) throw new Error('لم يتم العثور على المستخدم.');

    if (isSelf && !verifyPassword(currentPassword, user.password_hash)) {
        throw new Error('كلمة المرور الحالية غير صحيحة.');
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE user_id = ?').run(hashPassword(newPassword), userId);
}

module.exports = { VALID_ROLES, MIN_PASSWORD_LENGTH, addUser, updateUserRole, setUserActive, changePassword };
