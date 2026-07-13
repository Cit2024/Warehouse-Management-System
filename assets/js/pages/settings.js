/**
 * Settings Page Logic
 * Handles cloud backup settings, connection checks, backup sync/restore.
 */

document.addEventListener('DOMContentLoaded', () => {
    const layout = new Layout();
    layout.init();
});

// Session helpers are provided by common.js

// المزامنة السحابية معطّلة في هذا الإصدار، فنعرض النسخ المحلية فقط.
// (الدوال السحابية ما زالت موجودة في main.js خلف CLOUD_SYNC_ENABLED.)
async function syncAndShowBackups() {
    const btn = document.getElementById('syncAndShowBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري جلب النسخ...';
    btn.disabled = true;

    try {
        const localBackups = await window.api.getLocalBackups();

        if (localBackups && localBackups.success === false) {
            showToast(localBackups.message || 'حدث خطأ في جلب النسخ المحلية', 'error');
            displayBackups([], false);
            return;
        }

        displayBackups(localBackups, false);

        if (!localBackups || localBackups.length === 0) {
            showToast('لا توجد نسخ احتياطية محلية بعد', 'info');
        } else {
            showToast(`تم العثور على ${localBackups.length} نسخة احتياطية محلية`, 'success');
        }
    } catch (error) {
        console.error('خطأ في جلب النسخ المحلية:', error);
        showToast('حدث خطأ أثناء جلب النسخ الاحتياطية', 'error');
        displayBackups([], false);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
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
        // b.message قد يحتوي اسم ملف اختاره المستخدم عند استيراد نسخة خارجية
        option.innerHTML = `${icon} [${sText}] ${escapeHtml(b.date)} - ${escapeHtml(b.message)}`;
        fragment.appendChild(option);
    });
    select.appendChild(fragment);
}

// الاسترجاع يمسح البيانات الحالية، فهو يمر بنفس بوابة كلمة المرور المستخدمة
// في الاسترجاع من ملف (common.js: handleRestore) — كان سابقاً خلف confirm() فقط.
async function restoreDatabase() {
    const commitId = document.getElementById('cloudBackupsSelect').value;
    if (!commitId) { showToast('يرجى اختيار نسخة أولاً', 'warning'); return; }

    const confirmed = await confirmModal({
        title: 'استرجاع نسخة احتياطية',
        message: 'استرجاع هذه النسخة سيمسح البيانات الحالية ويستبدلها بالكامل. هل أنت متأكد من المتابعة؟',
        confirmLabel: 'استرجاع',
        danger: true
    });
    if (!confirmed) return;

    promptForPassword(async () => {
        const btn = document.getElementById('restoreBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الاسترجاع...';
        btn.disabled = true;

        try {
            const result = await window.api.restoreFromGit(commitId);
            // عند النجاح يُعاد تشغيل التطبيق، فلا يصل التنفيذ إلى هنا عادةً
            if (result && result.success) { showToast('تم الاسترجاع بنجاح', 'success'); }
            else { showToast(result?.message || 'فشل الاسترجاع', 'error'); }
        } catch (error) {
            console.error('خطأ أثناء الاسترجاع:', error);
            showToast('حدث خطأ أثناء الاسترجاع', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// Init
window.addEventListener('DOMContentLoaded', async () => {
    checkSession();

    // لا نحمّل الإعدادات السحابية (ومنها رمز الوصول) إلى الصفحة:
    // المزامنة معطّلة في هذا الإصدار، وتحميل الرمز في الـ DOM عند فتح الصفحة
    // كان يضعه في متناول أي سكربت قبل بوابة كلمة المرور أصلاً.
    document.getElementById('syncAndShowBtn').addEventListener('click', syncAndShowBackups);
    syncAndShowBackups();
});
