<?php

header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");

require_once __DIR__ . "/db.php";

$allowedPlayerCounts = [2, 3, 4, 5];
$allowedEntryFees = [
    "500000000000000",    // 0.0005 ETH
    "1000000000000000",   // 0.001 ETH
    "2500000000000000",   // 0.0025 ETH
    "5000000000000000",   // 0.005 ETH
    "10000000000000000"   // 0.01 ETH
];

$liveWindowSeconds = 30;

$sql = "
    SELECT
        pmp.max_players,
        pmp.entry_fee_wei,
        COUNT(*) AS ready_count
    FROM player_sessions ps
    INNER JOIN player_match_preferences pmp
        ON pmp.wallet_address = ps.wallet_address
       AND pmp.session_token = ps.session_token
    WHERE ps.is_matchmaking = 1
      AND ps.last_seen >= (NOW() - INTERVAL :live_window SECOND)
    GROUP BY pmp.max_players, pmp.entry_fee_wei
";

$stmt = $pdo->prepare($sql);
$stmt->bindValue(":live_window", $liveWindowSeconds, PDO::PARAM_INT);
$stmt->execute();

$rows = $stmt->fetchAll();

$counts = [];
foreach ($rows as $row) {
    $key = $row["max_players"] . ":" . $row["entry_fee_wei"];
    $counts[$key] = (int)$row["ready_count"];
}

$queues = [];
foreach ($allowedPlayerCounts as $maxPlayers) {
    foreach ($allowedEntryFees as $entryFeeWei) {
        $key = $maxPlayers . ":" . $entryFeeWei;
        $readyCount = $counts[$key] ?? 0;

        $queues[] = [
            "maxPlayers" => $maxPlayers,
            "entryFeeWei" => $entryFeeWei,
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
