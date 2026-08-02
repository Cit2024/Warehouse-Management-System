/**
 * Mock preload used only by scripts/capture-screenshots.js.
 * Provides sample data so the pages render populated screenshots
 * without requiring a real database or main-process IPC handlers.
 */
const { contextBridge } = require('electron');

// Seed data for screenshots
const ITEMS = [
    { item_id: 'ITM-001', item_name: 'ورق تصوير A4', unit: 'رزمة', category: 'قرطاسية', min_order_qty: 20, current_quantity: 85, unit_price: 24.50 },
    { item_id: 'ITM-002', item_name: 'حبر طابعة أسود HP', unit: 'قطعة', category: 'أحبار وطباعة', min_order_qty: 10, current_quantity: 8, unit_price: 145.00 },
    { item_id: 'ITM-003', item_name: 'كابل شبكة CAT6', unit: 'لفة', category: 'شبكات', min_order_qty: 5, current_quantity: 12, unit_price: 390.00 },
    { item_id: 'ITM-004', item_name: 'قفازات حماية صناعية', unit: 'زوج', category: 'سلامة مهنية', min_order_qty: 30, current_quantity: 120, unit_price: 18.00 },
    { item_id: 'ITM-005', item_name: 'مفك كهربائي متعدد', unit: 'قطعة', category: 'عدد وأدوات', min_order_qty: 8, current_quantity: 6, unit_price: 72.00 },
    { item_id: 'ITM-007', item_name: 'مصباح LED مختبر', unit: 'قطعة', category: 'كهرباء', min_order_qty: 20, current_quantity: 19, unit_price: 15.50 },
    { item_id: 'ITM-008', item_name: 'ملف حفظ بلاستيكي', unit: 'قطعة', category: 'قرطاسية', min_order_qty: 50, current_quantity: 210, unit_price: 3.50 },
    { item_id: 'ITM-009', item_name: 'ورق تصوير A3', unit: 'رزمة', category: 'قرطاسية', min_order_qty: 10, current_quantity: 45, unit_price: 60.00 },
    { item_id: 'ITM-010', item_name: 'وصلة كاميرا', unit: 'قطعة', category: 'شبكات', min_order_qty: 8, current_quantity: 5, unit_price: 68.00 }
];

const SUPPLIERS = [
    { entity_id: 1, code: 'SUP-001', entity_name: 'شركة الأفق للحاسبات', entity_type: 'Supplier', phone: '0920000000', address: 'مصراتة - المنطقة الصناعية' },
    { entity_id: 2, code: 'SUP-002', entity_name: 'مكتبة مصراتة الحديثة', entity_type: 'Supplier', phone: '0911111111', address: 'مصراتة - وسط المدينة' }
];

// الجهات الداخلية مرتّبة هرمياً (depth/path كما تُرجعها CTE في main.js).
const REQUESTERS = [
    { entity_id: 3, code: 'ENT-001', entity_name: 'الإدارة العامة', entity_type: 'Department', phone: '', address: 'المبنى الإداري', parent_id: null, depth: 0, path: 'الإدارة العامة' },
    { entity_id: 4, code: 'ENT-002', entity_name: 'قسم تقنية المعلومات', entity_type: 'Department', phone: '', address: 'المبنى الإداري', parent_id: 3, depth: 1, path: 'الإدارة العامة ← قسم تقنية المعلومات' },
    { entity_id: 5, code: 'ENT-003', entity_name: 'شعبة الصيانة والدعم', entity_type: 'Department', phone: '', address: 'المبنى الإداري', parent_id: 4, depth: 2, path: 'الإدارة العامة ← قسم تقنية المعلومات ← شعبة الصيانة والدعم' },
    { entity_id: 6, code: 'ENT-004', entity_name: 'مكتب الشؤون الإدارية', entity_type: 'Department', phone: '', address: 'الإدارة', parent_id: 3, depth: 1, path: 'الإدارة العامة ← مكتب الشؤون الإدارية' }
];

const ENTITIES = [...SUPPLIERS, ...REQUESTERS];

const STORES = [
    { store_id: 1, store_name: 'المخزن الرئيسي', location: 'المبنى الإداري' }
];

const TRANSACTIONS = [
    { transaction_id: 1, transaction_type: 'In', transaction_date: '2026-07-02', entity_name: 'شركة الأفق للحاسبات', store_name: 'المخزن الرئيسي', total_value: 1575.00 },
    { transaction_id: 2, transaction_type: 'In', transaction_date: '2026-07-05', entity_name: 'مكتبة مصراتة الحديثة', store_name: 'المخزن الرئيسي', total_value: 3900.00 },
    { transaction_id: 3, transaction_type: 'Out', transaction_date: '2026-07-08', entity_name: 'قسم تقنية المعلومات', store_name: 'المخزن الرئيسي', total_value: 504.00 },
    { transaction_id: 4, transaction_type: 'Out', transaction_date: '2026-07-10', entity_name: 'مكتب الشؤون الإدارية', store_name: 'المخزن الرئيسي', total_value: 332.50 },
    { transaction_id: 5, transaction_type: 'Out', transaction_date: '2026-07-11', entity_name: 'قسم الهندسة الكهربائية', store_name: 'المخزن الرئيسي', total_value: 720.00 }
];

const USERS = [
    { user_id: 1, full_name: 'admin', role: 'Admin', is_active: 1, created_at: '2026-07-01' },
    { user_id: 2, full_name: 'أمين المخزن', role: 'Store_Keeper', is_active: 1, created_at: '2026-07-02' }
];

const BACKUPS = [
    { commitId: 'abc1234', date: '2026-07-12 09:00', message: 'نسخة تلقائية' },
    { commitId: 'def5678', date: '2026-07-11 21:00', message: 'قبل إضافة مستخدمين' }
];

// Fake session so every page (except login) thinks we are logged in.
// Default role is Admin; capture-screenshots.js can override it per page via
// --screenshot-role=Store_Keeper to show the reduced sidebar.
const roleArg = process.argv.find(a => a.startsWith('--screenshot-role='));
const sessionRole = roleArg ? roleArg.split('=')[1] : 'Admin';
try {
    localStorage.setItem('userSession', JSON.stringify({
        userId: sessionRole === 'Admin' ? 1 : 2,
        username: sessionRole === 'Admin' ? 'admin' : 'storekeeper',
        fullName: sessionRole === 'Admin' ? 'admin' : 'أمين المخزن',
        role: sessionRole
    }));
} catch (e) {
    // localStorage may not be available in some contexts; ignore.
}

function itemTransactions(itemId) {
    // Return hard-coded movements for a few items so the item-card report looks real.
    const id = String(itemId);
    if (id === 'ITM-001') {
        return [
            { transaction_id: 1, transaction_type: 'In', transaction_date: '2026-07-02', entity_name: 'شركة الأفق للحاسبات', quantity: 50, running_balance: 50 },
            { transaction_id: 3, transaction_type: 'Out', transaction_date: '2026-07-08', entity_name: 'قسم تقنية المعلومات', quantity: 10, running_balance: 40 },
            { transaction_id: 4, transaction_type: 'Out', transaction_date: '2026-07-10', entity_name: 'مكتب الشؤون الإدارية', quantity: 5, running_balance: 35 }
        ];
    }
    if (id === 'ITM-002') {
        return [
            { transaction_id: 1, transaction_type: 'In', transaction_date: '2026-07-02', entity_name: 'شركة الأفق للحاسبات', quantity: 10, running_balance: 10 },
            { transaction_id: 3, transaction_type: 'Out', transaction_date: '2026-07-08', entity_name: 'قسم تقنية المعلومات', quantity: 2, running_balance: 8 }
        ];
    }
    return [];
}

contextBridge.exposeInMainWorld('api', {
    login: async () => ({ success: true, user: { user_id: 1, full_name: 'admin', role: 'Admin' } }),
    logout: async () => ({ success: true }),

    getItems: async () => ITEMS,
    addItem: async () => ({ success: true, message: 'تمت الإضافة' }),
    updateItem: async () => ({ success: true, message: 'تم التحديث' }),
    deleteItem: async () => ({ success: true, message: 'تم الحذف' }),

    getSuppliers: async () => SUPPLIERS,
    getRequesters: async () => REQUESTERS,
    getStores: async () => STORES,
    getStock: async () => ITEMS,

    getAllEntities: async () => ENTITIES,
    addEntity: async () => ({ success: true, message: 'تمت الإضافة' }),
    deleteEntity: async () => ({ success: true, message: 'تم الحذف' }),

    saveSupplyReceipt: async () => ({ success: true, message: 'تم حفظ إذن التوريد' }),
    saveDispenseReceipt: async () => ({ success: true, message: 'تم حفظ إذن الصرف' }),
    getSupplyReceipt: async () => ({
        success: true,
        receipt: {
            transaction_id: 1,
            date: '2026-07-02',
            supplier: 'شركة الأفق للحاسبات',
            store: 'المخزن الرئيسي',
            notes: 'توريد مستلزمات مكتبية',
            items: [
                { item_id: 'ITM-001', item_name: 'ورق تصوير A4', unit: 'رزمة', quantity: 50, price: 24.50 },
                { item_id: 'ITM-002', item_name: 'حبر طابعة أسود HP', unit: 'قطعة', quantity: 10, price: 145.00 }
            ]
        }
    }),
    getDispenseReceipt: async () => ({
        success: true,
        receipt: {
            transaction_id: 3,
            date: '2026-07-08',
            requester: 'قسم تقنية المعلومات',
            requester_path: 'الإدارة العامة ← قسم تقنية المعلومات',
            recipient: 'محمد عبد السلام',
            store: 'المخزن الرئيسي',
            reason: 'احتياجات المعمل',
            items: [
                { item_id: 'ITM-001', item_name: 'ورق تصوير A4', unit: 'رزمة', quantity: 10, price: 0 },
                { item_id: 'ITM-002', item_name: 'حبر طابعة أسود HP', unit: 'قطعة', quantity: 2, price: 0 }
            ]
        }
    }),

    getTransactionsHistory: async () => TRANSACTIONS,
    getItemTransactions: async (itemId) => itemTransactions(itemId),

    getUsers: async () => USERS,
    addUser: async () => ({ success: true, message: 'تمت الإضافة' }),
    updateUserRole: async () => ({ success: true, message: 'تم التحديث' }),
    setUserActive: async () => ({ success: true, message: 'تم التحديث' }),
    changePassword: async () => ({ success: true, message: 'تم التغيير' }),

    getDbHealth: async () => ({ isHealthy: true }),

    getSettings: async () => ({ logoPath: '' }),
    saveSettings: async () => ({ success: true, message: 'تم الحفظ' }),

    getLocalBackups: async () => BACKUPS,
    restoreFromGit: async () => ({ success: true, message: 'تم الاسترجاع' }),
    backupDatabase: async () => ({ success: true, message: 'تم النسخ' }),
    restoreDatabase: async () => ({ success: true, message: 'تم الاسترجاع' }),

    printDirect: async () => ({ success: true }),
    generateReport: async () => ({ success: true }),
    syncWithCloud: async () => ({ success: true }),
    getMergedBackups: async () => []
});
