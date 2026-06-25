/**
 * Login logic for index.html
 * Handles form submission, demo account fill, and API fallback.
 */

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const loginButton = document.getElementById('loginButton');

    errorMessage.style.display = 'none';

    const originalText = loginButton.innerHTML;
    loginButton.innerHTML = '<span class="loading-spinner"></span> جاري التحقق...';
    loginButton.disabled = true;

    try {
        // If no credentials provided, login as viewer
        if (!username && !password) {
            loginAsViewer();
            return;
        }

        const result = await window.api.login({ username, password });
        if (result.success) {
            setSessionAndRedirect(result.user);
        } else {
            showError(result.message || 'اسم المستخدم أو كلمة المرور غير صحيحة');
            resetButton(loginButton, originalText);
        }
    } catch (error) {
        // If API not available (preview mode), allow viewer access
        loginAsViewer();
    }

    return false;
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

function resetButton(button, text) {
    button.innerHTML = text;
    button.disabled = false;
}

function fillDemoAccount() {
    document.getElementById('username').value = 'mohamed';
    document.getElementById('password').value = 'password123';
    document.getElementById('username').focus();
}
