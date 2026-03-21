import { ENDPOINTS, getJson, postJson } from "./api.js";
import { getSessionToken } from "./session.js";
import { stopHeartbeat } from "./heartbeat.js";
import { refreshMatchCandidates } from "./matchmaking.js";
import { setQueues } from "./state/app-state.js";
import { renderQueues, setStatus } from "./ui/render.js";

let pollInterval = null;
const POLL_MS = 5000;

async function leaveQueue(walletAddress, sessionToken = getSessionToken()) {
    if (!walletAddress) return;

    try {
        await postJson(ENDPOINTS.leaveMatchmaking, {
            walletAddress: walletAddress.toLowerCase(),
            sessionToken
        });

        stopHeartbeat();
        setStatus("Left matchmaking.");
        await refreshQueues();
    } catch (err) {
        console.error(err);
        setStatus(`Leave queue failed: ${err.message}`);
    }
}

async function refreshQueues() {
    try {
        const data = await getJson(`${ENDPOINTS.queueStatus}?t=${Date.now()}`);
        const queues = data.queues || [];
        setQueues(queues);
        renderQueues(queues);
        await refreshMatchCandidates();
    } catch (err) {
        console.error(err);
        setStatus(`Failed to load queue status: ${err.message}`);
    }
}

function startPolling() {
    refreshQueues();
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(refreshQueues, POLL_MS);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

export {
    leaveQueue,
    refreshQueues,
    startPolling,
    stopPolling
};
