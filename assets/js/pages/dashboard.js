/**
 * Dashboard Page Logic (redesigned for low-literacy users)
 * Tells the user what to do instead of showing raw data.
 */

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout({ showRefresh: true, refreshAction: 'loadDashboardData()' });
    layout.init();
});

let allItems = [];

// ========== Dashboard Data ==========
async function loadDashboardData() {
    try {
        let items = await window.api.getItems();
        if (items && items.success === false) {
            showToast(items.message || 'حدث خطأ في جلب الأصناف', 'error');
            items = [];
        }
        allItems = items || [];

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

        renderStatus(allItems);
        renderAttention(allItems);
        renderRecentMovements(history);
        renderSummary(allItems, history);
        updateSidebarBadge(allItems.length);
        renderRoleBadge();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('تعذّر تحميل بيانات لوحة التحكم', 'error');
        showDashboardLoadError();
    }
}

// عند فشل تحميل البيانات — نعرض حالة خطأ واضحة بدلاً من أرقام وهمية
function showDashboardLoadError() {
    const status = document.getElementById('dashboardStatus');
    if (status) {
        status.className = 'dashboard-status dashboard-status--error';
        status.href = 'javascript:void(0);';
        status.innerHTML = `
            <span class="dashboard-status-icon" aria-hidden="true"><i class="fas fa-triangle-exclamation"></i></span>
            <span class="dashboard-status-text">تعذّر تحميل البيانات — اضغط زر التحديث أعلى الصفحة</span>
        `;
    }

    const attention = document.getElementById('attentionList');
    if (attention) attention.innerHTML = '<p class="dashboard-empty">تعذّر تحميل التنبيهات.</p>';

    const movements = document.getElementById('recentMovementsList');
    if (movements) movements.innerHTML = '<li class="dashboard-empty">تعذّر تحميل الحركات الأخيرة.</li>';

    document.getElementById('summaryTotalItems').textContent = '—';
    document.getElementById('summaryInventoryValue').textContent = '—';
    document.getElementById('summaryMonthlyMovements').textContent = '—';
}

// ========== Status Banner ==========
function renderStatus(items) {
    const status = document.getElementById('dashboardStatus');
    if (!status) return;

    const lowItems = items.filter(item => (item.current_quantity || 0) <= (item.min_order_qty || 0));

    if (lowItems.length === 0) {
        status.className = 'dashboard-status dashboard-status--ok';
        status.href = 'javascript:void(0);';
        status.setAttribute('aria-disabled', 'true');
        status.setAttribute('tabindex', '-1');
        status.innerHTML = `
            <span class="dashboard-status-icon" aria-hidden="true"><i class="fas fa-check-circle"></i></span>
            <span class="dashboard-status-text">كل شيء على ما يرام — لا توجد أصناف تحتاج تدخلك اليوم</span>
        `;
    } else {
        status.className = 'dashboard-status dashboard-status--warning';
        status.href = '#attentionPanel';
        status.setAttribute('aria-disabled', 'false');
        status.setAttribute('tabindex', '0');
        status.innerHTML = `
            <span class="dashboard-status-icon" aria-hidden="true"><i class="fas fa-exclamation-circle"></i></span>
            <span class="dashboard-status-text">يوجد ${lowItems.length} ${lowItems.length === 1 ? 'صنف' : 'أصناف'} وصلت للحد الأدنى وتحتاج إعادة طلب</span>
            <span class="dashboard-status-hint">اضغط هنا لمعرفة الأصناف</span>
        `;
    }
}

// ========== Attention Section ==========
function renderAttention(items) {
    const container = document.getElementById('attentionList');
    if (!container) return;

    const lowItems = items.filter(item => (item.current_quantity || 0) <= (item.min_order_qty || 0));

    if (lowItems.length === 0) {
        container.innerHTML = `
            <div class="dashboard-allclear">
                <span class="dashboard-allclear-icon" aria-hidden="true"><i class="fas fa-check-circle"></i></span>
                <p>لا توجد أصناف منخفضة — لا تحتاج لأي إجراء الآن</p>
            </div>
        `;
        return;
    }

    container.innerHTML = lowItems.map(item => {
        const current = item.current_quantity || 0;
        const min = item.min_order_qty || 0;
        return `
            <div class="dashboard-attention-row">
                <div class="dashboard-attention-info">
                    <span class="dashboard-attention-name">${escapeHtml(item.item_name || 'غير معروف')}</span>
                    <span class="dashboard-attention-detail">
                        متبقي ${current.toLocaleString('ar-LY')} من أصل حد أدنى ${min.toLocaleString('ar-LY')}
                        <details class="dashboard-inline-hint">
                            <summary><span aria-hidden="true">(؟)</span><span class="visually-hidden">ما معنى الحد الأدنى؟</span></summary>
                            <p>الحد الأدنى هو أقل كمية يجب توفرها من الصنف قبل إعادة الطلب.</p>
                        </details>
                    </span>
                </div>
                <a href="supply.html" class="btn btn-primary btn-sm">
                    <span><i class="fas fa-arrow-down" aria-hidden="true"></i></span>
                    <span>توريد</span>
                </a>
            </div>
        `;
    }).join('');
}

// ========== Recent Movements ==========
function renderRecentMovements(history) {
    const list = document.getElementById('recentMovementsList');
    if (!list) return;

    const recent = (history || [])
        .filter(t => t.transaction_date)
        .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date))
        .slice(0, 5);

    if (recent.length === 0) {
        list.innerHTML = '<li class="dashboard-empty">لا توجد حركات مسجلة بعد</li>';
        return;
    }

    list.innerHTML = recent.map(t => {
        const isDispense = t.transaction_type === 'Out';
        const action = isDispense ? 'تم صرف' : 'تم توريد';
        const entity = escapeHtml(t.entity_name || t.store_name || 'جهة غير محددة');
        const value = (t.total_value || 0).toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const dateText = formatMovementDate(t.transaction_date);
        return `
            <li class="dashboard-movement">
                <span class="dashboard-movement-date">${dateText}</span>
                <span class="dashboard-movement-text">
                    — ${action} بقيمة ${value} د.ل لـ ${entity}
                </span>
            </li>
        `;
    }).join('');
}

// تنسيق التاريخ: نسبي إن كان قريباً، وإلا بصيغة عربية واضحة
function formatMovementDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfDayBefore = new Date(startOfToday);
    startOfDayBefore.setDate(startOfDayBefore.getDate() - 2);

    if (d >= startOfToday) return 'اليوم';
    if (d >= startOfYesterday) return 'أمس';
    if (d >= startOfDayBefore) return 'قبل يومين';

    const diffDays = Math.floor((startOfToday - d) / (1000 * 60 * 60 * 24));
    if (diffDays > 2 && diffDays < 7) {
        return `قبل ${diffDays} ${diffDays === 1 ? 'يوم' : 'أيام'}`;
    }

    return d.toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ========== Small Numeric Summary ==========
function renderSummary(items, history) {
    const totalItems = items.length;
    const totalValue = items.reduce((sum, item) => sum + ((item.current_quantity || 0) * (item.unit_price || 0)), 0);
    const monthlyMovements = countMovementsThisMonth(history);

    document.getElementById('summaryTotalItems').textContent = totalItems.toLocaleString('ar-LY');
    document.getElementById('summaryInventoryValue').textContent = totalValue.toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' د.ل';
    document.getElementById('summaryMonthlyMovements').textContent = monthlyMovements.toLocaleString('ar-LY');
}

function countMovementsThisMonth(history) {
    const now = new Date();
    return (history || []).filter(t => {
        if (!t.transaction_date) return false;
        const d = new Date(t.transaction_date);
        return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
}

// ========== Helpers (kept from previous version) ==========
function updateSidebarBadge(count) {
    const badge = document.getElementById('sidebarItemCount');
    if (badge) badge.textContent = count;
}

const ROLE_BADGE_INFO = {
    Admin: { text: 'مسؤول', icon: 'fa-user-shield', cssClass: 'admin' },
    Store_Keeper: { text: 'أمين مخزن', icon: 'fa-user-gear', cssClass: 'storekeeper' },
    Viewer: { text: 'مستعرض (قراءة فقط)', icon: 'fa-eye', cssClass: 'viewer' }
};

function renderRoleBadge() {
    const container = document.getElementById('roleBadgeContainer');
    if (!container) return;

    const session = checkSession();
    const info = session && ROLE_BADGE_INFO[session.role];
    if (!info) { container.innerHTML = ''; return; }

    container.innerHTML = `
        <span class="role-badge ${info.cssClass}">
            <i class="fas ${info.icon}" aria-hidden="true"></i>
            ${escapeHtml(info.text)}
        </span>
    `;
}

async function checkDatabaseHealth() {
    try {
        const health = await window.api.getDbHealth();
        if (!health || health.success === false || health.isHealthy) return;

        const problems = [];
        if (health.orphanHeaders > 0) {
            problems.push(`${health.orphanHeaders} إذن بدون أصناف (فُقدت سطوره)`);
        }
        if (health.negativeStockItems.length > 0) {
            const names = health.negativeStockItems.map(i => `«${escapeHtml(i.item_name)}»`).join('، ');
            problems.push(`${health.negativeStockItems.length} صنف برصيد سالب: ${names}`);
        }

        const banner = document.createElement('div');
        banner.className = 'db-health-banner';
        banner.setAttribute('role', 'alert');
        banner.innerHTML = `
            <span class="db-health-icon" aria-hidden="true"><i class="fas fa-triangle-exclamation"></i></span>
            <div>
                <strong>تحذير: تم اكتشاف تلف في البيانات</strong>
                <p>${problems.join(' — ')}.</p>
                <p>يُرجى استرجاع نسخة احتياطية سابقة <strong>قبل</strong> تسجيل أي حركات جديدة، وإلا ستُبنى الحركات الجديدة فوق أرصدة خاطئة.</p>
            </div>
        `;

        const content = document.querySelector('main.content');
        if (content) content.insertAdjacentElement('afterbegin', banner);
    } catch (error) {
        console.error('تعذّر فحص سلامة البيانات:', error);
    }
}

// ========== Init ==========
window.addEventListener('DOMContentLoaded', () => {
    const session = checkSession();
    if (session) {
        checkDatabaseHealth();
        loadDashboardData();
    }
});
