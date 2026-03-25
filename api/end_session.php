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
    if ($existingSession && (int)$existingSession["active_match_count"] > 0) {
        $pdo->commit();
        echo json_encode([
            "success" => true,
            "status" => "session_retained_for_active_matches"
        ]);
        exit;
    }

    $pdo->prepare("
        DELETE FROM player_match_preferences
        WHERE wallet_address = :wallet
        AND session_token = :sessionToken
    ")->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    $pdo->prepare("
        DELETE FROM player_sessions
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
    echo json_encode(["error" => "Failed to end session"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => "session_ended"
]);
