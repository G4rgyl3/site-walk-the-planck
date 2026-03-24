import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getSessionToken } from "../session.js";

const state = {
    isInQueue: false,
    selectedMatchSizes: [],
    selectedEntryFeesWei: [],
    queues: [],
    availableMatches: [],
    playerMatches: []
};

const listeners = new Set();

function getState() {
    const wallet = getWalletState();

    return {
        ...state,
        wallet,
        walletAddress: wallet.account || "",
        selectedMatchSizes: [...state.selectedMatchSizes],
        selectedEntryFeesWei: [...state.selectedEntryFeesWei],
        queues: [...state.queues],
        availableMatches: [...state.availableMatches],
        playerMatches: [...state.playerMatches]
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
    return getWalletState().account || "";
}

function getSessionTokenValue() {
    return getSessionToken();
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

function setPlayerMatches(matches) {
    state.playerMatches = Array.isArray(matches) ? [...matches] : [];
    notify();
}

function getPlayerMatches() {
    return [...state.playerMatches];
}

function resetMatchmakingState() {
    state.isInQueue = false;
    state.availableMatches = [];
    state.playerMatches = [];
    notify();
}

export {
    getAvailableMatches,
    getIsInQueue,
    getPlayerMatches,
    getQueues,
    getSelectedPreferences,
    getSessionTokenValue,
    getState,
    getWalletAddress,
    notify,
    resetMatchmakingState,
    setAvailableMatches,
    setIsInQueue,
    setPlayerMatches,
    setQueues,
    setSelectedPreferences,
    subscribe
};
