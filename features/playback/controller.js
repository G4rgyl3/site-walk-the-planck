import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getPlayerMatches, subscribe as subscribeAppState } from "../../state/app-state.js";
import {
    playbackClipMeta,
    playbackClipNote,
    playbackEmpty,
    playbackPanel,
    playbackPrimaryBtn,
    playbackSecondaryBtn,
    playbackShell,
    playbackStageKicker,
    playbackStageSummary,
    playbackStageTitle,
    playbackVideo
} from "../../ui/dom.js";
import { PLAYBACK_ENTRY_IDS, getPlaybackMatchById } from "./library.js";

let activeFlowMatchId = null;
let revealStartedMatchId = null;
let revealCompletedMatchId = null;
let dismissedThroughMatchId = 0;
let revealCompletionTimerId = null;

function getEntry(entryId) {
    return getPlaybackMatchById(entryId);
}

function getMatchIdNumber(match) {
    return Number(match?.id ?? 0);
}

function getEligibleMatch(matches = getPlayerMatches()) {
    return matches.find((match) => {
        const matchId = getMatchIdNumber(match);

        if (!matchId || matchId <= dismissedThroughMatchId) {
            return false;
        }

        return (
            Number(match.statusCode) === 2 ||
            Number(match.statusCode) === 1 ||
            (Number(match.statusCode) === 0 && Number(match.playerCount) >= Number(match.maxPlayers))
        );
    }) ?? null;
}

function getCurrentMatch() {
    const matches = getPlayerMatches();
    const activeMatch = matches.find((match) => String(match.id) === String(activeFlowMatchId)) ?? null;

    if (activeMatch) {
        return activeMatch;
    }

    const eligibleMatch = getEligibleMatch(matches);
    if (eligibleMatch) {
        activeFlowMatchId = String(eligibleMatch.id);
        revealStartedMatchId = null;
        revealCompletedMatchId = null;
    }

    return eligibleMatch;
}

function getMatchById(matchId, matches = getPlayerMatches()) {
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

    if (Number(match.statusCode) === 2) {
        return isLoser(match) ? "loser" : "winner";
    }

    return "turn_waiting";
}

function getModeConfig(mode, match) {
    switch (mode) {
    case "turn_ready":
        return {
            entry: getEntry(PLAYBACK_ENTRY_IDS.turn),
            kicker: "Resolving Soon",
            title: `Match #${match.id} is ready`,
            summary: "Your lobby is filled. Take your ceremonial turn to begin the suspense sequence.",
            note: "This is the dramatic handoff into on-chain resolution. Once the match resolves, the outcome clip will take over automatically.",
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
            kicker: "Resolving",
            title: `Walking the Planck for match #${match.id}`,
            summary: "The cinematic turn is playing while the app watches for the on-chain result.",
            note: "Keep this window open. As soon as the contract reports resolution, the final outcome clip and close-out actions will replace this scene.",
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
            kicker: "Resolving",
            title: `Match #${match.id} is resolving`,
            summary: "Your ceremonial turn is complete. Waiting for the chain to reveal the result.",
            note: "The outcome clip will begin automatically as soon as the match resolves on chain.",
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
            summary: "The chain resolved in your favor. Claim your winnings when you are ready.",
            note: match.isClaimable
                ? "Your winnings are ready to claim."
                : "Your match is resolved and recorded on chain.",
            primaryLabel: match.isClaimable ? "Claim Winnings" : "",
            primaryAction: match.isClaimable ? "claim_match" : "",
            secondaryLabel: "Close",
            secondaryAction: "dismiss_resolved",
            autoplay: true,
            loop: true
        };
    case "loser":
        return {
            entry: getEntry(PLAYBACK_ENTRY_IDS.loser),
            kicker: "Defeat",
            title: `Match #${match.id} did not go your way`,
            summary: match.isRefundable
                ? "The chain resolved against you, but this result is refundable."
                : "The chain resolved against you. Close out the result when you are ready.",
            note: match.isRefundable
                ? "If this match is refundable, you can settle it here."
                : "Use Close to clear the cinematic window and return to the lobby view.",
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

    if (mode === "loser" && entry.clips.length > 1) {
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

function clearRevealCompletionTimer() {
    if (revealCompletionTimerId) {
        window.clearTimeout(revealCompletionTimerId);
        revealCompletionTimerId = null;
    }
}

function completeTurnReveal(matchId) {
    if (!matchId || String(revealCompletedMatchId) === String(matchId)) {
        return;
    }

    clearRevealCompletionTimer();
    revealCompletedMatchId = String(matchId);
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
        playbackPanel.classList.add("hidden");
        return;
    }

    playbackPanel.classList.remove("hidden");
    playbackEmpty?.classList.add("hidden");
    playbackShell?.classList.remove("hidden");

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

    applyButtonState(playbackPrimaryBtn, config.primaryLabel, config.primaryAction);
    applyButtonState(playbackSecondaryBtn, config.secondaryLabel, config.secondaryAction);

    if (playbackVideo) {
        const nextSrc = clip.src;
        const shouldReload = playbackVideo.dataset.activeSrc !== nextSrc;
        const modeChanged = playbackVideo.dataset.mode !== mode;

        playbackVideo.muted = true;
        playbackVideo.loop = config.loop;
        playbackVideo.playsInline = true;

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
            playbackVideo.play().catch(() => {});
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
}

function handlePlaybackAction(action) {
    const match = getCurrentMatch();

    switch (action) {
    case "start_turn":
        if (!match) return;
        activeFlowMatchId = String(match.id);
        revealStartedMatchId = String(match.id);
        revealCompletedMatchId = null;
        renderPlaybackPanel();
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
        activeFlowMatchId = null;
        revealStartedMatchId = null;
        revealCompletedMatchId = null;
        clearRevealCompletionTimer();
        playbackVideo?.pause();
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

    playbackSecondaryBtn?.addEventListener("click", () => {
        handlePlaybackAction(playbackSecondaryBtn.dataset.action);
    });

    playbackVideo?.addEventListener("ended", () => {
        if (playbackVideo.dataset.mode === "turn_playing") {
            completeTurnReveal(playbackVideo.dataset.matchId || null);
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
        const currentMatch = getCurrentMatch();
        if (!currentMatch) {
            activeFlowMatchId = null;
            revealStartedMatchId = null;
            revealCompletedMatchId = null;
            clearRevealCompletionTimer();
        }
        renderPlaybackPanel();
    });
    renderPlaybackPanel();
}

export {
    initPlaybackController,
    renderPlaybackPanel
};
