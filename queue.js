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

function normalizeQueues(queues) {
    return (queues ?? []).map((queue) => ({
        ...queue,
        queuedCount: Number(queue.queuedCount ?? 0),
        committedCount: null,
        readyCount: null,
        matchable: null
    }));
}

function getBucketKey(maxPlayers, entryFeeWei) {
    return `${Number(maxPlayers)}:${String(entryFeeWei)}`;
}

function applySoftQueueMutation(eventDetail) {
    const payload = eventDetail?.payload;
    if (!payload || payload.action === "match_join_confirmed" || payload.action === "active_matches_released") {
        return;
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
    const delta = payload.action === "left" ? -1 : 1;
    let didChange = false;

    const nextQueues = getQueues().map((queue) => {
        if (!bucketKeys.has(getBucketKey(queue.maxPlayers, queue.entryFeeWei))) {
            return queue;
        }

        didChange = true;
        return {
            ...queue,
            queuedCount: Math.max(0, Number(queue.queuedCount ?? 0) + delta)
        };
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
