const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// تحديد مسار حفظ ملف قاعدة البيانات (في مجلد AppData)
const dataPath = app.getPath('userData');
const dbPath = path.join(dataPath, 'warehouse_system.sqlite');

// الاتصال بقاعدة البيانات
const db = new Database(dbPath);

// تفعيل المفاتيح الأجنبية (ضروري جداً لحماية العلاقات)
db.pragma('foreign_keys = ON');

// دالة بناء الجداول (Schema) بالكامل
function initializeDatabase() {
    const init = db.transaction(() => {

        // 1. جدول المستخدمين
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

        // 2. جدول المخازن
        db.exec(`
            CREATE TABLE IF NOT EXISTS stores (
                store_id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_name TEXT NOT NULL,
                location TEXT,
                manager_id INTEGER,
                FOREIGN KEY (manager_id) REFERENCES users(user_id) ON DELETE SET NULL
            );
        `);

        // 3. جدول الأصناف
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

        // 4. جدول الجهات (entities) - الموردين والموظفين والأقسام
        db.exec(`
            CREATE TABLE IF NOT EXISTS entities (
                entity_id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_name TEXT NOT NULL,
                entity_type TEXT CHECK(entity_type IN ('Supplier', 'Department', 'Employee')) NOT NULL,
                phone TEXT,
                is_deleted INTEGER DEFAULT 0
            );
        `);

        // 5. جدول الحركات - رأس المستند (transactions)
        db.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_type TEXT CHECK(transaction_type IN ('In', 'Out', 'Opening_Balance')) NOT NULL,
                transaction_date DATETIME NOT NULL,
                receipt_number TEXT,
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

        // 6. جدول تفاصيل الحركات - سطور المستند (transaction_details)
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

        // 7. العرض المتقدم (View) لحساب الرصيد اللحظي - بناءً على تصميمك
        db.exec(`
            CREATE VIEW IF NOT EXISTS view_current_stock AS
            SELECT 
                i.item_id,
                i.item_name,
                i.unit,
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
            GROUP BY i.item_id, i.item_name, i.unit, i.min_order_qty;
        `);

        // ==========================================
        // البيانات التجريبية (Seed Data) لتجربة النظام
        // ==========================================

        // التحقق من وجود مستخدمين، إذا لم يوجد، نضيف البيانات التجريبية
        const checkUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        if (checkUsers.count === 0) {
            // 1. المستخدمين أولاً (لا يعتمدون على أي جدول آخر)
            db.prepare(`
                INSERT INTO users (full_name, password_hash, role) 
                VALUES ('admin', 'admin', 'Admin')
            `).run();

            // الحصول على الـ user_id الفعلي الذي أُنشئ تلقائياً
            const adminUser = db.prepare('SELECT user_id FROM users WHERE full_name = ?').get('admin');

            // 2. الجهات (لا تعتمد على جداول أخرى)
            db.prepare(`
                INSERT INTO entities (entity_name, entity_type, phone) 
                VALUES ('شركة الأفق للحاسبات', 'Supplier', '0920000000')
            `).run();

            db.prepare(`
                INSERT INTO entities (entity_name, entity_type) 
                VALUES ('قسم تقنية المعلومات', 'Department')
            `).run();

            // 3. المخازن (تعتمد على users — لذا تأتي بعد إنشاء المستخدم)
            db.prepare(`
                INSERT INTO stores (store_name, location, manager_id) 
                VALUES ('المخزن الرئيسي', 'المبنى الإداري', ?)
            `).run(adminUser.user_id);

            // 4. الأصناف (مستقلة)
            db.prepare(`
                INSERT INTO items (item_name, unit, category, min_order_qty) 
                VALUES ('لابتوب ديل', 'قطعة', 'أجهزة إلكترونية', 5)
            `).run();
        }
    });

    init();
}

// تشغيل الدالة
initializeDatabase();

module.exports = db;
