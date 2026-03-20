import { ENDPOINTS, postJson } from "./api.js";
import { getSessionToken } from "./session.js";
import { getWalletAddress } from "./state/app-state.js";

const HEARTBEAT_MS = 10000;
let heartbeatInterval = null;

async function sendHeartbeat() {
    const walletAddress = getWalletAddress();
    if (!walletAddress) return;

    try {
        await postJson(ENDPOINTS.heartbeat, {
            walletAddress,
            sessionToken: getSessionToken()
        });
    } catch (err) {
        console.error(err);
    }
}

function startHeartbeat() {
    stopHeartbeat();
    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_MS);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

export {
    sendHeartbeat,
    startHeartbeat,
    stopHeartbeat
};
