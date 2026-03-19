function getCookieValue(name) {
    const key = `${name}=`;
    const parts = document.cookie.split(';');
    for (const part of parts) {
        const value = part.trim();
        if (value.startsWith(key)) {
            return decodeURIComponent(value.slice(key.length));
        }
    }
    return '';
}

function parseJson(value) {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

(function() {
    const currentPath = window.location.pathname;
    const isLoginPage = currentPath.includes('login.html');
    const cookieUserId = getCookieValue('current_user_id');
    const localUserId = localStorage.getItem('current_user_id');

    if (!cookieUserId) {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('current_user_id');
        localStorage.removeItem('current_user');
        localStorage.removeItem('user_info');
        localStorage.removeItem('current_user_name');

        if (!isLoginPage) {
            console.log('⚠️ 未登录（无 Cookie），跳转到登录页');
            window.location.href = '/pages/mobile/login.html';
        }
        return;
    }

    if (!localUserId || localUserId !== cookieUserId) {
        localStorage.setItem('current_user_id', cookieUserId);
    }

    const authUser = parseJson(localStorage.getItem('auth_user'));
    if (!authUser) {
        const legacyUser = parseJson(localStorage.getItem('current_user')) || parseJson(localStorage.getItem('user_info'));
        if (legacyUser) {
            localStorage.setItem('auth_user', JSON.stringify(legacyUser));
            localStorage.removeItem('current_user');
            localStorage.removeItem('user_info');
            localStorage.removeItem('current_user_name');
        }
    }

    window.AuthSession = {
        getUserId() {
            return getCookieValue('current_user_id') || localStorage.getItem('current_user_id') || '';
        }
    };
})();
