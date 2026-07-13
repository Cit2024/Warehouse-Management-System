// ============================================================
// المهاجرات وفحص سلامة البيانات
//
// دوال خالصة (Pure): تستقبل اتصال قاعدة البيانات ولا تعتمد على Electron،
// لذلك يمكن اختبارها مباشرة على قاعدة بيانات في الذاكرة (:memory:).
// ============================================================

// هيكل جدول transactions الرسمي (بدون receipt_number)
const TRANSACTIONS_SCHEMA = `
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
`;

/**
 * إزالة عمود receipt_number من جدول transactions.
 *
 * تحذير تاريخي: النسخة السابقة من هذه المهاجرة كانت تنفّذ DROP TABLE transactions
 * بينما foreign_keys = ON. حذف الجدول في SQLite يُنفَّذ داخلياً كـ DELETE ضمني،
 * وهو ما كان يُفعّل ON DELETE CASCADE على transaction_details ويمسح كل سطور
 * الأذونات (الكميات والأسعار) بصمت — دون رمي أي خطأ.
 *
 * الحل هنا هو إجراء إعادة البناء الموثّق من SQLite:
 *   1. إطفاء foreign_keys خارج أي معاملة (إطفاؤها داخل معاملة لا يفعل شيئاً).
 *   2. إعادة البناء داخل db.transaction() لضمان التراجع الكامل عند أي خطأ.
 *   3. foreign_key_check داخل المعاملة كشبكة أمان: أي انتهاك يرمي خطأ ويتراجع.
 *   4. إعادة foreign_keys إلى حالتها الأصلية في finally.
 *
 * @returns {boolean} true إذا تم التنفيذ، false إذا لم تكن هناك حاجة له
 */
function migrateRemoveReceiptNumber(db) {
    const columns = db.prepare('PRAGMA table_info(transactions)').all();
    if (!columns.some((col) => col.name === 'receipt_number')) {
        return false; // القاعدة محدّثة أصلاً
    }

    console.log('[DB] Migrating: removing receipt_number column (safe rebuild)...');

    const foreignKeysWereOn = db.pragma('foreign_keys', { simple: true }) === 1;

    // يجب أن يكون هذا خارج أي معاملة، وإلا فهو أمر بلا أثر
    db.pragma('foreign_keys = OFF');

    try {
        const rebuild = db.transaction(() => {
            db.exec('DROP VIEW IF EXISTS view_current_stock;');
            db.exec(TRANSACTIONS_SCHEMA);
            db.exec(`
                INSERT INTO transactions_new
                    (transaction_id, transaction_type, transaction_date, store_id, entity_id, created_by, notes, is_deleted)
                SELECT
                    transaction_id, transaction_type, transaction_date, store_id, entity_id, created_by, notes, is_deleted
                FROM transactions;
            `);
            db.exec('DROP TABLE transactions;');
            db.exec('ALTER TABLE transactions_new RENAME TO transactions;');

            // شبكة الأمان: إن كسر أي شيء الروابط، نتراجع عن كل شيء
            const violations = db.pragma('foreign_key_check');
            if (violations.length > 0) {
                throw new Error(
                    `فشل التحقق من سلامة الروابط بعد إعادة البناء (${violations.length} انتهاك). تم التراجع عن التعديل.`
                );
            }
        });

        rebuild();
    } finally {
        if (foreignKeysWereOn) {
            db.pragma('foreign_keys = ON');
        }
    }

    console.log('[DB] Migration complete (line items preserved).');
    return true;
}

/**
 * إضافة أعمدة الإلغاء إلى جدول transactions في القواعد القائمة.
 *
 * ALTER TABLE ADD COLUMN عملية على البيانات الوصفية فقط: لا تُعيد بناء الجدول،
 * ولا تُنفّذ حذفاً ضمنياً، ولا تُفعّل CASCADE — أي أنها لا تحمل الخطر الذي دمّر
 * بيانات المستخدمين في مهاجرة receipt_number.
 *
 * is_deleted وحده لا يكفي: بدونه لا يمكن التمييز بين إلغاء متعمّد وخلل برمجي،
 * ومغزى دفتر الحسابات هو إمكانية التدقيق.
 *
 * @returns {string[]} الأعمدة التي أُضيفت فعلاً
 */
function migrateAddVoidColumns(db) {
    const existing = db.prepare('PRAGMA table_info(transactions)').all().map((col) => col.name);

    const wanted = [
        { name: 'void_reason', ddl: 'ALTER TABLE transactions ADD COLUMN void_reason TEXT' },
        { name: 'voided_by', ddl: 'ALTER TABLE transactions ADD COLUMN voided_by INTEGER' },
        { name: 'voided_at', ddl: 'ALTER TABLE transactions ADD COLUMN voided_at DATETIME' }
    ];

    const added = [];
    for (const column of wanted) {
        if (!existing.includes(column.name)) {
            db.exec(column.ddl);
            added.push(column.name);
        }
    }

    if (added.length > 0) {
        console.log(`[DB] Added void audit columns: ${added.join(', ')}`);
    }
    return added;
}

/**
 * فحص سلامة البيانات — يكشف الأضرار التي خلّفتها المهاجرة القديمة.
 *
 * orphanHeaders: أذونات بلا أي أصناف. التطبيق لا يمكنه إنتاج هذا إطلاقاً —
 * كلٌ من supply.js و dispense.js يرفضان حفظ إذن فارغ — لذا فوجود إذن بلا
 * سطور هو دليل على أن CASCADE مسح سطوره. لا نحذف هذه الأذونات: هي الدليل،
 * وهي أصلاً لا تؤثر على الأرصدة (لا سطور لها).
 *
 * negativeStockItems: العَرَض المترتب على ذلك — أصناف رصيدها سالب.
 */
function checkIntegrity(db) {
    const orphanHeaders = db.prepare(`
        SELECT COUNT(*) AS count
        FROM transactions t
        WHERE t.is_deleted = 0
          AND NOT EXISTS (
              SELECT 1 FROM transaction_details td WHERE td.transaction_id = t.transaction_id
          )
    `).get().count;

    // نحسب الرصيد من الجداول الأساسية مباشرة بدل الاعتماد على view_current_stock:
    // فحص السلامة قد يُستدعى أثناء المهاجرة، وهي تُسقط العرض مؤقتاً.
    // التعريف هنا مطابق تماماً لتعريف العرض في db.js.
    const negativeStockItems = db.prepare(`
        SELECT i.item_name, i.unit,
               COALESCE(
                   SUM(CASE WHEN t.transaction_type IN ('In', 'Opening_Balance') THEN td.quantity ELSE 0 END)
                   -
                   SUM(CASE WHEN t.transaction_type = 'Out' THEN td.quantity ELSE 0 END),
               0) AS current_quantity
        FROM items i
        LEFT JOIN transaction_details td ON i.item_id = td.item_id
        LEFT JOIN transactions t ON td.transaction_id = t.transaction_id AND t.is_deleted = 0
        WHERE i.is_deleted = 0
        GROUP BY i.item_id, i.item_name, i.unit
        HAVING current_quantity < 0
    `).all();

    return {
        orphanHeaders,
        negativeStockItems,
        isHealthy: orphanHeaders === 0 && negativeStockItems.length === 0
    };
}

module.exports = { migrateRemoveReceiptNumber, migrateAddVoidColumns, checkIntegrity };
