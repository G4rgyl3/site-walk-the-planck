import { API_BASE, ENDPOINTS } from "../api.js";

let eventSource = null;
const queuePreferenceChangedListeners = new Set();

function notifyQueuePreferenceChangedListeners(detail) {
    queuePreferenceChangedListeners.forEach((listener) => {
        try {
            listener(detail);
        } catch (error) {
            console.error("[matchmaking:sse] Listener failed.", error);
        }
    });
}

function subscribeToMatchmakingEvents() {
    if (eventSource) {
        return eventSource;
    }

    eventSource = new EventSource(`${API_BASE}/${ENDPOINTS.streamEvents}`);

    eventSource.addEventListener("queue_preferences_changed", (event) => {
        try {
            const detail = JSON.parse(event.data);
            console.log("[matchmaking:sse] queue_preferences_changed", detail);
            notifyQueuePreferenceChangedListeners(detail);
        } catch (error) {
            console.error("[matchmaking:sse] Failed to parse event payload.", error, event.data);
        }
    });

    eventSource.onerror = (error) => {
        console.warn("[matchmaking:sse] Stream connection issue.", error);
    };

    return eventSource;
}

function onQueuePreferencesChanged(listener) {
    queuePreferenceChangedListeners.add(listener);
    return () => queuePreferenceChangedListeners.delete(listener);
}

export { onQueuePreferencesChanged, subscribeToMatchmakingEvents };
