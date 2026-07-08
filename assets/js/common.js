function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon"><i class="fas ${iconMap[type] || iconMap.info}"></i></span>
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
    promptForPassword(async () => handleBackupInner(event))
}
async function handleBackupInner(event) {
    if (event) event.preventDefault(); 
    try {
        const result = await window.api.backupDatabase();
        if (result.success) {
            showToast(result.message, 'success');
        } else if (result.message !== 'تم إلغاء عملية الحفظ.') {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('حدث خطأ غير متوقع أثناء النسخ الاحتياطي.', 'error');
    }
}

// 3. دالة التعامل مع استيراد النسخة الاحتياطية
async function handleRestore(event) {
    if (event) event.preventDefault();
    promptForPassword(async () => handleRestoreInner(event))
}
async function handleRestoreInner(event) {
    
    const confirmRestore = confirm('⚠️ تحذير هام جداً: استيراد نسخة احتياطية سيقوم بمسح كافة بيانات المخزن الحالية واستبدالها بالنسخة المستوردة.\n\nهل أنت متأكد من رغبتك في المتابعة؟');
    if (!confirmRestore) return;

    try {
        const result = await window.api.restoreDatabase();
        if (result && !result.success && result.message !== 'تم إلغاء العملية.') {
            alert('❌ ' + result.message);
        }
    } catch (error) {
        alert('❌ حدث خطأ غير متوقع أثناء الاستيراد.');
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
        localStorage.removeItem('userSession');
        window.location.href = 'index.html';
    }
}

// 5.1 التحقق من الجلسة
function checkSession() {
    const session = JSON.parse(localStorage.getItem('userSession'));
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    return session;
}

// 5.2 فرز الجداول
let sortDirection = {};

function parseArabicNumber(text) {
    if (typeof text !== 'string') return NaN;
    // يتعامل مع تنسيق ar-LY: النقطة فاصل آلاف والفاصلة عشرية
    const cleaned = text.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned);
}

function sortTable(tableId, colIndex) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.querySelectorAll('td').length > 1);
    if (rows.length === 0) return;

    const headers = table.querySelectorAll('thead th');
    const header = headers[colIndex];
    if (header && !header.classList.contains('sortable')) return;

    let dir;
    // نفضل سمة data-sort إن وُجدت (مثل dashboard)
    if (header && header.hasAttribute('data-sort')) {
        dir = header.getAttribute('data-sort') === 'asc' ? 'desc' : 'asc';
        headers.forEach(h => {
            h.setAttribute('data-sort', '');
            const icon = h.querySelector('.sort-icon');
            if (icon) icon.textContent = '↕';
        });
        header.setAttribute('data-sort', dir);
    } else {
        const key = tableId + '-' + colIndex;
        const currentDir = sortDirection[key] || 'asc';
        dir = currentDir === 'asc' ? 'desc' : 'asc';
        sortDirection = {};
        sortDirection[key] = dir;
    }

    if (header) {
        const icon = header.querySelector('.sort-icon');
        if (icon) icon.textContent = dir === 'asc' ? '↑' : '↓';
    }
    table.querySelectorAll('.sort-icon').forEach(span => {
        if (span.closest('th') !== header) span.textContent = '↕';
    });

    rows.sort((a, b) => {
        const aCell = a.children[colIndex];
        const bCell = b.children[colIndex];
        if (!aCell || !bCell) return 0;
        const aText = aCell.textContent.trim();
        const bText = bCell.textContent.trim();

        const aNum = parseArabicNumber(aText);
        const bNum = parseArabicNumber(bText);

        if (!isNaN(aNum) && !isNaN(bNum) && aText !== '' && bText !== '') {
            return dir === 'asc' ? aNum - bNum : bNum - aNum;
        }
        return dir === 'asc'
            ? aText.localeCompare(bText, 'ar')
            : bText.localeCompare(aText, 'ar');
    });

    rows.forEach(row => tbody.appendChild(row));
}

function promptForPassword(actionCallback) {
    // إنشاء النافذة المنبثقة
    const modalHtml = `
        <div class="modal" id="securityModal" style="display: flex;">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <div style="font-size: 40px; margin-bottom: 10px;">🔐</div>
                <h3 style="margin-bottom: 10px;">إجراء أمني مطلوب</h3>
                <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
                    يرجى إدخال كلمة المرور الخاصة بك لتأكيد هويتك والسماح بهذا الإجراء.
                </p>
                <input type="password" id="securityPassword" class="form-control" 
                       style="width: 100%; padding: 10px; margin-bottom: 15px; border: 2px solid var(--border-color); border-radius: 8px;" 
                       placeholder="كلمة المرور...">
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-success" style="flex: 1;" id="confirmSecurityBtn">تأكيد</button>
                    <button class="btn btn-secondary" style="flex: 1;" onclick="document.getElementById('securityModal').remove()">إلغاء</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const passwordInput = document.getElementById('securityPassword');
    passwordInput.focus();

    document.getElementById('confirmSecurityBtn').onclick = async () => {
        const password = passwordInput.value;
        if (!password) {
            showToast('الرجاء إدخال كلمة المرور', 'error');
            return;
        }
        const sessionData = JSON.parse(localStorage.getItem("userSession"));
        // التحقق من كلمة المرور عبر API (يجب بناء هذه الدالة في Electron)
        const isAuthorized = await window.api.login({ username:sessionData.username,password });
        
        if (isAuthorized.success) {
            document.getElementById('securityModal').remove();
            actionCallback(); // تنفيذ الإجراء المطلوب (نسخ احتياطي أو فتح إعدادات)
        } else {
            showToast('كلمة المرور غير صحيحة', 'error');
            passwordInput.value = '';
        }
    };
}
function showSettings(){
    const SETTINGS_PAGE_TIME_LIMIT = 10 * 60 * 100 * 8; 
    const settings = document.getElementById("cloudSettingsForm");
    const lock = document.getElementById("settingsLockedState");
    lock.style.display = "none";
    settings.style.display = "block"; 
    setTimeout(() => {
        console.log("fired.");
        hideSettings();
    }, SETTINGS_PAGE_TIME_LIMIT);
}
function hideSettings(){
    const settings = document.getElementById("cloudSettingsForm");
    const lock = document.getElementById("settingsLockedState");
    if (settings && lock) {
        lock.style.display = "block";
        settings.style.display = "none"; 
    }
}
window.addEventListener("visibilitychange", () => {
    hideSettings()
});


 // نظام تسجيل الخروج التلقائي عند الخمول (10 دقائق)
let idleTimeout;
const IDLE_TIME_LIMIT = 10 * 60 * 1000; // 10 دقائق بالملي ثانية

function resetIdleTimeout() {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        // إذا لم يكن المستخدم في صفحة تسجيل الدخول بالفعل
        if (!window.location.href.includes('index.html')) {
            localStorage.removeItem('userSession');
            alert(' تم تسجيل الخروج تلقائياً للحفاظ على أمان المنظومة بسبب عدم النشاط.');
            window.location.href = 'index.html';
        }
    }, IDLE_TIME_LIMIT);
}

// مراقبة نشاط المستخدم
['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
    document.addEventListener(event, resetIdleTimeout);
});

// تشغيل العداد عند فتح الصفحة
resetIdleTimeout();
//load logo image
(function() {
    var logoPath = 'assets/images/logo.png';
    var img = new Image();
    img.onload = () => {
        var el = document.getElementById('sidebarLogo');
        if (el) {
            el.innerHTML = '<img src="' + logoPath + '" alt="شعار الكلية" style="width:100%;height:100%;object-fit:contain;padding:4px;border-radius:10px;">';
        }
    };
    img.onerror = () => {
        console.log('Logo not found, using default icon');
    };
    img.src = logoPath;
})();
