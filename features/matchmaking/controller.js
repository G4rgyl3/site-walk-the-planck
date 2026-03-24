import { ENDPOINTS, postJson } from "../../api.js";
import {
    connect,
    getState as getWalletState,
    initializeWallet,
    subscribe as subscribeWallet
} from "@ohlabs/js-chain/utility/wallet.js";
import { startHeartbeat, stopHeartbeat } from "../../heartbeat.js";
import {
    claimPublishedMatch,
    claimPublishedRefund,
    joinPublishedLobby
} from "./walk-the-planck-contract.js";
import { hasMatchCandidate, refreshMatchCandidates, refreshPlayerMatches } from "../../matchmaking.js";
import { leaveQueue, refreshQueues, startPolling } from "../../queue.js";
import { resetSessionToken } from "../../session.js";
import {
    getIsInQueue,
    getPlayerMatches,
    getSelectedPreferences,
    getSessionTokenValue,
    resetMatchmakingState,
    setIsInQueue,
    setSelectedPreferences
} from "../../state/app-state.js";
import {
    availableMatchList,
    connectBtn,
    entryFeeSelector,
    joinQueueBtn,
    leaveQueueBtn,
    matchSizeSelector,
    refreshQueueBtn
} from "../../ui/dom.js";
import {
    formatSelections,
    setMatchmakingState,
    setSelectorsLocked,
    setStatus,
    updateWalletUI
} from "../../ui/render.js";

let unsubscribeWallet = null;
let lastWalletAccount = null;

function hasBlockingMatch(matches = getPlayerMatches()) {
    return matches.some((match) =>
        match.isClaimable ||
        match.isRefundable ||
        match.statusCode === 0 ||
        match.statusCode === 1
    );
}

function getBlockedBucketKeys(matches = getPlayerMatches()) {
    return new Set(
        matches
            .filter((match) => match.statusCode === 0 || match.statusCode === 1)
            .map((match) => `${Number(match.maxPlayers)}:${String(match.entryFeeWei)}`)
    );
}

async function startPlayerSession(walletAddress, sessionToken) {
    await postJson(ENDPOINTS.startSession, {
        walletAddress: walletAddress.toLowerCase(),
        sessionToken
    });
}

async function endPlayerSession(walletAddress, sessionToken) {
    await postJson(ENDPOINTS.endSession, {
        walletAddress: walletAddress.toLowerCase(),
        sessionToken
    });
}

function getSelectedValues(container, datasetKey, parseValue) {
    if (!container) return [];

    return Array.from(container.querySelectorAll(".select-chip.selected")).map((el) =>
        parseValue(el.dataset[datasetKey])
    );
}

function syncSelectionsFromDom() {
    setSelectedPreferences({
        matchSizes: getSelectedValues(matchSizeSelector, "matchSize", (value) => parseInt(value, 10)),
        entryFeesWei: getSelectedValues(entryFeeSelector, "entryFee", (value) => String(value))
    });
}

function setupMultiSelectChips(container) {
    if (!container) return;

    container.addEventListener("click", (event) => {
        const chip = event.target.closest(".select-chip");
        if (!chip || !container.contains(chip)) return;

        const isSelected = chip.classList.contains("selected");
        chip.classList.toggle("selected", !isSelected);
        chip.setAttribute("aria-pressed", (!isSelected).toString());
        syncSelectionsFromDom();
    });
}

async function updateMatchmakingUI() {
    await refreshPlayerMatches();

    const isInQueue = getIsInQueue();
    const activeOnChainMatch = hasBlockingMatch();

    setSelectorsLocked(isInQueue);
    updateWalletUI();

    if (isInQueue) {
        setMatchmakingState({
            searching: true,
            title: "Searching for matches",
            detail: "You are in queue and being considered for any selected buckets.",
            meta: formatSelections()
        });
    } else if (activeOnChainMatch) {
        setMatchmakingState({
            searching: true,
            title: "Active on-chain match",
            detail: "You already have a live match in one bucket. You can still queue different buckets.",
            meta: "The committed on-chain bucket is filtered out from queue re-entry."
        });
    } else {
        setMatchmakingState({
            searching: false,
            title: "Not in queue",
            detail: "Select match sizes and entry fees, then click I'm Ready.",
            meta: "No active matchmaking preferences."
        });
    }

    await refreshMatchCandidates();
}

async function joinQueue() {
    const walletAddress = getWalletState().account;

    if (!walletAddress) {
        setStatus("Connect wallet first.");
        return;
    }

    syncSelectionsFromDom();
    const { matchSizes, entryFeesWei } = getSelectedPreferences();
    const blockedBucketKeys = getBlockedBucketKeys();

    const blockedPairs = [];

    for (const matchSize of matchSizes) {
        for (const entryFeeWei of entryFeesWei) {
            const key = `${Number(matchSize)}:${String(entryFeeWei)}`;
            if (blockedBucketKeys.has(key)) {
                blockedPairs.push(`${matchSize}p @ ${entryFeeWei} wei`);
            }
        }
    }

    if (blockedPairs.length === matchSizes.length * entryFeesWei.length) {
        setStatus("All selected buckets are already active on chain for this wallet.");
        return;
    }

    try {
        await postJson(ENDPOINTS.enterMatchmaking, {
            walletAddress: walletAddress.toLowerCase(),
            sessionToken: getSessionTokenValue(),
            matchSizes,
            entryFeesWei,
            blockedCombinations: Array.from(blockedBucketKeys).map((key) => {
                const [blockedMatchSize, blockedEntryFeeWei] = key.split(":");

                return {
                    maxPlayers: Number(blockedMatchSize),
                    entryFeeWei: blockedEntryFeeWei
                };
            })
        });

        setIsInQueue(true);
        await updateMatchmakingUI();
        setStatus(
            blockedPairs.length > 0
                ? `Searching for matches... skipped active bucket selections: ${blockedPairs.join(", ")}`
                : "Searching for matches..."
        );
        startHeartbeat();
        await refreshQueues();
    } catch (err) {
        console.error(err);
        setStatus(`Ready request failed: ${err.message}`);
    }
}

async function handleLeaveQueueClick() {
    const walletAddress = getWalletState().account;
    await leaveQueue(walletAddress);
    resetMatchmakingState();
    await updateMatchmakingUI();
}

async function handleJoinMatchClick(maxPlayers, entryFeeWei) {
    const walletAddress = getWalletState().account;

    if (!walletAddress) {
        setStatus("Connect wallet first.");
        return;
    }

    await refreshMatchCandidates();

    if (!hasMatchCandidate(maxPlayers, entryFeeWei)) {
        setStatus("That match is no longer fillable. Choose another available option.");
        return;
    }

    try {
        setStatus(`Submitting join transaction for ${maxPlayers} players at ${entryFeeWei} wei...`);
        const { contract, tx } = await joinPublishedLobby(maxPlayers, entryFeeWei);
        setStatus(`Transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        const matchId = contract.getLobbyIdFromReceipt(receipt);

        if (!matchId) {
            setStatus("Join confirmed on chain, but the app could not read the match id from the receipt.");
            return;
        }

        try {
            await postJson(ENDPOINTS.confirmMatchJoin, {
                walletAddress: walletAddress.toLowerCase(),
                sessionToken: getSessionTokenValue(),
                matchId,
                maxPlayers,
                entryFeeWei
            });
        } catch (syncError) {
            console.error(syncError);
            setStatus(`Join confirmed on chain for match #${matchId}, but DB sync failed: ${syncError.message}`);
            await refreshPlayerMatches();
            await refreshQueues();
            return;
        }

        resetMatchmakingState();
        setIsInQueue(false);
        await updateMatchmakingUI();

        setStatus(`Join confirmed on chain. Match #${matchId} is now locked in the queue bucket.`);
        await refreshPlayerMatches();
        await refreshQueues();
    } catch (err) {
        console.error(err);
        setStatus(`Join transaction failed: ${err.message}`);
    }
}

async function handleClaimMatchClick(matchId) {
    try {
        setStatus(`Submitting claim transaction for match #${matchId}...`);
        const { tx } = await claimPublishedMatch(matchId);
        setStatus(`Claim transaction submitted: ${tx.hash}`);
        await tx.wait();
        setStatus(`Claim confirmed for match #${matchId}.`);
        await refreshPlayerMatches();
        await refreshQueues();
    } catch (err) {
        console.error(err);
        setStatus(`Claim failed: ${err.message}`);
    }
}

async function handleClaimRefundClick(matchId) {
    try {
        setStatus(`Submitting refund claim for match #${matchId}...`);
        const { tx } = await claimPublishedRefund(matchId);
        setStatus(`Refund transaction submitted: ${tx.hash}`);
        await tx.wait();
        setStatus(`Refund confirmed for match #${matchId}.`);
        await refreshPlayerMatches();
        await refreshQueues();
    } catch (err) {
        console.error(err);
        setStatus(`Refund claim failed: ${err.message}`);
    }
}

function handleWalletStateChange(walletState) {
    void syncWalletState(walletState).catch((err) => {
        console.error(err);
        setStatus(`Wallet lifecycle sync failed: ${err.message}`);
        updateWalletUI();
    });
}

async function syncWalletState(walletState) {
    const walletAddress = walletState.account || "";
    const previousWalletAddress = lastWalletAccount;
    const previousSessionToken = getSessionTokenValue();

    if (walletAddress && previousWalletAddress && walletAddress !== previousWalletAddress) {
        if (getIsInQueue()) {
            await leaveQueue(previousWalletAddress, previousSessionToken);
        }

        stopHeartbeat();
        resetMatchmakingState();
        await endPlayerSession(previousWalletAddress, previousSessionToken);
        const nextSessionToken = resetSessionToken();
        await startPlayerSession(walletAddress, nextSessionToken);
        setStatus(`Wallet changed: ${walletAddress}`);
    } else if (walletAddress && walletAddress !== previousWalletAddress) {
        const nextSessionToken = resetSessionToken();
        await startPlayerSession(walletAddress, nextSessionToken);
        setStatus(`Wallet changed: ${walletAddress}`);
    } else if (!walletAddress && previousWalletAddress) {
        if (getIsInQueue()) {
            await leaveQueue(previousWalletAddress, previousSessionToken);
        }

        stopHeartbeat();
        resetMatchmakingState();
        await endPlayerSession(previousWalletAddress, previousSessionToken);
        resetSessionToken();
        setStatus("Wallet disconnected.");
    }

    lastWalletAccount = walletAddress;
    updateWalletUI();
    void updateMatchmakingUI();
}

function bindEvents() {
    if (connectBtn) {
        connectBtn.addEventListener("click", connect);
    }

    if (joinQueueBtn) {
        joinQueueBtn.addEventListener("click", joinQueue);
    }

    if (leaveQueueBtn) {
        leaveQueueBtn.addEventListener("click", handleLeaveQueueClick);
    }

    if (refreshQueueBtn) {
        refreshQueueBtn.addEventListener("click", refreshQueues);
    }

    if (availableMatchList) {
        availableMatchList.addEventListener("click", async (event) => {
            const button = event.target.closest(".btn-join-match");
            if (!button) return;

            const maxPlayers = Number(button.dataset.maxPlayers);
            const entryFeeWei = button.dataset.entryFeeWei;
            await handleJoinMatchClick(maxPlayers, entryFeeWei);
        });
    }

    document.addEventListener("click", async (event) => {
        const claimButton = event.target.closest("[data-claim-match-id]");
        if (claimButton) {
            await handleClaimMatchClick(claimButton.dataset.claimMatchId);
            return;
        }

        const refundButton = event.target.closest("[data-refund-match-id]");
        if (refundButton) {
            await handleClaimRefundClick(refundButton.dataset.refundMatchId);
        }
    });

}

async function initMatchmakingController() {
    bindEvents();
    setupMultiSelectChips(matchSizeSelector);
    setupMultiSelectChips(entryFeeSelector);
    syncSelectionsFromDom();
    startPolling();
    unsubscribeWallet?.();
    unsubscribeWallet = subscribeWallet(handleWalletStateChange);
    await initializeWallet();
    updateWalletUI();
    await updateMatchmakingUI();
}

export { initMatchmakingController, updateMatchmakingUI };
