/**
 * Backup / restore correctness.
 *
 * Covers three shipped regressions:
 *   1. generateSQLDump() dumped only tables, so database_dump.sql — the
 *      disaster-recovery artifact — was missing view_current_stock and every
 *      index. Restored outside the app, every report failed.
 *   2. getHistory() returned no fullCommitId, so get-merged-backups keyed its
 *      Map on undefined and collapsed every local backup into one entry.
 *   3. Dates were locale strings, so the "newest first" sort was a NaN no-op —
 *      "restore the latest backup" could silently restore an old one.
 *
 * MUST run under Electron's ABI:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron tests/gitBackup.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const GitManager = require('../gitManager.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  ✓', message); }
    else { failed++; console.error('  ✗', message); }
}

// GitManager takes userDataPath, so it is testable against a temp dir with no
// Electron boot.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cit-backup-test-'));
const dbPath = path.join(workDir, 'warehouse_system.sqlite');

function seedDatabase() {
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE users (user_id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, password_hash TEXT, role TEXT);
        CREATE TABLE stores (store_id INTEGER PRIMARY KEY AUTOINCREMENT, store_name TEXT NOT NULL);
        CREATE TABLE entities (entity_id INTEGER PRIMARY KEY AUTOINCREMENT, entity_name TEXT NOT NULL, entity_type TEXT, is_deleted INTEGER DEFAULT 0);
        CREATE TABLE items (item_id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT NOT NULL, unit TEXT, is_deleted INTEGER DEFAULT 0);
        CREATE TABLE transactions (
            transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_type TEXT NOT NULL, transaction_date DATETIME NOT NULL,
            store_id INTEGER NOT NULL, entity_id INTEGER, created_by INTEGER,
            notes TEXT, is_deleted INTEGER DEFAULT 0
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
        CREATE INDEX idx_items_is_deleted ON items(is_deleted);
        CREATE INDEX idx_transaction_details_item_id ON transaction_details(item_id);

        INSERT INTO stores (store_name) VALUES ('المخزن الرئيسي');
        INSERT INTO items (item_name, unit) VALUES ('لابتوب ديل', 'قطعة');
        INSERT INTO entities (entity_name, entity_type) VALUES ('شركة الأفق للحاسبات', 'Supplier');
        INSERT INTO transactions (transaction_type, transaction_date, store_id, notes)
            VALUES ('In', '2026-01-01 00:00:00', 1, 'توريد أول — يحتوي على فاصلة عليا: ''test''');
        INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_price) VALUES (1, 1, 10, 500);
    `);
    db.close();
}

(async () => {
    console.log('\nBackup / Restore Test');
    console.log('=====================\n');

    seedDatabase();
    const manager = new GitManager(workDir);
    await manager.init();

    // --- Dump completeness ------------------------------------------------
    console.log('generateSQLDump — produces a self-contained, restorable backup:');
    manager.generateSQLDump();
    const dump = fs.readFileSync(manager.sqlFilePath, 'utf8');

    assert(dump.includes('CREATE TABLE transactions'), 'dump contains the table schemas');
    assert(dump.includes('CREATE VIEW view_current_stock'), 'dump contains view_current_stock (was missing entirely)');
    assert(dump.includes('idx_items_is_deleted'), 'dump contains the indexes');
    assert(
        dump.indexOf('CREATE VIEW') > dump.lastIndexOf('INSERT INTO'),
        'views are emitted after the tables and their data (order matters on replay)'
    );
    assert(
        dump.indexOf('PRAGMA foreign_keys=OFF') < dump.indexOf('BEGIN TRANSACTION'),
        'foreign_keys is disabled OUTSIDE the transaction (inside, the pragma is a silent no-op)'
    );
    assert(dump.includes("'توريد أول — يحتوي على فاصلة عليا: ''test'''"), 'Arabic text and embedded quotes are escaped correctly');

    // The assertion that actually proves the fix: replay the dump into a fresh
    // database and query the view every major screen depends on.
    const replayPath = path.join(workDir, 'replay.sqlite');
    const replay = new Database(replayPath);
    let replayWorked = true;
    let stock = null;
    try {
        replay.exec(dump);
        stock = replay.prepare('SELECT current_quantity FROM view_current_stock WHERE item_id = 1').get();
    } catch (error) {
        replayWorked = false;
        console.error('    replay error:', error.message);
    }
    assert(replayWorked, 'the dump replays into a fresh database without error');
    assert(stock && stock.current_quantity === 10, 'view_current_stock works on the restored database (the whole point)');
    replay.close();

    // --- History: identity and ordering -----------------------------------
    console.log('\ngetHistory — backups are distinct and sortable:');
    const first = await manager.commitLocalBackup('نسخة احتياطية أولى');
    assert(first && first.success !== false, 'first commit succeeds');

    // Mutate, then take a second backup.
    const live = new Database(dbPath);
    live.prepare("INSERT INTO items (item_name, unit) VALUES ('ورق A4', 'رزمة')").run();
    live.close();
    await manager.commitLocalBackup('نسخة احتياطية ثانية');

    const history = await manager.getHistory();
    assert(history.length >= 2, `history returns every commit (found ${history.length})`);
    assert(typeof history[0].fullCommitId === 'string' && history[0].fullCommitId.length === 40, 'each entry carries a full 40-char commit id');
    assert(Number.isFinite(history[0].timestamp), 'each entry carries a numeric timestamp');

    // The exact regression: get-merged-backups keys its Map on fullCommitId.
    const keyed = new Map(history.map((c) => [c.fullCommitId, c]));
    assert(keyed.size === history.length, `keying by fullCommitId keeps every backup distinct (${keyed.size}/${history.length}, was collapsing to 1)`);

    const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
    assert(sorted[0].timestamp >= sorted[sorted.length - 1].timestamp, 'sorting by timestamp actually orders the list (the old date-string sort was a NaN no-op)');

    // --- Round trip --------------------------------------------------------
    console.log('\nrestoreFromCommit — round trip returns the original data:');
    const oldestFirstCommit = sorted[sorted.length - 1].fullCommitId;

    const beforeRestore = new Database(dbPath);
    const countBefore = beforeRestore.prepare('SELECT COUNT(*) AS c FROM items').get().c;
    beforeRestore.close();
    assert(countBefore === 2, 'live database has both items before the restore');

    const result = await manager.restoreFromCommit(oldestFirstCommit);
    assert(result && result.success, `restoring the first backup succeeds (${result && result.message})`);

    const afterRestore = new Database(dbPath);
    const countAfter = afterRestore.prepare('SELECT COUNT(*) AS c FROM items').get().c;
    const viewAlive = afterRestore.prepare(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='view' AND name='view_current_stock'"
    ).get().c;
    afterRestore.close();

    assert(countAfter === 1, 'the restored database is back to its earlier state (2 items -> 1)');
    assert(viewAlive === 1, 'the restored database still has view_current_stock');

    console.log('\n---------------------------');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('---------------------------\n');

    fs.rmSync(workDir, { recursive: true, force: true });
    process.exit(failed > 0 ? 1 : 0);
})();
