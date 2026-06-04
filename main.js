const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('./database/db');
const Database = require('better-sqlite3'); 

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

  // win.removeMenu();
  win.loadFile('index.html'); // يبدأ بصفحة تسجيل الدخول
};


app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ==========================================
// العمليات الخلفية (Backend) - الاتصال بقاعدة البيانات
// ==========================================
// 1. جلب الأصناف من الجدول (فقط التي لم يتم حذفها منطقياً)
ipcMain.handle('get-items', async () => {
  try {
    const items = db.prepare('SELECT * FROM items WHERE is_deleted = 0 ORDER BY item_id DESC').all();
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
    // نبحث عن المستخدم المطابق لاسم المستخدم وكلمة المرور، ويجب أن يكون حسابه نشطاً (is_active = 1)
    const stmt = db.prepare('SELECT user_id, full_name, role FROM users WHERE full_name = ? AND password_hash = ? AND is_active = 1');
    const user = stmt.get(credentials.username, credentials.password);

    if (user) {
      return { success: true, user: user };
    } else {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }
  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    return { success: false, message: 'حدث خطأ في قاعدة البيانات' };
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
      1, 
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
      1, 
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
             e.entity_name, s.store_name
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

    // 8. إعادة تشغيل التطبيق تلقائياً
    app.relaunch();
    app.exit();

  } catch (error) {
    console.error('خطأ في استيراد القاعدة:', error);
    return { success: false, message: 'حدث خطأ غير متوقع أثناء الاستيراد.' };
  }
});
