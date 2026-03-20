import { ENDPOINTS, postJson } from "../../api.js";
import {
    connect,
    getState as getWalletState,
    initializeWallet,
    subscribe as subscribeWallet
} from "@ohlabs/js-chain/utility/wallet.js";
import { startHeartbeat, stopHeartbeat } from "../../heartbeat.js";
import { refreshMatchCandidates } from "../../matchmaking.js";
import { leaveQueue, refreshQueues, startPolling } from "../../queue.js";
import {
    getIsInQueue,
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
    const isInQueue = getIsInQueue();

    setSelectorsLocked(isInQueue);
    updateWalletUI();

    if (isInQueue) {
        setMatchmakingState({
            searching: true,
            title: "Searching for matches",
            detail: "You are in queue and being considered for any selected buckets.",
            meta: formatSelections()
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

    try {
        await postJson(ENDPOINTS.enterMatchmaking, {
            walletAddress: walletAddress.toLowerCase(),
            sessionToken: getSessionTokenValue(),
            matchSizes,
            entryFeesWei
        });

        setIsInQueue(true);
        await updateMatchmakingUI();
        setStatus("Searching for matches...");
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

function handleWalletStateChange(walletState) {
    void syncWalletState(walletState);
}

async function syncWalletState(walletState) {
    const walletAddress = walletState.account || "";
    const previousWalletAddress = lastWalletAccount;

    if (walletAddress && previousWalletAddress && walletAddress !== previousWalletAddress) {
        if (getIsInQueue()) {
            await leaveQueue(previousWalletAddress);
        }

        stopHeartbeat();
        resetMatchmakingState();
        setStatus(`Wallet changed: ${walletAddress}`);
    } else if (walletAddress && walletAddress !== previousWalletAddress) {
        setStatus(`Wallet changed: ${walletAddress}`);
    } else if (!walletAddress && previousWalletAddress) {
        if (getIsInQueue()) {
            await leaveQueue(previousWalletAddress);
        }

        stopHeartbeat();
        resetMatchmakingState();
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

            void maxPlayers;
            void entryFeeWei;
            // next step: call your claim/select endpoint here
        });
    }

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
