import { ENDPOINTS, getJson, postJson } from "./api.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getSessionToken } from "./session.js";
import { stopHeartbeat } from "./heartbeat.js";
import { refreshMatchCandidates } from "./matchmaking.js";
import { onQueuePreferencesChanged } from "./lib/matchmaking-events.js";
import { getQueues, setQueues } from "./state/app-state.js";
import { renderQueues, setStatus } from "./ui/render.js";

let refreshQueuesPromise = null;
let queueEventsSubscribed = false;
const committedMatchExpiryTimers = new Map();

function normalizeQueues(queues) {
    return (queues ?? []).map(normalizeQueue);
}

function normalizeQueue(queue) {
    const queuedCount = Number(queue?.queuedCount ?? 0);
    const committedCount = Number(queue?.committedCount ?? 0);
    const readyCount = queuedCount + committedCount;

    return {
        ...queue,
        queuedCount,
        committedCount,
        readyCount,
        matchable: readyCount >= Number(queue?.maxPlayers ?? 0)
    };
}

function getBucketKey(maxPlayers, entryFeeWei) {
    return `${Number(maxPlayers)}:${String(entryFeeWei)}`;
}

function clearCommittedMatchExpiry(matchId) {
    if (!matchId || !committedMatchExpiryTimers.has(matchId)) {
        return;
    }

    clearTimeout(committedMatchExpiryTimers.get(matchId));
    committedMatchExpiryTimers.delete(matchId);
}

function scheduleCommittedMatchExpiry(payload) {
    const matchId = String(payload?.matchId || "");
    const deadline = Number(payload?.deadline ?? 0);
    const bucket = Array.isArray(payload?.buckets) ? payload.buckets[0] : null;

    if (!matchId || !bucket || deadline <= 0) {
        return;
    }

    clearCommittedMatchExpiry(matchId);

    const delayMs = (deadline * 1000) - Date.now();
    const deactivate = async () => {
        try {
            await postJson(ENDPOINTS.deactivateMatch, {
                matchId,
                maxPlayers: Number(bucket.maxPlayers),
                entryFeeWei: String(bucket.entryFeeWei)
            });
        } catch (error) {
            console.warn(`Failed to deactivate expired match #${matchId}.`, error);
        } finally {
            clearCommittedMatchExpiry(matchId);
        }
    };

    if (delayMs <= 0) {
        void deactivate();
        return;
    }

    const timeoutId = window.setTimeout(() => {
        void deactivate();
    }, delayMs);

    committedMatchExpiryTimers.set(matchId, timeoutId);
}

function applySoftQueueMutation(eventDetail) {
    const payload = eventDetail?.payload;
    if (!payload) {
        return;
    }

    if (payload.action === "match_join_confirmed") {
        scheduleCommittedMatchExpiry(payload);
    } else if (payload.action === "committed_match_closed") {
        clearCommittedMatchExpiry(String(payload.matchId || ""));
    }

    const currentWalletAddress = (getWalletState().account || "").toLowerCase();
    const eventWalletAddress = String(payload.walletAddress || "").toLowerCase();
    const currentSessionToken = String(getSessionToken() || "");
    const eventSessionToken = String(payload.sessionToken || "");

    if (
        currentWalletAddress &&
        eventWalletAddress === currentWalletAddress &&
        currentSessionToken &&
        eventSessionToken === currentSessionToken
    ) {
        return;
    }

    const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
    if (buckets.length === 0) {
        return;
    }

    const bucketKeys = new Set(
        buckets.map((bucket) => getBucketKey(bucket.maxPlayers, bucket.entryFeeWei))
    );
    let didChange = false;

    const nextQueues = getQueues().map((queue) => {
        if (!bucketKeys.has(getBucketKey(queue.maxPlayers, queue.entryFeeWei))) {
            return queue;
        }

        const nextQueue = {
            ...queue,
            queuedCount: Number(queue.queuedCount ?? 0),
            committedCount: Number(queue.committedCount ?? 0)
        };

        if (payload.action === "entered") {
            nextQueue.queuedCount += 1;
        } else if (payload.action === "left") {
            nextQueue.queuedCount = Math.max(0, nextQueue.queuedCount - 1);
        } else if (payload.action === "match_join_confirmed") {
            nextQueue.queuedCount = Math.max(0, nextQueue.queuedCount - 1);
            nextQueue.committedCount += 1;
        } else if (
            payload.action === "committed_deactivated" ||
            payload.action === "committed_match_closed" ||
            payload.action === "active_matches_released"
        ) {
            const removedCount = Number(payload.removedCount ?? 1);
            nextQueue.committedCount = Math.max(0, nextQueue.committedCount - removedCount);
        } else {
            return queue;
        }

        didChange = true;
        return normalizeQueue(nextQueue);
    });

    if (!didChange) {
        return;
    }

    setQueues(nextQueues);
    renderQueues(nextQueues);
    void refreshMatchCandidates();
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
    if (refreshQueuesPromise) {
        return refreshQueuesPromise;
    }

    refreshQueuesPromise = (async () => {
    try {
        const data = await getJson(`${ENDPOINTS.queueStatus}?t=${Date.now()}`);
        const queues = normalizeQueues(data.queues || []);
        setQueues(queues);
        renderQueues(queues);
        await refreshMatchCandidates();
    } catch (err) {
        console.error(err);
        setStatus(`Failed to load queue status: ${err.message}`);
    }
    })();

    try {
        return await refreshQueuesPromise;
    } finally {
        refreshQueuesPromise = null;
    }
}

function startPolling() {
    if (!queueEventsSubscribed) {
        onQueuePreferencesChanged(applySoftQueueMutation);
        queueEventsSubscribed = true;
    }

    void refreshQueues();
}

export {
    leaveQueue,
    refreshQueues,
    startPolling
};
