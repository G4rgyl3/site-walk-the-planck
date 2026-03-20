import { ENDPOINTS } from "./api.js";
import { getSessionToken } from "./session.js";
import { formatSelections, renderAvailableMatches, setMatchmakingState } from "./ui/render.js";
import {
    getIsInQueue,
    getWalletAddress,
    setAvailableMatches
} from "./state/app-state.js";

async function refreshMatchCandidates() {
    const walletAddress = getWalletAddress();
    const isInQueue = getIsInQueue();

    if (!walletAddress || !isInQueue) {
        setAvailableMatches([]);
        renderAvailableMatches([]);
        return;
    }

    try {
        const response = await fetch(
            `${ENDPOINTS.matchCandidates}?walletAddress=${encodeURIComponent(walletAddress.toLowerCase())}&sessionToken=${encodeURIComponent(getSessionToken())}&t=${Date.now()}`,
            { cache: "no-store" }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to load match candidates");
        }

        const matches = data.matches || [];
        setAvailableMatches(matches);
        renderAvailableMatches(matches);

        if (Array.isArray(matches) && matches.length > 0) {
            setMatchmakingState({
                searching: true,
                title: "Match available",
                detail: "A match is ready below. Claim your spot to join.",
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

export { refreshMatchCandidates }
