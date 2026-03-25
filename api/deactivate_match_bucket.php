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
$maxPlayers = (int)($input["maxPlayers"] ?? 0);
$entryFeeWei = trim((string)($input["entryFeeWei"] ?? ""));

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

if ($maxPlayers <= 0 || !preg_match('/^\d+$/', $entryFeeWei)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid bucket"]);
    exit;
}

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        DELETE FROM player_session_matches
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
          AND max_players = :maxPlayers
          AND entry_fee_wei = :entryFeeWei
    ");

    $stmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
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
    echo json_encode(["error" => "Failed to deactivate match bucket"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => "match_bucket_deactivated",
    "updated" => $stmt->rowCount() > 0
]);
