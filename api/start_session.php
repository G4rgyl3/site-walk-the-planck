<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";
require_once __DIR__ . "/session_cleanup.php";
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

$liveWindowSeconds = 30;

try {
    $cleanupResult = cleanupInactiveMatchmakingSessions($pdo, $liveWindowSeconds);
    foreach (($cleanupResult["events"] ?? array()) as $eventPayload) {
        publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, $eventPayload);
    }

    $pdo->beginTransaction();

    $existingSessionStmt = $pdo->prepare("
        SELECT session_token, is_matchmaking, last_seen
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
    $previousSessionIsLiveMatchmaking =
        $existingSession &&
        (int)($existingSession["is_matchmaking"] ?? 0) === 1 &&
        !empty($existingSession["last_seen"]) &&
        (strtotime((string)$existingSession["last_seen"]) >= (time() - $liveWindowSeconds));

    if ($previousSessionToken && $previousSessionToken !== $sessionToken) {
        if ($previousSessionIsLiveMatchmaking) {
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
        } else {
            $stalePreferenceBucketsStmt = $pdo->prepare("
                SELECT max_players, entry_fee_wei
                FROM player_match_preferences
                WHERE wallet_address = :wallet
                  AND session_token = :previousSessionToken
            ");
            $stalePreferenceBucketsStmt->execute([
                ":wallet" => $walletAddress,
                ":previousSessionToken" => $previousSessionToken
            ]);
            $stalePreferenceBuckets = array_map(
                function ($bucket) {
                    return array(
                        "maxPlayers" => (int)($bucket["max_players"] ?? 0),
                        "entryFeeWei" => (string)($bucket["entry_fee_wei"] ?? "")
                    );
                },
                $stalePreferenceBucketsStmt->fetchAll()
            );

            $pdo->prepare("
                DELETE FROM player_match_preferences
                WHERE wallet_address = :wallet
                  AND session_token = :previousSessionToken
            ")->execute([
                ":wallet" => $walletAddress,
                ":previousSessionToken" => $previousSessionToken
            ]);

            if (!empty($stalePreferenceBuckets)) {
                publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, [
                    "action" => "left",
                    "walletAddress" => $walletAddress,
                    "sessionToken" => $previousSessionToken,
                    "operationId" => null,
                    "buckets" => $stalePreferenceBuckets
                ]);
            }
        }

        $pdo->prepare("
            UPDATE player_session_matches
            SET session_token = :nextSessionToken
            WHERE wallet_address = :wallet
              AND session_token = :previousSessionToken
        ")->execute([
            ":nextSessionToken" => $sessionToken,
            ":wallet" => $walletAddress,
            ":previousSessionToken" => $previousSessionToken
        ]);

        $pdo->prepare("
            UPDATE player_current_matches
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
            last_seen
        ) VALUES (
            :wallet,
            :sessionToken,
            0,
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            session_token = VALUES(session_token),
            is_matchmaking = is_matchmaking,
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
