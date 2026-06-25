/**
 * Login logic — index.html
 */
(function() {
    'use strict';

    var isSubmitting = false;

    // ===== CRITICAL FIX: Full reset on every page load =====
    function fullReset() {
        var user = document.getElementById('username');
        var pass = document.getElementById('password');
        var btn = document.getElementById('loginButton');
        var err = document.getElementById('errorMessage');

        // Clear any browser-autofilled or cached disabled state
        if (user) {
            user.removeAttribute('disabled');
            user.removeAttribute('readonly');
            user.style.pointerEvents = 'auto';
            user.style.opacity = '1';
            user.style.backgroundColor = 'white';
            user.value = '';
        }
        if (pass) {
            pass.removeAttribute('disabled');
            pass.removeAttribute('readonly');
            pass.style.pointerEvents = 'auto';
            pass.style.opacity = '1';
            pass.style.backgroundColor = 'white';
            pass.value = '';
        }
        if (btn) {
            btn.removeAttribute('disabled');
            btn.classList.remove('loading');
            btn.innerHTML = 'دخول إلى المنظومة';
            btn.style.pointerEvents = 'auto';
        }
        if (err) err.style.display = 'none';

        isSubmitting = false;
    }

    // Execute immediately + on DOM ready + on pageshow (bfcache)
    fullReset();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fullReset);
    }
    window.addEventListener('pageshow', function(e) {
        fullReset();
    });

    function setLoading(loading) {
        var btn = document.getElementById('loginButton');
        isSubmitting = loading;
        if (!btn) return;
        if (loading) {
            btn.innerHTML = '<span class="loading-spinner"></span> جاري التحقق...';
            btn.classList.add('loading');
            btn.style.pointerEvents = 'none';
        } else {
            btn.innerHTML = 'دخول إلى المنظومة';
            btn.classList.remove('loading');
            btn.style.pointerEvents = 'auto';
        }
    }

    function showError(msg) {
        var err = document.getElementById('errorMessage');
        if (err) {
            err.innerHTML = '<i class="fas fa-times-circle"></i> ' + msg;
            err.style.display = 'block';
        }
    }

    function hideError() {
        var err = document.getElementById('errorMessage');
        if (err) err.style.display = 'none';
    }

    // ===== handleLogin =====
    window.handleLogin = function(event) {
        event.preventDefault();
        if (isSubmitting) return false;

        var userEl = document.getElementById('username');
        var passEl = document.getElementById('password');
        var userValue = userEl ? userEl.value.trim() : '';
        var passValue = passEl ? passEl.value : '';

        hideError();
        setLoading(true);

        function done(success, redirect) {
            setLoading(false);
            if (success && redirect) {
                window.location.href = 'dashboard.html';
            }
        }

        // Viewer mode (no credentials)
        if (!userValue && !passValue) {
            localStorage.setItem('userSession', JSON.stringify({
                userId: 0, username: 'مستعرض النظام', role: 'viewer', rememberMe: false
            }));
            done(true, true);
            return false;
        }

        // API login
        if (typeof window.api !== 'undefined' && window.api.login) {
            window.api.login({ username: userValue, password: passValue })
                .then(function(result) {
                    if (result && result.success) {
                        localStorage.setItem('userSession', JSON.stringify({
                            userId: result.user.user_id,
                            username: result.user.full_name,
                            role: result.user.role,
                            rememberMe: false
                        }));
                        done(true, true);
                    } else {
                        showError(result && result.message ? result.message : 'خطأ في تسجيل الدخول');
                        done(false);
                    }
                })
                .catch(function(error) {
                    console.error('Login error:', error);
                    showError('تعذر الاتصال، جاري الدخول كمستعرض...');
                    setTimeout(function() {
                        localStorage.setItem('userSession', JSON.stringify({
                            userId: 0, username: 'مستعرض النظام', role: 'viewer', rememberMe: false
                        }));
                        done(true, true);
                    }, 1000);
                });
        } else {
            // No API
            showError('تعذر الاتصال، جاري الدخول كمستعرض...');
            setTimeout(function() {
                localStorage.setItem('userSession', JSON.stringify({
                    userId: 0, username: 'مستعرض النظام', role: 'viewer', rememberMe: false
                }));
                done(true, true);
            }, 1000);
        }
        return false;
    };

    window.fillDemoAccount = function() {
        var user = document.getElementById('username');
        var pass = document.getElementById('password');
        if (user) { user.value = 'mohamed'; user.focus(); }
        if (pass) { pass.value = 'password123'; }
    };
})();
