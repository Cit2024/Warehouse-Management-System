// ============================================================
// تجزئة والتحقق من كلمات المرور
//
// دوال خالصة (Pure): لا تعتمد على Electron ولا على قاعدة البيانات، لذلك يمكن
// اختبارها مباشرة. كانت هذه الدوال مكرّرة بنسخة متطابقة في main.js وdb.js.
// ============================================================

const crypto = require('crypto');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt:${salt}:${derived}`;
}

/**
 * التحقق من كلمة المرور مقابل الهاش المخزّن.
 *
 * تحذير تاريخي: كانت هذه الدالة تقارن storedHash === password بلا شرط، فكان
 * إدخال نص هاش scrypt المخزّن حرفياً ككلمة مرور يُعتبَر صحيحاً — أي أن تسريب
 * الهاش (كنسخة احتياطية مثلاً) كان يعادل تسريب كلمة المرور. المسار البديل
 * (النص العادي القديم) لا يُستخدم إلا عندما لا يكون المخزّن بصيغة scrypt أصلاً.
 */
function verifyPassword(password, storedHash) {
    if (!storedHash) return false;
    if (!storedHash.startsWith('scrypt:')) {
        return storedHash === password;
    }
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return derived === hash;
}

module.exports = { hashPassword, verifyPassword };
