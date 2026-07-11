/**
 * Dashboard Page Logic
 * Handles data loading, charts, tables, and interactions for dashboard.html
 */

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout({ showRefresh: true, refreshAction: 'loadDashboardData()' });
    layout.init();
});

let allItems = [];
let inventoryChart = null;

// Table sorting helpers (parseArabNumber / sortTable) are provided by common.js

// Session helpers are provided by common.js

// ========== Dashboard Data ==========
async function loadDashboardData() {
    try {
        let items = await window.api.getItems();
        if (items && items.success === false) {
            showToast(items.message || 'حدث خطأ في جلب الأصناف', 'error');
            items = [];
        }
        allItems = items || [];

        // سجل الحركات (توريد/صرف) يُستخدم لحساب عدد حركات الشهر ولعرض آخر الحركات
        let history = [];
        try {
            history = await window.api.getTransactionsHistory();
            if (history && history.success === false) {
                showToast(history.message || 'حدث خطأ في جلب سجل الحركات', 'error');
                history = [];
            }
        } catch (historyError) {
            console.error('Error loading transactions history:', historyError);
        }

        updateStats(allItems, countMovementsThisMonth(history));
        renderItemsSummary(allItems);
        renderLowStockAlerts(allItems);
        renderChart(allItems);
        renderRecentMovements(history);
        updateSidebarBadge(allItems.length);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        // Use sample data for preview
        loadSampleData();
    }
}

// يحسب عدد الحركات (توريد/صرف) التي تاريخها يقع ضمن الشهر والسنة الحاليين
function countMovementsThisMonth(history) {
    const now = new Date();
    return history.filter(t => {
        if (!t.transaction_date) return false;
        const d = new Date(t.transaction_date);
        return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
}

function loadSampleData() {
    const sampleItems = [
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
    allItems = sampleItems;
    updateStats(sampleItems, 4);
    renderItemsSummary(sampleItems);
    renderLowStockAlerts(sampleItems);
    renderChart(sampleItems);
    updateSidebarBadge(sampleItems.length);
    renderSampleMovements();
}

function updateStats(items, monthlyMovements = 0) {
    const totalItems = items.length;
    const totalUnits = items.reduce((sum, item) => sum + (item.current_quantity || 0), 0);
    const totalValue = items.reduce((sum, item) => sum + ((item.current_quantity || 0) * (item.unit_price || 0)), 0);
    const lowStock = items.filter(item => (item.current_quantity || 0) <= (item.min_order_qty || 0)).length;

    document.getElementById('statTotalItems').textContent = totalItems;
    document.getElementById('statTotalUnits').textContent = totalUnits.toLocaleString() + ' وحدة مخزنة';
    document.getElementById('statInventoryValue').textContent = totalValue.toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' د.ل';
    document.getElementById('statLowStock').textContent = lowStock;
    document.getElementById('statMonthlyMovements').textContent = monthlyMovements;
}

function updateSidebarBadge(count) {
    const badge = document.getElementById('sidebarItemCount');
    if (badge) badge.textContent = count;
}

function renderChart(items) {
    const ctx = document.getElementById('inventoryChart');
    if (!ctx) return;

    // Group by category
    const categoryData = {};
    items.forEach(item => {
        const value = (item.current_quantity || 0) * (item.unit_price || 0);
        categoryData[item.category] = (categoryData[item.category] || 0) + value;
    });

    const labels = Object.keys(categoryData);
    const data = Object.values(categoryData);

    if (inventoryChart) {
        inventoryChart.destroy();
    }

    inventoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'القيمة (د.ل)',
                data: data,
                backgroundColor: 'rgba(255, 107, 0, 0.8)',
                borderColor: 'rgba(255, 107, 0, 1)',
                borderWidth: 0,
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y.toLocaleString('ar-LY') + ' د.ل';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('ar-LY');
                        }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function renderLowStockAlerts(items) {
    const container = document.getElementById('lowStockList');
    const lowItems = items.filter(item => (item.current_quantity || 0) <= (item.min_order_qty || 0));

    if (lowItems.length === 0) {
        container.innerHTML = '';
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.style.padding = '24px';
        emptyState.innerHTML = `
            <div class="empty-state-icon"><i class="fas fa-check-circle"></i></div>
            <p>لا توجد أصناف منخفضة</p>
        `;
        container.appendChild(emptyState);
        return;
    }

    const fragment = document.createDocumentFragment();
    lowItems.forEach(item => {
        const alertItem = document.createElement('div');
        alertItem.className = 'alert-item';
        alertItem.innerHTML = `
            <div class="alert-item-icon">${(item.item_name || 'غير معروف').charAt(0)}</div>
            <div class="alert-item-content">
                <div class="alert-item-name">${item.item_name || 'غير معروف'}</div>
                <div class="alert-item-detail">${(item.current_quantity || 0)} ${(item.unit || '')} من حد أدنى ${(item.min_order_qty || 0)}</div>
            </div>
            <div class="alert-item-status">منخفض</div>
        `;
        fragment.appendChild(alertItem);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
}

// يُستخدم فقط في مسار البيانات التجريبية (عند فشل الاتصال بقاعدة البيانات) لعرض نموذج توضيحي
function renderSampleMovements() {
    const container = document.getElementById('recentMovements');
    const movements = [
        { type: 'dispense', id: 'صرف-2026-002', date: '2026-06-12', entity: 'مكتب الشؤون الإدارية', value: '332,50 د.ل' },
        { type: 'dispense', id: 'صرف-2026-001', date: '2026-06-10', entity: 'قسم الهندسة الكهربائية', value: '504,00 د.ل' },
        { type: 'supply', id: 'توريد-2026-002', date: '2026-06-07', entity: 'مكتبة مصراتة الحديثة', value: '1.575,00 د.ل' },
        { type: 'supply', id: 'توريد-2026-001', date: '2026-06-02', entity: 'شركة المدار للتجهيزات', value: '3.740,00 د.ل' }
    ];

    const fragment = document.createDocumentFragment();
    movements.forEach(m => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        activityItem.innerHTML = `
            <div class="activity-icon ${m.type}">
                <i class="fas fa-arrow-${m.type === 'supply' ? 'down' : 'up'}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-title">${m.id}</div>
                <div class="activity-meta">${m.date} · ${m.entity}</div>
            </div>
            <div class="activity-value">${m.value}</div>
        `;
        fragment.appendChild(activityItem);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
}

// يعرض آخر الحركات الحقيقية (توريد/صرف) من سجل قاعدة البيانات الفعلي
function renderRecentMovements(history) {
    const container = document.getElementById('recentMovements');
    if (!container) return;

    const recent = (history || []).slice(0, 6);

    if (recent.length === 0) {
        container.innerHTML = '';
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <div class="empty-state-icon"><i class="fas fa-clipboard-list"></i></div>
            <p>لا توجد حركات مسجلة</p>
        `;
        container.appendChild(emptyState);
        return;
    }

    const fragment = document.createDocumentFragment();
    recent.forEach(t => {
        const isDispense = t.transaction_type === 'Out';
        const type = isDispense ? 'dispense' : 'supply';
        const title = '#' + t.transaction_id;
        const entity = t.entity_name || t.store_name || '-';
        const dateLabel = formatMovementDate(t.transaction_date);
        const value = (t.total_value || 0).toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' د.ل';

        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        activityItem.innerHTML = `
            <div class="activity-icon ${type}">
                <i class="fas fa-arrow-${type === 'supply' ? 'down' : 'up'}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-title">${title}</div>
                <div class="activity-meta">${dateLabel} · ${entity}</div>
            </div>
            <div class="activity-value">${value}</div>
        `;
        fragment.appendChild(activityItem);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
}

// تنسيق تاريخ الحركة لعرض مختصر وواضح (مثال: 2026-06-12 -> 12-06-2026)
function formatMovementDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('ar-LY', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ========== Items Summary ==========
function renderItemsSummary(items) {
    const container = document.getElementById('itemsSummary');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 32px;">
                <div class="empty-state-icon"><i class="fas fa-inbox"></i></div>
                <h3>لا توجد أصناف حالياً</h3>
                <p>قم بإضافة صنف جديد من صفحة الأصناف والمخزون</p>
            </div>
        `;
        return;
    }

    const lowItems = items.filter(item => (item.current_quantity || 0) <= (item.min_order_qty || 0));
    const previewItems = items.slice(0, 5);

    let html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 20px;">
            <div class="stat-card" style="margin: 0;">
                <div class="stat-content">
                    <div class="stat-label">إجمالي الأصناف</div>
                    <div class="stat-value" style="font-size: 24px;">${items.length}</div>
                </div>
            </div>
            <div class="stat-card" style="margin: 0;">
                <div class="stat-content">
                    <div class="stat-label">أصناف منخفضة</div>
                    <div class="stat-value" style="font-size: 24px; color: var(--danger);">${lowItems.length}</div>
                </div>
            </div>
        </div>

        <h4 style="margin-bottom: 12px; font-size: 15px; color: var(--text-primary);">آخر الأصناف المسجلة</h4>
        <div class="activity-list">
    `;

    previewItems.forEach(item => {
        const isLow = (item.current_quantity || 0) <= (item.min_order_qty || 0);
        html += `
            <div class="activity-item">
                <div class="activity-icon" style="background: var(--primary-light); color: var(--primary);">
                    <i class="fas fa-box"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${item.item_name}</div>
                    <div class="activity-meta">${item.category || 'غير مصنف'} · ${item.current_quantity || 0} ${item.unit}</div>
                </div>
                <div class="activity-value">
                    <span class="badge ${isLow ? 'badge-low' : 'badge-available'}">${isLow ? 'منخفض' : 'متوفر'}</span>
                </div>
            </div>
        `;
    });

    html += '</div>';

    if (items.length > 5) {
        html += `
            <div style="text-align: center; margin-top: 16px;">
                <a href="items.html" class="btn btn-secondary">
                    <span>عرض كل الأصناف</span>
                    <span><i class="fas fa-arrow-left"></i></span>
                </a>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ========== Print ==========
function handleDirectPrint() {
    window.print();
}

// ========== Init ==========
window.addEventListener('DOMContentLoaded', () => {
    const session = checkSession();
    if (session) {
        loadDashboardData();
    }
});
