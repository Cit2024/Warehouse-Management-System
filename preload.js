const { contextBridge, ipcRenderer } = require('electron');

// هذا الكود يكشف الدوال المسموح للـ HTML باستخدامها بأمان
contextBridge.exposeInMainWorld('api', {
    // الأصناف
    getItems: () => ipcRenderer.invoke('get-items'),
    addItem: (itemData) => ipcRenderer.invoke('add-item', itemData),
    deleteItem: (itemId) => ipcRenderer.invoke('delete-item', itemId),
    
    // التقارير
    printDirect: () => ipcRenderer.invoke('print-direct'),
    generateReport: () => ipcRenderer.invoke('generate-report')
});
