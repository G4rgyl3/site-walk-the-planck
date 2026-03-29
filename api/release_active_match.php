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

$walletAddress = strtolower(trim((string)($input["walletAddress"] ?? "")));
$sessionToken = trim((string)($input["sessionToken"] ?? ""));

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
    $pdo->beginTransaction();

    $sessionUpdate = $pdo->prepare("
        UPDATE player_sessions
        SET is_matchmaking = 0,
            last_seen = NOW()
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
    ");

    $sessionUpdate->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $activeBucketsStmt = $pdo->prepare("
        SELECT max_players, entry_fee_wei
        FROM player_session_matches
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
        FOR UPDATE
    ");
    $activeBucketsStmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $activeBuckets = array_map(
        static fn(array $bucket) => [
            "maxPlayers" => (int)($bucket["max_players"] ?? 0),
            "entryFeeWei" => (string)($bucket["entry_fee_wei"] ?? "")
        ],
        $activeBucketsStmt->fetchAll()
    );

    $deletedMatchesStmt = $pdo->prepare("
        DELETE FROM player_session_matches
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
    ");
    $deletedMatchesStmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $pdo->prepare("
        DELETE FROM player_match_preferences
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
    ")->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode(["error" => "Failed to release active match"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => "active_matches_released"
]);

publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, [
    "action" => "active_matches_released",
    "walletAddress" => $walletAddress,
    "sessionToken" => $sessionToken,
    "buckets" => $activeBuckets
]);
