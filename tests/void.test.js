/**
 * Voiding receipts.
 *
 * transactions.is_deleted existed and every read filtered on it, but nothing in
 * the app ever set it to 1 — a receipt entered with the wrong supplier or
 * quantity was permanent, correctable only by restoring a whole backup.
 *
 * The rule under test: a void may never leave any item's stock negative.
 * Voiding a dispense always works (it returns goods). Voiding a supply whose
 * goods were already dispensed is refused — allowing it would reintroduce
 * negative stock from the opposite direction.
 *
 * MUST run under Electron's ABI:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron tests/void.test.js
 */

const Database = require('better-sqlite3');
const { voidTransaction } = require('../database/stock');
const { migrateAddVoidColumns } = require('../database/migrations');

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
        return null;
    } catch (error) {
        const ok = matcher ? matcher.test(error.message) : true;
        assert(ok, ok ? message : `${message} — wrong error: ${error.message}`);
        return error;
    }
}

// Legacy schema: transactions WITHOUT the void columns, so every run also
// exercises the ALTER TABLE migration.
function buildDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE users (user_id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT);
        CREATE TABLE stores (store_id INTEGER PRIMARY KEY AUTOINCREMENT, store_name TEXT);
        CREATE TABLE items (item_id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT NOT NULL, unit TEXT, is_deleted INTEGER DEFAULT 0);
        CREATE TABLE transactions (
            transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_type TEXT CHECK(transaction_type IN ('In','Out','Opening_Balance')) NOT NULL,
            transaction_date DATETIME NOT NULL, store_id INTEGER NOT NULL,
            entity_id INTEGER, created_by INTEGER, notes TEXT, is_deleted INTEGER DEFAULT 0
        );
        CREATE TABLE transaction_details (
            detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER NOT NULL, item_id INTEGER NOT NULL,
            quantity REAL NOT NULL, unit_price REAL DEFAULT 0,
            FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE
        );
        CREATE VIEW view_current_stock AS
            SELECT i.item_id, i.item_name, i.unit,
                   COALESCE(
                       SUM(CASE WHEN t.transaction_type IN ('In','Opening_Balance') THEN td.quantity ELSE 0 END)
                       - SUM(CASE WHEN t.transaction_type = 'Out' THEN td.quantity ELSE 0 END), 0) AS current_quantity
            FROM items i
            LEFT JOIN transaction_details td ON i.item_id = td.item_id
            LEFT JOIN transactions t ON td.transaction_id = t.transaction_id AND t.is_deleted = 0
            WHERE i.is_deleted = 0
            GROUP BY i.item_id;

        INSERT INTO users (full_name) VALUES ('admin');
        INSERT INTO stores (store_name) VALUES ('المخزن الرئيسي');
        INSERT INTO items (item_name, unit) VALUES ('لابتوب ديل', 'قطعة');

        -- تخ #1: توريد 10
        INSERT INTO transactions (transaction_type, transaction_date, store_id) VALUES ('In', '2026-01-01', 1);
        INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_price) VALUES (1, 1, 10, 500);
    `);
    migrateAddVoidColumns(db);
    return db;
}

const stockOf = (db, itemId) =>
    db.prepare('SELECT current_quantity FROM view_current_stock WHERE item_id = ?').get(itemId).current_quantity;

const dispense = (db, qty) => {
    const info = db.prepare(
        "INSERT INTO transactions (transaction_type, transaction_date, store_id) VALUES ('Out', '2026-02-01', 1)"
    ).run();
    db.prepare('INSERT INTO transaction_details (transaction_id, item_id, quantity) VALUES (?, 1, ?)')
        .run(info.lastInsertRowid, qty);
    return info.lastInsertRowid;
};

// Mirrors the handler: the void runs inside a transaction so it rolls back.
const doVoid = (db, payload) => db.transaction(() => voidTransaction(db, payload))();

console.log('\nVoid Transaction Test');
console.log('=====================\n');

// --- Migration -------------------------------------------------------------
console.log('migrateAddVoidColumns:');
{
    const db = buildDb();
    const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
    assert(cols.includes('void_reason') && cols.includes('voided_by') && cols.includes('voided_at'),
        'the three audit columns are added to a legacy table');

    const addedAgain = migrateAddVoidColumns(db);
    assert(addedAgain.length === 0, 'a second run is a no-op (idempotent)');

    const count = db.prepare('PRAGMA table_info(transactions)').all().filter((c) => c.name === 'void_reason').length;
    assert(count === 1, 'the column is not duplicated');
    db.close();
}

// --- Voiding a dispense always works ---------------------------------------
console.log('\nvoiding a dispense returns the goods to stock:');
{
    const db = buildDb();
    const outId = dispense(db, 4);
    assert(stockOf(db, 1) === 6, 'stock is 6 after dispensing 4 of 10');

    const result = doVoid(db, { transactionId: outId, reason: 'صرف بالخطأ لجهة غير صحيحة', voidedBy: 1 });
    assert(result.transactionType === 'Out', 'the voided receipt is reported as a dispense');
    assert(stockOf(db, 1) === 10, 'stock returns to 10');

    const row = db.prepare('SELECT is_deleted, void_reason, voided_by, voided_at FROM transactions WHERE transaction_id = ?').get(outId);
    assert(row.is_deleted === 1, 'the receipt is marked deleted');
    assert(row.void_reason === 'صرف بالخطأ لجهة غير صحيحة', 'the reason is persisted for audit');
    assert(row.voided_by === 1, 'the user who voided it is recorded');
    assert(typeof row.voided_at === 'string' && row.voided_at.length > 0, 'the void timestamp is recorded');
    db.close();
}

// --- Voiding a supply: allowed while the goods are on hand -------------------
console.log('\nvoiding a supply whose goods are still on hand:');
{
    const db = buildDb();
    assert(stockOf(db, 1) === 10, 'stock is 10');
    doVoid(db, { transactionId: 1, reason: 'إذن توريد مكرر', voidedBy: 1 });
    assert(stockOf(db, 1) === 0, 'stock drops to 0 — the supply is withdrawn');
    db.close();
}

// --- Voiding a supply: REFUSED once the goods are gone -----------------------
console.log('\nvoiding a supply whose goods were already dispensed is refused:');
{
    const db = buildDb();
    dispense(db, 8); // 10 in, 8 out -> 2 on hand
    assert(stockOf(db, 1) === 2, 'stock is 2 after dispensing 8 of 10');

    const err = throws(
        () => doVoid(db, { transactionId: 1, reason: 'محاولة إلغاء التوريد', voidedBy: 1 }),
        /لا يمكن إلغاء إذن التوريد/,
        'voiding the supply throws (it would leave stock at -8)'
    );
    assert(err && /إلغاء أذونات الصرف المقابلة أولاً/.test(err.message),
        'the error tells the user to void the corresponding dispense first');
    assert(err && err.message.includes('لابتوب ديل'), 'the error names the item');

    assert(stockOf(db, 1) === 2, 'stock is unchanged after the refusal');
    const row = db.prepare('SELECT is_deleted, voided_at FROM transactions WHERE transaction_id = 1').get();
    assert(row.is_deleted === 0, 'the receipt is NOT marked deleted (the update rolled back)');
    assert(row.voided_at === null, 'no audit data was left behind by the failed void');
    assert(db.inTransaction === false, 'no transaction is leaked');
    db.close();
}

// --- The documented correction path works -----------------------------------
console.log('\nthe correction path the error suggests actually works:');
{
    const db = buildDb();
    const outId = dispense(db, 8);
    doVoid(db, { transactionId: outId, reason: 'إلغاء الصرف تمهيداً لتصحيح التوريد', voidedBy: 1 });
    doVoid(db, { transactionId: 1, reason: 'إذن توريد بكمية خاطئة', voidedBy: 1 });
    assert(stockOf(db, 1) === 0, 'voiding the dispense first, then the supply, leaves a clean zero balance');
    db.close();
}

// --- Guards -----------------------------------------------------------------
console.log('\nguards:');
{
    const db = buildDb();
    throws(() => doVoid(db, { transactionId: 1, reason: '   ', voidedBy: 1 }), /سبب الإلغاء/, 'an empty reason is rejected');
    throws(() => doVoid(db, { transactionId: 1, voidedBy: 1 }), /سبب الإلغاء/, 'a missing reason is rejected');
    throws(() => doVoid(db, { transactionId: 999, reason: 'x' }), /لم يتم العثور/, 'an unknown transaction is rejected');
    throws(() => doVoid(db, { transactionId: 0, reason: 'x' }), /غير صالح/, 'an invalid id is rejected');

    doVoid(db, { transactionId: 1, reason: 'إلغاء أول', voidedBy: 1 });
    throws(() => doVoid(db, { transactionId: 1, reason: 'إلغاء ثانٍ', voidedBy: 1 }), /ملغى بالفعل/, 'double-voiding is rejected');

    const row = db.prepare('SELECT void_reason FROM transactions WHERE transaction_id = 1').get();
    assert(row.void_reason === 'إلغاء أول', 'the second void did not overwrite the first void reason');
    db.close();
}

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
