const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const GitManager = require('./gitManager.js');
const Database = require('better-sqlite3');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node'); // بروتوكول الاتصال لـ Push/Pull
let gitManager;
let db;
let scheduledBackupInterval = null;

// المزامنة السحابية معطّلة في هذا الإصدار: مسار الرفع كان يستخدم force push
// عند أي فشل شبكة عابر (وليس فقط عند مستودع فارغ)، مما يعني أن جهازاً واحداً
// قد يمسح تاريخ النسخ السحابية لبقية الأجهزة. الشيفرة باقية في المستودع
// وتُعاد بتغيير هذا الثابت وحده بعد إصلاح مسار المزامنة.
const CLOUD_SYNC_ENABLED = false;

// الجداول التي يجب أن تكون موجودة في أي نسخة احتياطية صالحة لهذه المنظومة
const REQUIRED_TABLES = ['users', 'stores', 'items', 'entities', 'transactions', 'transaction_details'];

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200, // عرض أكبر ليناسب لوحة التحكم
    height: 800,
    icon: path.join(__dirname, './assets/icon.png'),
    webPreferences: {
      // ربط ملف الجسر الآمن
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.removeMenu();  // إزالة شريط القوائم العلوي
  win.loadFile('index.html'); // يبدأ بصفحة تسجيل الدخول
  return win;
};

app.whenReady().then(async () => {
  // Initialize database AFTER app is ready (lazy init prevents temp-path data loss)
  db = require('./database/db');
  db.initializeDatabase();

  gitManager = new GitManager(app.getPath('userData'));
  await gitManager.init();
  await startAutoBackupScheduling();

  if (CLOUD_SYNC_ENABLED) {
    setInterval(() => {
      checkAndPushPendingBackups();
    }, 3600000);
  }
  const win = createWindow();

  // ==========================================
  // أدوات المطورين المخفية (Debug Shortcuts)
  // ==========================================
  if (!app.isPackaged) {
    console.log('🛠️ التطبيق يعمل في وضع المطور. الاختصارات مفعلة.');

    win.webContents.openDevTools();
    win.webContents.on('before-input-event', async (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 's') {
        console.log('\n🚀 تم تفعيل الرفع الإجباري من اختصار المطور...');
        await performAutoBackup();
        event.preventDefault(); // منع السلوك الافتراضي
      }
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ==========================================
// دوال مساعدة للاسترجاع
// ==========================================

// ملفات WAL/SHM تظل تشير إلى القاعدة القديمة؛ لو بقيت بعد الاستبدال قد تُظلّل
// القاعدة المستوردة ببيانات قديمة.
function cleanupWalFiles(dbPath) {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`;
    try {
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    } catch (error) {
      console.warn(`تعذّر حذف ${sidecar}:`, error.message);
    }
  }
}

// نتأكد أن القاعدة المستوردة تُفتح وتحتوي على الجداول المطلوبة قبل إعادة التشغيل.
// بدون هذا الفحص قد يُعاد تشغيل التطبيق على قاعدة تالفة دون أي طريق للعودة.
function assertDatabaseOpens(dbPath) {
  const probe = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = probe.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new Error(`قاعدة البيانات المستوردة تالفة (${integrity})`);
    }
    const found = probe.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all().map(row => row.name);
    const missing = REQUIRED_TABLES.filter(table => !found.includes(table));
    if (missing.length > 0) {
      throw new Error(`جداول مفقودة: ${missing.join('، ')}`);
    }
  } finally {
    probe.close();
  }
}

// ==========================================
// دوال مساعدة لتجزئة كلمات المرور
// ==========================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  // دعم كلمات المرور القديمة المخزنة كنص عادي
  if (storedHash === password) return true;
  if (!storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return derived === hash;
}

// ==========================================
// العمليات الخلفية (Backend) - الاتصال بقاعدة البيانات
// ==========================================

// فحص سلامة البيانات — يكشف الأضرار التي خلّفتها المهاجرة القديمة
// (أذونات فقدت سطورها بسبب CASCADE، أو أصناف برصيد سالب)
ipcMain.handle('get-db-health', async () => {
  try {
    return db.checkIntegrity();
  } catch (error) {
    console.error('[get-db-health] خطأ في فحص سلامة البيانات:', error);
    return { success: false, message: 'تعذّر فحص سلامة البيانات', error: error.message };
  }
});

// 1. جلب الأصناف من الجدول (فقط التي لم يتم حذفها منطقياً)
ipcMain.handle('get-items', async () => {
  try {
    // نجلب أعمدة الصنف الأساسية + الرصيد اللحظي (من view_current_stock) + آخر سعر شراء مسجّل له
    // (السعر غير مخزّن في جدول items لأنه يتغيّر من فاتورة توريد لأخرى، فنأخذ آخر سعر 'In' مسجّل)
    const items = db.prepare(`
      SELECT 
        i.item_id,
        i.item_name,
        i.unit,
        i.category,
        i.min_order_qty,
        i.is_deleted,
        COALESCE(vcs.current_quantity, 0) AS current_quantity,
        COALESCE((
          SELECT td.unit_price
          FROM transaction_details td
          JOIN transactions t ON t.transaction_id = td.transaction_id
          WHERE td.item_id = i.item_id
            AND t.transaction_type = 'In'
            AND t.is_deleted = 0
            AND td.unit_price > 0
          ORDER BY t.transaction_date DESC, t.transaction_id DESC
          LIMIT 1
        ), 0) AS unit_price
      FROM items i
      LEFT JOIN view_current_stock vcs ON vcs.item_id = i.item_id
      WHERE i.is_deleted = 0
      ORDER BY i.item_id DESC
    `).all();
    return items;
  } catch (error) {
    console.error('[get-items] خطأ في جلب الأصناف:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب الأصناف', error: error.message };
  }
});

// 2. إضافة صنف جديد
ipcMain.handle('add-item', async (event, newItem) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO items (item_name, unit, category, min_order_qty) 
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(
      newItem.item_name,
      newItem.unit,
      newItem.category,
      newItem.min_order_qty
    );

    return { success: true, message: 'تمت الإضافة بنجاح', id: info.lastInsertRowid };
  } catch (error) {
    console.error('[add-item] خطأ في إضافة الصنف:', error);
    return { success: false, message: 'حدث خطأ في قاعدة البيانات', error: error.message };
  }
});

// 3. حذف صنف (حذف منطقي كما طلبتم في التصميم المحاسبي: Soft Delete)
ipcMain.handle('delete-item', async (event, itemId) => {
  try {
    const stmt = db.prepare('UPDATE items SET is_deleted = 1 WHERE item_id = ?');
    stmt.run(itemId);
    return { success: true, message: 'تم الحذف بنجاح' };
  } catch (error) {
    console.error('[delete-item] خطأ في الحذف:', error);
    return { success: false, message: 'لا يمكن حذف هذا الصنف', error: error.message };
  }
});

// 4. تعديل بيانات صنف
ipcMain.handle('update-item', async (event, itemData) => {
  try {
    const stmt = db.prepare(`
      UPDATE items 
      SET item_name = ?, unit = ?, category = ?, min_order_qty = ?
      WHERE item_id = ? AND is_deleted = 0
    `);
    const result = stmt.run(
      itemData.item_name,
      itemData.unit,
      itemData.category,
      itemData.min_order_qty,
      itemData.item_id
    );

    if (result.changes === 0) {
      return { success: false, message: 'لم يتم العثور على الصنف أو لم يتم تعديله' };
    }

    return { success: true, message: 'تم التحديث بنجاح' };
  } catch (error) {
    console.error('[update-item] خطأ في تحديث الصنف:', error);
    return { success: false, message: 'حدث خطأ في قاعدة البيانات', error: error.message };
  }
});

ipcMain.handle('print-direct', async (event) => {
  const win = BrowserWindow.getFocusedWindow();

  try {
    const printers = await win.webContents.getPrintersAsync();

    if (!printers || printers.length === 0) {
      return { success: false, message: 'لم يتم العثور على أي طابعة متصلة أو مُعرفة في النظام.' };
    }

    win.webContents.print({
      silent: false, // false تعني إظهار نافذة اختيار الطابعة للمستخدم 
      printBackground: true
    });

    return { success: true, message: 'جاري فتح نافذة الطباعة...' };
  } catch (error) {
    console.error('خطأ في التحقق من الطابعات:', error);
    return { success: false, message: 'حدث خطأ أثناء محاولة الاتصال بالطابعة.' };
  }
});
ipcMain.handle('generate-report', async (event) => {
  const win = BrowserWindow.getFocusedWindow();

  try {
    // تحويل الصفحة الحالية إلى PDF
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false
    });

    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'حفظ التقرير',//ltr
      defaultPath: path.join(app.getPath('documents'), 'تقرير_الأصناف.pdf'),
      buttonLabel: 'حفظ التقرير',
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] }
      ]
    });
    // إذا اختار المستخدم مساراً وتمت الموافقةltr
    if (filePath) {
      fs.writeFileSync(filePath, pdfData);
      return { success: true, message: 'تم حفظ التقرير بنجاح' };
    } else {
      return { success: false, message: 'تم إلغاء عملية الحفظ' };
    }

  } catch (error) {
    console.error('فشل في إنشاء التقرير:', error);
    return { success: false, message: 'حدث خطأ أثناء إنشاء التقرير' };
  }
});
// ==========================================
// دوال أذونات التوريد (Supply Receipts)
// ==========================================

// جلب قائمة الموردين
ipcMain.handle('get-suppliers', async () => {
  try {
    return db.prepare("SELECT * FROM entities WHERE entity_type = 'Supplier' AND is_deleted = 0").all();
  } catch (error) {
    console.error('[get-suppliers] خطأ في جلب الموردين:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب الموردين', error: error.message };
  }
});

// جلب قائمة المخازن
ipcMain.handle('get-stores', async () => {
  try {
    return db.prepare("SELECT * FROM stores").all();
  } catch (error) {
    console.error('[get-stores] خطأ في جلب المخازن:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب المخازن', error: error.message };
  }
});
// ==========================================
// التحقق من تسجيل الدخول
// ==========================================
ipcMain.handle('login', async (event, credentials) => {
  try {
    // نبحث عن المستخدم النشط حسب الاسم فقط، ثم نتحقق من كلمة المرور
    const stmt = db.prepare('SELECT user_id, full_name, role, password_hash FROM users WHERE full_name = ? AND is_active = 1');
    const user = stmt.get(credentials.username);

    if (!user) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    const isValid = verifyPassword(credentials.password, user.password_hash);
    if (!isValid) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    // التوافق مع كلمات المرور القديمة: إعادة التجزئة عند أول تسجيل دخول ناجح
    if (user.password_hash === credentials.password) {
      try {
        const newHash = hashPassword(credentials.password);
        db.prepare('UPDATE users SET password_hash = ? WHERE user_id = ?').run(newHash, user.user_id);
      } catch (rehashError) {
        console.error('خطأ في إعادة تجزئة كلمة المرور القديمة:', rehashError);
      }
    }

    return { success: true, user: { user_id: user.user_id, full_name: user.full_name, role: user.role } };
  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    return { success: false, message: 'حدث خطأ في قاعدة البيانات', error: error.message };
  }
});
// حفظ إذن التوريد بالكامل (رأس المستند وسهوره)
ipcMain.handle('save-supply-receipt', async (event, receiptData) => {
  // نستخدم transaction() الخاصة بـ better-sqlite3 لضمان حفظ كل البيانات أو التراجع عنها في حال حدوث خطأ
  const insertReceipt = db.transaction((data) => {
    // 1. حفظ رأس الإذن (Transaction Master)
    const stmtMaster = db.prepare(`
      INSERT INTO transactions (transaction_type, transaction_date, store_id, entity_id, created_by, notes) 
      VALUES ('In', ?, ?, ?, ?, ?)
    `);

    // ملاحظة: وضعنا 1 كرقم افتراضي للمستخدم (created_by) حتى يتم برمجة نظام تسجيل الدخول لاحقاً
    const info = stmtMaster.run(
      data.date,
      data.storeId,
      data.supplierId,
      data.createdBy || 1,
      data.notes
    );
    const newTransactionId = info.lastInsertRowid;

    // 2. حفظ سطور الإذن (Transaction Details)
    const stmtDetails = db.prepare(`
      INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_price) 
      VALUES (?, ?, ?, ?)
    `);

    for (const item of data.items) {
      stmtDetails.run(newTransactionId, item.itemId, item.quantity, item.price);
    }

    return newTransactionId;
  });

  try {
    const newId = insertReceipt(receiptData);
    return { success: true, message: 'تم حفظ إذن التوريد بنجاح', transaction_id: newId };
  } catch (error) {
    console.error('خطأ في حفظ الإذن:', error);
    return { success: false, message: 'حدث خطأ أثناء الحفظ: ' + error.message };
  }
});
// ==========================================
// دوال أذونات الصرف (Dispense Receipts)
// ==========================================

// جلب الجهات الطالبة (الأقسام والموظفين فقط)
ipcMain.handle('get-requesters', async () => {
  try {
    return db.prepare("SELECT * FROM entities WHERE entity_type IN ('Department', 'Employee') AND is_deleted = 0").all();
  } catch (error) {
    console.error('[get-requesters] خطأ في جلب الجهات الطالبة:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب الجهات الطالبة', error: error.message };
  }
});

// جلب الأصناف مع رصيدها اللحظي من العرض (View)
ipcMain.handle('get-stock', async () => {
  try {
    // نجلب فقط الأصناف التي رصيدها أكبر من 0 مع آخر سعر شراء مسجّل
    return db.prepare(`
      SELECT
        i.item_id,
        i.item_name,
        i.unit,
        i.category,
        i.min_order_qty,
        COALESCE(vcs.current_quantity, 0) AS current_quantity,
        COALESCE((
          SELECT td.unit_price
          FROM transaction_details td
          JOIN transactions t ON t.transaction_id = td.transaction_id
          WHERE td.item_id = i.item_id
            AND t.transaction_type = 'In'
            AND t.is_deleted = 0
            AND td.unit_price > 0
          ORDER BY t.transaction_date DESC, t.transaction_id DESC
          LIMIT 1
        ), 0) AS unit_price
      FROM items i
      LEFT JOIN view_current_stock vcs ON vcs.item_id = i.item_id
      WHERE i.is_deleted = 0
        AND COALESCE(vcs.current_quantity, 0) > 0
      ORDER BY i.item_id DESC
    `).all();
  } catch (error) {
    console.error('[get-stock] خطأ في جلب الأرصدة:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب الأرصدة', error: error.message };
  }
});

// حفظ إذن الصرف
ipcMain.handle('save-dispense-receipt', async (event, receiptData) => {
  const insertReceipt = db.transaction((data) => {
    // 1. حفظ رأس الإذن (نوع الحركة: Out)
    const stmtMaster = db.prepare(`
      INSERT INTO transactions (transaction_type, transaction_date, store_id, entity_id, created_by, notes) 
      VALUES ('Out', ?, ?, ?, ?, ?)
    `);

    // نستخدم ID المستخدم 1 مؤقتاً (يمكنك لاحقاً جلبه من الجلسة session)
    const info = stmtMaster.run(
      data.date,
      data.storeId,
      data.requesterId,
      data.createdBy || 1,
      data.notes
    );
    const newTransactionId = info.lastInsertRowid;

    // 2. حفظ سطور الإذن
    const stmtDetails = db.prepare(`
      INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_price) 
      VALUES (?, ?, ?, 0) -- السعر 0 لأن هذا إذن صرف وليس فاتورة شراء
    `);

    for (const item of data.items) {
      stmtDetails.run(newTransactionId, item.itemId, item.quantity);
    }

    return newTransactionId;
  });

  try {
    const newId = insertReceipt(receiptData);
    return { success: true, message: 'تم حفظ إذن الصرف بنجاح' };
  } catch (error) {
    console.error('خطأ في حفظ الإذن:', error);
    return { success: false, message: 'حدث خطأ أثناء الحفظ: ' + error.message };
  }
});
// ==========================================
// دوال إدارة الجهات والموردين (Entities)
// ==========================================

// 1. جلب كل الجهات (التي لم تحذف)
ipcMain.handle('get-all-entities', async () => {
  try {
    return db.prepare('SELECT * FROM entities WHERE is_deleted = 0 ORDER BY entity_id DESC').all();
  } catch (error) {
    console.error('[get-all-entities] خطأ في جلب الجهات:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب الجهات', error: error.message };
  }
});

// 2. إضافة جهة جديدة
ipcMain.handle('add-entity', async (event, newEntity) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO entities (entity_name, entity_type, phone) 
      VALUES (?, ?, ?)
    `);

    const info = stmt.run(newEntity.name, newEntity.type, newEntity.phone);
    return { success: true, message: 'تمت إضافة الجهة بنجاح', id: info.lastInsertRowid };
  } catch (error) {
    console.error('[add-entity] خطأ في إضافة الجهة:', error);
    return { success: false, message: 'حدث خطأ في قاعدة البيانات', error: error.message };
  }
});

// 3. حذف جهة (حذف منطقي)
ipcMain.handle('delete-entity', async (event, entityId) => {
  try {
    const stmt = db.prepare('UPDATE entities SET is_deleted = 1 WHERE entity_id = ?');
    stmt.run(entityId);
    return { success: true, message: 'تم حذف الجهة بنجاح' };
  } catch (error) {
    console.error('[delete-entity] خطأ في الحذف:', error);
    return { success: false, message: 'لا يمكن حذف هذه الجهة', error: error.message };
  }
});
// ==========================================
// دوال التقارير والإحصائيات (Reports)
// ==========================================

// جلب سجل الحركات (أذونات التوريد والصرف)
ipcMain.handle('get-transactions-history', async () => {
  try {
    const query = `
      SELECT t.transaction_id, t.transaction_type, t.transaction_date,
             e.entity_name, s.store_name,
             COALESCE((
               SELECT SUM(td.quantity * td.unit_price)
               FROM transaction_details td
               WHERE td.transaction_id = t.transaction_id
             ), 0) AS total_value
      FROM transactions t
      LEFT JOIN entities e ON t.entity_id = e.entity_id
      LEFT JOIN stores s ON t.store_id = s.store_id
      WHERE t.is_deleted = 0
      ORDER BY t.transaction_date DESC
    `;
    return db.prepare(query).all();
  } catch (error) {
    console.error('[get-transactions-history] خطأ في جلب سجل الأذونات:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب سجل الأذونات', error: error.message };
  }
});

// جلب حركات صنف محدد (بطاقة حركة صنف)
ipcMain.handle('get-item-transactions', async (event, itemId) => {
  try {
    const rows = db.prepare(`
      SELECT t.transaction_id, t.transaction_type, t.transaction_date,
             e.entity_name, s.store_name, td.quantity
      FROM transaction_details td
      JOIN transactions t ON t.transaction_id = td.transaction_id
      LEFT JOIN entities e ON t.entity_id = e.entity_id
      LEFT JOIN stores s ON t.store_id = s.store_id
      WHERE td.item_id = ? AND t.is_deleted = 0
      ORDER BY t.transaction_date ASC, t.transaction_id ASC
    `).all(itemId);

    let balance = 0;
    return rows.map(r => {
      const qty = r.quantity || 0;
      balance += r.transaction_type === 'In' ? qty : -qty;
      return { ...r, running_balance: balance };
    });
  } catch (error) {
    console.error('[get-item-transactions] خطأ في جلب حركات الصنف:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب حركات الصنف', error: error.message };
  }
});

// جلب تفاصيل إذن توريد محدد
ipcMain.handle('get-supply-receipt', async (event, transactionId) => {
  try {
    const header = db.prepare(`
      SELECT t.transaction_id, t.transaction_date AS date, t.notes,
             e.entity_name AS supplier, s.store_name AS store
      FROM transactions t
      LEFT JOIN entities e ON t.entity_id = e.entity_id
      LEFT JOIN stores s ON t.store_id = s.store_id
      WHERE t.transaction_id = ? AND t.transaction_type = 'In' AND t.is_deleted = 0
    `).get(transactionId);

    if (!header) {
      return { success: false, message: 'لم يتم العثور على إذن التوريد' };
    }

    const items = db.prepare(`
      SELECT td.item_id, i.item_name, i.unit, td.quantity, td.unit_price AS price
      FROM transaction_details td
      JOIN items i ON td.item_id = i.item_id
      WHERE td.transaction_id = ?
    `).all(header.transaction_id);

    return { success: true, receipt: { ...header, items } };
  } catch (error) {
    console.error('خطأ في جلب إذن التوريد:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب إذن التوريد', error: error.message };
  }
});

// جلب تفاصيل إذن صرف محدد
ipcMain.handle('get-dispense-receipt', async (event, transactionId) => {
  try {
    const header = db.prepare(`
      SELECT t.transaction_id, t.transaction_date AS date, t.notes AS reason,
             e.entity_name AS requester, s.store_name AS store
      FROM transactions t
      LEFT JOIN entities e ON t.entity_id = e.entity_id
      LEFT JOIN stores s ON t.store_id = s.store_id
      WHERE t.transaction_id = ? AND t.transaction_type = 'Out' AND t.is_deleted = 0
    `).get(transactionId);

    if (!header) {
      return { success: false, message: 'لم يتم العثور على إذن الصرف' };
    }

    const items = db.prepare(`
      SELECT td.item_id, i.item_name, i.unit, td.quantity, td.unit_price AS price
      FROM transaction_details td
      JOIN items i ON td.item_id = i.item_id
      WHERE td.transaction_id = ?
    `).all(header.transaction_id);

    return { success: true, receipt: { ...header, items } };
  } catch (error) {
    console.error('خطأ في جلب إذن الصرف:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب إذن الصرف', error: error.message };
  }
});
// ==========================================
// دوال النسخ الاحتياطي (Backup)
// ==========================================

ipcMain.handle('backup-database', async (event) => {
  const win = BrowserWindow.getFocusedWindow();

  try {
    // توليد اسم افتراضي للملف يحتوي على تاريخ اليوم (مثال: Backup_2026-06-03.sqlite)
    const date = new Date().toISOString().split('T')[0];
    const defaultFilename = `Warehouse_Backup_${date}.sqlite`;

    // إظهار نافذة للمستخدم لاختيار مكان حفظ النسخة
    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'حفظ نسخة احتياطية لقاعدة البيانات',
      defaultPath: path.join(app.getPath('desktop'), defaultFilename), // سطح المكتب كمسار افتراضي
      buttonLabel: 'حفظ النسخة',
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    });

    if (filePath) {
      // استخدام API النسخ الاحتياطي الآمن الخاص بمكتبة better-sqlite3
      await db.backup(filePath);
      return { success: true, message: 'تم حفظ النسخة الاحتياطية بنجاح في المسار المحدد!' };
    } else {
      return { success: false, message: 'تم إلغاء عملية الحفظ.' };
    }
  } catch (error) {
    console.error('خطأ في النسخ الاحتياطي:', error);
    return { success: false, message: 'حدث خطأ أثناء أخذ النسخة الاحتياطية.' };
  }
});
// ==========================================
// دالة استيراد النسخة الاحتياطية (Restore) المحدثة والآمنة
// ==========================================
ipcMain.handle('restore-database', async (event) => {
  const win = BrowserWindow.getFocusedWindow();

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'استيراد نسخة احتياطية',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, message: 'تم إلغاء العملية.' };
    }

    const sourcePath = filePaths[0]; // مسار الملف الذي اختاره المستخدم

    try {
      // 1. نفتح اتصالاً مؤقتاً بالملف الجديد بوضع "القراءة فقط" لكي لا نفسده
      const testDb = new Database(sourcePath, { readonly: true, fileMustExist: true });

      // 2. نجلب أسماء كل الجداول الموجودة داخل هذا الملف
      // جدول sqlite_master هو جدول مخفي في SQLite يحتوي على هيكل القاعدة
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map(t => t.name);

      // 3. نتحقق هل كل الجداول المطلوبة موجودة داخل الملف؟
      const isValidSchema = REQUIRED_TABLES.every(table => tableNames.includes(table));

      // 5. نغلق الاتصال المؤقت فوراً
      testDb.close();

      if (!isValidSchema) {
        // الملف يعمل كقاعدة بيانات، لكنه لا يخص منظومتنا
        return { success: false, message: '❌ الملف المختار ليس نسخة احتياطية صالحة لهذه المنظومة (الهيكلية غير مطابقة).' };
      }

    } catch (dbError) {
      // إذا حدث خطأ هنا، فهذا يعني أن الملف ليس قاعدة بيانات SQLite من الأساس 
      // (مثلاً المستخدم قام بتغيير امتداد ملف صورة إلى sqlite)
      console.error('فحص الملف فشل:', dbError);
      return { success: false, message: '❌ الملف تالف أو أنه ليس قاعدة بيانات SQLite صالحة.' };
    }
    // ================================================================

    // إذا تجاوزنا الفحص بنجاح، نقوم بعملية الاستيراد الفعلية
    const targetDbPath = db.getDbPath();
    const rollbackPath = `${targetDbPath}.bak`;

    // 6. إغلاق الاتصال الحالي عبر closeDb() وليس close():
    //    close() الخام يغلق المقبض لكنه لا يصفّر dbInstance داخل db.js، فيبقى
    //    التطبيق ممسكاً بمقبض ميت ويفشل كل طلب لاحق حتى يُقتل البرنامج.
    db.closeDb();

    try {
      // 7. نحتفظ بنسخة تراجع من القاعدة الحالية قبل الكتابة فوقها
      fs.copyFileSync(targetDbPath, rollbackPath);
      cleanupWalFiles(targetDbPath);

      // 8. نسخ الملف السليم فوق القديم
      fs.copyFileSync(sourcePath, targetDbPath);

      // 9. التحقق من أن القاعدة المستوردة تُفتح فعلاً قبل إعادة التشغيل
      assertDatabaseOpens(targetDbPath);
    } catch (restoreError) {
      // الاستيراد فشل — نُعيد القاعدة الأصلية ونُبقي التطبيق صالحاً للاستخدام
      console.error('فشل الاستيراد، جاري التراجع:', restoreError);
      try {
        if (fs.existsSync(rollbackPath)) {
          fs.copyFileSync(rollbackPath, targetDbPath);
        }
      } catch (rollbackError) {
        console.error('فشل التراجع أيضاً:', rollbackError);
      }
      db.getDb(); // إعادة فتح الاتصال حتى لا يبقى التطبيق معطلاً
      return { success: false, message: `❌ فشل الاستيراد وتمت إعادة البيانات السابقة: ${restoreError.message}` };
    }

    // 10. توثيق عملية الاستيراد في Git (قبل إعادة التشغيل)
    if (gitManager) {
      const backupName = path.basename(sourcePath, path.extname(sourcePath));
      await gitManager.commitLocalBackup(`استيراد نسخة احتياطية خارجية: ${backupName}`);
    }

    // 11. إعادة تشغيل التطبيق تلقائياً
    app.relaunch();
    app.exit();

  } catch (error) {
    console.error('خطأ في استيراد القاعدة:', error);
    db.getDb(); // لا نترك التطبيق بمقبض مغلق مهما حدث
    return { success: false, message: 'حدث خطأ غير متوقع أثناء الاستيراد.' };
  }
});
// ==========================================
// دوال إعدادات النظام والتخزين السحابي
// ==========================================

// مسار ملف الإعدادات
const configPath = path.join(app.getPath('userData'), 'system_config.json');

// 1. جلب الإعدادات الحالية
ipcMain.handle('get-settings', async () => {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
    return null; // لا توجد إعدادات (تثبيت جديد)
  } catch (error) {
    console.error('خطأ في قراءة الإعدادات:', error);
    return null;
  }
});

ipcMain.handle('save-settings', async (event, settingsData) => {
  try {
    // فحص الاتصال (محاكاة)
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (!settingsData.repoUrl.includes('github.com')) {
      return { success: false, message: 'رابط المستودع غير صالح. يرجى التأكد من الرابط.' };
    }

    // حفظ البيانات في الملف
    fs.writeFileSync(configPath, JSON.stringify(settingsData));

    // إعادة تشغيل الجدولة مع الإعدادات الجديدة
    await restartAutoBackupScheduling();

    return { success: true, message: 'تم الاتصال بالمستودع وحفظ الإعدادات بنجاح!' };
  } catch (error) {
    return { success: false, message: 'حدث خطأ أثناء حفظ الإعدادات.' };
  }
});

// جلب سجل النسخ المحلية (Git Log)
ipcMain.handle('get-local-backups', async () => {
  try {
    if (!gitManager) {
      return [];
    }
    return await gitManager.getHistory();
  } catch (error) {
    console.error('[get-local-backups] خطأ في جلب النسخ المحلية:', error);
    return { success: false, message: 'حدث خطأ أثناء جلب النسخ المحلية', error: error.message };
  }
});

// تنفيذ الاسترجاع من Git
ipcMain.handle('restore-from-git', async (event, commitId) => {
  const targetDbPath = db.getDbPath();
  const rollbackPath = `${targetDbPath}.bak`;

  try {
    // 1. نسخة تراجع قبل أي شيء
    if (fs.existsSync(targetDbPath)) {
      fs.copyFileSync(targetDbPath, rollbackPath);
    }

    // 2. إغلاق القاعدة عبر closeDb() لتصفير dbInstance، وليس close() الخام
    db.closeDb();
    cleanupWalFiles(targetDbPath);

    // 3. أمر الـ GitManager بالاسترجاع
    const result = await gitManager.restoreFromCommit(commitId);

    if (!result.success) {
      db.getDb(); // نُعيد فتح الاتصال حتى لا يبقى التطبيق معطلاً
      return result;
    }

    // 4. لا نُعيد التشغيل قبل التأكد من أن القاعدة المسترجعة تُفتح فعلاً
    assertDatabaseOpens(targetDbPath);

    app.relaunch();
    app.exit();

  } catch (error) {
    console.error('خطأ غير متوقع أثناء الاسترجاع:', error);

    // التراجع إلى القاعدة السابقة وإبقاء التطبيق صالحاً للاستخدام
    try {
      if (fs.existsSync(rollbackPath)) {
        fs.copyFileSync(rollbackPath, targetDbPath);
      }
    } catch (rollbackError) {
      console.error('فشل التراجع أيضاً:', rollbackError);
    }
    db.getDb();

    return { success: false, message: `حدث خطأ أثناء استعادة النظام وتمت إعادة البيانات السابقة: ${error.message}` };
  }
});

ipcMain.handle('sync-with-cloud', async () => {
  try {
    if (!CLOUD_SYNC_ENABLED) {
      return { success: false, message: 'المزامنة السحابية معطّلة في هذا الإصدار. النسخ الاحتياطي المحلي يعمل تلقائياً.' };
    }
    if (!gitManager) {
      return { success: false, message: 'نظام النسخ الاحتياطي لم يتم تهيئته' };
    }

    // قراءة الإعدادات
    const configPath = path.join(app.getPath('userData'), 'system_config.json');
    if (!fs.existsSync(configPath)) {
      return { success: false, message: 'لم يتم إعداد التخزين السحابي بعد' };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.repoUrl || !config.accessToken) {
      return { success: false, message: 'رابط المستودع أو رمز الوصول غير مكتمل' };
    }

    console.log('🔄 بدء المزامنة مع السحابة...');
    console.log('📡 المستودع:', config.repoUrl);

    const gitFolderPath = path.join(gitManager.repoDir, '.git');
    const hasCommits = fs.existsSync(gitFolderPath);

    // إعداد remote
    try {
      const remotes = await git.listRemotes({ fs, dir: gitManager.repoDir });
      const hasOrigin = remotes.some(r => r.remote === 'origin');

      if (!hasOrigin) {
        await git.addRemote({
          fs,
          dir: gitManager.repoDir,
          remote: 'origin',
          url: config.repoUrl
        });
        console.log('✅ تم إضافة remote origin');
      }
    } catch (remoteError) {
      console.log('⚠️ خطأ في إعداد remote:', remoteError.message);
    }

    // التحقق من وجود commits في المستودع المحلي
    let localCommits = [];
    try {
      localCommits = await git.log({ fs, dir: gitManager.repoDir, depth: 1 });
      console.log(`📊 عدد الـ commits المحلية: ${localCommits.length}`);
    } catch (logError) {
      console.log('ℹ️ لا يوجد commits محلية بعد');
    }

    // محاولة جلب التحديثات من السحابة
    let fetchSuccess = false;
    let isRemoteEmpty = false;
    let fetchError = null;

    for (const branch of ['main', 'master']) {
      try {
        console.log(`⏳ جاري جلب التحديثات من فرع ${branch}...`);
        await git.fetch({
          fs,
          http,
          dir: gitManager.repoDir,
          remote: 'origin',
          ref: branch,
          singleBranch: true,
          depth: 100,
          onAuth: () => ({ username: config.accessToken })
        });
        fetchSuccess = true;
        console.log(`✅ تم جلب التحديثات من فرع ${branch}`);
        break;
      } catch (error) {
        fetchError = error;
        // التحقق مما إذا كان الـ repo فارغاً
        if (error.message.includes('cannot find remote ref') ||
          error.message.includes('remote error') ||
          error.data?.what === 'main' ||
          error.data?.what === 'master') {
          isRemoteEmpty = true;
          console.log('ℹ️ المستودع البعيد فارغ (لا يوجد commits بعد)');
          break;
        }
        console.log(`⚠️ فشل الجلب من فرع ${branch}:`, error.message);
      }
    }

    // إذا كان الـ repo فارغاً، نقوم برفع الملفات المحلية
    if (isRemoteEmpty || (!fetchSuccess && localCommits.length > 0)) {
      console.log('📤 المستودع البعيد فارغ، جاري رفع الملفات المحلية...');

      try {
        // التأكد من وجود commit محلي
        if (localCommits.length === 0) {
          console.log('📦 لا يوجد commits محلية، جاري إنشاء commit أولي...');
          await gitManager.commitLocalBackup('النسخة الأولية للنظام');
          localCommits = await git.log({ fs, dir: gitManager.repoDir, depth: 1 });
        }

        // تحديد اسم الفرع الرئيسي
        let mainBranch = 'main';
        try {
          const currentBranch = await git.currentBranch({ fs, dir: gitManager.repoDir });
          if (currentBranch) {
            mainBranch = currentBranch;
          }
        } catch (branchError) {
          // إذا لم يكن هناك فرع، ننشئ واحداً
          await git.branch({ fs, dir: gitManager.repoDir, ref: 'main' });
          mainBranch = 'main';
        }

        // رفع الملفات للسحابة
        console.log(`⏳ جاري رفع الملفات إلى فرع ${mainBranch}...`);
        await git.push({
          fs,
          http,
          dir: gitManager.repoDir,
          remote: 'origin',
          ref: mainBranch,
          remoteRef: mainBranch,
          force: true, // استخدام force لأول مرة
          onAuth: () => ({ username: config.accessToken })
        });

        console.log('✅ تم رفع الملفات إلى المستودع البعيد بنجاح');
        return {
          success: true,
          message: 'تم إنشاء المستودع البعيد ورفع النسخة الأولى بنجاح',
          pushed: true
        };

      } catch (pushError) {
        console.error('❌ فشل رفع الملفات:', pushError);
        return {
          success: false,
          message: `فشل رفع الملفات للمستودع البعيد: ${pushError.message}`
        };
      }
    }

    // إذا كان الجلب ناجحاً، نحاول الدمج
    if (fetchSuccess) {
      let mergeSuccess = false;
      for (const branch of ['main', 'master']) {
        try {
          // التحقق من وجود الـ remote branch
          const branches = await git.listBranches({ fs, dir: gitManager.repoDir });
          const hasRemoteBranch = branches.includes(`origin/${branch}`);

          if (hasRemoteBranch) {
            console.log(`⏳ جاري دمج origin/${branch}...`);
            await git.merge({
              fs,
              dir: gitManager.repoDir,
              theirs: `origin/${branch}`,
              author: { name: 'System Sync', email: 'sync@system.local' },
              message: 'دمج التغييرات من السحابة'
            });
            mergeSuccess = true;
            console.log(`✅ تم دمج التغييرات من ${branch}`);
            break;
          }
        } catch (mergeError) {
          console.log(`⚠️ فشل الدمج مع ${branch}:`, mergeError.message);
        }
      }

      if (!mergeSuccess) {
        console.log('ℹ️ لا توجد تغييرات جديدة للدمج');
      }

      // محاولة رفع التغييرات المحلية إلى السحابة (push)
      try {
        console.log('⏳ جاري رفع التغييرات المحلية إلى السحابة...');
        const currentBranch = await git.currentBranch({ fs, dir: gitManager.repoDir });
        await git.push({
          fs,
          http,
          dir: gitManager.repoDir,
          remote: 'origin',
          ref: currentBranch || 'main',
          onAuth: () => ({ username: config.accessToken })
        });
        console.log('✅ تم رفع التغييرات إلى السحابة');
      } catch (pushError) {
        console.log('⚠️ فشل رفع التغييرات:', pushError.message);
        // لا نعتبر هذا فشل للمزامنة الكاملة
      }
    }

    return {
      success: true,
      message: 'تمت المزامنة مع السحابة بنجاح',
      pushed: false
    };

  } catch (error) {
    console.error('❌ خطأ في المزامنة:', error);
    return { success: false, message: error.message };
  }
});

// 2. جلب النسخ المدمجة (محلية + سحابية)
ipcMain.handle('get-merged-backups', async () => {
  try {
    if (!gitManager) {
      console.log('❌ gitManager غير موجود');
      return [];
    }

    const allBackups = new Map();

    // جلب النسخ المحلية
    console.log('📋 جلب النسخ المحلية...');
    const localCommits = await gitManager.getHistory();
    console.log(`📊 تم جلب ${localCommits.length} نسخة محلية`);

    for (const commit of localCommits) {
      allBackups.set(commit.fullCommitId, {
        fullCommitId: commit.fullCommitId,
        commitId: commit.commitId,
        timestamp: commit.timestamp,
        date: commit.date,
        message: commit.message,
        source: 'local'
      });
    }

    // محاولة جلب النسخ السحابية إذا كان هناك اتصال
    try {
      const configPath = path.join(app.getPath('userData'), 'system_config.json');
      if (CLOUD_SYNC_ENABLED && fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.repoUrl && config.accessToken) {
          console.log('🌐 جاري جلب النسخ السحابية...');

          // التأكد من وجود remote
          try {
            const remotes = await git.listRemotes({ fs, dir: gitManager.repoDir });
            const hasOrigin = remotes.some(r => r.remote === 'origin');

            if (!hasOrigin) {
              await git.addRemote({
                fs,
                dir: gitManager.repoDir,
                remote: 'origin',
                url: config.repoUrl
              });
            }
          } catch (remoteError) {
            console.log('⚠️ خطأ في remote:', remoteError.message);
          }

          // قراءة commits من remote
          for (const branch of ['origin/main', 'origin/master']) {
            try {
              const remoteCommits = await git.log({
                fs,
                dir: gitManager.repoDir,
                ref: branch,
                depth: 50
              });

              console.log(`📊 تم جلب ${remoteCommits.length} نسخة من ${branch}`);

              for (const commit of remoteCommits) {
                if (!allBackups.has(commit.oid)) {
                  allBackups.set(commit.oid, {
                    fullCommitId: commit.oid,
                    commitId: commit.oid.substring(0, 7),
                    timestamp: commit.commit.author.timestamp * 1000,
                    date: new Date(commit.commit.author.timestamp * 1000).toLocaleString('ar-LY'),
                    message: commit.commit.message,
                    source: 'cloud'
                  });
                }
              }
              break;
            } catch (e) {
              console.log(`⚠️ لا يمكن قراءة ${branch}:`, e.message);
            }
          }
        }
      }
    } catch (cloudError) {
      console.log('⚠️ لا يمكن جلب النسخ السحابية:', cloudError.message);
    }

    // ترتيب حسب الطابع الزمني الرقمي (الأحدث أولاً).
    // كان الترتيب سابقاً على حقل date وهو نص محلي (ar-LY)، فكان new Date() عليه
    // يُنتج Invalid Date والمقارنة NaN — أي أن الترتيب لم يكن يفعل شيئاً، وكان
    // المستخدم قد يسترجع نسخة قديمة ظناً أنها الأحدث.
    const merged = Array.from(allBackups.values())
      .sort((a, b) => b.timestamp - a.timestamp);

    console.log(`📊 تم دمج ${merged.length} نسخة (${merged.filter(b => b.source === 'local').length} محلية، ${merged.filter(b => b.source === 'cloud').length} سحابية)`);

    return merged;

  } catch (error) {
    console.error('[get-merged-backups] خطأ في دمج النسخ:', error);
    return { success: false, message: 'حدث خطأ أثناء دمج النسخ', error: error.message };
  }
});

// ==========================================
// دوال التخزين التلقائي المجدول
// ==========================================
function getBackupIntervalMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

function getLastBackupPath() {
  return path.join(app.getPath('userData'), 'last_auto_backup.json');
}

// قراءة وقت آخر نسخة تلقائية. الملف كان يُقرأ ولا يُكتب أبداً، فكانت النتيجة
// أن كل إقلاع للتطبيق يُشغّل نسخة كاملة بغض النظر عن الدورية المضبوطة.
function readLastBackupTime() {
  try {
    const lastBackupPath = getLastBackupPath();
    if (!fs.existsSync(lastBackupPath)) return 0;
    const saved = JSON.parse(fs.readFileSync(lastBackupPath, 'utf8'));
    const parsed = new Date(saved.lastBackup).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (error) {
    console.error('تعذّر قراءة وقت آخر نسخة احتياطية:', error);
    return 0;
  }
}

function stampLastBackupTime() {
  try {
    fs.writeFileSync(getLastBackupPath(), JSON.stringify({ lastBackup: new Date().toISOString() }));
  } catch (error) {
    console.error('تعذّر تسجيل وقت آخر نسخة احتياطية:', error);
  }
}

async function performAutoBackup() {
  console.log('🤖 بدء النسخ الاحتياطي التلقائي...');
  try {
    if (!gitManager) {
      return { success: false, message: 'نظام النسخ الاحتياطي لم يتم تهيئته' };
    }

    // commitLocalBackup تُعيد {success:false} عند الفشل — وهو كائن صادق (truthy).
    // الفحص القديم `if (!commitResult)` لم يكن يلتقط الفشل إطلاقاً.
    const commitResult = await gitManager.commitLocalBackup('نسخة احتياطية تلقائية دورية');
    if (!commitResult || commitResult.success === false) {
      return { success: false, message: `فشل إنشاء النسخة المحلية: ${commitResult && commitResult.message || 'سبب غير معروف'}` };
    }

    stampLastBackupTime();

    if (!CLOUD_SYNC_ENABLED) {
      return { success: true, message: 'تم حفظ نسخة احتياطية محلية', pushed: false };
    }

    // قراءة الإعدادات
    const configPath = path.join(app.getPath('userData'), 'system_config.json');
    if (!fs.existsSync(configPath)) {
      return { success: false, message: 'لم يتم إعداد التخزين السحابي بعد' };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.repoUrl || !config.accessToken) {
      return { success: false, message: 'رابط المستودع أو رمز الوصول غير مكتمل' };
    }

    console.log('🔄 بدء المزامنة مع السحابة...');
    console.log('📡 المستودع:', config.repoUrl);

    const gitFolderPath = path.join(gitManager.repoDir, '.git');
    const hasCommits = fs.existsSync(gitFolderPath);

    // إعداد remote
    try {
      const remotes = await git.listRemotes({ fs, dir: gitManager.repoDir });
      const hasOrigin = remotes.some(r => r.remote === 'origin');

      if (!hasOrigin) {
        await git.addRemote({
          fs,
          dir: gitManager.repoDir,
          remote: 'origin',
          url: config.repoUrl
        });
        console.log('✅ تم إضافة remote origin');
      }
    } catch (remoteError) {
      console.log('⚠️ خطأ في إعداد remote:', remoteError.message);
    }

    // التحقق من وجود commits في المستودع المحلي
    let localCommits = [];
    try {
      localCommits = await git.log({ fs, dir: gitManager.repoDir, depth: 1 });
      console.log(`📊 عدد الـ commits المحلية: ${localCommits.length}`);
    } catch (logError) {
      console.log('ℹ️ لا يوجد commits محلية بعد');
    }

    let fetchSuccess = false;
    let isRemoteEmpty = false;
    let fetchError = null;
    const branch = 'main';
    try {
      console.log(`⏳ جاري جلب التحديثات من فرع ${branch}...`);
      await git.fetch({
        fs,
        http,
        dir: gitManager.repoDir,
        remote: 'origin',
        ref: branch,
        singleBranch: true,
        depth: 100,
        onAuth: () => ({ username: config.accessToken })
      });
      fetchSuccess = true;
      console.log(`✅ تم جلب التحديثات من فرع ${branch}`);
    } catch (error) {
      fetchError = error;
      // التحقق مما إذا كان الـ repo فارغاً
      if (error.message.includes('cannot find remote ref') ||
        error.message.includes('remote error') ||
        error.data?.what === 'main' ||
        error.data?.what === 'master') {
        isRemoteEmpty = true;
        console.log('ℹ️ المستودع البعيد فارغ (لا يوجد commits بعد)');
      }
      console.log(`⚠️ فشل الجلب من فرع ${branch}:`, error.message);
    }

    if (isRemoteEmpty || (!fetchSuccess && localCommits.length > 0)) {
      console.log('📤 المستودع البعيد فارغ، جاري رفع الملفات المحلية...');

      try {
        // التأكد من وجود commit محلي
        if (localCommits.length === 0) {
          console.log('📦 لا يوجد commits محلية، جاري إنشاء commit أولي...');
          await gitManager.commitLocalBackup('النسخة الأولية للنظام');
          localCommits = await git.log({ fs, dir: gitManager.repoDir, depth: 1 });
        }

        let mainBranch = 'main';
        try {
          const currentBranch = await git.currentBranch({ fs, dir: gitManager.repoDir });
          if (currentBranch) {
            mainBranch = currentBranch;
          }
        } catch (branchError) {
          // إذا لم يكن هناك فرع، ننشئ واحداً
          await git.branch({ fs, dir: gitManager.repoDir, ref: 'main' });
          mainBranch = 'main';
        }

        console.log(`⏳ جاري رفع الملفات إلى فرع ${mainBranch}...`);
        await git.push({
          fs,
          http,
          dir: gitManager.repoDir,
          remote: 'origin',
          ref: mainBranch,
          remoteRef: mainBranch,
          force: true, // استخدام force لأول مرة
          onAuth: () => ({ username: config.accessToken })
        });

        console.log('✅ تم رفع الملفات إلى المستودع البعيد بنجاح');
        return {
          success: true,
          message: 'تم إنشاء المستودع البعيد ورفع النسخة الأولى بنجاح',
          pushed: true
        };

      } catch (pushError) {
        console.error('❌ فشل رفع الملفات:', pushError);
        return {
          success: false,
          message: `فشل رفع الملفات للمستودع البعيد: ${pushError.message}`
        };
      }
    }
    // إذا كان الجلب ناجحاً، نحاول الدمج
    if (fetchSuccess) {
      let mergeSuccess = false;
      for (const branch of ['main', 'master']) {
        try {
          // التحقق من وجود الـ remote branch
          const branches = await git.listBranches({ fs, dir: gitManager.repoDir });
          const hasRemoteBranch = branches.includes(`origin/${branch}`);

          if (hasRemoteBranch) {
            console.log(`⏳ جاري دمج origin/${branch}...`);
            await git.merge({
              fs,
              dir: gitManager.repoDir,
              theirs: `origin/${branch}`,
              author: { name: 'System Sync', email: 'sync@system.local' },
              message: 'دمج التغييرات من السحابة'
            });
            mergeSuccess = true;
            console.log(`✅ تم دمج التغييرات من ${branch}`);
            break;
          }
        } catch (mergeError) {
          console.log(`⚠️ فشل الدمج مع ${branch}:`, mergeError.message);
        }
      }

      if (!mergeSuccess) {
        console.log('ℹ️ لا توجد تغييرات جديدة للدمج');
      }

      // محاولة رفع التغييرات المحلية إلى السحابة (push)
      try {
        console.log('⏳ جاري رفع التغييرات المحلية إلى السحابة...');
        const currentBranch = await git.currentBranch({ fs, dir: gitManager.repoDir });
        await git.push({
          fs,
          http,
          dir: gitManager.repoDir,
          remote: 'origin',
          ref: currentBranch || 'main',
          onAuth: () => ({ username: config.accessToken })
        });
        console.log('✅ تم رفع التغييرات إلى السحابة');
      } catch (pushError) {
        console.log('⚠️ فشل رفع التغييرات:', pushError.message);
        // لا نعتبر هذا فشل للمزامنة الكاملة
      }
    }

    return {
      success: true,
      message: 'تمت المزامنة مع السحابة بنجاح',
      pushed: false
    };

  } catch (error) {
    console.error('❌ خطأ في المزامنة:', error);
    return { success: false, message: error.message };
  }
}
async function startAutoBackupScheduling() {
  // إيقاف الجدولة القديمة إن وجدت
  if (scheduledBackupInterval) {
    clearInterval(scheduledBackupInterval);
    scheduledBackupInterval = null;
    console.log('🛑 تم إيقاف الجدولة القديمة');
  }

  try {
    // النسخ المحلي لا يعتمد على إعدادات السحابة: لو غاب system_config.json
    // كانت الجدولة تتوقف كلياً، أي لا نسخ احتياطي محلي إطلاقاً على تثبيت جديد.
    let backupFrequencyDays = 14; // الافتراضي: كل أسبوعين
    const configPath = path.join(app.getPath('userData'), 'system_config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        backupFrequencyDays = parseInt(config.backupFrequency) || 14;
      } catch (configError) {
        console.warn('تعذّرت قراءة دورية النسخ من الإعدادات، سيُعتمد الافتراضي:', configError.message);
      }
    }

    const intervalMs = getBackupIntervalMs(backupFrequencyDays);
    console.log(`⏰ جدولة النسخ الاحتياطي التلقائي كل ${backupFrequencyDays} يوم`);

    // نبضة كل ساعة تقارن الوقت المنقضي، بدل setInterval بفترة طويلة:
    //   1. خيار "كل شهر" = 2,592,000,000 مللي ثانية، وهو يتجاوز حد Node
    //      (2^31-1 ≈ 24.8 يوم)، فيُقصّه Node إلى 1 مللي ثانية — أي حلقة نسخ
    //      متواصلة بدل نسخة شهرية.
    //   2. التطبيق المكتبي نادراً ما يبقى مفتوحاً 14 يوماً متصلة، فالمؤقّت
    //      الطويل لم يكن ليُطلَق أصلاً.
    const TICK_MS = 60 * 60 * 1000; // ساعة
    const runIfDue = async () => {
      const elapsed = Date.now() - readLastBackupTime();
      if (elapsed >= intervalMs) {
        console.log('⏳ حان موعد النسخة الاحتياطية الدورية...');
        await performAutoBackup();
      }
    };

    // فحص أولي بعد تأخير بسيط لضمان اكتمال تهيئة النظام
    setTimeout(runIfDue, 10000);
    scheduledBackupInterval = setInterval(runIfDue, TICK_MS);

    console.log(`✅ تم تفعيل النسخ الاحتياطي التلقائي (كل ${backupFrequencyDays} يوم)`);

  } catch (error) {
    console.error('❌ خطأ في بدء الجدولة:', error);
  }
}

async function restartAutoBackupScheduling() {
  console.log('🔄 إعادة تشغيل الجدولة بسبب تغيير الإعدادات...');
  await startAutoBackupScheduling();
}

async function checkAndPushPendingBackups() {
  try {
    if (!CLOUD_SYNC_ENABLED) return;

    const configPath = path.join(app.getPath('userData'), 'system_config.json');
    if (!fs.existsSync(configPath)) return;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.repoUrl || !config.accessToken) return;

    // التحقق من وجود commits محلية لم يتم رفعها
    const localCommits = await gitManager.getHistory();
    const lastBackupPath = path.join(app.getPath('userData'), 'last_push_status.json');

    let lastPushTime = 0;
    if (fs.existsSync(lastBackupPath)) {
      const pushStatus = JSON.parse(fs.readFileSync(lastBackupPath, 'utf8'));
      lastPushTime = pushStatus.lastPush || 0;
    }

    // إذا كان هناك commits جديدة ولم يتم رفعها منذ أكثر من ساعة.
    // نستخدم timestamp الرقمي: القراءة من حقل date النصي كانت تُنتج NaN،
    // والمقارنة NaN > x دائماً false — أي أن هذا المسار لم يكن يرفع شيئاً أبداً.
    if (localCommits.length > 0) {
      const latestCommitTime = localCommits[0].timestamp;
      if (latestCommitTime > lastPushTime && (Date.now() - lastPushTime) > 3600000) {
        console.log('📤 محاولة رفع النسخ المعلقة للسحابة...');
        const pushResult = await gitManager.pushToCloud(config.repoUrl, config.accessToken);
        if (pushResult.success) {
          fs.writeFileSync(lastBackupPath, JSON.stringify({
            lastPush: Date.now(),
            status: 'success'
          }));
          console.log('✅ تم رفع النسخ المعلقة');
        }
      }
    }
  } catch (error) {
    console.error('❌ خطأ في فحص الرفع المعلق:', error);
  }
}
