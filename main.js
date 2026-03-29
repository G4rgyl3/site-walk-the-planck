import { initMatchmakingController } from "./features/matchmaking/controller.js";
import { initPlaybackController } from "./features/playback/controller.js";
import { subscribeToMatchmakingEvents } from "./lib/matchmaking-events.js";

initPlaybackController();
subscribeToMatchmakingEvents();
await initMatchmakingController();
