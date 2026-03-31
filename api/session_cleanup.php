<?php

function cleanupInactiveMatchmakingSessions(PDO $pdo, int $liveWindowSeconds = 30): array
{
    $deletePreferencesSql = "
        DELETE pmp
        FROM player_match_preferences pmp
        INNER JOIN player_sessions ps
            ON ps.wallet_address = pmp.wallet_address
           AND ps.session_token = pmp.session_token
        LEFT JOIN player_session_matches psm
            ON psm.wallet_address = ps.wallet_address
           AND psm.session_token = ps.session_token
           AND psm.state = 'active'
        LEFT JOIN player_current_matches pcm
            ON pcm.wallet_address = ps.wallet_address
           AND pcm.session_token = ps.session_token
        WHERE ps.is_matchmaking = 1
          AND ps.last_seen < (NOW() - INTERVAL :live_window SECOND)
          AND psm.wallet_address IS NULL
          AND pcm.wallet_address IS NULL
    ";

    $deleteSessionsSql = "
        DELETE ps
        FROM player_sessions ps
        LEFT JOIN player_match_preferences pmp
            ON pmp.wallet_address = ps.wallet_address
           AND pmp.session_token = ps.session_token
        LEFT JOIN player_session_matches psm
            ON psm.wallet_address = ps.wallet_address
           AND psm.session_token = ps.session_token
           AND psm.state = 'active'
        LEFT JOIN player_current_matches pcm
            ON pcm.wallet_address = ps.wallet_address
           AND pcm.session_token = ps.session_token
        WHERE ps.is_matchmaking = 1
          AND ps.last_seen < (NOW() - INTERVAL :live_window SECOND)
          AND pmp.wallet_address IS NULL
          AND psm.wallet_address IS NULL
          AND pcm.wallet_address IS NULL
    ";

    $deletedPreferenceRows = 0;
    $deletedSessionRows = 0;

    $pdo->beginTransaction();

    try {
        $deletePreferencesStmt = $pdo->prepare($deletePreferencesSql);
        $deletePreferencesStmt->bindValue(":live_window", $liveWindowSeconds, PDO::PARAM_INT);
        $deletePreferencesStmt->execute();
        $deletedPreferenceRows = $deletePreferencesStmt->rowCount();

        $deleteSessionsStmt = $pdo->prepare($deleteSessionsSql);
        $deleteSessionsStmt->bindValue(":live_window", $liveWindowSeconds, PDO::PARAM_INT);
        $deleteSessionsStmt->execute();
        $deletedSessionRows = $deleteSessionsStmt->rowCount();

        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $error;
    }

    return [
        "deletedPreferenceRows" => $deletedPreferenceRows,
        "deletedSessionRows" => $deletedSessionRows
    ];
}
