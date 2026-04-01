import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getSessionToken } from "../session.js";

const state = {
    isInQueue: false,
    selectedMatchSizes: [],
    selectedEntryFeesWei: [],
    queues: [],
    availableMatches: [],
    currentGameMatch: null,
    currentGameMatchHydrated: false,
    activeMatchStates: [],
    activeMatchStatesHydrated: false,
    shipLogMatches: [],
    shipLogMatchesHydrated: false,
    pendingActiveMatchSyncId: ""
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
        currentGameMatch: state.currentGameMatch ? { ...state.currentGameMatch } : null,
        currentGameMatchHydrated: state.currentGameMatchHydrated,
        activeMatchStates: [...state.activeMatchStates],
        activeMatchStatesHydrated: state.activeMatchStatesHydrated,
        shipLogMatches: [...state.shipLogMatches],
        shipLogMatchesHydrated: state.shipLogMatchesHydrated,
        pendingActiveMatchSyncId: state.pendingActiveMatchSyncId
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

function setCurrentGameMatch(match) {
    state.currentGameMatch = match ? { ...match } : null;
    notify();
}

function getCurrentGameMatch() {
    return state.currentGameMatch ? { ...state.currentGameMatch } : null;
}

function getCurrentGameMatchHydrated() {
    return state.currentGameMatchHydrated;
}

function setCurrentGameMatchHydrated(currentGameMatchHydrated) {
    state.currentGameMatchHydrated = !!currentGameMatchHydrated;
    notify();
}

function setActiveMatchStates(matches) {
    state.activeMatchStates = Array.isArray(matches) ? [...matches] : [];
    notify();
}

function getActiveMatchStates() {
    return [...state.activeMatchStates];
}

function getActiveMatchStatesHydrated() {
    return state.activeMatchStatesHydrated;
}

function setActiveMatchStatesHydrated(activeMatchStatesHydrated) {
    state.activeMatchStatesHydrated = !!activeMatchStatesHydrated;
    notify();
}

function setShipLogMatches(matches) {
    state.shipLogMatches = Array.isArray(matches) ? [...matches] : [];
    notify();
}

function getShipLogMatches() {
    return [...state.shipLogMatches];
}

function getShipLogMatchesHydrated() {
    return state.shipLogMatchesHydrated;
}

function setShipLogMatchesHydrated(shipLogMatchesHydrated) {
    state.shipLogMatchesHydrated = !!shipLogMatchesHydrated;
    notify();
}

function getPendingActiveMatchSyncId() {
    return state.pendingActiveMatchSyncId;
}

function setPendingActiveMatchSyncId(pendingActiveMatchSyncId) {
    state.pendingActiveMatchSyncId = String(pendingActiveMatchSyncId || "");
    notify();
}

function resetMatchmakingState() {
    state.isInQueue = false;
    state.selectedMatchSizes = [];
    state.selectedEntryFeesWei = [];
    state.availableMatches = [];
    state.currentGameMatch = null;
    state.currentGameMatchHydrated = false;
    state.activeMatchStates = [];
    state.activeMatchStatesHydrated = false;
    state.shipLogMatches = [];
    state.shipLogMatchesHydrated = false;
    state.pendingActiveMatchSyncId = "";
    notify();
}

export {
    getActiveMatchStates,
    getActiveMatchStatesHydrated,
    getAvailableMatches,
    getCurrentGameMatch,
    getCurrentGameMatchHydrated,
    getIsInQueue,
    getPendingActiveMatchSyncId,
    getQueues,
    getSelectedPreferences,
    getSessionTokenValue,
    getShipLogMatches,
    getShipLogMatchesHydrated,
    getState,
    getWalletAddress,
    notify,
    resetMatchmakingState,
    setActiveMatchStates,
    setActiveMatchStatesHydrated,
    setAvailableMatches,
    setCurrentGameMatch,
    setCurrentGameMatchHydrated,
    setIsInQueue,
    setPendingActiveMatchSyncId,
    setQueues,
    setSelectedPreferences,
    setShipLogMatches,
    setShipLogMatchesHydrated,
    subscribe
};
