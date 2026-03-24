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
    $hasActiveMatch = $existingSession && $existingSession["active_match_id"] !== null;

    $lockedBucketKeys = [];
    if ($hasActiveMatch) {
        $lockedBucketsStmt = $pdo->prepare("
            SELECT max_players, entry_fee_wei
            FROM player_match_preferences
            WHERE wallet_address = :wallet
              AND session_token = :sessionToken
        ");
        $lockedBucketsStmt->execute([
            ":wallet" => $walletAddress,
            ":sessionToken" => $sessionToken
        ]);

        foreach ($lockedBucketsStmt->fetchAll() as $lockedBucket) {
            $key = ((int)$lockedBucket["max_players"]) . ":" . (string)$lockedBucket["entry_fee_wei"];
            $lockedBucketKeys[$key] = true;
        }
    }

    $pdo->prepare("
        UPDATE player_sessions
        SET is_matchmaking = 0,
            selected_match_id = IF(active_match_id IS NULL, NULL, selected_match_id),
            last_seen = NOW()
        WHERE wallet_address = :wallet
        AND session_token = :sessionToken
    ")->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    if (count($lockedBucketKeys) > 0) {
        $deleteSql = "
            DELETE FROM player_match_preferences
            WHERE wallet_address = ?
              AND session_token = ?
              AND CONCAT(max_players, ':', entry_fee_wei) NOT IN (" .
            implode(", ", array_fill(0, count($lockedBucketKeys), "?")) .
            ")
        ";
        $deleteParams = array_merge([$walletAddress, $sessionToken], array_keys($lockedBucketKeys));
        $stmt = $pdo->prepare($deleteSql);
        $stmt->execute($deleteParams);
    } else {
        $pdo->prepare("
            DELETE FROM player_match_preferences
            WHERE wallet_address = ?
              AND session_token = ?
        ")->execute([
            $walletAddress,
            $sessionToken
        ]);
    }

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
    "status" => $hasActiveMatch ? "matchmaking_left_active_bucket_retained" : "matchmaking_left"
]);
