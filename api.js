const API_BASE = "/fogo/walk-the-planck/api";
const ENDPOINTS = {
    enterMatchmaking: "enter_matchmaking.php",
    leaveMatchmaking: "leave_matchmaking.php",
    heartbeat: "player_heartbeat.php",
    queueStatus: "queue_status.php",
    matchCandidates : "get_match_candidtates.php"
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
    ENDPOINTS,
    getJson, postJson
}