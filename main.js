import { initMatchmakingController } from "./features/matchmaking/controller.js";
import { initPlaybackController } from "./features/playback/controller.js";
import { initTutorialController } from "./features/tutorial/controller.js";
import { subscribeToMatchmakingEvents } from "./lib/matchmaking-events.js";

initPlaybackController();
initTutorialController();
subscribeToMatchmakingEvents();
await initMatchmakingController();
