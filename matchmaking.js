import { getPlayerMatchDetails } from "./features/matchmaking/walk-the-planck-contract.js";
import { ENDPOINTS, getJson, postJson } from "./api.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getSessionToken } from "./session.js";
import { formatSelections, renderAvailableMatches, renderPlayerMatches, setMatchmakingState } from "./ui/render.js";
import {
    getAvailableMatches,
    getIsInQueue,
    setAvailableMatches,
    setPlayerMatches
} from "./state/app-state.js";

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
        match.statusCode === 0 ||
        match.statusCode === 1
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

        const matches = sortMatches(data.matches || []);
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

        if (!getIsInQueue() && !hasBlockingMatch(matches)) {
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
