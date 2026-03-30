CREATE TABLE `player_current_matches` (
  `wallet_address` char(42) NOT NULL,
  `session_token` varchar(64) NOT NULL,
  `match_id` bigint unsigned NOT NULL,
  `max_players` tinyint unsigned NOT NULL,
  `entry_fee_wei` varchar(32) NOT NULL,
  `state` varchar(32) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`wallet_address`),
  KEY `idx_player_current_matches_match_id` (`match_id`),
  KEY `idx_player_current_matches_session_token` (`session_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
