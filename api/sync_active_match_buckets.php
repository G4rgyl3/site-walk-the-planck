<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";

$input = json_decode(file_get_contents("php://input"), true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON"]);
    exit;
}

$buckets = $input["buckets"] ?? [];
if (!is_array($buckets)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid buckets payload"]);
    exit;
}

$desiredRows = [];
$desiredMatchIds = [];
$walletAddresses = [];
error_log("[walk-the-planck] sync_active_match_buckets received " . json_encode($buckets, JSON_UNESCAPED_SLASHES));

foreach ($buckets as $bucket) {
    if (!is_array($bucket)) {
        continue;
    }

    $matchId = trim((string)($bucket["matchId"] ?? ""));
    $maxPlayers = (int)($bucket["maxPlayers"] ?? 0);
    $entryFeeWei = trim((string)($bucket["entryFeeWei"] ?? ""));
    $players = $bucket["players"] ?? [];

    if (!preg_match('/^\d+$/', $matchId) || $maxPlayers <= 0 || !preg_match('/^\d+$/', $entryFeeWei) || !is_array($players)) {
        continue;
    }

    $desiredMatchIds[$matchId] = [
        "matchId" => $matchId,
        "maxPlayers" => $maxPlayers,
        "entryFeeWei" => $entryFeeWei
    ];

    foreach ($players as $player) {
        $walletAddress = strtolower(trim((string)$player));
        if (!preg_match('/^0x[a-f0-9]{40}$/', $walletAddress)) {
            continue;
        }

        $desiredRows[$walletAddress . "|" . $matchId] = [
            "walletAddress" => $walletAddress,
            "matchId" => $matchId,
            "maxPlayers" => $maxPlayers,
            "entryFeeWei" => $entryFeeWei
        ];
        $walletAddresses[$walletAddress] = true;
    }
}

error_log("[walk-the-planck] sync_active_match_buckets parsed " . json_encode([
    "desiredRows" => array_values($desiredRows),
    "desiredMatchIds" => array_values($desiredMatchIds),
    "walletCount" => count($walletAddresses)
], JSON_UNESCAPED_SLASHES));

try {
    $pdo->beginTransaction();

    $playerSessionTokens = [];
    if (count($walletAddresses) > 0) {
        $walletParams = array_keys($walletAddresses);
        $placeholders = implode(", ", array_fill(0, count($walletParams), "?"));

        $playerSessionsStmt = $pdo->prepare("
            SELECT wallet_address, session_token
            FROM player_sessions
            WHERE wallet_address IN ($placeholders)
        ");
        $playerSessionsStmt->execute($walletParams);
        foreach ($playerSessionsStmt->fetchAll() as $row) {
            $playerSessionTokens[strtolower($row["wallet_address"])] = (string)$row["session_token"];
        }
    }

    $existingRowsByMatch = [];
    $existingRowsStmt = $pdo->prepare("
        SELECT wallet_address, match_id, session_token
        FROM player_session_matches
        WHERE state = 'active'
    ");
    $existingRowsStmt->execute();
    foreach ($existingRowsStmt->fetchAll() as $row) {
        $matchId = (string)$row["match_id"];
        $walletAddress = strtolower($row["wallet_address"]);

        if (!isset($existingRowsByMatch[$matchId])) {
            $existingRowsByMatch[$matchId] = [];
        }

        $existingRowsByMatch[$matchId][$walletAddress] = (string)$row["session_token"];
    }

    $insertStmt = $pdo->prepare("
        INSERT INTO player_session_matches (
            wallet_address,
            session_token,
            match_id,
            max_players,
            entry_fee_wei,
            state
        ) VALUES (
            :wallet,
            :sessionToken,
            :matchId,
            :maxPlayers,
            :entryFeeWei,
            'active'
        )
        ON DUPLICATE KEY UPDATE
            session_token = VALUES(session_token),
            max_players = VALUES(max_players),
            entry_fee_wei = VALUES(entry_fee_wei),
            state = VALUES(state),
            updated_at = CURRENT_TIMESTAMP
    ");

    foreach ($desiredRows as $row) {
        $sessionToken =
            $playerSessionTokens[$row["walletAddress"]] ??
            $existingRowsByMatch[$row["matchId"]][$row["walletAddress"]] ??
            "chain-sync";

        $insertStmt->execute([
            ":wallet" => $row["walletAddress"],
            ":sessionToken" => $sessionToken,
            ":matchId" => $row["matchId"],
            ":maxPlayers" => $row["maxPlayers"],
            ":entryFeeWei" => $row["entryFeeWei"]
        ]);
    }

    foreach ($existingRowsByMatch as $matchId => $existingWalletRows) {
        if (!isset($desiredMatchIds[$matchId])) {
            $deleteMissingMatchStmt = $pdo->prepare("
                DELETE FROM player_session_matches
                WHERE match_id = :matchId
                  AND state = 'active'
            ");
            $deleteMissingMatchStmt->execute([
                ":matchId" => $matchId
            ]);
            continue;
        }

        $desiredWallets = [];
        foreach ($desiredRows as $row) {
            if ($row["matchId"] === $matchId) {
                $desiredWallets[$row["walletAddress"]] = true;
            }
        }

        foreach (array_keys($existingWalletRows) as $walletAddress) {
            if (isset($desiredWallets[$walletAddress])) {
                continue;
            }

            $deleteWalletStmt = $pdo->prepare("
                DELETE FROM player_session_matches
                WHERE match_id = :matchId
                  AND wallet_address = :wallet
                  AND state = 'active'
            ");
            $deleteWalletStmt->execute([
                ":matchId" => $matchId,
                ":wallet" => $walletAddress
            ]);
        }
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode(["error" => "Failed to sync active match buckets"]);
    exit;
}

echo json_encode([
    "success" => true,
    "status" => "active_match_buckets_synced",
    "rows" => count($desiredRows)
]);
