const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    // الأصناف والتقارير 
    getItems: () => ipcRenderer.invoke('get-items'),
    addItem: (itemData) => ipcRenderer.invoke('add-item', itemData),
    deleteItem: (itemId) => ipcRenderer.invoke('delete-item', itemId),
    printDirect: () => ipcRenderer.invoke('print-direct'),
    generateReport: () => ipcRenderer.invoke('generate-report'),
   
    // دوال أذونات التوريدltr
    getSuppliers: () => ipcRenderer.invoke('get-suppliers'),
    getStores: () => ipcRenderer.invoke('get-stores'),
    saveSupplyReceipt: (receiptData) => ipcRenderer.invoke('save-supply-receipt', receiptData),
    // دوال أذونات الصرف 
    getRequesters: () => ipcRenderer.invoke('get-requesters'),
    getStock: () => ipcRenderer.invoke('get-stock'),
    saveDispenseReceipt: (receiptData) => ipcRenderer.invoke('save-dispense-receipt', receiptData),
    // دوال إدارة الجهات والموردين
    getAllEntities: () => ipcRenderer.invoke('get-all-entities'),
    addEntity: (entityData) => ipcRenderer.invoke('add-entity', entityData),
    deleteEntity: (entityId) => ipcRenderer.invoke('delete-entity', entityId),
    //
    getTransactionsHistory: () => ipcRenderer.invoke('get-transactions-history'),
    // دالة النسخ الاحتياطي
    backupDatabase: () => ipcRenderer.invoke('backup-database')
});
