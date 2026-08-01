/**
 * Component Loader - Dynamically loads JS components
 * Ensures components are loaded before page scripts run
 */
const ComponentLoader = {
    loaded: new Set(),

    /**
     * Load a script dynamically
     * @param {string} src - Script path relative to the page
     * @returns {Promise}
     */
    load(src) {
        if (this.loaded.has(src)) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                this.loaded.add(src);
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    /**
     * Initialize the sidebar layout on the current page
     */
    async initLayout() {
        try {
            await this.load('assets/js/components/sidebar.js');
            await this.load('assets/js/components/layout.js');

            if (typeof Layout !== 'undefined') {
                const layout = new Layout();
                layout.init();
            }
        } catch (error) {
            console.error('Failed to initialize layout:', error);
        }
    }
};

// تهريب النصوص القادمة من قاعدة البيانات قبل حقنها في innerHTML.
// (نسخ متطابقة كانت موجودة في items.js ومكوّنات الطباعة؛ هذه هي النسخة المشتركة.)
function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * نافذة إدخال نصي.
 *
 * Electron لا يُنفّذ window.prompt() إطلاقاً (يعود بلا شيء بصمت)، فأي زر يعتمد
 * عليه يبدو عاملاً ولا يفعل شيئاً. هذه النافذة تتبع نمط promptForPassword نفسه.
 *
 * @returns {Promise<string|null>} النص المُدخل، أو null إذا ألغى المستخدم
 */
function promptForText({ title, message = '', label, placeholder = '', defaultValue = '' } = {}) {
    return new Promise((resolve) => {
        if (document.getElementById('textPromptModal')) {
            resolve(null);
            return;
        }

        const modalHtml = `
            <div class="modal active" id="textPromptModal" role="dialog" aria-modal="true" aria-labelledby="textPromptTitle">
                <div class="modal-content modal-sm modal-center">
                    <div class="modal-body">
                        <h3 class="modal-title" id="textPromptTitle">${escapeHtml(title || '')}</h3>
                        ${message ? `<p class="modal-description">${escapeHtml(message)}</p>` : ''}
                        <div class="form-group">
                            <label for="textPromptInput">${escapeHtml(label || '')}</label>
                            <input type="text" id="textPromptInput" class="form-control"
                                   placeholder="${escapeHtml(placeholder)}"
                                   value="${escapeHtml(defaultValue)}"
                                   aria-required="true">
                        </div>
                    </div>
                    <div class="modal-footer modal-footer-center">
                        <button type="button" class="btn btn-secondary" id="cancelTextPromptBtn">إلغاء</button>
                        <button type="button" class="btn btn-primary" id="confirmTextPromptBtn">تأكيد</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('textPromptModal');
        const input = document.getElementById('textPromptInput');
        const confirmBtn = document.getElementById('confirmTextPromptBtn');
        const cancelBtn = document.getElementById('cancelTextPromptBtn');
        const previouslyFocused = document.activeElement;

        input.focus();
        input.select();

        function close(value) {
            document.removeEventListener('keydown', handleKeydown);
            if (modal) modal.remove();
            if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
            resolve(value);
        }

        function handleKeydown(e) {
            if (e.key === 'Escape') close(null);
        }

        confirmBtn.addEventListener('click', () => close(input.value));
        cancelBtn.addEventListener('click', () => close(null));
        document.addEventListener('keydown', handleKeydown);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                close(input.value);
            }
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close(null);
        });
    });
}

/**
 * نافذة تأكيد — بديل عن confirm() الأصلية، بنفس نمط النوافذ الأخرى في التطبيق
 * (عنوان، أيقونة، أزرار إلغاء/تأكيد، إغلاق بـ Escape أو النقر على الخلفية).
 *
 * @returns {Promise<boolean>} true إذا أكّد المستخدم، false إذا ألغى
 */
function confirmModal({ title = 'تأكيد', message = '', confirmLabel = 'تأكيد', danger = false } = {}) {
    return new Promise((resolve) => {
        if (document.getElementById('confirmActionModal')) {
            resolve(false);
            return;
        }

        const modalHtml = `
            <div class="modal active" id="confirmActionModal" role="dialog" aria-modal="true" aria-labelledby="confirmActionTitle">
                <div class="modal-content modal-sm modal-center">
                    <div class="modal-body">
                        <div class="modal-icon" aria-hidden="true">
                            <i class="fas ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i>
                        </div>
                        <h3 class="modal-title" id="confirmActionTitle">${escapeHtml(title)}</h3>
                        <p class="modal-description">${escapeHtml(message)}</p>
                    </div>
                    <div class="modal-footer modal-footer-center">
                        <button type="button" class="btn btn-secondary" id="cancelConfirmActionBtn">إلغاء</button>
                        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmConfirmActionBtn">${escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('confirmActionModal');
        const confirmBtn = document.getElementById('confirmConfirmActionBtn');
        const cancelBtn = document.getElementById('cancelConfirmActionBtn');
        const previouslyFocused = document.activeElement;

        confirmBtn.focus();

        function close(result) {
            document.removeEventListener('keydown', handleKeydown);
            if (modal) modal.remove();
            if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
            resolve(result);
        }

        function handleKeydown(e) {
            if (e.key === 'Escape') close(false);
        }

        confirmBtn.addEventListener('click', () => close(true));
        cancelBtn.addEventListener('click', () => close(false));
        document.addEventListener('keydown', handleKeydown);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close(false);
        });
    });
}

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
    // message قد يحتوي بيانات من قاعدة البيانات (مثال: اسم صنف يحذفه المستخدم)؛
    // لا مستدعٍ في الكود يمرّر HTML متعمّداً هنا، فالتهريب آمن للجميع.
    toast.innerHTML = `
        <span class="toast-icon"><i class="fas ${iconMap[type] || iconMap.info}"></i></span>
        <span>${escapeHtml(message)}</span>
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

    const confirmRestore = await confirmModal({
        title: 'استرجاع نسخة احتياطية',
        message: 'تحذير هام جداً: استيراد نسخة احتياطية سيقوم بمسح كافة بيانات المخزن الحالية واستبدالها بالنسخة المستوردة. هل أنت متأكد من رغبتك في المتابعة؟',
        confirmLabel: 'استرجاع',
        danger: true
    });
    if (!confirmRestore) return;

    try {
        const result = await window.api.restoreDatabase();
        if (result && !result.success && result.message !== 'تم إلغاء العملية.') {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('حدث خطأ غير متوقع أثناء الاستيراد.', 'error');
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

// 4.1 فتح/إغلاق القائمة الجانبية على الشاشات الضيقة (< 768px)
// كانت القائمة تختفي بالكامل دون أي وسيلة لإعادة فتحها.
const sidebarMobileQuery = window.matchMedia('(max-width: 768px)');

function toggleSidebar(forceState) {
    const sidebar = document.getElementById('appSidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (!sidebar) return;

    // على الشاشات العريضة القائمة ثابتة دائماً؛ الفتح هنا كان يُظهر الطبقة
    // المعتمة فوق الصفحة كاملة دون أي أثر مرئي آخر — نسمح بالإغلاق فقط.
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('open');
    if (shouldOpen && !sidebarMobileQuery.matches) return;

    sidebar.classList.toggle('open', shouldOpen);
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(shouldOpen));

    let backdrop = document.getElementById('sidebarBackdrop');
    if (shouldOpen) {
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'sidebarBackdrop';
            backdrop.className = 'sidebar-backdrop';
            backdrop.addEventListener('click', () => toggleSidebar(false));
            document.body.appendChild(backdrop);
        }
        backdrop.classList.add('visible');
    } else if (backdrop) {
        backdrop.classList.remove('visible');
    }
}

// عند توسيع النافذة فوق 768px تُغلق القائمة تلقائياً حتى لا تبقى
// الطبقة المعتمة عالقة فوق المحتوى بعد تغيير حجم النافذة.
sidebarMobileQuery.addEventListener('change', (mq) => {
    if (!mq.matches) toggleSidebar(false);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('appSidebar');
        if (sidebar && sidebar.classList.contains('open')) toggleSidebar(false);
    }
});

// 5. تسجيل الخروج
async function handleLogout() {
    const confirmed = await confirmModal({ title: 'تسجيل الخروج', message: 'هل أنت متأكد من تسجيل الخروج؟', confirmLabel: 'تسجيل الخروج' });
    if (confirmed) {
        // نُصفّر جلسة العملية الرئيسية أيضاً، وليس فقط جلسة المتصفح: صلاحية
        // الكتابة الفعلية تُفرض هناك، وكانت ستبقى سارية حتى إغلاق التطبيق
        // بالكامل لو اقتصر تسجيل الخروج على مسح localStorage فقط.
        if (window.api && window.api.logout) window.api.logout();
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
    // تجنب فتح أكثر من نافذة أمنية في نفس الوقت
    if (document.getElementById('securityModal')) return;

    const modalHtml = `
        <div class="modal active" id="securityModal" role="dialog" aria-modal="true" aria-labelledby="securityModalTitle">
            <div class="modal-content modal-sm modal-center">
                <div class="modal-body">
                    <div class="modal-icon" aria-hidden="true">
                        <i class="fas fa-lock"></i>
                    </div>
                    <h3 class="modal-title" id="securityModalTitle">إجراء أمني مطلوب</h3>
                    <p class="modal-description">
                        يرجى إدخال كلمة المرور الخاصة بك لتأكيد هويتك والسماح بهذا الإجراء.
                    </p>
                    <div class="form-group">
                        <label for="securityPassword">كلمة المرور</label>
                        <input type="password" id="securityPassword" class="form-control" 
                               placeholder="أدخل كلمة المرور..."
                               autocomplete="current-password"
                               aria-required="true">
                    </div>
                </div>
                <div class="modal-footer modal-footer-center">
                    <button type="button" class="btn btn-secondary" id="cancelSecurityBtn">إلغاء</button>
                    <button type="button" class="btn btn-primary" id="confirmSecurityBtn">تأكيد</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('securityModal');
    const passwordInput = document.getElementById('securityPassword');
    const confirmBtn = document.getElementById('confirmSecurityBtn');
    const cancelBtn = document.getElementById('cancelSecurityBtn');

    // حفظ العنصر الذي كان محل التركيز قبل فتح النافذة
    const previouslyFocused = document.activeElement;

    passwordInput.focus();

    function closeModal() {
        if (modal) {
            modal.remove();
        }
        if (previouslyFocused && previouslyFocused.focus) {
            previouslyFocused.focus();
        }
    }

    async function confirm() {
        const password = passwordInput.value.trim();
        if (!password) {
            showToast('الرجاء إدخال كلمة المرور', 'error');
            passwordInput.focus();
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';

        try {
            const sessionData = JSON.parse(localStorage.getItem('userSession')) || {};
            const isAuthorized = await window.api.login({
                username: sessionData.username,
                password: password
            });

            if (isAuthorized && isAuthorized.success) {
                closeModal();
                actionCallback();
            } else {
                showToast('كلمة المرور غير صحيحة', 'error');
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (error) {
            showToast('حدث خطأ أثناء التحقق', 'error');
            console.error('Security modal login error:', error);
        } finally {
            if (document.getElementById('confirmSecurityBtn')) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = 'تأكيد';
            }
        }
    }

    confirmBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', closeModal);

    // إغلاق عند الضغط على Escape
    function handleKeydown(e) {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleKeydown);
        }
    }
    document.addEventListener('keydown', handleKeydown);

    // التأكيد عند الضغط على Enter داخل حقل كلمة المرور
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirm();
        }
    });

    // إغلاق عند النقر على الخلفية
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

// تغيير كلمة المرور الخاصة — متاح لكل الأدوار (لا يقتصر على Admin)، لأنه لم يكن
// هناك أي طريق من داخل التطبيق لتغيير كلمة مرور، لا للمستخدم نفسه ولا لغيره —
// admin/admin الافتراضية كانت دائمة فعلياً.
async function changeOwnPassword(event) {
    if (event) event.preventDefault();
    if (document.getElementById('changePasswordModal')) return;

    const session = checkSession();
    if (!session) return;

    const modalHtml = `
        <div class="modal active" id="changePasswordModal" role="dialog" aria-modal="true" aria-labelledby="changePasswordTitle">
            <div class="modal-content modal-sm modal-center">
                <div class="modal-body">
                    <div class="modal-icon" aria-hidden="true"><i class="fas fa-key"></i></div>
                    <h3 class="modal-title" id="changePasswordTitle">تغيير كلمة المرور</h3>
                    <div class="form-group">
                        <label for="currentPasswordInput">كلمة المرور الحالية</label>
                        <input type="password" id="currentPasswordInput" class="form-control" autocomplete="current-password" aria-required="true">
                    </div>
                    <div class="form-group">
                        <label for="newPasswordInput">كلمة المرور الجديدة</label>
                        <input type="password" id="newPasswordInput" class="form-control" autocomplete="new-password" aria-required="true">
                    </div>
                    <div class="form-group">
                        <label for="confirmPasswordInput">تأكيد كلمة المرور الجديدة</label>
                        <input type="password" id="confirmPasswordInput" class="form-control" autocomplete="new-password" aria-required="true">
                    </div>
                </div>
                <div class="modal-footer modal-footer-center">
                    <button type="button" class="btn btn-secondary" id="cancelChangePasswordBtn">إلغاء</button>
                    <button type="button" class="btn btn-primary" id="confirmChangePasswordBtn">تغيير كلمة المرور</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('changePasswordModal');
    const currentInput = document.getElementById('currentPasswordInput');
    const newInput = document.getElementById('newPasswordInput');
    const confirmInput = document.getElementById('confirmPasswordInput');
    const confirmBtn = document.getElementById('confirmChangePasswordBtn');
    const cancelBtn = document.getElementById('cancelChangePasswordBtn');
    const previouslyFocused = document.activeElement;

    currentInput.focus();

    function closeModal() {
        if (modal) modal.remove();
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    }

    async function submit() {
        const currentPassword = currentInput.value;
        const newPassword = newInput.value;
        const confirmPassword = confirmInput.value;

        if (!currentPassword || !newPassword) {
            showToast('يرجى تعبئة جميع الحقول', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('كلمة المرور الجديدة غير متطابقة', 'error');
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التغيير...';
        try {
            const result = await window.api.changePassword({
                userId: session.userId,
                currentPassword,
                newPassword
            });
            if (result && result.success) {
                showToast(result.message, 'success');
                closeModal();
            } else {
                showToast((result && result.message) || 'تعذّر تغيير كلمة المرور', 'error');
            }
        } catch (error) {
            showToast('حدث خطأ أثناء تغيير كلمة المرور', 'error');
        } finally {
            if (document.getElementById('confirmChangePasswordBtn')) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = 'تغيير كلمة المرور';
            }
        }
    }

    confirmBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', closeModal);
    document.addEventListener('keydown', function handleKeydown(e) {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleKeydown);
        }
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}


 // نظام تسجيل الخروج التلقائي عند الخمول (10 دقائق)
let idleTimeout;
const IDLE_TIME_LIMIT = 10 * 60 * 1000; // 10 دقائق بالملي ثانية

function resetIdleTimeout() {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        // إذا لم يكن المستخدم في صفحة تسجيل الدخول بالفعل
        if (!window.location.href.includes('index.html')) {
            if (window.api && window.api.logout) window.api.logout();
            localStorage.removeItem('userSession');
            // alert() الأصلية مقصودة هنا وليست إغفالاً: الصفحة تُغادَر مباشرة
            // بعدها، وalert() الوحيدة التي تضمن قراءة السبب قبل ضياع السياق —
            // toast غير حاجب كان سيختفي مع تنقّل الصفحة قبل أن يُقرأ.
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
