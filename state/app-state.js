import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getSessionToken } from "../session.js";

const state = {
    sessionToken: getSessionToken(),
    isInQueue: false,
    selectedMatchSizes: [],
    selectedEntryFeesWei: [],
    queues: [],
    availableMatches: []
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
    return getWalletState().account || "";
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
    subscribe
};
