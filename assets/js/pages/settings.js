/**
 * Settings Page Logic
 * Handles cloud backup settings, connection checks, backup sync/restore.
 */

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();
});

let isOnline = false;

// Session helpers are provided by common.js

async function checkInternetConnection() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        await fetch('https://api.github.com', { signal: controller.signal, mode: 'no-cors' });
        clearTimeout(timeoutId);
        isOnline = true; updateConnectionStatus(true); return true;
    } catch (error) { isOnline = false; updateConnectionStatus(false); return false; }
}

function updateConnectionStatus(online) {
    const statusText = document.getElementById('statusText');
    if (online) { statusText.textContent = 'متصل بالإنترنت'; statusText.className = 'status-badge status-online'; }
    else { statusText.textContent = 'غير متصل (وضع غير متصل)'; statusText.className = 'status-badge status-offline'; }
}

async function syncAndShowBackups() {
    const btn = document.getElementById('syncAndShowBtn');
    const select = document.getElementById('cloudBackupsSelect');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الفحص...';
    btn.disabled = true;

    try {
        let localBackups = await window.api.getLocalBackups();
        if (localBackups && localBackups.success === false) {
            showToast(localBackups.message || 'حدث خطأ في جلب النسخ المحلية', 'error');
            displayBackups([], false);
            return;
        }

        const hasInternet = await checkInternetConnection();
        if (!hasInternet) {
            btn.innerHTML = originalText; btn.disabled = false;
            displayBackups(localBackups, false);
            showToast('لا يوجد اتصال - عرض النسخ المحلية فقط', 'warning');
            return;
        }

        const settings = await window.api.getSettings();
        if (!settings || !settings.repoUrl || !settings.accessToken) {
            btn.innerHTML = originalText; btn.disabled = false;
            displayBackups(localBackups, false);
            showToast('لا توجد إعدادات سحابية', 'warning');
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المزامنة...';
        const syncResult = await window.api.syncWithCloud();

        if (syncResult.success) {
            let allBackups = await window.api.getMergedBackups();
            if (allBackups && allBackups.success === false) {
                showToast(allBackups.message || 'حدث خطأ في جلب النسخ السحابية', 'warning');
                displayBackups(localBackups || [], false);
                return;
            }
            displayBackups(allBackups, true);
            showToast('تمت المزامنة بنجاح: ' + allBackups.length + ' نسخة', 'success');
        } else {
            displayBackups(localBackups, false);
            showToast('فشلت المزامنة - عرض المحلية فقط', 'warning');
        }
    } catch (error) {
        showToast('حدث خطأ أثناء المزامنة', 'error');
    } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

function displayBackups(backups, isOnlineMode) {
    const select = document.getElementById('cloudBackupsSelect');
    if (!backups || backups.length === 0) {
        select.innerHTML = '<option value="">لا توجد نسخ احتياطية</option>';
        return;
    }

    select.innerHTML = '<option value="">-- اختر نسخة --</option>';
    const fragment = document.createDocumentFragment();
    backups.forEach(b => {
        const source = b.source || 'local';
        const icon = source === 'cloud' ? '<i class="fas fa-cloud"></i>' : '<i class="fas fa-save"></i>';
        const sText = source === 'cloud' ? 'سحابية' : 'محلية';
        const option = document.createElement('option');
        option.value = b.fullCommitId || b.commitId;
        option.innerHTML = `${icon} [${sText}] ${b.date} - ${b.message}`;
        fragment.appendChild(option);
    });
    select.appendChild(fragment);
}

async function restoreDatabase() {
    const commitId = document.getElementById('cloudBackupsSelect').value;
    if (!commitId) { showToast('يرجى اختيار نسخة أولاً', 'warning'); return; }

    if (confirm('استرجاع هذه النسخة سيمسح البيانات الحالية ويستبدلها. هل أنت متأكد؟')) {
        const btn = document.getElementById('restoreBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الاسترجاع...';
        btn.disabled = true;

        try {
            const result = await window.api.restoreFromGit(commitId);
            if (result && result.success) { showToast('تم الاسترجاع بنجاح', 'success'); }
            else { showToast(result?.message || 'فشل الاسترجاع', 'error'); }
        } catch (error) { showToast('حدث خطأ أثناء الاسترجاع', 'error'); }
        finally { btn.innerHTML = originalText; btn.disabled = false; }
    }
}

// Init
window.addEventListener('DOMContentLoaded', async () => {
    const session = checkSession();

    try {
        const settings = await window.api.getSettings();
        if (settings) {
            document.getElementById('repoUrl').value = settings.repoUrl || '';
            document.getElementById('accessToken').value = settings.accessToken || '';
            document.getElementById('backupFrequency').value = settings.backupFrequency || '14';
            document.getElementById('alertBanner').style.display = 'none';
        } else { document.getElementById('alertBanner').style.display = 'flex'; }
    } catch (e) { document.getElementById('alertBanner').style.display = 'flex'; }

    await checkInternetConnection();
    document.getElementById('syncAndShowBtn').addEventListener('click', syncAndShowBackups);
});

// Save settings
async function saveSettings() {
    const btn = document.getElementById('saveBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    const result = await window.api.saveSettings({
        repoUrl: document.getElementById('repoUrl').value.trim(),
        accessToken: document.getElementById('accessToken').value.trim(),
        backupFrequency: document.getElementById('backupFrequency').value
    });

    if (result.success) {
        showToast(result.message, 'success');
        document.getElementById('alertBanner').style.display = 'none';
    } else { showToast(result.message, 'error'); }
    btn.innerHTML = originalText; btn.disabled = false;
}
