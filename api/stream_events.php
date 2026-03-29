<?php

header("Content-Type: text/event-stream");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");
header("X-Accel-Buffering: no");

require_once __DIR__ . "/matchmaking_events.php";

@set_time_limit(0);
@ini_set("output_buffering", "off");
@ini_set("zlib.output_compression", "0");

while (ob_get_level() > 0) {
    ob_end_flush();
}

$lastEventId = trim((string)($_SERVER["HTTP_LAST_EVENT_ID"] ?? ""));
if ($lastEventId === "") {
    $lastEventId = (string)(getLatestMatchmakingEventId() ?? "");
}

$startedAt = time();
$maxRuntimeSeconds = 25;

echo ": matchmaking event stream\n\n";
@flush();

while (!connection_aborted() && (time() - $startedAt) < $maxRuntimeSeconds) {
    $events = readMatchmakingEventsSince($lastEventId, 100);

    foreach ($events as $event) {
        $lastEventId = (string)($event["id"] ?? "");
        $eventType = (string)($event["type"] ?? "message");
        $payload = [
            "id" => $event["id"] ?? null,
            "type" => $eventType,
            "emittedAt" => $event["emittedAt"] ?? null,
            "payload" => $event["payload"] ?? new stdClass()
        ];

        echo "id: " . $lastEventId . "\n";
        echo "event: " . $eventType . "\n";
        echo "data: " . json_encode($payload, JSON_UNESCAPED_SLASHES) . "\n\n";
    }

    echo ": keepalive\n\n";
    @flush();
    sleep(1);
}
