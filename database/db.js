const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');

// ============================================================
// LAZY DATABASE INITIALIZATION
// Do NOT open the database at module load time.
// Wait until getDb() is called (after app.whenReady()).
// This prevents creating the database in a temporary directory
// when app.getPath('userData') is called before Electron is ready.
// ============================================================

let dbInstance = null;
let dbPath = null;
let initialized = false;

// توليد هاش لكلمة المرور باستخدام scrypt
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt:${salt}:${derived}`;
}

function getDbPath() {
    if (!dbPath) {
        const dataPath = app.getPath('userData');
        dbPath = path.join(dataPath, 'warehouse_system.sqlite');
        console.log('[DB] Database path:', dbPath);
    }
    return dbPath;
}

function getDb() {
    if (!dbInstance) {
        const dbFile = getDbPath();

        // Ensure directory exists
        const dir = path.dirname(dbFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        dbInstance = new Database(dbFile);
        dbInstance.pragma('journal_mode = WAL');       // Write-Ahead Logging for durability
        dbInstance.pragma('synchronous = NORMAL');     // Balance between safety and speed
        dbInstance.pragma('foreign_keys = ON');        // Enforce referential integrity

        console.log('[DB] Database opened successfully at:', dbFile);
        console.log('[DB] Journal mode:', dbInstance.pragma('journal_mode', { simple: true }));
    }
    return dbInstance;
}

// Close database (used for restore operations)
function closeDb() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
        console.log('[DB] Database connection closed.');
    }
}

// Reopen database (after restore)
function reopenDb() {
    closeDb();
    initialized = false;
    return getDb();
}

// ============================================================
// DATABASE INITIALIZATION (Schema + Seed Data)
// ============================================================

function initializeDatabase() {
    if (initialized) {
        console.log('[DB] Already initialized, skipping.');
        return;
    }

    const db = getDb();

    // Migration: remove receipt_number column from existing databases
    try {
        const tableInfo = db.prepare("PRAGMA table_info(transactions)").all();
        const hasReceiptNumber = tableInfo.some(col => col.name === 'receipt_number');
        if (hasReceiptNumber) {
            console.log('[DB] Migrating: removing receipt_number column...');
            db.exec(`
                BEGIN TRANSACTION;
                DROP VIEW IF EXISTS view_current_stock;
                CREATE TABLE transactions_new (
                    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    transaction_type TEXT CHECK(transaction_type IN ('In', 'Out', 'Opening_Balance')) NOT NULL,
                    transaction_date DATETIME NOT NULL,
                    store_id INTEGER NOT NULL,
                    entity_id INTEGER,
                    created_by INTEGER,
                    notes TEXT,
                    is_deleted INTEGER DEFAULT 0,
                    FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE RESTRICT,
                    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE RESTRICT,
                    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT
                );
                INSERT INTO transactions_new
                    (transaction_id, transaction_type, transaction_date, store_id, entity_id, created_by, notes, is_deleted)
                SELECT
                    transaction_id, transaction_type, transaction_date, store_id, entity_id, created_by, notes, is_deleted
                FROM transactions;
                DROP TABLE transactions;
                ALTER TABLE transactions_new RENAME TO transactions;
                COMMIT;
            `);
            console.log('[DB] Migration complete.');
        }
    } catch (e) {
        console.error('[DB] Migration warning:', e.message);
    }

    const init = db.transaction(() => {

        // 1. Users table
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT CHECK(role IN ('Admin', 'Store_Keeper', 'Viewer')) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active INTEGER DEFAULT 1
            );
        `);

        // 2. Stores table
        db.exec(`
            CREATE TABLE IF NOT EXISTS stores (
                store_id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_name TEXT NOT NULL,
                location TEXT,
                manager_id INTEGER,
                FOREIGN KEY (manager_id) REFERENCES users(user_id) ON DELETE SET NULL
            );
        `);

        // 3. Items table
        db.exec(`
            CREATE TABLE IF NOT EXISTS items (
                item_id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_name TEXT NOT NULL,
                unit TEXT NOT NULL,
                category TEXT,
                min_order_qty REAL DEFAULT 0.00,
                is_deleted INTEGER DEFAULT 0
            );
        `);

        // 4. Entities table
        db.exec(`
            CREATE TABLE IF NOT EXISTS entities (
                entity_id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_name TEXT NOT NULL,
                entity_type TEXT CHECK(entity_type IN ('Supplier', 'Department', 'Employee')) NOT NULL,
                phone TEXT,
                is_deleted INTEGER DEFAULT 0
            );
        `);

        // 5. Transactions table
        db.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_type TEXT CHECK(transaction_type IN ('In', 'Out', 'Opening_Balance')) NOT NULL,
                transaction_date DATETIME NOT NULL,
                store_id INTEGER NOT NULL,
                entity_id INTEGER,
                created_by INTEGER,
                notes TEXT,
                is_deleted INTEGER DEFAULT 0,
                FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE RESTRICT,
                FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE RESTRICT,
                FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT
            );
        `);

        // 6. Transaction details table
        db.exec(`
            CREATE TABLE IF NOT EXISTS transaction_details (
                detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                quantity REAL NOT NULL,
                unit_price REAL DEFAULT 0.00,
                FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
                FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE RESTRICT
            );
        `);

        // 7. Current stock view (includes category)
        db.exec(`
            CREATE VIEW IF NOT EXISTS view_current_stock AS
            SELECT
                i.item_id,
                i.item_name,
                i.unit,
                i.category,
                i.min_order_qty,
                COALESCE(
                    SUM(CASE WHEN t.transaction_type IN ('In', 'Opening_Balance') THEN td.quantity ELSE 0 END)
                    -
                    SUM(CASE WHEN t.transaction_type = 'Out' THEN td.quantity ELSE 0 END),
                0) AS current_quantity
            FROM items i
            LEFT JOIN transaction_details td ON i.item_id = td.item_id
            LEFT JOIN transactions t ON td.transaction_id = t.transaction_id AND t.is_deleted = 0
            WHERE i.is_deleted = 0
            GROUP BY i.item_id, i.item_name, i.unit, i.category, i.min_order_qty;
        `);

        // 8. Performance indexes
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_items_is_deleted ON items(is_deleted);
            CREATE INDEX IF NOT EXISTS idx_entities_type_deleted ON entities(entity_type, is_deleted);
            CREATE INDEX IF NOT EXISTS idx_transactions_type_date_deleted ON transactions(transaction_type, transaction_date, is_deleted);
            CREATE INDEX IF NOT EXISTS idx_transaction_details_transaction_id ON transaction_details(transaction_id);
            CREATE INDEX IF NOT EXISTS idx_transaction_details_item_id ON transaction_details(item_id);
        `);

        // 9. Seed data (only if no users exist)
        const checkUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        if (checkUsers.count === 0) {
            console.log('[DB] Inserting seed data...');

            db.prepare(`INSERT INTO users (full_name, password_hash, role) VALUES ('admin', ?, 'Admin')`).run(hashPassword('admin'));
            const adminUser = db.prepare('SELECT user_id FROM users WHERE full_name = ?').get('admin');

            db.prepare(`INSERT INTO entities (entity_name, entity_type, phone) VALUES ('شركة الأفق للحاسبات', 'Supplier', '0920000000')`).run();
            db.prepare(`INSERT INTO entities (entity_name, entity_type) VALUES ('قسم تقنية المعلومات', 'Department')`).run();

            db.prepare(`INSERT INTO stores (store_name, location, manager_id) VALUES ('المخزن الرئيسي', 'المبنى الإداري', ?)`).run(adminUser.user_id);

            db.prepare(`INSERT INTO items (item_name, unit, category, min_order_qty) VALUES ('لابتوب ديل', 'قطعة', 'أجهزة إلكترونية', 5)`).run();

            console.log('[DB] Seed data inserted.');
        }
    });

    init();
    initialized = true;
    console.log('[DB] Initialization complete.');
}

// ============================================================
// EXPORTS
// ============================================================

// Export a Proxy that calls getDb() on every property access.
// This keeps the existing `db.prepare(...)` API working while
// ensuring the connection is only opened after Electron is ready.
module.exports = new Proxy({}, {
    get(target, prop) {
        // Explicit utility exports must be resolved before touching the DB
        if (prop === 'getDb') return getDb;
        if (prop === 'closeDb') return closeDb;
        if (prop === 'reopenDb') return reopenDb;
        if (prop === 'initializeDatabase') return initializeDatabase;
        if (prop === 'hashPassword') return hashPassword;
        if (prop === 'getDbPath') return getDbPath;

        const db = getDb();
        const value = db[prop];
        return typeof value === 'function' ? value.bind(db) : value;
    }
});

// Keep explicit assignments for compatibility with static analysis / importers
module.exports.getDb = getDb;
module.exports.closeDb = closeDb;
module.exports.reopenDb = reopenDb;
module.exports.initializeDatabase = initializeDatabase;
module.exports.hashPassword = hashPassword;
module.exports.getDbPath = getDbPath;
