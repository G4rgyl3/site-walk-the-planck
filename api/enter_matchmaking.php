<?php

header("Content-Type: application/json");

require_once __DIR__ . "/db.php";

$raw = file_get_contents("php://input");
$input = json_decode($raw, true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON"]);
    exit;
}

$walletAddress = strtolower(trim($input["walletAddress"] ?? ""));
$sessionToken = trim((string)($input["sessionToken"] ?? ""));
$matchSizes = $input["matchSizes"] ?? [];
$entryFees = $input["entryFeesWei"] ?? [];

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

try {
    $pdo->beginTransaction();

    // upsert session
    $sql = "
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
            1,
            NULL,
            NULL,
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            session_token = VALUES(session_token),
            is_matchmaking = 1,
            selected_match_id = NULL,
            last_seen = NOW();
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
    ]);

    // clear old preferences
    $stmt = $pdo->prepare("
        DELETE FROM player_match_preferences
        WHERE wallet_address = :wallet
        AND session_token = :sessionToken
    ");
    $stmt->execute([
        ":wallet" => $walletAddress,
        ":sessionToken" => $sessionToken
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
    ");

    foreach ($matchSizes as $size) {
        foreach ($entryFees as $fee) {
            $insert->execute([
                ":wallet" => $walletAddress,
                ":token" => $sessionToken,
                ":max_players" => (int)$size,
                ":entry_fee" => (string)$fee
            ]);
        }
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
    "status" => "matchmaking_entered",
    "preferences" => [
        "matchSizes" => $matchSizes,
        "entryFeesWei" => $entryFees
    ]
]);