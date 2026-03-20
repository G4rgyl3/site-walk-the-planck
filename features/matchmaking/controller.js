import { ENDPOINTS, postJson } from "../../api.js";
import { startHeartbeat } from "../../heartbeat.js";
import { refreshMatchCandidates } from "../../matchmaking.js";
import { leaveQueue, refreshQueues } from "../../queue.js";
import { initializeWallet, connect } from "@ohlabs/js-chain/utility/wallet.js";
import {
    clearWalletAddress,
    getIsInQueue,
    getSelectedPreferences,
    getSessionTokenValue,
    getWalletAddress,
    resetMatchmakingState,
    setIsInQueue,
    setSelectedPreferences,
    setWalletAddress
} from "../../state/app-state.js";
import {
    availableMatchList,
    connectBtn,
    disconnectBtn,
    entryFeeSelector,
    forgetSessionBtn,
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
    const walletAddress = getWalletAddress();

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

async function handleWalletConnected(event) {
    const walletAddress = event.detail || "";
    setWalletAddress(walletAddress);

    if (walletAddress) {
        setStatus(`Wallet changed: ${walletAddress}`);
    } else {
        setStatus("Wallet disconnected.");
    }

    updateWalletUI();
}

async function handleWalletDisconnected() {
    clearWalletAddress();
    resetMatchmakingState();
    updateWalletUI();
    await updateMatchmakingUI();
    setStatus("Wallet disconnected.");
}

async function handleDisconnectClick() {
    const walletAddress = getWalletAddress();

    try {
        await leaveQueue(walletAddress);
    } catch {}

    resetMatchmakingState();
    await updateMatchmakingUI();
    clearWalletAddress();
    updateWalletUI();
    setStatus("Local wallet session cleared. Wallet extension may still remain connected.");
}

async function handleLeaveQueueClick() {
    const walletAddress = getWalletAddress();
    await leaveQueue(walletAddress);
    resetMatchmakingState();
    await updateMatchmakingUI();
}

function bindEvents() {
    if (connectBtn) {
        connectBtn.addEventListener("click", connect);
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener("click", handleDisconnectClick);
    }

    if (forgetSessionBtn) {
        forgetSessionBtn.addEventListener("click", () => {
            setStatus("Forget Local Session is not wired yet.");
        });
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

    window.addEventListener("onConnected", handleWalletConnected);
    window.addEventListener("onDisconnected", handleWalletDisconnected);
}

async function initMatchmakingController() {
    window.onload = initializeWallet;
    window.login = connect;

    bindEvents();
    setupMultiSelectChips(matchSizeSelector);
    setupMultiSelectChips(entryFeeSelector);
    syncSelectionsFromDom();
    updateWalletUI();
    await updateMatchmakingUI();
}

export { initMatchmakingController, updateMatchmakingUI };
