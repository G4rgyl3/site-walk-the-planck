<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";
require_once __DIR__ . "/matchmaking_events.php";

$raw = file_get_contents("php://input");
$input = json_decode($raw, true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON"]);
    exit;
}

$walletAddress = strtolower(trim($input["walletAddress"] ?? ""));
$sessionToken = trim((string)($input["sessionToken"] ?? ""));
$operationId = trim((string)($input["operationId"] ?? ""));
$matchSizes = $input["matchSizes"] ?? [];
$entryFees = $input["entryFeesWei"] ?? [];
$blockedCombinationsInput = $input["blockedCombinations"] ?? [];

$allowedSizes = [2,3,4,5];
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

if ($operationId !== "" && !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $operationId)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid operationId"]);
    exit;
}

if (!is_array($matchSizes) || count($matchSizes) === 0) {
    http_response_code(400);
    echo json_encode(["error" => "No match sizes selected"]);
    exit;
}

if (!is_array($entryFees) || count($entryFees) === 0) {
    http_response_code(400);
    echo json_encode(["error" => "No entry fees selected"]);
    exit;
}

// filter valid values
$matchSizes = array_values(array_filter($matchSizes, fn($v) => in_array((int)$v, $allowedSizes, true)));
$entryFees = array_values(array_filter($entryFees, fn($v) => in_array((string)$v, $allowedFees, true)));

if (count($matchSizes) === 0 || count($entryFees) === 0) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid selections"]);
    exit;
}

$blockedBucketKeys = [];
if (is_array($blockedCombinationsInput)) {
    foreach ($blockedCombinationsInput as $blockedCombination) {
        if (!is_array($blockedCombination)) {
            continue;
        }

        $blockedSize = (int)($blockedCombination["maxPlayers"] ?? 0);
        $blockedFee = (string)($blockedCombination["entryFeeWei"] ?? "");
        if (in_array($blockedSize, $allowedSizes, true) && in_array($blockedFee, $allowedFees, true)) {
            $blockedBucketKeys[$blockedSize . ":" . $blockedFee] = true;
        }
    }
}

try {
    $pdo->beginTransaction();

    $activeMatchStmt = $pdo->prepare("
        SELECT session_token
        FROM player_sessions
        WHERE wallet_address = :wallet
        LIMIT 1
        FOR UPDATE
    ");
    $activeMatchStmt->execute([
        ":wallet" => $walletAddress
    ]);

    $existingSession = $activeMatchStmt->fetch();
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

    $lockedBucketKeys = $blockedBucketKeys;
    $lockedBucketsStmt = $pdo->prepare("
        SELECT max_players, entry_fee_wei
        FROM player_session_matches
        WHERE wallet_address = :wallet
          AND session_token = :sessionToken
          AND state NOT IN ('resolved', 'refunded', 'cancelled')
    ");
    $lockedBucketsStmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    foreach ($lockedBucketsStmt->fetchAll() as $lockedBucket) {
        $key = ((int)$lockedBucket["max_players"]) . ":" . (string)$lockedBucket["entry_fee_wei"];
        $lockedBucketKeys[$key] = true;
    }

    if (count($lockedBucketKeys) > 0) {
        $lockedBucketsStmt = $pdo->prepare("
            DELETE FROM player_match_preferences
            WHERE wallet_address = ?
              AND session_token = ?
              AND CONCAT(max_players, ':', entry_fee_wei) NOT IN (" .
            implode(", ", array_fill(0, count($lockedBucketKeys), "?")) .
            ")
        ");
        $deleteParams = array_merge([$walletAddress, $sessionToken], array_keys($lockedBucketKeys));
        $lockedBucketsStmt->execute($deleteParams);
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

    $queueCombinations = [];
    $blockedCombinations = [];
    foreach ($matchSizes as $size) {
        foreach ($entryFees as $fee) {
            $key = ((int)$size) . ":" . (string)$fee;
            if (isset($lockedBucketKeys[$key])) {
                $blockedCombinations[] = [
                    "maxPlayers" => (int)$size,
                    "entryFeeWei" => (string)$fee
                ];
                continue;
            }

            $queueCombinations[$key] = [
                "maxPlayers" => (int)$size,
                "entryFeeWei" => (string)$fee
            ];
        }
    }

    $shouldMatchmake = count($queueCombinations) > 0 ? 1 : 0;

    // upsert session
    $sql = "
       INSERT INTO player_sessions (
            wallet_address,
            session_token,
            is_matchmaking,
            last_seen
        ) VALUES (
            :wallet,
            :sessionToken,
            :isMatchmaking,
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            session_token = VALUES(session_token),
            is_matchmaking = VALUES(is_matchmaking),
            last_seen = NOW();
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken,
        ":isMatchmaking" => $shouldMatchmake
    ]);

    // insert new combinations
    $insert = $pdo->prepare("
        INSERT INTO player_match_preferences (
            wallet_address,
            session_token,
            max_players,
            entry_fee_wei
        ) VALUES (
            :wallet,
            :token,
            :max_players,
            :entry_fee
        )
        ON DUPLICATE KEY UPDATE
            max_players = VALUES(max_players),
            entry_fee_wei = VALUES(entry_fee_wei)
    ");

    foreach ($queueCombinations as $combination) {
        $insert->execute([
            ":wallet" => $walletAddress,
            ":token" => $sessionToken,
            ":max_players" => $combination["maxPlayers"],
            ":entry_fee" => $combination["entryFeeWei"]
        ]);
    }

    $pdo->commit();

} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(["error" => "Failed to enter matchmaking"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => $shouldMatchmake ? "matchmaking_entered" : "active_bucket_locked",
    "preferences" => [
        "matchSizes" => $matchSizes,
        "entryFeesWei" => $entryFees
    ],
    "blockedCombinations" => $blockedCombinations
]);

publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, [
    "action" => $shouldMatchmake ? "entered" : "updated",
    "walletAddress" => $walletAddress,
    "sessionToken" => $sessionToken,
    "operationId" => $operationId !== "" ? $operationId : null,
    "buckets" => array_values($queueCombinations),
    "blockedBuckets" => $blockedCombinations
]);
