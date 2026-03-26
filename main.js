import { initMatchmakingController } from "./features/matchmaking/controller.js";
import { initPlaybackController } from "./features/playback/controller.js";

initPlaybackController();
await initMatchmakingController();
