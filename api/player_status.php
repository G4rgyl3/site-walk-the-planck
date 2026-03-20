<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";

$raw = file_get_contents("php://input");
$input = json_decode($raw, true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON body"]);
    exit;
}

$sessionToken = trim((string)($input["sessionToken"] ?? ""));

if ($sessionToken === "" || strlen($sessionToken) > 64) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid sessionToken"]);
    exit;
}

$sql = "
    SELECT
        wallet_address,
        max_players,
        entry_fee_wei,
        is_ready,
        session_token,
        last_seen
    FROM ready_players
    WHERE session_token = :session_token
    LIMIT 1
";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ":session_token" => $sessionToken
    ]);

    $player = $stmt->fetch();
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "error" => "Database read failed"
    ]);
    exit;
}

if (!$player) {
    echo json_encode([
        "success" => true,
        "found" => false,
        "status" => "not_found"
    ]);
    exit;
}

$status = ((int)$player["is_ready"] === 1) ? "ready" : "not_ready";

echo json_encode([
    "success" => true,
    "found" => true,
    "status" => $status,
    "player" => [
        "walletAddress" => $player["wallet_address"],
        "maxPlayers" => (int)$player["max_players"],
        "entryFeeWei" => (string)$player["entry_fee_wei"],
        "isReady" => ((int)$player["is_ready"] === 1),
        "lastSeen" => $player["last_seen"]
    ]
]);