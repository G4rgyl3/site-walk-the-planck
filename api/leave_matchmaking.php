<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";
require_once __DIR__ . "/matchmaking_events.php";

$input = json_decode(file_get_contents("php://input"), true);

$walletAddress = strtolower(trim($input["walletAddress"] ?? ""));
$sessionToken = trim((string)($input["sessionToken"] ?? ""));

if (!preg_match('/^0x[a-f0-9]{40}$/', $walletAddress)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid wallet"]);
    exit;
}

if ($sessionToken === "") {
    http_response_code(400);
    echo json_encode(["error" => "Invalid sessionToken"]);
    exit;
}

try {
    $pdo->beginTransaction();

    $queuedBucketsStmt = $pdo->prepare("
        SELECT max_players, entry_fee_wei
        FROM player_match_preferences
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
        FOR UPDATE
    ");
    $queuedBucketsStmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $queuedBuckets = array_map(
        static fn(array $bucket) => [
            "maxPlayers" => (int)($bucket["max_players"] ?? 0),
            "entryFeeWei" => (string)($bucket["entry_fee_wei"] ?? "")
        ],
        $queuedBucketsStmt->fetchAll()
    );

    $activeMatchStmt = $pdo->prepare("
        SELECT COUNT(*) AS active_match_count
        FROM player_session_matches
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
        FOR UPDATE
    ");
    $activeMatchStmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $existingSession = $activeMatchStmt->fetch();
    $hasActiveMatch = $existingSession && (int)$existingSession["active_match_count"] > 0;

    $pdo->prepare("
        UPDATE player_sessions
        SET is_matchmaking = 0,
            last_seen = NOW()
        WHERE wallet_address = :wallet
        AND session_token = :sessionToken
    ")->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $pdo->prepare("
        DELETE FROM player_match_preferences
        WHERE wallet_address = ?
          AND session_token = ?
    ")->execute([
        $walletAddress,
        $sessionToken
    ]);

    $pdo->commit();

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(["error" => "Failed to leave matchmaking"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => $hasActiveMatch ? "matchmaking_left_active_matches_retained" : "matchmaking_left"
]);

publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, [
    "action" => "left",
    "walletAddress" => $walletAddress,
    "sessionToken" => $sessionToken,
    "buckets" => $queuedBuckets
]);
