import { ENDPOINTS, postJson } from "../../api.js";
import {
    connect,
    getState as getWalletState,
    initializeWallet,
    refreshAccount,
    subscribe as subscribeWallet
} from "@ohlabs/js-chain/utility/wallet.js";
import { startHeartbeat, stopHeartbeat } from "../../heartbeat.js";
import {
    CHAIN_ACTIONS_ENABLED,
    claimPublishedMatch,
    claimPublishedRefund,
    decodeContractError,
    joinPublishedLobby
} from "./walk-the-planck-contract.js";
import {
    hasMatchCandidate,
    refreshActiveMatchStates,
    refreshCurrentGameMatch,
    refreshMatchCandidates,
    refreshShipLogMatches,
    scheduleRefreshActiveMatchStates
} from "../../matchmaking.js";
import { onQueuePreferencesChanged } from "../../lib/matchmaking-events.js";
import { createQueueOperationId, leaveQueue, refreshQueues, startPolling, suppressQueueOperation, truthUpCommittedMatches } from "../../queue.js";
import { resetSessionToken } from "../../session.js";
import {
    getCurrentGameMatch,
    getIsInQueue,
    getActiveMatchStates,
    subscribe as subscribeAppState,
    getShipLogMatchesHydrated,
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
    historyTabBtn,
    joinQueueBtn,
    leaveQueueBtn,
    matchSizeSelector,
    refreshQueueBtn
} from "../../ui/dom.js";
import {
    formatSelections,
    renderPlayerMatches,
    setMatchmakingState,
    setSelectorsLocked,
    showToast,
    updateWalletUI
} from "../../ui/render.js";

let unsubscribeWallet = null;
let lastWalletAccount = null;
let unsubscribeQueueEvents = null;
let unsubscribeMatchmakingState = null;

function isExpiredOpenMatch(match) {
    if (!match || Number(match.statusCode) !== 0 || !match.deadline) {
        return false;
    }

    return (match.deadline * 1000) <= Date.now();
}

function getWalletActionErrorMessage(err) {
    const contractError = decodeContractError(err);

    if (contractError?.name === "MatchNotOpen") {
        return "That match is no longer open on chain. Refresh and choose another match.";
    }

    if (contractError?.name === "AlreadyJoined") {
        return "This wallet already joined that match.";
    }

    if (contractError?.name === "IncorrectEthAmount") {
        return "The entry fee no longer matches this match. Refresh and try again.";
    }

    if (err?.code === 4001) {
        return "The request was canceled in your wallet.";
    }

    if (err?.code === -32002) {
        return "A wallet request is already pending. Please open your wallet and respond there.";
    }

    return "Please make sure your wallet is signed in and unlocked, then try again.";
}

function hasBlockingMatch(matches = getActiveMatchStates()) {
    const currentGameMatch = getCurrentGameMatch();
    if (currentGameMatch?.id || currentGameMatch?.matchId) {
        return true;
    }

    return matches.some((match) =>
        match.isClaimable ||
        match.isRefundable ||
        (match.statusCode === 0 && !isExpiredOpenMatch(match)) ||
        match.statusCode === 1
    );
}

function getBlockedBucketKeys(matches = getActiveMatchStates()) {
    const blockedKeys = new Set(
        matches
            .filter((match) =>
                (match.statusCode === 0 && !isExpiredOpenMatch(match)) ||
                match.statusCode === 1
            )
            .map((match) => `${Number(match.maxPlayers)}:${String(match.entryFeeWei)}`)
    );

    const currentGameMatch = getCurrentGameMatch();
    if (currentGameMatch?.maxPlayers && currentGameMatch?.entryFeeWei) {
        blockedKeys.add(`${Number(currentGameMatch.maxPlayers)}:${String(currentGameMatch.entryFeeWei)}`);
    }

    return blockedKeys;
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

function renderMatchmakingState() {
    const isInQueue = getIsInQueue();
    const activeOnChainMatch = hasBlockingMatch();

    setSelectorsLocked(isInQueue);
    updateWalletUI();

    if (isInQueue) {
        setMatchmakingState({
            searching: true,
            title: "Searching the seas",
            detail: "Your wallet is in queue and being considered for the planks you selected.",
            meta: formatSelections(),
            tone: "searching"
        });
        return;
    }

    if (activeOnChainMatch) {
        setMatchmakingState({
            searching: true,
            title: "Crew already aboard",
            detail: "You already have a live match underway in one plank.",
            meta: "That plank is held aside until the match is settled.",
            tone: "active"
        });
        return;
    }

    setMatchmakingState({
        searching: false,
        title: "Not in queue",
        detail: "Choose your match sizes and entry fees, then join the queue.",
        meta: "No open planks selected.",
        tone: "idle"
    });
}

async function updateMatchmakingUI() {
    await refreshCurrentGameMatch();
    await refreshActiveMatchStates();
    renderMatchmakingState();

    await refreshMatchCandidates();
}

async function joinQueue() {
    const walletAddress = getWalletState().account;
    const operationId = createQueueOperationId();

    if (!walletAddress) {
        showToast("Connect your wallet first.", { variant: "info" });
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
        showToast("Those selected planks are already occupied by this wallet.", { variant: "info" });
        return;
    }

    try {
        suppressQueueOperation(operationId);
        await postJson(ENDPOINTS.enterMatchmaking, {
            walletAddress: walletAddress.toLowerCase(),
            sessionToken: getSessionTokenValue(),
            operationId,
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
        showToast(
            blockedPairs.length > 0
                ? `Now searching. Skipped occupied planks: ${blockedPairs.join(", ")}`
                : "Now searching for a crew."
        , { variant: "success" });
        startHeartbeat();
        await refreshQueues();
    } catch (err) {
        console.error(err);
        showToast(`Could not join the queue: ${err.message}`);
    }
}

async function handleLeaveQueueClick() {
    const walletAddress = getWalletState().account;
    await leaveQueue(walletAddress, getSessionTokenValue(), {
        operationId: createQueueOperationId()
    });
    resetMatchmakingState();
    await updateMatchmakingUI();
}

async function handleJoinMatchClick(maxPlayers, entryFeeWei) {
    if (!CHAIN_ACTIONS_ENABLED) {
        showToast("Chain actions are temporarily disabled.", { variant: "info" });
        return;
    }

    const walletAddress = getWalletState().account;

    if (!walletAddress) {
        showToast("Connect your wallet first.", { variant: "info" });
        return;
    }

    await refreshMatchCandidates();

    if (!hasMatchCandidate(maxPlayers, entryFeeWei)) {
        showToast("That match is no longer ready to board. Choose another one.");
        return;
    }

    try {
        showToast(`Boarding ${maxPlayers} players at ${entryFeeWei} wei...`, { variant: "info" });
        const { contract, tx } = await joinPublishedLobby(maxPlayers, entryFeeWei);
        showToast(`Transaction sent: ${tx.hash}`, { variant: "info" });
        const receipt = await tx.wait();
        const matchId = contract.getLobbyIdFromReceipt(receipt);

        if (!matchId) {
            showToast("The boarding transaction landed, but the match id could not be read.");
            return;
        }

        try {
            await postJson(ENDPOINTS.confirmMatchJoin, {
                walletAddress: walletAddress.toLowerCase(),
                sessionToken: getSessionTokenValue(),
                matchId,
                maxPlayers,
                entryFeeWei,
                deadline: 0
            });
        } catch (syncError) {
            console.error(syncError);
            showToast(`Boarding confirmed for match #${matchId}, but the harbor ledger failed to sync.`);
            await refreshActiveMatchStates();
            await refreshQueues();
            return;
        }

        resetMatchmakingState();
        setIsInQueue(false);
        await updateMatchmakingUI();

        showToast(`Boarding confirmed. Match #${matchId} is locked in.`, { variant: "success" });
        await refreshQueues();
    } catch (err) {
        console.error(err);
        if (decodeContractError(err)?.name === "MatchNotOpen") {
            await refreshMatchCandidates();
        }
        showToast(getWalletActionErrorMessage(err));
    }
}

async function handleClaimMatchClick(matchId) {
    if (!CHAIN_ACTIONS_ENABLED) {
        showToast("Chain actions are temporarily disabled.", { variant: "info" });
        return;
    }

    try {
        showToast(`Claiming spoils for match #${matchId}...`, { variant: "info" });
        const { tx } = await claimPublishedMatch(matchId);
        showToast(`Claim sent: ${tx.hash}`, { variant: "info" });
        await tx.wait();
        showToast(`Spoils claimed for match #${matchId}.`, { variant: "success" });
        await updateMatchmakingUI();
        if (getShipLogMatchesHydrated()) {
            await refreshShipLogMatches({ force: true });
        }
        await refreshQueues();
    } catch (err) {
        console.error(err);
        showToast(getWalletActionErrorMessage(err));
    }
}

async function handleClaimRefundClick(matchId) {
    if (!CHAIN_ACTIONS_ENABLED) {
        showToast("Chain actions are temporarily disabled.", { variant: "info" });
        return;
    }

    try {
        showToast(`Claiming refund for match #${matchId}...`, { variant: "info" });
        const { tx } = await claimPublishedRefund(matchId);
        showToast(`Refund sent: ${tx.hash}`, { variant: "info" });
        await tx.wait();
        showToast(`Refund confirmed for match #${matchId}.`, { variant: "success" });
        await updateMatchmakingUI();
        if (getShipLogMatchesHydrated()) {
            await refreshShipLogMatches({ force: true });
        }
        await refreshQueues();
    } catch (err) {
        console.error(err);
        showToast(getWalletActionErrorMessage(err));
    }
}

function handleWalletStateChange(walletState) {
    void syncWalletState(walletState).catch((err) => {
        console.error(err);
        showToast(`Wallet sync failed: ${err.message}`);
        updateWalletUI();
    });
}

async function syncWalletState(walletState) {
    if (walletState.account && !walletState.chainId) {
        await initializeWallet();
        return;
    }

    const walletAddress = walletState.account || "";
    const previousWalletAddress = lastWalletAccount;
    const previousSessionToken = getSessionTokenValue();

    if (walletAddress && previousWalletAddress && walletAddress !== previousWalletAddress) {
        if (getIsInQueue()) {
            await leaveQueue(previousWalletAddress, previousSessionToken);
        }

        stopHeartbeat();
        resetMatchmakingState();
        renderPlayerMatches([]);
        await endPlayerSession(previousWalletAddress, previousSessionToken);
        const nextSessionToken = resetSessionToken();
        await startPlayerSession(walletAddress, nextSessionToken);
        showToast(`Wallet connected: ${walletAddress}`, { variant: "success" });
    } else if (walletAddress && walletAddress !== previousWalletAddress) {
        const nextSessionToken = resetSessionToken();
        await startPlayerSession(walletAddress, nextSessionToken);
        showToast(`Wallet connected: ${walletAddress}`, { variant: "success" });
    } else if (!walletAddress && previousWalletAddress) {
        if (getIsInQueue()) {
            await leaveQueue(previousWalletAddress, previousSessionToken);
        }

        stopHeartbeat();
        resetMatchmakingState();
        renderPlayerMatches([]);
        await endPlayerSession(previousWalletAddress, previousSessionToken);
        resetSessionToken();
        showToast("Wallet disconnected.", { variant: "info" });
    }

    lastWalletAccount = walletAddress;
    updateWalletUI();
    renderMatchmakingState();
    void updateMatchmakingUI();

    if (walletAddress) {
        void (async () => {
            await truthUpCommittedMatches();
            await refreshCurrentGameMatch();
            await refreshActiveMatchStates();
            await refreshQueues();
        })();
        return;
    }

    void refreshCurrentGameMatch().finally(() => {
        void refreshActiveMatchStates();
    });
    void refreshQueues();
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

    if (historyTabBtn) {
        historyTabBtn.addEventListener("click", () => {
            if (!getShipLogMatchesHydrated()) {
                void refreshShipLogMatches({ force: true });
            }
        });
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

function bindMatchmakingEventRefresh() {
    unsubscribeQueueEvents?.();
    unsubscribeQueueEvents = onQueuePreferencesChanged((eventDetail) => {
        const payload = eventDetail?.payload;
        if (!payload) {
            return;
        }

        if (
            payload.action === "match_join_confirmed" ||
            payload.action === "committed_match_closed" ||
            payload.action === "committed_deactivated" ||
            payload.action === "active_matches_released"
        ) {
            void refreshCurrentGameMatch();
            scheduleRefreshActiveMatchStates();
        }
    });
}

async function initMatchmakingController() {
    bindEvents();
    bindMatchmakingEventRefresh();
    setupMultiSelectChips(matchSizeSelector);
    setupMultiSelectChips(entryFeeSelector);
    syncSelectionsFromDom();
    startPolling();
    unsubscribeWallet?.();
    unsubscribeWallet = subscribeWallet(handleWalletStateChange);
    unsubscribeMatchmakingState?.();
    unsubscribeMatchmakingState = subscribeAppState(() => {
        renderMatchmakingState();
    });
    await initializeWallet();
    await refreshAccount();
    updateWalletUI();
    await truthUpCommittedMatches();
    await refreshCurrentGameMatch();
    await refreshActiveMatchStates();
    renderMatchmakingState();
    await refreshMatchCandidates();
    await refreshQueues();
}

export { initMatchmakingController, updateMatchmakingUI };
