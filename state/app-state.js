import { getSessionToken } from "../session.js";

const WALLET_STORAGE_KEY = "wtp_wallet";

const state = {
    walletAddress: localStorage.getItem(WALLET_STORAGE_KEY) || "",
    sessionToken: getSessionToken(),
    isInQueue: false,
    selectedMatchSizes: [],
    selectedEntryFeesWei: [],
    queues: [],
    availableMatches: []
};

const listeners = new Set();

function getState() {
    return {
        ...state,
        selectedMatchSizes: [...state.selectedMatchSizes],
        selectedEntryFeesWei: [...state.selectedEntryFeesWei],
        queues: [...state.queues],
        availableMatches: [...state.availableMatches]
    };
}

function notify() {
    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot));
}

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getWalletAddress() {
    return state.walletAddress;
}

function setWalletAddress(walletAddress) {
    state.walletAddress = walletAddress || "";

    if (state.walletAddress) {
        localStorage.setItem(WALLET_STORAGE_KEY, state.walletAddress);
    } else {
        localStorage.removeItem(WALLET_STORAGE_KEY);
    }

    notify();
}

function clearWalletAddress() {
    setWalletAddress("");
}

function getSessionTokenValue() {
    return state.sessionToken;
}

function getIsInQueue() {
    return state.isInQueue;
}

function setIsInQueue(isInQueue) {
    state.isInQueue = !!isInQueue;
    notify();
}

function getSelectedPreferences() {
    return {
        matchSizes: [...state.selectedMatchSizes],
        entryFeesWei: [...state.selectedEntryFeesWei]
    };
}

function setSelectedPreferences({ matchSizes = [], entryFeesWei = [] }) {
    state.selectedMatchSizes = matchSizes.map((value) => Number(value));
    state.selectedEntryFeesWei = entryFeesWei.map((value) => String(value));
    notify();
}

function setQueues(queues) {
    state.queues = Array.isArray(queues) ? [...queues] : [];
    notify();
}

function getQueues() {
    return [...state.queues];
}

function setAvailableMatches(matches) {
    state.availableMatches = Array.isArray(matches) ? [...matches] : [];
    notify();
}

function getAvailableMatches() {
    return [...state.availableMatches];
}

function resetMatchmakingState() {
    state.isInQueue = false;
    state.availableMatches = [];
    notify();
}

export {
    clearWalletAddress,
    getAvailableMatches,
    getIsInQueue,
    getQueues,
    getSelectedPreferences,
    getSessionTokenValue,
    getState,
    getWalletAddress,
    notify,
    resetMatchmakingState,
    setAvailableMatches,
    setIsInQueue,
    setQueues,
    setSelectedPreferences,
    setWalletAddress,
    subscribe
};
