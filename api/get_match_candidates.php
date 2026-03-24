<?php

header("Content-Type: application/json");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");

require_once __DIR__ . "/db.php";

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

$sql = "
    SELECT
        pmp_self.max_players,
        pmp_self.entry_fee_wei,
        COUNT(*) AS ready_count
    FROM player_match_preferences pmp_self
    INNER JOIN player_sessions ps_self
        ON ps_self.wallet_address = pmp_self.wallet_address
       AND ps_self.session_token = pmp_self.session_token
    INNER JOIN player_match_preferences pmp
        ON pmp.max_players = pmp_self.max_players
       AND pmp.entry_fee_wei = pmp_self.entry_fee_wei
    INNER JOIN player_sessions ps
        ON ps.wallet_address = pmp.wallet_address
       AND ps.session_token = pmp.session_token
    WHERE pmp_self.wallet_address = :wallet
      AND pmp_self.session_token = :sessionToken
      AND (
            ps_self.active_match_id IS NOT NULL
            OR (
                ps_self.is_matchmaking = 1
                AND ps_self.last_seen >= (NOW() - INTERVAL :live_window SECOND)
            )
          )
      AND (
            ps.active_match_id IS NOT NULL
            OR (
                ps.is_matchmaking = 1
                AND ps.last_seen >= (NOW() - INTERVAL :live_window SECOND)
            )
          )
    GROUP BY pmp_self.max_players, pmp_self.entry_fee_wei
    HAVING COUNT(*) >= pmp_self.max_players
";

$stmt = $pdo->prepare($sql);
$stmt->bindValue(":live_window", $liveWindowSeconds, PDO::PARAM_INT);
$stmt->bindValue(":wallet", $walletAddress, PDO::PARAM_STR);
$stmt->bindValue(":sessionToken", $sessionToken, PDO::PARAM_STR);
$stmt->execute();

$rows = $stmt->fetchAll();

$matches = [];
foreach ($rows as $row) {
    $matches[] = [
        "maxPlayers" => (int)$row["max_players"],
        "entryFeeWei" => (string)$row["entry_fee_wei"],
        "readyCount" => (int)$row["ready_count"],
        "matchable" => ((int)$row["ready_count"] >= (int)$row["max_players"])
    ];
}

echo json_encode([
    "status" => "ok",
    "liveWindowSeconds" => $liveWindowSeconds,
    "matches" => $matches
]);
