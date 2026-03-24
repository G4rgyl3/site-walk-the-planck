<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";

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

    $activeMatchStmt = $pdo->prepare("
        SELECT active_match_id
        FROM player_sessions
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
        LIMIT 1
        FOR UPDATE
    ");
    $activeMatchStmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $existingSession = $activeMatchStmt->fetch();
    if ($existingSession && $existingSession["active_match_id"] !== null) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(["error" => "Player already committed to an on-chain match"]);
        exit;
    }

    $pdo->prepare("
        UPDATE player_sessions
        SET is_matchmaking = 0,
            selected_match_id = NULL,
            last_seen = NOW()
        WHERE wallet_address = :wallet
        AND session_token = :sessionToken
    ")->execute([
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
    "status" => "matchmaking_left"
]);
