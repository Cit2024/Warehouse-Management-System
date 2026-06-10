const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    getItems: () => ipcRenderer.invoke('get-items'),
    addItem: (itemData) => ipcRenderer.invoke('add-item', itemData),
    deleteItem: (itemId) => ipcRenderer.invoke('delete-item', itemId),
    printDirect: () => ipcRenderer.invoke('print-direct'),
    generateReport: () => ipcRenderer.invoke('generate-report'),
    getSuppliers: () => ipcRenderer.invoke('get-suppliers'),
    getStores: () => ipcRenderer.invoke('get-stores'),
    saveSupplyReceipt: (receiptData) => ipcRenderer.invoke('save-supply-receipt', receiptData),
    getRequesters: () => ipcRenderer.invoke('get-requesters'),
    getStock: () => ipcRenderer.invoke('get-stock'),
    saveDispenseReceipt: (receiptData) => ipcRenderer.invoke('save-dispense-receipt', receiptData),
    getAllEntities: () => ipcRenderer.invoke('get-all-entities'),
    addEntity: (entityData) => ipcRenderer.invoke('add-entity', entityData),
    deleteEntity: (entityId) => ipcRenderer.invoke('delete-entity', entityId),
    getTransactionsHistory: () => ipcRenderer.invoke('get-transactions-history'),
    backupDatabase: () => ipcRenderer.invoke('backup-database'),
    restoreDatabase: () => ipcRenderer.invoke('restore-database'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settingsData) => ipcRenderer.invoke('save-settings', settingsData),
    
    getLocalBackups: () => ipcRenderer.invoke('get-local-backups'),
    syncWithCloud: () => ipcRenderer.invoke('sync-with-cloud'),
    getMergedBackups: () => ipcRenderer.invoke('get-merged-backups'),
    restoreFromGit: (commitId) => ipcRenderer.invoke('restore-from-git', commitId)
});
