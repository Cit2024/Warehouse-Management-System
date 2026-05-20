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
