/**
 * Ledger integrity: a dispense may never leave stock negative.
 *
 * Before this guard, save-dispense-receipt inserted unconditionally. The only
 * check lived in dispense.js against a snapshot taken at page load, so two
 * windows (or a stale form, or two lines for the same item) drove stock
 * negative. The item then VANISHED from get-stock, which filters
 * current_quantity > 0, while still showing as negative in get-items.
 *
 * MUST run under Electron's ABI:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron tests/stockGuard.test.js
 */

const Database = require('better-sqlite3');
const { aggregateByItem, validateReceiptItems, assertNoNegativeStock } = require('../database/stock');

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

// Schema mirrors database/db.js: stock is derived, never stored.
function buildDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
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

        INSERT INTO stores (store_name) VALUES ('المخزن الرئيسي');
        INSERT INTO items (item_name, unit) VALUES ('لابتوب ديل', 'قطعة'), ('ورق A4', 'رزمة');
        -- توريد: 10 لابتوب، 5 رزم ورق
        INSERT INTO transactions (transaction_type, transaction_date, store_id) VALUES ('In', '2026-01-01', 1);
        INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_price) VALUES (1, 1, 10, 500), (1, 2, 5, 20);
    `);
    return db;
}

const stockOf = (db, itemId) =>
    db.prepare('SELECT current_quantity FROM view_current_stock WHERE item_id = ?').get(itemId).current_quantity;

// Mirrors the transaction body of save-dispense-receipt in main.js.
function dispense(db, items) {
    const run = db.transaction(() => {
        const totals = validateReceiptItems(db, items);
        const info = db.prepare(
            "INSERT INTO transactions (transaction_type, transaction_date, store_id) VALUES ('Out', '2026-02-01', 1)"
        ).run();
        const stmt = db.prepare(
            'INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_price) VALUES (?, ?, ?, 0)'
        );
        for (const [itemId, quantity] of totals) {
            stmt.run(info.lastInsertRowid, itemId, quantity);
        }
        assertNoNegativeStock(db, totals.keys());
    });
    run();
}

console.log('\nStock Guard Test');
console.log('================\n');

// --- The premise the whole design rests on --------------------------------
console.log('premise — the view sees uncommitted writes on the same connection:');
{
    const db = buildDb();
    let visible = null;
    const probe = db.transaction(() => {
        const info = db.prepare(
            "INSERT INTO transactions (transaction_type, transaction_date, store_id) VALUES ('Out', '2026-02-01', 1)"
        ).run();
        db.prepare('INSERT INTO transaction_details (transaction_id, item_id, quantity) VALUES (?, 1, 4)')
            .run(info.lastInsertRowid);
        visible = stockOf(db, 1); // read INSIDE the open transaction
        throw new Error('rollback');
    });
    try { probe(); } catch (e) { /* intentional rollback */ }

    assert(visible === 6, 'view_current_stock reflects the uncommitted dispense (10 - 4 = 6)');
    assert(stockOf(db, 1) === 10, 'and the rollback restores it (back to 10)');
    db.close();
}

// --- Over-dispense --------------------------------------------------------
console.log('\nover-dispense is refused and rolled back:');
{
    const db = buildDb();
    assert(stockOf(db, 1) === 10, 'stock starts at 10');

    const err = throws(
        () => dispense(db, [{ itemId: 1, quantity: 12 }]),
        /الكمية المتاحة لا تكفي/,
        'dispensing 12 against a stock of 10 throws'
    );
    assert(err && err.message.includes('لابتوب ديل'), 'the error names the item');
    assert(stockOf(db, 1) === 10, 'stock is unchanged after the refusal (rolled back)');
    assert(db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c === 1, 'no orphan transaction header is left behind');
    assert(db.inTransaction === false, 'no transaction is leaked');
    db.close();
}

// --- Duplicate lines for one item ------------------------------------------
console.log('\nduplicate lines for the same item are summed, not checked line-by-line:');
{
    const db = buildDb();
    throws(
        () => dispense(db, [{ itemId: 1, quantity: 6 }, { itemId: 1, quantity: 6 }]),
        /الكمية المتاحة لا تكفي/,
        'two lines of 6 against a stock of 10 throws (each line alone would pass)'
    );
    assert(stockOf(db, 1) === 10, 'stock is unchanged');
    db.close();
}

// --- Degenerate quantities --------------------------------------------------
console.log('\ndegenerate quantities are rejected before any write:');
{
    const db = buildDb();
    throws(() => dispense(db, [{ itemId: 1, quantity: 0 }]), /أكبر من صفر/, 'quantity 0 is rejected');
    throws(() => dispense(db, [{ itemId: 1, quantity: -5 }]), /أكبر من صفر/, 'a negative quantity is rejected (it would INCREASE stock)');
    throws(() => dispense(db, [{ itemId: 1, quantity: 'abc' }]), /أكبر من صفر/, 'a non-numeric quantity is rejected');
    throws(() => dispense(db, []), /بدون أصناف/, 'an empty receipt is rejected (it would create an orphan header)');
    throws(() => dispense(db, [{ itemId: 999, quantity: 1 }]), /غير موجود/, 'an unknown item is rejected');
    assert(db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c === 1, 'none of the rejects wrote a transaction');
    db.close();
}

// --- Happy path -------------------------------------------------------------
console.log('\nvalid dispenses still work:');
{
    const db = buildDb();
    dispense(db, [{ itemId: 1, quantity: 10 }]);
    assert(stockOf(db, 1) === 0, 'dispensing the full stock succeeds and lands exactly on zero');

    dispense(db, [{ itemId: 2, quantity: 2 }]);
    assert(stockOf(db, 2) === 3, 'a partial dispense of another item succeeds (5 - 2 = 3)');
    db.close();
}

// --- Supply price validation ------------------------------------------------
console.log('\nsupply price validation:');
{
    const db = buildDb();
    throws(
        () => validateReceiptItems(db, [{ itemId: 1, quantity: 1, price: -5 }], { requirePrice: true }),
        /غير سالب/,
        'a negative unit price is rejected'
    );
    const totals = validateReceiptItems(db, [{ itemId: 1, quantity: 3, price: 0 }], { requirePrice: true });
    assert(totals.get(1) === 3, 'a zero price is allowed (donations, transfers)');
    db.close();
}

// --- aggregateByItem --------------------------------------------------------
console.log('\naggregateByItem:');
{
    const totals = aggregateByItem([
        { itemId: 1, quantity: 2 }, { itemId: 2, quantity: 5 }, { itemId: 1, quantity: 3 }
    ]);
    assert(totals.get(1) === 5, 'quantities for a repeated item are summed (2 + 3 = 5)');
    assert(totals.get(2) === 5, 'other items are preserved');
    assert(totals.size === 2, 'one entry per distinct item');
}

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
