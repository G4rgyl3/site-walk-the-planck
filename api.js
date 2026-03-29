const API_BASE = "/base/walk-the-planck/api";
const ENDPOINTS = {
    startSession: "start_session.php",
    endSession: "end_session.php",
    enterMatchmaking: "enter_matchmaking.php",
    leaveMatchmaking: "leave_matchmaking.php",
    confirmMatchJoin: "confirm_match_join.php",
    deactivateMatchBucket: "deactivate_match_bucket.php",
    deactivateMatch: "deactivate_match.php",
    releaseActiveMatch: "release_active_match.php",
    heartbeat: "player_heartbeat.php",
    queueStatus: "queue_status.php",
    matchCandidates : "get_match_candidates.php",
    streamEvents: "stream_events.php"
}

async function getJson(path) {
    const response = await fetch(`${API_BASE}/${path}`);
    const data = await response.json();
    if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
}

async function postJson(path, payload) {
    const response = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
}

export {
    API_BASE,
    ENDPOINTS,
    getJson, postJson
}
