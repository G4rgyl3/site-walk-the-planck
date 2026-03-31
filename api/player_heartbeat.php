<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";
require_once __DIR__ . "/session_cleanup.php";
require_once __DIR__ . "/matchmaking_events.php";

$input = json_decode(file_get_contents("php://input"), true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON"]);
    exit;
}

$walletAddress = strtolower(trim((string)($input["walletAddress"] ?? "")));
$sessionToken = trim((string)($input["sessionToken"] ?? ""));
$liveWindowSeconds = 30;

if (!preg_match('/^0x[a-f0-9]{40}$/', $walletAddress)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid wallet"]);
    exit;
}

if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $sessionToken)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid sessionToken"]);
    exit;
}

try {
    $cleanupResult = cleanupInactiveMatchmakingSessions($pdo, $liveWindowSeconds);
    foreach (($cleanupResult["events"] ?? array()) as $eventPayload) {
        publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, $eventPayload);
    }

    $stmt = $pdo->prepare("
        UPDATE player_sessions
        SET last_seen = NOW()
        WHERE wallet_address = :wallet
        AND session_token = :sessionToken
        AND is_matchmaking = 1
    ");

    $stmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    echo json_encode([
        "success" => true,
        "status" => "heartbeat_ok",
        "updated" => $stmt->rowCount() > 0
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Failed to update heartbeat"]);
    exit;
}
