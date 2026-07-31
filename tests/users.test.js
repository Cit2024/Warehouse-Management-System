/**
 * User management: add, role change, activate/deactivate, password reset.
 *
 * There was no way to add a user, change a password, or ever remove the
 * seeded admin/admin default from inside the app. The trickiest part of
 * fixing that is the self-protection rules: an Admin must not be able to
 * accidentally strip their own Admin role or deactivate their own account,
 * because that could leave the system with no one able to manage users.
 *
 * MUST run under Electron's ABI:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron tests/users.test.js
 */

const Database = require('better-sqlite3');
const { hashPassword, verifyPassword } = require('../database/auth');
const { addUser, updateUserRole, setUserActive, changePassword } = require('../database/users');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  ✓', message); }
    else { failed++; console.error('  ✗', message); }
}

function throws(fn, matcher, message) {
    try {
        fn();
        assert(false, `${message} (did not throw)`);
    } catch (error) {
        const ok = matcher ? matcher.test(error.message) : true;
        assert(ok, ok ? message : `${message} — wrong error: ${error.message}`);
    }
}

function buildDb() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT CHECK(role IN ('Admin','Store_Keeper')) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1
        );
    `);
    const adminId = db.prepare(
        "INSERT INTO users (full_name, password_hash, role) VALUES ('admin', ?, 'Admin')"
    ).run(hashPassword('admin')).lastInsertRowid;
    return { db, adminId };
}

console.log('\nUser Management Test');
console.log('=====================\n');

// --- addUser -----------------------------------------------------------
console.log('addUser:');
{
    const { db } = buildDb();
    const id = addUser(db, hashPassword, { fullName: 'أحمد', password: '1234', role: 'Store_Keeper' });
    assert(typeof id === 'number' && id > 0, 'a valid user is created and its id returned');

    const row = db.prepare('SELECT * FROM users WHERE user_id = ?').get(id);
    assert(row.full_name === 'أحمد', 'the name is stored');
    assert(row.role === 'Store_Keeper', 'the role is stored');
    assert(row.password_hash.startsWith('scrypt:'), 'the password is hashed, never stored plaintext');
    assert(verifyPassword('1234', row.password_hash), 'the stored hash verifies against the given password');

    throws(() => addUser(db, hashPassword, { fullName: 'أحمد', password: '5678', role: 'Store_Keeper' }),
        /يوجد مستخدم بهذا الاسم بالفعل/, 'a duplicate name is rejected');
    throws(() => addUser(db, hashPassword, { fullName: '', password: '1234', role: 'SuperAdmin' }),
        /اسم المستخدم مطلوب/, 'an empty name is rejected');
    throws(() => addUser(db, hashPassword, { fullName: 'خالد', password: '12', role: 'SuperAdmin' }),
        /أحرف على الأقل/, 'a too-short password is rejected');
    throws(() => addUser(db, hashPassword, { fullName: 'خالد', password: '1234', role: 'SuperAdmin' }),
        /الدور المحدد غير صالح/, 'an invalid role is rejected');
    db.close();
}

// --- updateUserRole: the self-lockout guard -----------------------------
console.log('\nupdateUserRole — self-protection:');
{
    const { db, adminId } = buildDb();
    const skId = addUser(db, hashPassword, { fullName: 'أمين', password: '1234', role: 'Store_Keeper' });
    const otherAdminId = addUser(db, hashPassword, { fullName: 'محمد', password: '1234', role: 'Admin' });
    const adminSession = { userId: adminId, role: 'Admin' };

    // The only admin tries to demote themselves.
    throws(() => updateUserRole(db, adminSession, { userId: adminId, role: 'Store_Keeper' }),
        /لا يمكنك تغيير دورك الخاص/, 'an admin cannot demote their own account');
    assert(db.prepare('SELECT role FROM users WHERE user_id = ?').get(adminId).role === 'Admin',
        'the role is unchanged after the refusal');

    // Re-affirming the same role for yourself is allowed (not a demotion).
    updateUserRole(db, adminSession, { userId: adminId, role: 'Admin' });
    assert(db.prepare('SELECT role FROM users WHERE user_id = ?').get(adminId).role === 'Admin',
        'setting your own role to the same Admin role is allowed');

    // An admin CAN promote/demote someone else (from Admin to Store_Keeper — a real change).
    updateUserRole(db, adminSession, { userId: otherAdminId, role: 'Store_Keeper' });
    assert(db.prepare('SELECT role FROM users WHERE user_id = ?').get(otherAdminId).role === 'Store_Keeper',
        'an admin can change another user\'s role (Admin → Store_Keeper transition verified)');

    throws(() => updateUserRole(db, adminSession, { userId: 9999, role: 'Admin' }),
        /لم يتم العثور/, 'an unknown user id is rejected');
    throws(() => updateUserRole(db, adminSession, { userId: skId, role: 'nonsense' }),
        /الدور المحدد غير صالح/, 'an invalid role is rejected');
    db.close();
}

// --- setUserActive: the self-deactivation guard -------------------------
console.log('\nsetUserActive — self-protection:');
{
    const { db, adminId } = buildDb();
    const skId = addUser(db, hashPassword, { fullName: 'أمين', password: '1234', role: 'Store_Keeper' });
    const adminSession = { userId: adminId, role: 'Admin' };

    throws(() => setUserActive(db, adminSession, { userId: adminId, isActive: false }),
        /لا يمكنك إلغاء تفعيل حسابك الخاص/, 'an admin cannot deactivate their own account');
    assert(db.prepare('SELECT is_active FROM users WHERE user_id = ?').get(adminId).is_active === 1,
        'the account is still active after the refusal');

    setUserActive(db, adminSession, { userId: skId, isActive: false });
    assert(db.prepare('SELECT is_active FROM users WHERE user_id = ?').get(skId).is_active === 0,
        'an admin can deactivate another user');

    setUserActive(db, adminSession, { userId: skId, isActive: true });
    assert(db.prepare('SELECT is_active FROM users WHERE user_id = ?').get(skId).is_active === 1,
        'and reactivate them');
    db.close();
}

// --- changePassword: self-service vs admin reset -------------------------
console.log('\nchangePassword — self-service requires the current password:');
{
    const { db, adminId } = buildDb();
    const adminSession = { userId: adminId, role: 'Admin' };

    throws(() => changePassword(db, adminSession, verifyPassword, hashPassword,
        { userId: adminId, currentPassword: 'wrong', newPassword: 'newpass123' }),
        /كلمة المرور الحالية غير صحيحة/, 'changing your own password with the wrong current password is rejected');

    changePassword(db, adminSession, verifyPassword, hashPassword,
        { userId: adminId, currentPassword: 'admin', newPassword: 'newpass123' });
    const row = db.prepare('SELECT password_hash FROM users WHERE user_id = ?').get(adminId);
    assert(verifyPassword('newpass123', row.password_hash), 'the password is actually changed');
    assert(!verifyPassword('admin', row.password_hash), 'the old password no longer works');

    throws(() => changePassword(db, adminSession, verifyPassword, hashPassword,
        { userId: adminId, currentPassword: 'newpass123', newPassword: '12' }),
        /أحرف على الأقل/, 'a too-short new password is rejected');
    db.close();
}

console.log('\nchangePassword — admin resets another user without their password:');
{
    const { db, adminId } = buildDb();
    const skId = addUser(db, hashPassword, { fullName: 'أمين', password: 'oldpass', role: 'Store_Keeper' });
    const adminSession = { userId: adminId, role: 'Admin' };

    // No currentPassword supplied at all — admin doesn't know it, shouldn't need to.
    changePassword(db, adminSession, verifyPassword, hashPassword, { userId: skId, newPassword: 'resetpass1' });
    const row = db.prepare('SELECT password_hash FROM users WHERE user_id = ?').get(skId);
    assert(verifyPassword('resetpass1', row.password_hash), 'the admin-set password takes effect without the old one');
    db.close();
}

console.log('\nchangePassword — a non-admin cannot change someone else\'s password:');
{
    const { db, adminId } = buildDb();
    const skId = addUser(db, hashPassword, { fullName: 'أمين', password: 'oldpass', role: 'Store_Keeper' });
    const skSession = { userId: skId, role: 'Store_Keeper' };

    throws(() => changePassword(db, skSession, verifyPassword, hashPassword,
        { userId: adminId, newPassword: 'hijacked1' }),
        /لا تملك صلاحية تغيير كلمة مرور مستخدم آخر/, 'a store keeper cannot reset the admin\'s password');

    const row = db.prepare('SELECT password_hash FROM users WHERE user_id = ?').get(adminId);
    assert(verifyPassword('admin', row.password_hash), 'the admin password is unchanged');
    db.close();
}

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
