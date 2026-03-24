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

    $existingSessionStmt = $pdo->prepare("
        SELECT session_token, active_match_id
        FROM player_sessions
        WHERE wallet_address = :wallet
        LIMIT 1
        FOR UPDATE
    ");
    $existingSessionStmt->execute([
        ":wallet" => $walletAddress
    ]);

    $existingSession = $existingSessionStmt->fetch();
    $previousSessionToken = $existingSession["session_token"] ?? null;

    if ($previousSessionToken && $previousSessionToken !== $sessionToken) {
        $pdo->prepare("
            UPDATE player_match_preferences
            SET session_token = :nextSessionToken
            WHERE wallet_address = :wallet
              AND session_token = :previousSessionToken
        ")->execute([
            ":nextSessionToken" => $sessionToken,
            ":wallet" => $walletAddress,
            ":previousSessionToken" => $previousSessionToken
        ]);
    }

    $stmt = $pdo->prepare("
        INSERT INTO player_sessions (
            wallet_address,
            session_token,
            is_matchmaking,
            selected_match_id,
            active_match_id,
            last_seen
        ) VALUES (
            :wallet,
            :sessionToken,
            0,
            NULL,
            NULL,
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            session_token = VALUES(session_token),
            is_matchmaking = IF(active_match_id IS NULL, 0, is_matchmaking),
            selected_match_id = IF(active_match_id IS NULL, NULL, selected_match_id),
            active_match_id = active_match_id,
            last_seen = NOW()
    ");

    $stmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $pdo->commit();
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(["error" => "Failed to start session"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => "session_started"
]);
