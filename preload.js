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
    saveSupplyReceipt: (receiptData) => ipcRenderer.invoke('save-supply-receipt', receiptData)
});
