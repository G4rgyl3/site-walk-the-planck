<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";

$walletAddress = strtolower(trim((string)($_GET["walletAddress"] ?? "")));
$sessionToken = trim((string)($_GET["sessionToken"] ?? ""));

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
    $stmt = $pdo->prepare("
        SELECT wallet_address, session_token, match_id, max_players, entry_fee_wei, state, created_at, updated_at
        FROM player_current_matches
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
        LIMIT 1
    ");
    $stmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $match = $stmt->fetch();

    echo json_encode([
        "success" => true,
        "status" => "ok",
        "currentMatch" => $match ? [
            "walletAddress" => strtolower((string)$match["wallet_address"]),
            "sessionToken" => (string)$match["session_token"],
            "id" => (string)$match["match_id"],
            "matchId" => (string)$match["match_id"],
            "maxPlayers" => (int)$match["max_players"],
            "playerCount" => (int)$match["max_players"],
            "entryFeeWei" => (string)$match["entry_fee_wei"],
            "statusCode" => 0,
            "state" => (string)$match["state"],
            "createdAt" => (string)$match["created_at"],
            "updatedAt" => (string)$match["updated_at"]
        ] : null
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["error" => "Failed to load current game match"]);
}
