<?php

function cleanupInactiveMatchmakingSessions($pdo, $liveWindowSeconds = 30)
{
    $selectStaleSessionsSql = "
        SELECT
            ps.wallet_address,
            ps.session_token
        FROM player_sessions ps
        LEFT JOIN player_session_matches psm
            ON BINARY psm.wallet_address = BINARY ps.wallet_address
           AND BINARY psm.session_token = BINARY ps.session_token
           AND psm.state = 'active'
        LEFT JOIN player_current_matches pcm
            ON BINARY pcm.wallet_address = BINARY ps.wallet_address
           AND BINARY pcm.session_token = BINARY ps.session_token
        WHERE ps.is_matchmaking = 1
          AND ps.last_seen < (NOW() - INTERVAL {$liveWindowSeconds} SECOND)
          AND psm.wallet_address IS NULL
          AND pcm.wallet_address IS NULL
    ";

    $deletedPreferenceRows = 0;
    $deletedSessionRows = 0;
    $cleanupEvents = array();

    $pdo->beginTransaction();

    try {
        $selectStaleSessionsStmt = $pdo->query($selectStaleSessionsSql);
        $staleSessions = $selectStaleSessionsStmt->fetchAll();

        if (!empty($staleSessions)) {
            $deletePreferenceStmt = $pdo->prepare("
                DELETE FROM player_match_preferences
                WHERE wallet_address = :wallet
                  AND session_token = :sessionToken
            ");
            $deleteSessionStmt = $pdo->prepare("
                DELETE FROM player_sessions
                WHERE wallet_address = :wallet
                  AND session_token = :sessionToken
            ");
            $selectPreferenceBucketsStmt = $pdo->prepare("
                SELECT max_players, entry_fee_wei
                FROM player_match_preferences
                WHERE wallet_address = :wallet
                  AND session_token = :sessionToken
            ");

            foreach ($staleSessions as $staleSession) {
                $params = array(
                    ":wallet" => strtolower((string)$staleSession["wallet_address"]),
                    ":sessionToken" => (string)$staleSession["session_token"]
                );

                $selectPreferenceBucketsStmt->execute($params);
                $preferenceBuckets = array_map(
                    function ($bucket) {
                        return array(
                            "maxPlayers" => (int)($bucket["max_players"] ?? 0),
                            "entryFeeWei" => (string)($bucket["entry_fee_wei"] ?? "")
                        );
                    },
                    $selectPreferenceBucketsStmt->fetchAll()
                );

                if (!empty($preferenceBuckets)) {
                    $cleanupEvents[] = array(
                        "action" => "left",
                        "walletAddress" => $params[":wallet"],
                        "sessionToken" => $params[":sessionToken"],
                        "operationId" => null,
                        "buckets" => $preferenceBuckets
                    );
                }

                $deletePreferenceStmt->execute($params);
                $deletedPreferenceRows += $deletePreferenceStmt->rowCount();

                $deleteSessionStmt->execute($params);
                $deletedSessionRows += $deleteSessionStmt->rowCount();
            }
        }

        $pdo->commit();
    } catch (Exception $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $error;
    }

    return array(
        "deletedPreferenceRows" => $deletedPreferenceRows,
        "deletedSessionRows" => $deletedSessionRows,
        "events" => $cleanupEvents
    );
}
