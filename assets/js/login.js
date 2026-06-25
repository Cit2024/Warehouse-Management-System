/**
 * Login logic for index.html
 * NEVER uses the disabled attribute — uses CSS loading states only.
 */

(function() {
    'use strict';

    var isSubmitting = false;

    function getElements() {
        return {
            username: document.getElementById('username'),
            password: document.getElementById('password'),
            errorMessage: document.getElementById('errorMessage'),
            loginButton: document.getElementById('loginButton')
        };
    }

    function setLoading(loading) {
        var btn = document.getElementById('loginButton');
        isSubmitting = loading;
        if (btn) {
            if (loading) {
                btn.innerHTML = '<span class="loading-spinner"></span> جاري التحقق...';
                btn.classList.add('loading');
            } else {
                btn.innerHTML = 'دخول إلى المنظومة';
                btn.classList.remove('loading');
            }
        }
    }

    function showError(msg) {
        var err = document.getElementById('errorMessage');
        if (err) {
            err.innerHTML = '<i class="fas fa-times-circle"></i> ' + (msg || 'خطأ في تسجيل الدخول');
            err.style.display = 'block';
        }
    }

    function hideError() {
        var err = document.getElementById('errorMessage');
        if (err) err.style.display = 'none';
    }

    function redirectToDashboard() {
        window.location.href = 'dashboard.html';
    }

    window.handleLogin = function(event) {
        event.preventDefault();
        if (isSubmitting) return false;

        var { username, password } = getElements();
        var userValue = username ? username.value.trim() : '';
        var passValue = password ? password.value : '';

        hideError();
        setLoading(true);

        function done(success, redirect) {
            setLoading(false);
            if (success && redirect) {
                redirectToDashboard();
            }
        }

        // No credentials = viewer mode
        if (!userValue && !passValue) {
            localStorage.setItem('userSession', JSON.stringify({
                userId: 0,
                username: 'مستعرض النظام',
                role: 'viewer',
                rememberMe: false
            }));
            done(true, true);
            return false;
        }

        // Try API login
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
                    showError('تعذر الاتصال بالنظام، جاري الدخول كمستعرض...');
                    setTimeout(function() {
                        localStorage.setItem('userSession', JSON.stringify({
                            userId: 0,
                            username: 'مستعرض النظام',
                            role: 'viewer',
                            rememberMe: false
                        }));
                        done(true, true);
                    }, 800);
                });
        } else {
            // No API available — auto login as viewer
            showError('تعذر الاتصال بالنظام، جاري الدخول كمستعرض...');
            setTimeout(function() {
                localStorage.setItem('userSession', JSON.stringify({
                    userId: 0,
                    username: 'مستعرض النظام',
                    role: 'viewer',
                    rememberMe: false
                }));
                done(true, true);
            }, 800);
        }

        return false;
    };

    window.fillDemoAccount = function() {
        var { username, password } = getElements();
        if (username) { username.value = 'mohamed'; }
        if (password) { password.value = 'password123'; }
        if (username) username.focus();
    };
})();
