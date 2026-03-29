<?php

const MATCHMAKING_EVENT_LOG_PATH = __DIR__ . "/../state/matchmaking-events.ndjson";
const MATCHMAKING_EVENT_TYPE_QUEUE_PREFERENCES_CHANGED = "queue_preferences_changed";

function ensureMatchmakingEventLogExists(): void
{
    $directory = dirname(MATCHMAKING_EVENT_LOG_PATH);
    if (!is_dir($directory)) {
        mkdir($directory, 0777, true);
    }

    if (!file_exists(MATCHMAKING_EVENT_LOG_PATH)) {
        touch(MATCHMAKING_EVENT_LOG_PATH);
    }
}

function createMatchmakingEventId(): string
{
    return sprintf(
        "%d-%04d",
        (int) floor(microtime(true) * 1000),
        random_int(1000, 9999)
    );
}

function publishMatchmakingEvent(string $type, array $payload = []): array
{
    ensureMatchmakingEventLogExists();

    $event = [
        "id" => createMatchmakingEventId(),
        "type" => $type,
        "emittedAt" => gmdate("c"),
        "payload" => $payload
    ];

    file_put_contents(
        MATCHMAKING_EVENT_LOG_PATH,
        json_encode($event, JSON_UNESCAPED_SLASHES) . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );

    return $event;
}

function readMatchmakingEventsSince(?string $lastEventId, int $limit = 100): array
{
    ensureMatchmakingEventLogExists();

    $lines = @file(MATCHMAKING_EVENT_LOG_PATH, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines) || count($lines) === 0) {
        return [];
    }

    $events = [];
    foreach ($lines as $line) {
        $event = json_decode($line, true);
        if (is_array($event) && isset($event["id"], $event["type"])) {
            $events[] = $event;
        }
    }

    if ($lastEventId) {
        $startIndex = null;
        foreach ($events as $index => $event) {
            if (($event["id"] ?? null) === $lastEventId) {
                $startIndex = $index + 1;
            }
        }

        if ($startIndex !== null) {
            $events = array_slice($events, $startIndex);
        }
    }

    if (count($events) > $limit) {
        $events = array_slice($events, -$limit);
    }

    return $events;
}

function getLatestMatchmakingEventId(): ?string
{
    $events = readMatchmakingEventsSince(null, 1);
    if (count($events) === 0) {
        return null;
    }

    return (string)($events[0]["id"] ?? "");
}
