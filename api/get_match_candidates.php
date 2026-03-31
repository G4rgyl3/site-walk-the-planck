<?php

header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");

require_once __DIR__ . "/db.php";
require_once __DIR__ . "/session_cleanup.php";
require_once __DIR__ . "/matchmaking_events.php";

$walletAddress = strtolower(trim((string)($_GET["walletAddress"] ?? "")));
$sessionToken = trim((string)($_GET["sessionToken"] ?? ""));

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
$cleanupResult = cleanupInactiveMatchmakingSessions($pdo, $liveWindowSeconds);
foreach (($cleanupResult["events"] ?? array()) as $eventPayload) {
    publishMatchmakingEvent(MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED, $eventPayload);
}

$selfSql = "
    SELECT
        pmp_self.max_players,
        pmp_self.entry_fee_wei
    FROM player_match_preferences pmp_self
    INNER JOIN player_sessions ps_self
        ON ps_self.wallet_address = pmp_self.wallet_address
    WHERE pmp_self.wallet_address = :wallet
      AND pmp_self.session_token = :sessionToken
      AND (
            ps_self.session_token = pmp_self.session_token
            AND ps_self.is_matchmaking = 1
            AND ps_self.last_seen >= (NOW() - INTERVAL :live_window SECOND)
          )
    GROUP BY pmp_self.max_players, pmp_self.entry_fee_wei
";

$queuedSql = "
    SELECT
        pmp.max_players,
        pmp.entry_fee_wei,
        COUNT(DISTINCT ps.wallet_address) AS queued_count
    FROM player_sessions ps
    INNER JOIN player_match_preferences pmp
        ON pmp.wallet_address = ps.wallet_address
       AND pmp.session_token = ps.session_token
    WHERE ps.is_matchmaking = 1
      AND ps.last_seen >= (NOW() - INTERVAL :live_window SECOND)
    GROUP BY pmp.max_players, pmp.entry_fee_wei
";

$selfStmt = $pdo->prepare($selfSql);
$selfStmt->bindValue(":wallet", $walletAddress, PDO::PARAM_STR);
$selfStmt->bindValue(":sessionToken", $sessionToken, PDO::PARAM_STR);
$selfStmt->bindValue(":live_window", $liveWindowSeconds, PDO::PARAM_INT);
$selfStmt->execute();
$selfRows = $selfStmt->fetchAll();

$queuedStmt = $pdo->prepare($queuedSql);
$queuedStmt->bindValue(":live_window", $liveWindowSeconds, PDO::PARAM_INT);
$queuedStmt->execute();
$queuedRows = $queuedStmt->fetchAll();

$queuedCounts = [];
foreach ($queuedRows as $row) {
    $key = $row["max_players"] . ":" . $row["entry_fee_wei"];
    $queuedCounts[$key] = (int)$row["queued_count"];
}

$matches = [];
foreach ($selfRows as $row) {
    $matches[] = [
        "maxPlayers" => (int)$row["max_players"],
        "entryFeeWei" => (string)$row["entry_fee_wei"],
        "queuedCount" => $queuedCounts[$row["max_players"] . ":" . $row["entry_fee_wei"]] ?? 0
    ];
}

echo json_encode([
    "status" => "ok",
    "liveWindowSeconds" => $liveWindowSeconds,
    "matches" => $matches
]);
