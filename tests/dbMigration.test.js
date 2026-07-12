/**
 * Regression test for the receipt_number migration.
 *
 * The old migration ran DROP TABLE transactions with foreign_keys = ON. SQLite
 * implements DROP as an implicit DELETE, which fired transaction_details'
 * ON DELETE CASCADE and destroyed every line item — silently, reporting success.
 * Reproduced before the fix: 2 line items -> 0.
 *
 * MUST run under Electron's ABI:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron tests/dbMigration.test.js
 * Plain `node` dies with ERR_DLOPEN_FAILED.
 */

const Database = require('better-sqlite3');
const { migrateRemoveReceiptNumber, checkIntegrity } = require('../database/migrations');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  ✓', message); }
    else { failed++; console.error('  ✗', message); }
}

// The pre-migration schema, exactly as shipped: receipt_number present,
// transaction_details cascading on delete.
function buildLegacyDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE users (user_id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT);
        CREATE TABLE stores (store_id INTEGER PRIMARY KEY AUTOINCREMENT, store_name TEXT);
        CREATE TABLE entities (entity_id INTEGER PRIMARY KEY AUTOINCREMENT, entity_name TEXT);
        CREATE TABLE items (item_id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT, unit TEXT, is_deleted INTEGER DEFAULT 0);
        CREATE TABLE transactions (
            transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_number TEXT,
            transaction_type TEXT CHECK(transaction_type IN ('In','Out','Opening_Balance')) NOT NULL,
            transaction_date DATETIME NOT NULL,
            store_id INTEGER NOT NULL,
            entity_id INTEGER,
            created_by INTEGER,
            notes TEXT,
            is_deleted INTEGER DEFAULT 0,
            FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE RESTRICT
        );
        CREATE TABLE transaction_details (
            detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            unit_price REAL DEFAULT 0,
            FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE RESTRICT
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
        INSERT INTO transactions (receipt_number, transaction_type, transaction_date, store_id)
            VALUES ('R-001', 'In', '2026-01-01', 1);
        INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_price)
            VALUES (1, 1, 10, 500), (1, 2, 3, 20);
    `);
    return db;
}

const count = (db, table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;

console.log('\nDatabase Migration Test');
console.log('=======================\n');

// --- The regression itself ------------------------------------------------
console.log('migrateRemoveReceiptNumber — line items survive:');
{
    const db = buildLegacyDb();
    assert(count(db, 'transaction_details') === 2, 'fixture starts with 2 line items');

    const ran = migrateRemoveReceiptNumber(db);

    assert(ran === true, 'migration reports that it ran');
    assert(count(db, 'transaction_details') === 2, 'LINE ITEMS SURVIVE the rebuild (was 2 -> 0 before the fix)');
    assert(count(db, 'transactions') === 1, 'the transaction header survives');

    const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
    assert(!cols.includes('receipt_number'), 'receipt_number column is gone');
    assert(cols.includes('transaction_id') && cols.includes('notes'), 'the other columns are intact');

    const detail = db.prepare('SELECT quantity, unit_price FROM transaction_details WHERE item_id = 1').get();
    assert(detail.quantity === 10 && detail.unit_price === 500, 'quantities and prices are preserved, not just row counts');

    assert(db.pragma('foreign_keys', { simple: true }) === 1, 'foreign_keys is restored to ON afterwards');
    assert(db.inTransaction === false, 'no transaction is left open');
    db.close();
}

// --- Idempotency ----------------------------------------------------------
console.log('\nmigrateRemoveReceiptNumber — idempotent:');
{
    const db = buildLegacyDb();
    migrateRemoveReceiptNumber(db);
    const ranAgain = migrateRemoveReceiptNumber(db);
    assert(ranAgain === false, 'second run is a no-op on an already-migrated database');
    assert(count(db, 'transaction_details') === 2, 'a second run does not touch the data');
    db.close();
}

// --- Failure path: the DB must be left untouched ---------------------------
console.log('\nmigrateRemoveReceiptNumber — rolls back cleanly on failure:');
{
    const db = buildLegacyDb();
    // Poison the rebuild: transactions_new already exists, so CREATE TABLE throws
    // partway through — after DROP VIEW, before any data is moved.
    db.exec('CREATE TABLE transactions_new (x INTEGER);');

    let threw = false;
    try { migrateRemoveReceiptNumber(db); } catch (e) { threw = true; }

    assert(threw, 'a failing rebuild throws instead of reporting success');
    assert(count(db, 'transactions') === 1, 'the transactions table is unchanged after the failure');
    assert(count(db, 'transaction_details') === 2, 'line items are unchanged after the failure');
    assert(db.inTransaction === false, 'no transaction is leaked (a leak would roll back the whole session on quit)');
    assert(db.pragma('foreign_keys', { simple: true }) === 1, 'foreign_keys is restored to ON even on the failure path');
    db.close();
}

// --- Damage detection ------------------------------------------------------
console.log('\ncheckIntegrity — detects damage from the old migration:');
{
    const healthy = buildLegacyDb();
    migrateRemoveReceiptNumber(healthy);
    const good = checkIntegrity(healthy);
    assert(good.orphanHeaders === 0, 'a healthy database reports no orphan headers');
    assert(good.negativeStockItems.length === 0, 'a healthy database reports no negative stock');
    assert(good.isHealthy === true, 'a healthy database is reported healthy');
    healthy.close();

    // Simulate a database the OLD migration already destroyed: header kept,
    // line items cascaded away.
    const damaged = buildLegacyDb();
    damaged.exec('DELETE FROM transaction_details;');
    const bad = checkIntegrity(damaged);
    assert(bad.orphanHeaders === 1, 'an orphaned header (cascade victim) is detected');
    assert(bad.isHealthy === false, 'a damaged database is reported unhealthy');
    damaged.close();

    // Negative stock: dispense more than was supplied.
    const negative = buildLegacyDb();
    migrateRemoveReceiptNumber(negative);
    negative.exec(`
        INSERT INTO transactions (transaction_type, transaction_date, store_id) VALUES ('Out', '2026-01-02', 1);
        INSERT INTO transaction_details (transaction_id, item_id, quantity) VALUES (2, 1, 99);
    `);
    const neg = checkIntegrity(negative);
    assert(neg.negativeStockItems.length === 1, 'an item with negative stock is detected');
    assert(neg.negativeStockItems[0].current_quantity === -89, 'the negative quantity is reported accurately');
    negative.close();
}

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
