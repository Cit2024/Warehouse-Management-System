const toastIcons = {
    success: '<i class="fas fa-check-circle"></i>',
    error: '<i class="fas fa-times-circle"></i>',
    warning: '<i class="fas fa-exclamation-triangle"></i>',
    info: '<i class="fas fa-info-circle"></i>'
};

function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        ${toastIcons[type] || toastIcons.info}
        <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 2. دالة التعامل مع النسخ الاحتياطي
async function handleBackup(event) {
    if (event) event.preventDefault();
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.style.pointerEvents = 'none';

    try {
        const result = await window.api.backupDatabase();
        if (result.success) {
            showToast(result.message, 'success');
        } else if (result.message !== 'تم إلغاء عملية الحفظ.') {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('حدث خطأ غير متوقع أثناء النسخ الاحتياطي.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.style.pointerEvents = 'auto';
    }
}

// 3. دالة التعامل مع استيراد النسخة الاحتياطية
async function handleRestore(event) {
    if (event) event.preventDefault();

    const confirmRestore = confirm('تحذير هام جداً: استيراد نسخة احتياطية سيقوم بمسح كافة بيانات المخزن الحالية واستبدالها بالنسخة المستوردة.\n\nهل أنت متأكد من رغبتك في المتابعة؟');
    if (!confirmRestore) return;

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الاستيراد...';
    btn.style.pointerEvents = 'none';

    try {
        const result = await window.api.restoreDatabase();
        if (result && !result.success && result.message !== 'تم إلغاء العملية.') {
            alert('خطأ: ' + result.message);
        }
    } catch (error) {
        alert('خطأ: حدث خطأ غير متوقع أثناء الاستيراد.');
    } finally {
        btn.innerHTML = originalText;
        btn.style.pointerEvents = 'auto';
    }
}

// 4. دوال الطباعة وتصدير PDF
async function handleDirectPrint() {
    try {
        const result = await window.api.printDirect();
        if (!result.success) {
            showToast(result.message, 'error');
        } else {
            showToast('تم إرسال أمر الطباعة بنجاح', 'success');
        }
    } catch (error) {
        showToast('حدث خطأ غير متوقع في الطباعة', 'error');
    }
}

async function handlePdfExport() {
    try {
        const result = await window.api.generateReport();
        if (result.success) showToast(result.message, 'success');
    } catch (error) {
        showToast('حدث خطأ أثناء تصدير PDF', 'error');
    }
}

// 5. تسجيل الخروج
function handleLogout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        if (window.electronAPI) {
            window.electronAPI.logout();
        } else {
            window.location.href = 'index.html';
        }
    }
}
