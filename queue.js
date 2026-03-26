import { ENDPOINTS, getJson, postJson } from "./api.js";
import { getSessionToken } from "./session.js";
import { stopHeartbeat } from "./heartbeat.js";
import { refreshMatchCandidates, refreshPlayerMatches } from "./matchmaking.js";
import { getActiveMatchBuckets } from "./features/matchmaking/walk-the-planck-contract.js";
import { setQueues } from "./state/app-state.js";
import { renderQueues, setStatus } from "./ui/render.js";

let pollInterval = null;
const POLL_MS = 5000;

function markCommittedCountsUnknown(queues) {
    return (queues ?? []).map((queue) => ({
        ...queue,
        committedCount: null,
        readyCount: null,
        matchable: null
    }));
}

function mergeCommittedQueueCounts(queues, activeMatchBuckets) {
    const committedCounts = new Map();

    for (const bucket of activeMatchBuckets) {
        const key = `${Number(bucket.maxPlayers)}:${String(bucket.entryFeeWei)}`;
        const nextCount = (committedCounts.get(key) ?? 0) + Number(bucket.playerCount ?? 0);
        committedCounts.set(key, nextCount);
    }

    return (queues ?? []).map((queue) => {
        const key = `${Number(queue.maxPlayers)}:${String(queue.entryFeeWei)}`;
        const committedCount = committedCounts.get(key) ?? 0;
        const queuedCount = Number(queue.queuedCount ?? 0);
        const readyCount = queuedCount + committedCount;

        return {
            ...queue,
            committedCount,
            readyCount,
            matchable: readyCount >= Number(queue.maxPlayers)
        };
    });
}

async function leaveQueue(walletAddress, sessionToken = getSessionToken(), options = {}) {
    const { silent = false } = options;

    if (!walletAddress) return;

    try {
        await postJson(ENDPOINTS.leaveMatchmaking, {
            walletAddress: walletAddress.toLowerCase(),
            sessionToken
        });

        stopHeartbeat();
        if (!silent) {
            setStatus("Left matchmaking.");
        }
        await refreshQueues();
    } catch (err) {
        console.error(err);
        if (!silent) {
            setStatus(`Leave queue failed: ${err.message}`);
        }
        throw err;
    }
}

async function refreshQueues() {
    try {
        const dataPromise = getJson(`${ENDPOINTS.queueStatus}?t=${Date.now()}`);
        const activeMatchBucketsPromise = getActiveMatchBuckets().catch((error) => {
            console.warn("Committed queue counts are unavailable without chain context.", error);
            return null;
        });

        const [data, activeMatchBuckets] = await Promise.all([
            dataPromise,
            activeMatchBucketsPromise
        ]);
        const queues = Array.isArray(activeMatchBuckets)
            ? mergeCommittedQueueCounts(data.queues || [], activeMatchBuckets)
            : markCommittedCountsUnknown(data.queues || []);
        setQueues(queues);
        renderQueues(queues);
        await refreshMatchCandidates();
        await refreshPlayerMatches();
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
