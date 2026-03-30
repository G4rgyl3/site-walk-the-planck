<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";

$input = json_decode(file_get_contents("php://input"), true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON"]);
    exit;
}

$walletAddress = strtolower(trim((string)($input["walletAddress"] ?? "")));
$sessionToken = trim((string)($input["sessionToken"] ?? ""));
$matchId = trim((string)($input["matchId"] ?? ""));

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

if ($matchId !== "" && !preg_match('/^\d+$/', $matchId)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid matchId"]);
    exit;
}

try {
    $sql = "
        DELETE FROM player_current_matches
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
    ";
    $params = [
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ];

    if ($matchId !== "") {
        $sql .= "
          AND match_id = :matchId
        ";
        $params[":matchId"] = $matchId;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    echo json_encode([
        "success" => true,
        "status" => "current_game_match_dismissed",
        "removedCount" => (int)$stmt->rowCount()
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["error" => "Failed to dismiss current game match"]);
}
