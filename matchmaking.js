import {
    getPlayerMatchDetail,
    getPlayerMatchDetails,
    getSupportedGameChainMessage,
    isPublishedGameChainSupported
} from "./features/matchmaking/walk-the-planck-contract.js";
import { ENDPOINTS, getJson, postJson } from "./api.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getSessionToken } from "./session.js";
import { formatSelections, renderAvailableMatches, renderPlayerMatches, setMatchmakingState, showToast } from "./ui/render.js";
import {
    getActiveMatchStates,
    getAvailableMatches,
    getCurrentGameMatch,
    getIsInQueue,
    getPendingActiveMatchSyncId,
    getQueues,
    setActiveMatchStates,
    setActiveMatchStatesHydrated,
    setAvailableMatches,
    setCurrentGameMatch,
    setCurrentGameMatchHydrated,
    setPendingActiveMatchSyncId,
    setShipLogMatches,
    setShipLogMatchesHydrated
} from "./state/app-state.js";

let refreshMatchCandidatesPromise = null;
let refreshActiveMatchStatesPromise = null;
let refreshCurrentGameMatchPromise = null;
let refreshShipLogMatchesPromise = null;
let activeMatchRefreshTimerId = null;

function isExpiredOpenMatch(match) {
    if (!match || Number(match.statusCode) !== 0 || !match.deadline) {
        return false;
    }

    return (match.deadline * 1000) <= Date.now();
}

function sortMatches(matches) {
    return [...matches].sort((left, right) => {
        if (left.maxPlayers !== right.maxPlayers) {
            return left.maxPlayers - right.maxPlayers;
        }

        const leftFee = BigInt(left.entryFeeWei);
        const rightFee = BigInt(right.entryFeeWei);

        if (leftFee < rightFee) return -1;
        if (leftFee > rightFee) return 1;
        return 0;
    });
}

function hasMatchCandidate(maxPlayers, entryFeeWei) {
    return getAvailableMatches().some((match) =>
        Number(match.maxPlayers) === Number(maxPlayers) &&
        String(match.entryFeeWei) === String(entryFeeWei)
    );
}

function hasBlockingMatch(matches) {
    return matches.some((match) =>
        match.isClaimable ||
        match.isRefundable ||
        (match.statusCode === 0 && !isExpiredOpenMatch(match)) ||
        match.statusCode === 1
    );
}

function hasQueueCountableMatch(matches) {
    return matches.some((match) =>
        match.statusCode === 0 &&
        !isExpiredOpenMatch(match) &&
        Number(match.playerCount) < Number(match.maxPlayers)
    );
}

function getBlockedBucketKeys(matches = getActiveMatchStates()) {
    const blockedKeys = new Set(
        matches
            .filter((match) => match.statusCode === 0 || match.statusCode === 1)
            .map((match) => `${Number(match.maxPlayers)}:${String(match.entryFeeWei)}`)
    );

    const currentGameMatch = getCurrentGameMatch();
    if (currentGameMatch?.maxPlayers && currentGameMatch?.entryFeeWei) {
        blockedKeys.add(`${Number(currentGameMatch.maxPlayers)}:${String(currentGameMatch.entryFeeWei)}`);
    }

    return blockedKeys;
}

async function refreshMatchCandidates() {
    if (refreshMatchCandidatesPromise) {
        return refreshMatchCandidatesPromise;
    }

    refreshMatchCandidatesPromise = (async () => {
    const walletAddress = getWalletState().account;
    const isInQueue = getIsInQueue();

    if (!walletAddress || !isInQueue) {
        setAvailableMatches([]);
        renderAvailableMatches([]);
        return;
    }

    try {
        const data = await getJson(
            `${ENDPOINTS.matchCandidates}?walletAddress=${encodeURIComponent(walletAddress.toLowerCase())}&sessionToken=${encodeURIComponent(getSessionToken())}&t=${Date.now()}`
        );
        const queueMap = new Map(
            getQueues().map((queue) => [
                `${Number(queue.maxPlayers)}:${String(queue.entryFeeWei)}`,
                queue
            ])
        );

        const blockedBucketKeys = getBlockedBucketKeys();
        const matches = sortMatches(
            (data.matches || [])
                .map((match) => {
                    const key = `${Number(match.maxPlayers)}:${String(match.entryFeeWei)}`;
                    const queue = queueMap.get(key);

                    if (!queue || queue.readyCount == null || Number(queue.readyCount) < Number(match.maxPlayers)) {
                        return null;
                    }

                    return {
                        ...match,
                        committedCount: queue.committedCount,
                        readyCount: queue.readyCount,
                        matchable: queue.matchable
                    };
                })
                .filter((match) =>
                    match &&
                    !blockedBucketKeys.has(`${Number(match.maxPlayers)}:${String(match.entryFeeWei)}`)
                )
        );
        setAvailableMatches(matches);
        renderAvailableMatches(matches);

        if (Array.isArray(matches) && matches.length > 0) {
            setMatchmakingState({
                searching: true,
                title: "Match available",
                detail: "A fillable match is ready below. Choose one to continue on chain.",
                meta: formatSelections()
            });
        } else {
            setMatchmakingState({
                searching: true,
                title: "Searching for matches",
                detail: "You are in queue and being considered for any selected buckets.",
                meta: formatSelections()
            });
        }
    } catch (err) {
        console.error(err);
        setAvailableMatches([]);
        renderAvailableMatches([]);
    }
    })();

    try {
        return await refreshMatchCandidatesPromise;
    } finally {
        refreshMatchCandidatesPromise = null;
    }
}

async function refreshActiveMatchStates() {
    if (refreshActiveMatchStatesPromise) {
        return refreshActiveMatchStatesPromise;
    }

    refreshActiveMatchStatesPromise = (async () => {
        const walletAddress = getWalletState().account;
        const currentGameMatch = getCurrentGameMatch();
        const currentMatchId = String(currentGameMatch?.id ?? currentGameMatch?.matchId ?? "");

        if (!walletAddress || !currentMatchId) {
            setActiveMatchStates([]);
            setActiveMatchStatesHydrated(true);
            setPendingActiveMatchSyncId("");
            return;
        }

        try {
            const match = await getPlayerMatchDetail(walletAddress.toLowerCase(), currentMatchId);
            const matches = match ? [match] : [];
            const pendingActiveMatchSyncId = String(getPendingActiveMatchSyncId() || "");
            setActiveMatchStates(matches);
            setActiveMatchStatesHydrated(true);
            if (pendingActiveMatchSyncId && matches.some((nextMatch) => String(nextMatch.id) === pendingActiveMatchSyncId)) {
                setPendingActiveMatchSyncId("");
            }
        } catch (err) {
            console.error(err);
            setActiveMatchStates([]);
            setActiveMatchStatesHydrated(false);
        }
    })();

    try {
        return await refreshActiveMatchStatesPromise;
    } finally {
        refreshActiveMatchStatesPromise = null;
    }
}

async function refreshShipLogMatches(options = {}) {
    const { force = false } = options;

    if (refreshShipLogMatchesPromise) {
        return refreshShipLogMatchesPromise;
    }

    refreshShipLogMatchesPromise = (async () => {
        const walletAddress = getWalletState().account;

        if (!walletAddress) {
            setShipLogMatches([]);
            setShipLogMatchesHydrated(true);
            renderPlayerMatches([]);
            return;
        }

        if (!isPublishedGameChainSupported(getWalletState().chainId)) {
            showToast(getSupportedGameChainMessage(), { variant: "info" });
            setShipLogMatches([]);
            setShipLogMatchesHydrated(false);
            if (force) {
                renderPlayerMatches([]);
            }
            return;
        }

        try {
            const matches = await getPlayerMatchDetails(walletAddress.toLowerCase());
            setShipLogMatches(matches);
            setShipLogMatchesHydrated(true);
            renderPlayerMatches(matches);
        } catch (err) {
            console.error(err);
            setShipLogMatches([]);
            setShipLogMatchesHydrated(false);
            if (force) {
                renderPlayerMatches([]);
            }
        }
    })();

    try {
        return await refreshShipLogMatchesPromise;
    } finally {
        refreshShipLogMatchesPromise = null;
    }
}

async function refreshCurrentGameMatch() {
    if (refreshCurrentGameMatchPromise) {
        return refreshCurrentGameMatchPromise;
    }

    refreshCurrentGameMatchPromise = (async () => {
        const walletAddress = getWalletState().account;
        const sessionToken = getSessionToken();

        if (!walletAddress || !sessionToken) {
            setCurrentGameMatch(null);
            setCurrentGameMatchHydrated(true);
            return;
        }

        try {
            const data = await getJson(
                `${ENDPOINTS.currentGameMatch}?walletAddress=${encodeURIComponent(walletAddress.toLowerCase())}&sessionToken=${encodeURIComponent(sessionToken)}&t=${Date.now()}`
            );
            setCurrentGameMatch(data.currentMatch || null);
            setCurrentGameMatchHydrated(true);
        } catch (err) {
            console.error(err);
            setCurrentGameMatch(null);
            setCurrentGameMatchHydrated(false);
        }
    })();

    try {
        return await refreshCurrentGameMatchPromise;
    } finally {
        refreshCurrentGameMatchPromise = null;
    }
}

async function dismissCurrentGameMatch(matchId) {
    const walletAddress = getWalletState().account;
    const sessionToken = getSessionToken();

    if (!walletAddress || !sessionToken) {
        setCurrentGameMatch(null);
        setCurrentGameMatchHydrated(true);
        return;
    }

    try {
        await postJson(ENDPOINTS.dismissCurrentGameMatch, {
            walletAddress: walletAddress.toLowerCase(),
            sessionToken,
            matchId: String(matchId || "")
        });
    } catch (error) {
        console.error(error);
    } finally {
        const currentMatch = getCurrentGameMatch();
        if (!currentMatch || String(currentMatch.id || currentMatch.matchId || "") === String(matchId || "")) {
            setCurrentGameMatch(null);
        }
        setCurrentGameMatchHydrated(true);
    }
}

function scheduleRefreshActiveMatchStates(delayMs = 300) {
    if (activeMatchRefreshTimerId) {
        window.clearTimeout(activeMatchRefreshTimerId);
    }

    activeMatchRefreshTimerId = window.setTimeout(() => {
        activeMatchRefreshTimerId = null;
        void refreshActiveMatchStates();
    }, delayMs);
}

export {
    dismissCurrentGameMatch,
    hasMatchCandidate,
    refreshActiveMatchStates,
    refreshCurrentGameMatch,
    refreshMatchCandidates,
    refreshShipLogMatches,
    scheduleRefreshActiveMatchStates
}
