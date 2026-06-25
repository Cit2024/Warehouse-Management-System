/**
 * Login logic for index.html
 * Handles form submission, demo account fill, and API fallback.
 */

function getLoginElements() {
    return {
        username: document.getElementById('username'),
        password: document.getElementById('password'),
        errorMessage: document.getElementById('errorMessage'),
        loginButton: document.getElementById('loginButton')
    };
}

async function handleLogin(event) {
    if (event) event.preventDefault();

    const { username, password, errorMessage, loginButton } = getLoginElements();
    const originalText = loginButton.innerHTML;

    errorMessage.style.display = 'none';

    // Disable controls during login
    setLoadingState(true, loginButton, username, password);

    try {
        // If no credentials provided, login as viewer
        if (!username.value.trim() && !password.value) {
            loginAsViewer();
            return;
        }

        const result = await window.api.login({ username: username.value.trim(), password: password.value });
        if (result.success) {
            setSessionAndRedirect(result.user);
        } else {
            showError(result.message || 'اسم المستخدم أو كلمة المرور غير صحيحة');
            resetLoginState(originalText, loginButton, username, password);
        }
    } catch (error) {
        // If API not available (preview mode), allow viewer access
        loginAsViewer();
    }

    return false;
}

function setLoadingState(isLoading, loginButton, username, password) {
    loginButton.disabled = isLoading;
    username.disabled = isLoading;
    password.disabled = isLoading;

    if (isLoading) {
        loginButton.innerHTML = '<span class="loading-spinner"></span> جاري التحقق...';
    }
}

function resetLoginState(buttonText, loginButton, username, password) {
    loginButton.innerHTML = buttonText;
    loginButton.disabled = false;
    username.disabled = false;
    password.disabled = false;
    username.focus();
}

function loginAsViewer() {
    setSessionAndRedirect({
        user_id: 0,
        full_name: 'مستعرض النظام',
        role: 'viewer'
    });
}

function setSessionAndRedirect(user) {
    const sessionData = {
        userId: user.user_id || 0,
        username: user.full_name || user.username || 'مستخدم',
        role: user.role || 'viewer',
        rememberMe: false
    };
    localStorage.setItem('userSession', JSON.stringify(sessionData));
    window.location.href = 'dashboard.html';
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.innerHTML = '<i class="fas fa-times-circle"></i> ' + message;
    errorMessage.style.display = 'block';
}

function fillDemoAccount() {
    const { username, password } = getLoginElements();
    username.value = 'mohamed';
    password.value = 'password123';
    username.focus();
}
