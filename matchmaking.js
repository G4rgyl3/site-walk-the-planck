import { getPlayerMatchDetails } from "./features/matchmaking/walk-the-planck-contract.js";
import { ENDPOINTS, getJson, postJson } from "./api.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getSessionToken } from "./session.js";
import { formatSelections, renderAvailableMatches, renderPlayerMatches, setMatchmakingState } from "./ui/render.js";
import {
    getAvailableMatches,
    getIsInQueue,
    getPlayerMatches,
    getQueues,
    setAvailableMatches,
    setPlayerMatches
} from "./state/app-state.js";

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

function getDeactivatableBuckets(matches) {
    const buckets = new Map();

    matches.forEach((match) => {
        const shouldDeactivate =
            isExpiredOpenMatch(match) ||
            (match.statusCode === 0 && Number(match.playerCount) >= Number(match.maxPlayers)) ||
            match.statusCode === 1 ||
            match.isClaimable ||
            match.isRefundable;

        if (!shouldDeactivate) {
            return;
        }

        const key = `${Number(match.maxPlayers)}:${String(match.entryFeeWei)}`;
        if (!buckets.has(key)) {
            buckets.set(key, {
                maxPlayers: Number(match.maxPlayers),
                entryFeeWei: String(match.entryFeeWei)
            });
        }
    });

    return [...buckets.values()];
}

function getBlockedBucketKeys(matches = getPlayerMatches()) {
    return new Set(
        matches
            .filter((match) => match.statusCode === 0 || match.statusCode === 1)
            .map((match) => `${Number(match.maxPlayers)}:${String(match.entryFeeWei)}`)
    );
}

async function refreshMatchCandidates() {
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
}

async function refreshPlayerMatches() {
    const walletAddress = getWalletState().account;

    if (!walletAddress) {
        setPlayerMatches([]);
        renderPlayerMatches([]);
        return;
    }

    try {
        const matches = await getPlayerMatchDetails(walletAddress.toLowerCase());
        setPlayerMatches(matches);
        renderPlayerMatches(matches);

        const bucketsToDeactivate = getDeactivatableBuckets(matches);
        for (const bucket of bucketsToDeactivate) {
            await postJson(ENDPOINTS.deactivateMatchBucket, {
                walletAddress: walletAddress.toLowerCase(),
                sessionToken: getSessionToken(),
                maxPlayers: bucket.maxPlayers,
                entryFeeWei: bucket.entryFeeWei
            });
        }

        if (!getIsInQueue()) {
            if (hasQueueCountableMatch(matches)) {
                return;
            }

            if (hasBlockingMatch(matches)) {
                return;
            }

            await postJson(ENDPOINTS.releaseActiveMatch, {
                walletAddress: walletAddress.toLowerCase(),
                sessionToken: getSessionToken()
            });
        }
    } catch (err) {
        console.error(err);
        setPlayerMatches([]);
        renderPlayerMatches([]);
    }
}

export { hasMatchCandidate, refreshMatchCandidates, refreshPlayerMatches }
