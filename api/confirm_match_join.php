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
$matchId = trim((string)($input["matchId"] ?? ""));
$maxPlayers = (int)($input["maxPlayers"] ?? 0);
$entryFeeWei = trim((string)($input["entryFeeWei"] ?? ""));
$deadline = (int)($input["deadline"] ?? 0);

$allowedSizes = [2, 3, 4, 5];
$allowedFees = [
    "500000000000000",
    "1000000000000000",
    "2500000000000000",
    "5000000000000000",
    "10000000000000000"
];

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

if (!preg_match('/^\d+$/', $matchId)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid matchId"]);
    exit;
}

if (!in_array($maxPlayers, $allowedSizes, true)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid maxPlayers"]);
    exit;
}

if (!in_array($entryFeeWei, $allowedFees, true)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid entryFeeWei"]);
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

    if ($sessionUpdate->rowCount() === 0) {
        throw new RuntimeException("Session not found");
    }

    $pdo->prepare("
        INSERT INTO player_session_matches (
            wallet_address,
            session_token,
            match_id,
            max_players,
            entry_fee_wei,
            state
        ) VALUES (
            :wallet,
            :sessionToken,
            :matchId,
            :maxPlayers,
            :entryFeeWei,
            'active'
        )
        ON DUPLICATE KEY UPDATE
            session_token = VALUES(session_token),
            max_players = VALUES(max_players),
            entry_fee_wei = VALUES(entry_fee_wei),
            state = VALUES(state),
            updated_at = CURRENT_TIMESTAMP
    ")->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken,
        ":matchId" => $matchId,
        ":maxPlayers" => $maxPlayers,
        ":entryFeeWei" => $entryFeeWei
    ]);

    $pdo->prepare("
        DELETE FROM player_match_preferences
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
          AND max_players = :maxPlayers
          AND entry_fee_wei = :entryFeeWei
    ")->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken,
        ":maxPlayers" => $maxPlayers,
        ":entryFeeWei" => $entryFeeWei
    ]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode(["error" => "Failed to confirm joined match"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => "match_join_confirmed",
    "matchId" => $matchId
]);

publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, [
    "action" => "match_join_confirmed",
    "walletAddress" => $walletAddress,
    "sessionToken" => $sessionToken,
    "matchId" => $matchId,
    "deadline" => $deadline > 0 ? $deadline : null,
    "buckets" => [[
        "maxPlayers" => $maxPlayers,
        "entryFeeWei" => $entryFeeWei
    ]]
]);
