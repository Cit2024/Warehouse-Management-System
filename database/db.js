// database/db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// 1. تحديد مسار حفظ ملف قاعدة البيانات
// نضعها في مجلد بيانات المستخدم في النظام (AppData) لتجنب مسحها عند تحديث التطبيق
const dataPath = app.getPath('userData'); 
const dbPath = path.join(dataPath, 'warehouse_system.sqlite');

// 2. الاتصال بقاعدة البيانات (سيقوم بإنشاء الملف تلقائياً إذا لم يكن موجوداً)
const db = new Database(dbPath);

// 3. تفعيل المفاتيح الأجنبية (ضروري جداً في SQLite لحماية العلاقات بين الجداول)
db.pragma('foreign_keys = ON');

// 4. دالة بناء الجداول (Schema)
function initializeDatabase() {
    // نستخدم transaction لضمان تنفيذ كل الأوامر دفعة واحدة
    const init = db.transaction(() => {
        
        // جدول المستخدمين
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

        // جدول المخازن
        db.exec(`
            CREATE TABLE IF NOT EXISTS stores (
                store_id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_name TEXT NOT NULL,
                location TEXT,
                manager_id INTEGER,
                FOREIGN KEY (manager_id) REFERENCES users(user_id) ON DELETE SET NULL
            );
        `);

        // جدول الأصناف
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

        // إدخال مستخدم افتراضي وصنف افتراضي (للتجربة فقط في أول تشغيل)
        const checkUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        if (checkUsers.count === 0) {
            db.prepare(`INSERT INTO users (full_name, password_hash, role) VALUES (?, ?, ?)`).run('مدير النظام', 'admin123', 'Admin');
        }
    });

    init(); // تشغيل عملية البناء
}

// تنفيذ البناء عند استدعاء الملف
initializeDatabase();

// تصدير كائن قاعدة البيانات لاستخدامه في main.js
module.exports = db;
