function getSessionToken() {
    let token = localStorage.getItem("wtp_session_token");
    if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem("wtp_session_token", token);
    }
    return token;
}

export {
    getSessionToken
}