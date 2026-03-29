<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";
require_once __DIR__ . "/matchmaking_events.php";

$input = json_decode(file_get_contents("php://input"), true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON"]);
    exit;
}

$matchId = trim((string)($input["matchId"] ?? ""));
$maxPlayers = (int)($input["maxPlayers"] ?? 0);
$entryFeeWei = trim((string)($input["entryFeeWei"] ?? ""));

if (!preg_match('/^\d+$/', $matchId)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid matchId"]);
    exit;
}

if ($maxPlayers <= 0 || !preg_match('/^\d+$/', $entryFeeWei)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid bucket"]);
    exit;
}

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        DELETE FROM player_session_matches
        WHERE match_id = :matchId
    ");
    $stmt->execute([
        ":matchId" => $matchId
    ]);

    $removedCount = (int)$stmt->rowCount();
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode(["error" => "Failed to deactivate match"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => "match_deactivated",
    "updated" => $removedCount > 0,
    "removedCount" => $removedCount
]);

if ($removedCount > 0) {
    publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, [
        "action" => "committed_match_closed",
        "matchId" => $matchId,
        "removedCount" => $removedCount,
        "buckets" => [[
            "maxPlayers" => $maxPlayers,
            "entryFeeWei" => $entryFeeWei
        ]]
    ]);
}
