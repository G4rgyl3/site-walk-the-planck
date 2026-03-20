const SESSION_STORAGE_KEY = "wtp_session_token";

function createSessionToken() {
    return crypto.randomUUID().replace(/-/g, "");
}

function getSessionToken() {
    let token = localStorage.getItem(SESSION_STORAGE_KEY);

    if (!token) {
        token = createSessionToken();
        localStorage.setItem(SESSION_STORAGE_KEY, token);
    }

    return token;
}

function resetSessionToken() {
    const token = createSessionToken();
    localStorage.setItem(SESSION_STORAGE_KEY, token);
    return token;
}

export {
    getSessionToken,
    resetSessionToken
}
