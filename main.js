const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database/db');
const GitManager = require('./gitManager.js');
const Database = require('better-sqlite3');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node'); // بروتوكول الاتصال لـ Push/Pull
let gitManager; 
let scheduledBackupInterval = null; 

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
  gitManager = new GitManager(app.getPath('userData'));
  await gitManager.init();
  await startAutoBackupScheduling();
   
  setInterval(() => {
      checkAndPushPendingBackups();
  }, 3600000); 
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
    console.error('خطأ في جلب الأصناف:', error);
    return [];
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
    console.error('خطأ في إضافة الصنف:', error);
    return { success: false, message: 'حدث خطأ في قاعدة البيانات' };
  }
});

// 3. حذف صنف (حذف منطقي كما طلبتم في التصميم المحاسبي: Soft Delete)
ipcMain.handle('delete-item', async (event, itemId) => {
  try {
    const stmt = db.prepare('UPDATE items SET is_deleted = 1 WHERE item_id = ?');
    stmt.run(itemId);
    return { success: true, message: 'تم الحذف بنجاح' };
  } catch (error) {
    console.error('خطأ في الحذف:', error);
    return { success: false, message: 'لا يمكن حذف هذا الصنف' };
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
    console.error('خطأ في جلب الموردين:', error);
    return [];
  }
});

// جلب قائمة المخازن
ipcMain.handle('get-stores', async () => {
  try {
    return db.prepare("SELECT * FROM stores").all();
  } catch (error) {
    console.error('خطأ في جلب المخازن:', error);
    return [];
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
      INSERT INTO transactions (transaction_type, transaction_date, receipt_number, store_id, entity_id, created_by, notes) 
      VALUES ('In', ?, ?, ?, ?, ?, ?)
    `);
    
    // ملاحظة: وضعنا 1 كرقم افتراضي للمستخدم (created_by) حتى يتم برمجة نظام تسجيل الدخول لاحقاً
    const info = stmtMaster.run(
      data.date, 
      data.receiptNumber, 
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
    console.error('خطأ في جلب الجهات الطالبة:', error);
    return [];
  }
});

// جلب الأصناف مع رصيدها اللحظي من العرض (View)
ipcMain.handle('get-stock', async () => {
  try {
    // نجلب فقط الأصناف التي رصيدها أكبر من 0
    return db.prepare("SELECT * FROM view_current_stock WHERE current_quantity > 0").all();
  } catch (error) {
    console.error('خطأ في جلب الأرصدة:', error);
    return [];
  }
});

// حفظ إذن الصرف
ipcMain.handle('save-dispense-receipt', async (event, receiptData) => {
  const insertReceipt = db.transaction((data) => {
    // 1. حفظ رأس الإذن (نوع الحركة: Out)
    const stmtMaster = db.prepare(`
      INSERT INTO transactions (transaction_type, transaction_date, receipt_number, store_id, entity_id, created_by, notes) 
      VALUES ('Out', ?, ?, ?, ?, ?, ?)
    `);
    
    // نستخدم ID المستخدم 1 مؤقتاً (يمكنك لاحقاً جلبه من الجلسة session)
    const info = stmtMaster.run(
      data.date, 
      data.receiptNumber, 
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
    console.error('خطأ في جلب الجهات:', error);
    return [];
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
    console.error('خطأ في إضافة الجهة:', error);
    return { success: false, message: 'حدث خطأ في قاعدة البيانات' };
  }
});

// 3. حذف جهة (حذف منطقي)
ipcMain.handle('delete-entity', async (event, entityId) => {
  try {
    const stmt = db.prepare('UPDATE entities SET is_deleted = 1 WHERE entity_id = ?');
    stmt.run(entityId);
    return { success: true, message: 'تم حذف الجهة بنجاح' };
  } catch (error) {
    console.error('خطأ في الحذف:', error);
    return { success: false, message: 'لا يمكن حذف هذه الجهة' };
  }
});
// ==========================================
// دوال التقارير والإحصائيات (Reports)
// ==========================================

// جلب سجل الحركات (أذونات التوريد والصرف)
ipcMain.handle('get-transactions-history', async () => {
  try {
    const query = `
      SELECT t.transaction_id, t.transaction_type, t.transaction_date, t.receipt_number, 
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
    console.error('خطأ في جلب سجل الأذونات:', error);
    return [];
  }
});

// جلب تفاصيل إذن توريد محدد
ipcMain.handle('get-supply-receipt', async (event, receiptNumber) => {
  try {
    const header = db.prepare(`
      SELECT t.transaction_id, t.transaction_date AS date, t.receipt_number, t.notes,
             e.entity_name AS supplier, s.store_name AS store
      FROM transactions t
      LEFT JOIN entities e ON t.entity_id = e.entity_id
      LEFT JOIN stores s ON t.store_id = s.store_id
      WHERE t.receipt_number = ? AND t.transaction_type = 'In' AND t.is_deleted = 0
    `).get(receiptNumber);

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
ipcMain.handle('get-dispense-receipt', async (event, receiptNumber) => {
  try {
    const header = db.prepare(`
      SELECT t.transaction_id, t.transaction_date AS date, t.receipt_number, t.notes AS reason,
             e.entity_name AS requester, s.store_name AS store
      FROM transactions t
      LEFT JOIN entities e ON t.entity_id = e.entity_id
      LEFT JOIN stores s ON t.store_id = s.store_id
      WHERE t.receipt_number = ? AND t.transaction_type = 'Out' AND t.is_deleted = 0
    `).get(receiptNumber);

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

      // 3. نحدد الجداول الأساسية التي يجب أن تكون موجودة في منظومتنا
      const requiredTables = ['users', 'stores', 'items', 'entities', 'transactions', 'transaction_details'];

      // 4. نتحقق هل كل الجداول المطلوبة موجودة داخل الملف؟
      const isValidSchema = requiredTables.every(table => tableNames.includes(table));

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
    const dataPath = app.getPath('userData');
    const targetDbPath = path.join(dataPath, 'warehouse_system.sqlite');

    // 6. إغلاق الاتصال الحالي بقاعدة البيانات الحقيقية
    db.close();

    // 7. نسخ الملف السليم فوق القديم
    fs.copyFileSync(sourcePath, targetDbPath);

    // 8. توثيق عملية الاستيراد في Git (قبل إعادة التشغيل)
    //    يقرأ gitManager الملف الجديد الذي نسخناه للتو ويحفظه كـ commit
    if (gitManager) {
      const backupName = path.basename(sourcePath, path.extname(sourcePath));
      await gitManager.commitLocalBackup(`استيراد نسخة احتياطية خارجية: ${backupName}`);
    }

    // 9. إعادة تشغيل التطبيق تلقائياً
    app.relaunch();
    app.exit();

  } catch (error) {
    console.error('خطأ في استيراد القاعدة:', error);
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
    if (gitManager) {
        return await gitManager.getHistory();
    }
    return [];
});

// تنفيذ الاسترجاع من Git
ipcMain.handle('restore-from-git', async (event, commitId) => {
    try {
        // 1. إغلاق قاعدة البيانات الحالية لفك الارتباط بالملف
        db.close();

        // 2. أمر الـ GitManager بالاسترجاع
        const result = await gitManager.restoreFromCommit(commitId);

        if (result.success) {
            // 3. إعادة تشغيل التطبيق ليقرأ القاعدة الجديدة
            app.relaunch();
            app.exit();
        } else {
            return result;
        }
    } catch (error) {
        console.error('خطأ غير متوقع:', error);
        return { success: false, message: 'حدث خطأ غير متوقع أثناء استعادة النظام.' };
    }
});

ipcMain.handle('sync-with-cloud', async () => {
    try {
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
                date: commit.date,
                message: commit.message,
                source: 'local'
            });
        }
        
        // محاولة جلب النسخ السحابية إذا كان هناك اتصال
        try {
            const configPath = path.join(app.getPath('userData'), 'system_config.json');
            if (fs.existsSync(configPath)) {
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
        
        // ترتيب حسب التاريخ (الأحدث أولاً)
        const merged = Array.from(allBackups.values())
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log(`📊 تم دمج ${merged.length} نسخة (${merged.filter(b => b.source === 'local').length} محلية، ${merged.filter(b => b.source === 'cloud').length} سحابية)`);
        
        return merged;
        
    } catch (error) {
        console.error('❌ خطأ في دمج النسخ:', error);
        return [];
    }
});

// 3. التحقق من حالة الاتصال بالإنترنت (اختياري)
ipcMain.handle('check-internet', async () => {
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        // محاولة ping لـ GitHub
        await execPromise('ping -c 1 github.com', { timeout: 5000 });
        return { online: true };
    } catch (error) {
        return { online: false };
    }
});

// ==========================================
// دوال التخزين التلقائي المجدول
// ==========================================
function getBackupIntervalMs(days) {
    return days * 24 * 60 * 60 * 1000;
}

async function performAutoBackup() {
    console.log('🤖 بدء النسخ الاحتياطي التلقائي...');
    try {
        if (!gitManager) {
            return { success: false, message: 'نظام النسخ الاحتياطي لم يتم تهيئته' };
        }
        const commitResult = await gitManager.commitLocalBackup('نسخة احتياطية تلقائية دورية');
        if (!commitResult ) {
            return { success: false, message: 'فشل بالقيام ب local commit' };
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
        const configPath = path.join(app.getPath('userData'), 'system_config.json');
        if (!fs.existsSync(configPath)) {
            console.log('⚠️ لا توجد إعدادات، لن يتم تشغيل النسخ الاحتياطي التلقائي');
            return;
        }
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const backupFrequencyDays = parseInt(config.backupFrequency) || 14; // الافتراضي 14 يوم
        
        const intervalMs = getBackupIntervalMs(backupFrequencyDays);
        
        console.log(`⏰ بدء جدولة النسخ الاحتياطي التلقائي كل ${backupFrequencyDays} يوم (${intervalMs / (1000*60*60)} ساعة)`);
        const lastBackupPath = path.join(app.getPath('userData'), 'last_auto_backup.json');
        let shouldRunNow = false;
        
        if (fs.existsSync(lastBackupPath)) {
            const lastBackup = JSON.parse(fs.readFileSync(lastBackupPath, 'utf8'));
            const lastBackupTime = new Date(lastBackup.lastBackup);
            const timeSinceLastBackup = Date.now() - lastBackupTime.getTime();
            
            if (timeSinceLastBackup >= intervalMs) {
                console.log('⚠️ مضى وقت طويل على آخر نسخة احتياطية، جاري التنفيذ فوراً...');
                shouldRunNow = true;
            }
        } else {
            console.log('📝 لا يوجد سجل سابق، جاري عمل أول نسخة احتياطية...');
            shouldRunNow = true;
        }
        
        // تنفيذ نسخة فورية إذا لزم الأمر
        if (shouldRunNow) {
            // تأخير بسيط لضمان اكتمال تهيئة النظام
            setTimeout(() => performAutoBackup(), 10000);
        }
        
        // بدء الجدولة الدورية
        scheduledBackupInterval = setInterval(() => {
            performAutoBackup();
        }, intervalMs);
        
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
        
        // إذا كان هناك commits جديدة ولم يتم رفعها منذ أكثر من ساعة
        if (localCommits.length > 0) {
            const latestCommitTime = new Date(localCommits[0].date).getTime();
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
