<?php

header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");

require_once __DIR__ . "/db.php";

$allowedPlayerCounts = [2, 3, 4, 5];
$allowedEntryFees = [
    "500000000000000",
    "1000000000000000",
    "2500000000000000",
    "5000000000000000",
    "10000000000000000"
];

$liveWindowSeconds = 30;

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

$committedSql = "
    SELECT
        psm.max_players,
        psm.entry_fee_wei,
        COUNT(DISTINCT psm.wallet_address) AS committed_count
    FROM player_session_matches psm
    WHERE psm.state NOT IN ('resolved', 'refunded', 'cancelled')
    GROUP BY psm.max_players, psm.entry_fee_wei
";

$queuedStmt = $pdo->prepare($queuedSql);
$queuedStmt->bindValue(":live_window", $liveWindowSeconds, PDO::PARAM_INT);
$queuedStmt->execute();
$queuedRows = $queuedStmt->fetchAll();

$committedStmt = $pdo->prepare($committedSql);
$committedStmt->execute();
$committedRows = $committedStmt->fetchAll();

$queuedCounts = [];
foreach ($queuedRows as $row) {
    $key = $row["max_players"] . ":" . $row["entry_fee_wei"];
    $queuedCounts[$key] = (int)$row["queued_count"];
}

$committedCounts = [];
foreach ($committedRows as $row) {
    $key = $row["max_players"] . ":" . $row["entry_fee_wei"];
    $committedCounts[$key] = (int)$row["committed_count"];
}

$queues = [];
foreach ($allowedPlayerCounts as $maxPlayers) {
    foreach ($allowedEntryFees as $entryFeeWei) {
        $key = $maxPlayers . ":" . $entryFeeWei;
        $queuedCount = $queuedCounts[$key] ?? 0;
        $committedCount = $committedCounts[$key] ?? 0;
        $readyCount = $queuedCount + $committedCount;

        $queues[] = [
            "maxPlayers" => $maxPlayers,
            "entryFeeWei" => $entryFeeWei,
            "queuedCount" => $queuedCount,
            "committedCount" => $committedCount,
            "readyCount" => $readyCount,
            "matchable" => $readyCount >= $maxPlayers
        ];
    }
}

echo json_encode([
    "status" => "ok",
    "liveWindowSeconds" => $liveWindowSeconds,
    "queues" => $queues
]);
