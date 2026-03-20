import { ENDPOINTS, postJson } from "./api.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getSessionToken } from "./session.js";

const HEARTBEAT_MS = 10000;
let heartbeatInterval = null;

async function sendHeartbeat() {
    const walletAddress = getWalletState().account;
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
