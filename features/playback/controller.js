import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { refreshActiveMatchStates } from "../../matchmaking.js";
import {
    getActiveMatchStates,
    getActiveMatchStatesHydrated,
    getCurrentGameMatch,
    getCurrentGameMatchHydrated,
    getSessionTokenValue,
    subscribe as subscribeAppState
} from "../../state/app-state.js";
import { dismissCurrentGameMatch } from "../../matchmaking.js";
import {
    playbackBackdrop,
    playbackClipMeta,
    playbackClipNote,
    playbackEmpty,
    playbackExplorerBtn,
    playbackPanel,
    playbackPrimaryBtn,
    playbackSkipBtn,
    playbackSecondaryBtn,
    playbackShell,
    playbackStageKicker,
    playbackStageSummary,
    playbackStageTitle,
    playbackTransition,
    playbackVideo,
    playbackVideoOverlay
} from "../../ui/dom.js";
import { getEntropyExplorerUrl } from "../../lib/entropy-explorer.js";
import { PLAYBACK_ENTRY_IDS, getPlaybackMatchById } from "./library.js";

let activeFlowMatchId = null;
let revealStartedMatchId = null;
let revealCompletedMatchId = null;
let dismissedThroughMatchId = 0;
let revealCompletionTimerId = null;
let suspenseTransitionTimerId = null;
let loserSequenceStepByMatchId = new Map();
let playbackTransitionTimerId = null;
let playbackMatchRefreshIntervalId = null;
let previousRenderedMode = "hidden";
let playbackUnlocked = false;
let playbackTrackingKey = "";
let playbackTrackingInitialized = false;
let playbackBaselineMatchIds = new Set();
let playbackShownMatchIds = new Set();
const PLAYBACK_STATE_CLASSES = [
    "state-turn-ready",
    "state-turn-playing",
    "state-turn-waiting",
    "state-winner",
    "state-loser-intro",
    "state-loser-finale"
];
const LOSER_TAUNTS = [
    "Arrr... ye sailed with Chainlink, did ye? Then mark me words, ye be doomed to drift the seas with sluggish signals and cursed, laggin' data fer all eternity!",
    "Arrr... ye dared turn down a grog with Pepito? A foolish choice, ye scallywag! Now the sea claims ye. Off ye go, straight to the sharks, ye fresh chum!",
    "Arrr... ye mocked Captain Planck fer droppin' her loot too soon, did ye? Bold... and foolish! Now she sends ye straight to the briny deep. Enjoy yer watery grave, ye bilge-suckin' fool!",
    "Arrr... ye praised Aster's Google Pixel, did ye? A grave mistake, ye soft-bellied fool! Captain Planck won't stand fer such nonsense. Off the ship with ye, to a swift and salty death in the depths below!"
];

function getEntry(entryId) {
    return getPlaybackMatchById(entryId);
}

function getMatchIdNumber(match) {
    return Number(match?.id ?? 0);
}

function getPlaybackTrackingKey() {
    const walletAddress = (getWalletState().account || "").toLowerCase();
    const sessionToken = String(getSessionTokenValue() || "");

    if (!walletAddress || !sessionToken) {
        return "";
    }

    return `${walletAddress}:${sessionToken}`;
}

function getPlaybackShownStorageKey(trackingKey) {
    return `wtp:playback-shown:${trackingKey}`;
}

function readShownMatchIds(trackingKey) {
    if (!trackingKey) {
        return new Set();
    }

    try {
        const raw = window.sessionStorage.getItem(getPlaybackShownStorageKey(trackingKey));
        if (!raw) {
            return new Set();
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return new Set();
        }

        return new Set(parsed.map((value) => String(value)));
    } catch (error) {
        return new Set();
    }
}

function writeShownMatchIds() {
    if (!playbackTrackingKey) {
        return;
    }

    try {
        window.sessionStorage.setItem(
            getPlaybackShownStorageKey(playbackTrackingKey),
            JSON.stringify([...playbackShownMatchIds])
        );
    } catch (error) {
        // Ignore storage failures and keep tracking in memory.
    }
}

function resetPlaybackTracking() {
    playbackTrackingKey = "";
    playbackTrackingInitialized = false;
    playbackBaselineMatchIds = new Set();
    playbackShownMatchIds = new Set();
}

function ensurePlaybackTracking(matches = getActiveMatchStates()) {
    const nextTrackingKey = getPlaybackTrackingKey();

    if (!nextTrackingKey) {
        resetPlaybackTracking();
        return false;
    }

    if (nextTrackingKey !== playbackTrackingKey) {
        playbackTrackingKey = nextTrackingKey;
        playbackTrackingInitialized = false;
        playbackBaselineMatchIds = new Set();
        playbackShownMatchIds = readShownMatchIds(nextTrackingKey);
    }

    if (!getActiveMatchStatesHydrated() && !getCurrentGameMatchHydrated()) {
        return false;
    }

    if (!playbackTrackingInitialized) {
        const baselineMatchIds = new Set(
            matches
                .map((match) => String(match?.id ?? ""))
                .filter(Boolean)
        );
        const currentGameMatchId = String(
            getCurrentGameMatch()?.id ??
            getCurrentGameMatch()?.matchId ??
            ""
        );
        if (currentGameMatchId) {
            baselineMatchIds.add(currentGameMatchId);
        }
        playbackBaselineMatchIds = baselineMatchIds;
        playbackTrackingInitialized = true;
    }

    return true;
}

function hasPlaybackWindowBeenShown(matchId) {
    const normalizedMatchId = String(matchId || "");

    if (!normalizedMatchId) {
        return false;
    }

    return (
        playbackBaselineMatchIds.has(normalizedMatchId) ||
        playbackShownMatchIds.has(normalizedMatchId)
    );
}

function markPlaybackWindowShown(matchId) {
    const normalizedMatchId = String(matchId || "");

    if (!normalizedMatchId || playbackShownMatchIds.has(normalizedMatchId)) {
        return;
    }

    playbackShownMatchIds.add(normalizedMatchId);
    writeShownMatchIds();
}

function getEligibleMatch(matches = getActiveMatchStates()) {
    if (!ensurePlaybackTracking(matches)) {
        return null;
    }

    const eligiblePlayerMatch = matches.find((match) => {
        const matchId = getMatchIdNumber(match);

        if (!matchId || matchId <= dismissedThroughMatchId) {
            return false;
        }

        if (hasPlaybackWindowBeenShown(match.id)) {
            return false;
        }

        return (
            Number(match.statusCode) === 2 ||
            Number(match.statusCode) === 1 ||
            (Number(match.statusCode) === 0 && Number(match.playerCount) >= Number(match.maxPlayers))
        );
    }) ?? null;

    if (eligiblePlayerMatch) {
        return eligiblePlayerMatch;
    }

    const currentGameMatch = getCurrentGameMatch();
    const currentGameMatchId = getMatchIdNumber(currentGameMatch);
    if (
        !currentGameMatch ||
        !currentGameMatchId ||
        currentGameMatchId <= dismissedThroughMatchId ||
        hasPlaybackWindowBeenShown(currentGameMatch.id)
    ) {
        return null;
    }

    return {
        ...currentGameMatch,
        id: String(currentGameMatch.id ?? currentGameMatch.matchId ?? ""),
        matchId: String(currentGameMatch.matchId ?? currentGameMatch.id ?? ""),
        maxPlayers: Number(currentGameMatch.maxPlayers ?? 0),
        playerCount: Number(currentGameMatch.playerCount ?? currentGameMatch.maxPlayers ?? 0),
        entryFeeWei: String(currentGameMatch.entryFeeWei ?? ""),
        statusCode: Number(currentGameMatch.statusCode ?? 0),
        isClaimable: false,
        isRefundable: false,
        loser: ""
    };
}

function getCurrentMatch() {
    const matches = getActiveMatchStates();
    const activeMatch = matches.find((match) => String(match.id) === String(activeFlowMatchId)) ?? null;

    if (activeMatch) {
        return activeMatch;
    }

    const currentGameMatch = getCurrentGameMatch();
    if (currentGameMatch && String(currentGameMatch.id ?? currentGameMatch.matchId ?? "") === String(activeFlowMatchId)) {
        return {
            ...currentGameMatch,
            id: String(currentGameMatch.id ?? currentGameMatch.matchId ?? ""),
            matchId: String(currentGameMatch.matchId ?? currentGameMatch.id ?? ""),
            maxPlayers: Number(currentGameMatch.maxPlayers ?? 0),
            playerCount: Number(currentGameMatch.playerCount ?? currentGameMatch.maxPlayers ?? 0),
            entryFeeWei: String(currentGameMatch.entryFeeWei ?? ""),
            statusCode: Number(currentGameMatch.statusCode ?? 0),
            isClaimable: false,
            isRefundable: false,
            loser: ""
        };
    }

    const eligibleMatch = getEligibleMatch(matches);
    if (eligibleMatch) {
        activeFlowMatchId = String(eligibleMatch.id);
        revealStartedMatchId = null;
        revealCompletedMatchId = null;
        markPlaybackWindowShown(eligibleMatch.id);
    }

    return eligibleMatch;
}

function getMatchById(matchId, matches = getActiveMatchStates()) {
    return matches.find((match) => String(match.id) === String(matchId)) ?? null;
}

function isWinner(match) {
    const walletAddress = (getWalletState().account || "").toLowerCase();
    if (!match || !walletAddress || Number(match.statusCode) !== 2) {
        return false;
    }

    const loser = String(match.loser || "").toLowerCase();
    return !loser || loser !== walletAddress;
}

function isLoser(match) {
    const walletAddress = (getWalletState().account || "").toLowerCase();
    if (!match || !walletAddress || Number(match.statusCode) !== 2) {
        return false;
    }

    return String(match.loser || "").toLowerCase() === walletAddress;
}

function getLoserTaunt(match) {
    const matchId = Math.max(1, getMatchIdNumber(match));
    return LOSER_TAUNTS[(matchId - 1) % LOSER_TAUNTS.length];
}

function getPanelMode(match) {
    if (!match) {
        return "hidden";
    }

    const matchId = String(match.id);
    const revealStarted = matchId === String(revealStartedMatchId);
    const revealCompleted = matchId === String(revealCompletedMatchId);

    if (!revealStarted) {
        return "turn_ready";
    }

    if (!revealCompleted) {
        return "turn_playing";
    }

    if (suspenseTransitionTimerId) {
        return "turn_waiting";
    }

    if (Number(match.statusCode) === 2) {
        if (isLoser(match)) {
            const loserStep = loserSequenceStepByMatchId.get(String(match.id)) ?? 0;
            return loserStep > 0 ? "loser_finale" : "loser_intro";
        }

        return "winner";
    }

    return "turn_waiting";
}

function getModeConfig(mode, match) {
    switch (mode) {
    case "turn_ready":
        return {
            entry: getEntry(PLAYBACK_ENTRY_IDS.turn),
            kicker: "Crew Ready",
            title: `Match #${match.id} is ready to sail`,
            summary: "Your crew is assembled. Step forward to begin the fate sequence.",
            note: "Once the sea decides, this window will roll straight into the outcome.",
            primaryLabel: "Walk the Planck",
            primaryAction: "start_turn",
            secondaryLabel: "",
            secondaryAction: "",
            autoplay: false,
            loop: false
        };
    case "turn_playing":
        return {
            entry: getEntry(PLAYBACK_ENTRY_IDS.turn),
            kicker: "Fate In Motion",
            title: `Walking the Planck in match #${match.id}`,
            summary: "Hold steady while the ritual plays and the sea weighs your luck.",
            note: "Stay with it. The outcome will take the helm as soon as the match resolves.",
            primaryLabel: "",
            primaryAction: "",
            secondaryLabel: "",
            secondaryAction: "",
            autoplay: true,
            loop: false
        };
    case "turn_waiting":
        return {
            entry: getEntry(PLAYBACK_ENTRY_IDS.turn),
            kicker: "Hold Fast",
            title: `Match #${match.id} is awaiting its fate`,
            summary: "The walk is done. Now the sea decides who stays aboard.",
            note: "The outcome clip will begin the moment the result is known.",
            primaryLabel: "",
            primaryAction: "",
            secondaryLabel: "",
            secondaryAction: "",
            autoplay: false,
            loop: false
        };
    case "winner":
        return {
            entry: getEntry(PLAYBACK_ENTRY_IDS.winner),
            kicker: "Victory",
            title: `You survived match #${match.id}`,
            summary: "Fortune favored your crew. Claim your spoils when you are ready.",
            note: match.isClaimable
                ? "Your spoils are ready to be claimed."
                : "This result is settled and recorded on chain.",
            primaryLabel: match.isClaimable ? "Claim Spoils" : "",
            primaryAction: match.isClaimable ? "claim_match" : "",
            secondaryLabel: "Close",
            secondaryAction: "dismiss_resolved",
            autoplay: true,
            loop: true
        };
    case "loser_intro":
        return {
            entry: getEntry(PLAYBACK_ENTRY_IDS.loser),
            kicker: "Defeat",
            title: `Match #${match.id} did not go your way`,
            summary: getLoserTaunt(match),
            note: "Captain Planck is not finished with ye yet. Stay with the sequence.",
            primaryLabel: "",
            primaryAction: "",
            secondaryLabel: "",
            secondaryAction: "",
            autoplay: true,
            loop: false
        };
    case "loser_finale":
        return {
            entry: getEntry(PLAYBACK_ENTRY_IDS.loser),
            kicker: "Defeat",
            title: `Match #${match.id} did not go your way`,
            summary: match.isRefundable
                ? "The tide turned against you, but this result can still be refunded."
                : "The tide turned against you. Close this out when you are ready.",
            note: match.isRefundable
                ? "If this match is refundable, settle it here."
                : "Close this window and return to the lobby.",
            primaryLabel: match.isRefundable ? "Claim Refund" : "",
            primaryAction: match.isRefundable ? "claim_refund" : "",
            secondaryLabel: "Close",
            secondaryAction: "dismiss_resolved",
            autoplay: true,
            loop: true
        };
    case "hidden":
    default:
        return {
            entry: null,
            kicker: "",
            title: "",
            summary: "",
            note: "",
            primaryLabel: "",
            primaryAction: "",
            secondaryLabel: "",
            secondaryAction: "",
            autoplay: true,
            loop: true
        };
    }
}

function getPrimaryClip(entry, mode) {
    if (!entry || !Array.isArray(entry.clips) || entry.clips.length === 0) {
        return null;
    }

    if (mode === "loser_intro") {
        return entry.clips[0];
    }

    if (mode === "loser_finale" && entry.clips.length > 1) {
        return entry.clips[1];
    }

    return entry.clips[0];
}

function applyButtonState(button, label, action, hidden = false) {
    if (!button) return;

    if (hidden || !label || !action) {
        button.classList.add("hidden");
        button.textContent = "";
        button.dataset.action = "";
        return;
    }

    button.classList.remove("hidden");
    button.textContent = label;
    button.dataset.action = action;
}

function applyLinkButtonState(link, label, href, hidden = false) {
    if (!link) return;

    if (hidden || !label || !href) {
        link.classList.add("hidden");
        link.textContent = "";
        link.removeAttribute("href");
        return;
    }

    link.classList.remove("hidden");
    link.textContent = label;
    link.href = href;
}

function isSkipEligibleMode(mode) {
    return mode === "turn_playing" || mode === "loser_intro";
}

function attemptPlayback(video = playbackVideo) {
    if (!video) {
        return;
    }

    video.muted = false;
    video.defaultMuted = false;

    const playPromise = video.play();
    if (playPromise?.catch) {
        playPromise.catch(() => {
            if (!playbackUnlocked) {
                video.muted = true;
                video.defaultMuted = true;
                video.play().catch(() => {});
            }
        });
    }
}

function applyPlaybackVisualState(mode, isVisible) {
    if (!playbackPanel) return;

    playbackPanel.classList.remove(...PLAYBACK_STATE_CLASSES, "is-modal");
    playbackBackdrop?.classList.add("hidden");
    document.body.classList.remove("playback-modal-open");

    if (!isVisible) {
        return;
    }

    if (mode !== "hidden") {
        playbackPanel.classList.add("is-modal");
        playbackBackdrop?.classList.remove("hidden");
        document.body.classList.add("playback-modal-open");
    }

    switch (mode) {
    case "turn_ready":
        playbackPanel.classList.add("state-turn-ready");
        break;
    case "turn_playing":
        playbackPanel.classList.add("state-turn-playing");
        break;
    case "turn_waiting":
        playbackPanel.classList.add("state-turn-waiting");
        break;
    case "winner":
        playbackPanel.classList.add("state-winner");
        break;
    case "loser_intro":
        playbackPanel.classList.add("state-loser-intro");
        break;
    case "loser_finale":
        playbackPanel.classList.add("state-loser-finale");
        break;
    default:
        break;
    }
}

function clearRevealCompletionTimer() {
    if (revealCompletionTimerId) {
        window.clearTimeout(revealCompletionTimerId);
        revealCompletionTimerId = null;
    }
}

function clearSuspenseTransitionTimer() {
    if (suspenseTransitionTimerId) {
        window.clearTimeout(suspenseTransitionTimerId);
        suspenseTransitionTimerId = null;
    }
}

function clearPlaybackTransitionTimer() {
    if (playbackTransitionTimerId) {
        window.clearTimeout(playbackTransitionTimerId);
        playbackTransitionTimerId = null;
    }
}

function clearPlaybackMatchRefreshInterval() {
    if (playbackMatchRefreshIntervalId) {
        window.clearInterval(playbackMatchRefreshIntervalId);
        playbackMatchRefreshIntervalId = null;
    }
}

function shouldRefreshPlaybackMatch(match) {
    if (!match) {
        return false;
    }

    return Number(match.statusCode) !== 2;
}

function syncPlaybackMatchRefreshLoop(match) {
    if (!shouldRefreshPlaybackMatch(match)) {
        clearPlaybackMatchRefreshInterval();
        return;
    }

    if (playbackMatchRefreshIntervalId) {
        return;
    }

    playbackMatchRefreshIntervalId = window.setInterval(() => {
        void refreshActiveMatchStates();
    }, 3000);
}

function getPlaybackTransitionClass(mode) {
    if (mode === "winner") {
        return "transition-victory";
    }

    if (mode === "loser_intro" || mode === "loser_finale") {
        return "transition-defeat";
    }

    if (mode === "turn_waiting" || mode === "turn_playing") {
        return "transition-resolve";
    }

    return "";
}

function triggerPlaybackTransition(mode) {
    if (!playbackTransition) {
        return;
    }

    const transitionClass = getPlaybackTransitionClass(mode);
    playbackTransition.classList.remove(
        "is-active",
        "transition-resolve",
        "transition-victory",
        "transition-defeat",
        "hidden"
    );

    if (!transitionClass) {
        playbackTransition.classList.add("hidden");
        return;
    }

    clearPlaybackTransitionTimer();
    playbackTransition.classList.add(transitionClass);
    void playbackTransition.offsetWidth;
    playbackTransition.classList.add("is-active");
    playbackTransitionTimerId = window.setTimeout(() => {
        playbackTransition.classList.remove(
            "is-active",
            "transition-resolve",
            "transition-victory",
            "transition-defeat"
        );
        playbackTransition.classList.add("hidden");
        playbackTransitionTimerId = null;
    }, 800);
}

function completeTurnReveal(matchId) {
    if (!matchId || String(revealCompletedMatchId) === String(matchId)) {
        return;
    }

    clearRevealCompletionTimer();
    clearSuspenseTransitionTimer();
    revealCompletedMatchId = String(matchId);

    const match = getMatchById(matchId);
    if (match && Number(match.statusCode) === 2) {
        suspenseTransitionTimerId = window.setTimeout(() => {
            suspenseTransitionTimerId = null;
            renderPlaybackPanel();
        }, 1400);
    }

    renderPlaybackPanel();
}

function scheduleRevealCompletion(matchId) {
    if (!playbackVideo || !matchId) {
        return;
    }

    clearRevealCompletionTimer();

    const match = getMatchById(matchId);
    if (!match || Number(match.statusCode) !== 2) {
        return;
    }

    const durationSeconds = Number(playbackVideo.duration);
    const currentTime = Number(playbackVideo.currentTime);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return;
    }

    const elapsedMs = Number.isFinite(currentTime) && currentTime >= 0
        ? Math.floor(currentTime * 1000)
        : 0;
    const totalDurationMs = Math.floor(durationSeconds * 1000);
    const remainingMs = Math.max(150, totalDurationMs - elapsedMs);

    revealCompletionTimerId = window.setTimeout(() => {
        completeTurnReveal(matchId);
    }, remainingMs);
}

function renderPlaybackPanel() {
    if (!playbackPanel) return;

    const match = getCurrentMatch();
    const mode = getPanelMode(match);
    const config = getModeConfig(mode, match);
    const clip = getPrimaryClip(config.entry, mode);

    if (!config.entry || !clip) {
        clearRevealCompletionTimer();
        clearSuspenseTransitionTimer();
        clearPlaybackTransitionTimer();
        clearPlaybackMatchRefreshInterval();
        applyPlaybackVisualState("hidden", false);
        playbackPanel.classList.add("hidden");
        previousRenderedMode = "hidden";
        return;
    }

    playbackPanel.classList.remove("hidden");
    applyPlaybackVisualState(mode, true);
    playbackEmpty?.classList.add("hidden");
    playbackShell?.classList.remove("hidden");
    playbackVideoOverlay?.classList.toggle("hidden", mode !== "turn_waiting");

    if (mode !== previousRenderedMode && previousRenderedMode !== "hidden") {
        triggerPlaybackTransition(mode);
    }
    previousRenderedMode = mode;

    if (playbackStageKicker) {
        playbackStageKicker.textContent = config.kicker;
    }

    if (playbackStageTitle) {
        playbackStageTitle.textContent = config.title;
    }

    if (playbackStageSummary) {
        playbackStageSummary.textContent = config.summary;
    }

    if (playbackClipMeta) {
        const metaBits = [config.entry.badge || "State"];
        if (match?.id) metaBits.push(`Match #${match.id}`);
        playbackClipMeta.textContent = metaBits.join(" | ");
    }

    if (playbackClipNote) {
        playbackClipNote.textContent = config.note;
    }

    const entropyExplorerUrl = (mode === "winner" || mode === "loser_finale")
        ? getEntropyExplorerUrl(match)
        : "";

    applyButtonState(playbackPrimaryBtn, config.primaryLabel, config.primaryAction);
    applyButtonState(playbackSkipBtn, "Skip", "skip_playback", !isSkipEligibleMode(mode));
    applyLinkButtonState(playbackExplorerBtn, "Explore Entropy", entropyExplorerUrl, !entropyExplorerUrl);
    applyButtonState(playbackSecondaryBtn, config.secondaryLabel, config.secondaryAction);

    if (playbackVideo) {
        const nextSrc = clip.src;
        const shouldReload = playbackVideo.dataset.activeSrc !== nextSrc;
        const modeChanged = playbackVideo.dataset.mode !== mode;

        playbackVideo.controls = false;
        playbackVideo.muted = false;
        playbackVideo.defaultMuted = false;
        playbackVideo.loop = config.loop;
        playbackVideo.playsInline = true;
        playbackVideo.disablePictureInPicture = true;
        playbackVideo.controlsList = "nodownload noplaybackrate nofullscreen";
        playbackVideo.volume = 1;

        playbackVideo.dataset.mode = mode;
        playbackVideo.dataset.matchId = match?.id ? String(match.id) : "";

        if (shouldReload) {
            playbackVideo.src = nextSrc;
            playbackVideo.dataset.activeSrc = nextSrc;
            playbackVideo.load();
        }

        if (modeChanged && mode === "turn_playing" && !shouldReload) {
            playbackVideo.currentTime = 0;
        }

        if (config.autoplay && (shouldReload || playbackVideo.paused)) {
            attemptPlayback(playbackVideo);
        }

        if (!config.autoplay && shouldReload) {
            playbackVideo.pause();
            playbackVideo.currentTime = 0;
        }
    }

    if (mode === "turn_playing") {
        scheduleRevealCompletion(match.id);
    } else {
        clearRevealCompletionTimer();
    }

    syncPlaybackMatchRefreshLoop(match);
}

function handlePlaybackAction(action) {
    const match = getCurrentMatch();

    switch (action) {
    case "start_turn":
        if (!match) return;
        playbackUnlocked = true;
        activeFlowMatchId = String(match.id);
        revealStartedMatchId = String(match.id);
        revealCompletedMatchId = null;
        renderPlaybackPanel();
        return;
    case "skip_playback":
        if (!match || !playbackVideo) return;

        if (playbackVideo.dataset.mode === "turn_playing") {
            completeTurnReveal(playbackVideo.dataset.matchId || match.id);
            return;
        }

        if (playbackVideo.dataset.mode === "loser_intro") {
            loserSequenceStepByMatchId.set(String(match.id), 1);
            renderPlaybackPanel();
        }
        return;
    case "claim_match":
        if (!match) return;
        document.querySelector(`[data-claim-match-id="${match.id}"]`)?.click();
        return;
    case "claim_refund":
        if (!match) return;
        document.querySelector(`[data-refund-match-id="${match.id}"]`)?.click();
        return;
    case "dismiss_resolved":
        if (!match) return;
        dismissedThroughMatchId = Math.max(dismissedThroughMatchId, getMatchIdNumber(match));
        loserSequenceStepByMatchId.delete(String(match.id));
        activeFlowMatchId = null;
        revealStartedMatchId = null;
        revealCompletedMatchId = null;
        clearRevealCompletionTimer();
        clearSuspenseTransitionTimer();
        clearPlaybackTransitionTimer();
        playbackVideo?.pause();
        void dismissCurrentGameMatch(match.id);
        renderPlaybackPanel();
        return;
    default:
        return;
    }
}

function bindPlaybackEvents() {
    playbackPrimaryBtn?.addEventListener("click", () => {
        handlePlaybackAction(playbackPrimaryBtn.dataset.action);
    });

    playbackSkipBtn?.addEventListener("click", () => {
        handlePlaybackAction(playbackSkipBtn.dataset.action);
    });

    playbackSecondaryBtn?.addEventListener("click", () => {
        handlePlaybackAction(playbackSecondaryBtn.dataset.action);
    });

    playbackVideo?.addEventListener("ended", () => {
        if (playbackVideo.dataset.mode === "turn_playing") {
            completeTurnReveal(playbackVideo.dataset.matchId || null);
            return;
        }

        if (playbackVideo.dataset.mode === "loser_intro") {
            const matchId = playbackVideo.dataset.matchId || null;
            if (!matchId) return;

            loserSequenceStepByMatchId.set(String(matchId), 1);
            renderPlaybackPanel();
        }
    });

    playbackVideo?.addEventListener("loadedmetadata", () => {
        if (playbackVideo.dataset.mode !== "turn_playing") {
            return;
        }

        const currentMatch = getCurrentMatch();
        if (currentMatch) {
            scheduleRevealCompletion(currentMatch.id);
        }
    });

    playbackVideo?.addEventListener("timeupdate", () => {
        if (playbackVideo.dataset.mode !== "turn_playing") {
            return;
        }

        if (!Number.isFinite(playbackVideo.duration) || playbackVideo.duration <= 0) {
            return;
        }

        if ((playbackVideo.duration - playbackVideo.currentTime) <= 0.2) {
            completeTurnReveal(playbackVideo.dataset.matchId || null);
        }
    });
}

function initPlaybackController() {
    bindPlaybackEvents();
    subscribeAppState(() => {
        ensurePlaybackTracking();
        const currentMatch = getCurrentMatch();
        if (!currentMatch) {
            activeFlowMatchId = null;
            revealStartedMatchId = null;
            revealCompletedMatchId = null;
            clearRevealCompletionTimer();
            clearSuspenseTransitionTimer();
            clearPlaybackTransitionTimer();
            clearPlaybackMatchRefreshInterval();
        }

        if (currentMatch && Number(currentMatch.statusCode) !== 2) {
            loserSequenceStepByMatchId.delete(String(currentMatch.id));
        }

        renderPlaybackPanel();
    });
    renderPlaybackPanel();
}

export {
    initPlaybackController,
    renderPlaybackPanel
};
