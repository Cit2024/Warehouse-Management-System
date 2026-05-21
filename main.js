const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('./database/db');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200, // عرض أكبر ليناسب لوحة التحكم
    height: 800,
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
