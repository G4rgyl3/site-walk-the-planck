import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getIsInQueue, getPlayerMatches, subscribe as subscribeAppState } from "../../state/app-state.js";
import {
    playbackAutoBtn,
    playbackClipMeta,
    playbackClipNote,
    playbackEmpty,
    playbackPanel,
    playbackPlaylist,
    playbackShell,
    playbackStageSummary,
    playbackStageTitle,
    playbackVideo
} from "../../ui/dom.js";
import { PLAYBACK_ENTRY_IDS, getPlaybackMatchById, getPlaybackMatches } from "./library.js";

let selectedEntryId = null;
let selectedClipId = null;
let isManualSelection = false;

function getEntryKey(entry) {
    return String(entry?.id ?? entry?.matchId ?? "");
}

function getSelectedEntry() {
    const entries = getPlaybackMatches();
    if (entries.length === 0) return null;

    return getPlaybackMatchById(selectedEntryId) ?? entries[0];
}

function getSelectedClip(entry) {
    if (!entry || !Array.isArray(entry.clips) || entry.clips.length === 0) {
        return null;
    }

    return entry.clips.find((clip) => String(clip.id) === String(selectedClipId)) ?? entry.clips[0];
}

function isWinningMatch(match, walletAddress) {
    if (!match || Number(match.statusCode) !== 2 || !walletAddress) {
        return false;
    }

    const normalizedWallet = walletAddress.toLowerCase();
    const loser = String(match.loser || "").toLowerCase();

    return !loser || loser !== normalizedWallet;
}

function isLosingMatch(match, walletAddress) {
    if (!match || Number(match.statusCode) !== 2 || !walletAddress) {
        return false;
    }

    return String(match.loser || "").toLowerCase() === walletAddress.toLowerCase();
}

function isActiveTurnMatch(match) {
    if (!match) return false;

    return (
        Number(match.statusCode) === 0 ||
        Number(match.statusCode) === 1
    );
}

function resolveAutomaticEntryId() {
    const walletAddress = getWalletState().account || "";
    const playerMatches = getPlayerMatches();

    if (walletAddress) {
        if (playerMatches.some((match) => isLosingMatch(match, walletAddress))) {
            return PLAYBACK_ENTRY_IDS.loser;
        }

        if (playerMatches.some((match) => isWinningMatch(match, walletAddress))) {
            return PLAYBACK_ENTRY_IDS.winner;
        }

        if (playerMatches.some((match) => isActiveTurnMatch(match))) {
            return PLAYBACK_ENTRY_IDS.turn;
        }
    }

    if (getIsInQueue()) {
        return PLAYBACK_ENTRY_IDS.turn;
    }

    return PLAYBACK_ENTRY_IDS.intro;
}

function syncAutomaticSelection() {
    if (isManualSelection) {
        return;
    }

    const nextEntryId = resolveAutomaticEntryId();
    const nextEntry = getPlaybackMatchById(nextEntryId);

    if (!nextEntry || !Array.isArray(nextEntry.clips) || nextEntry.clips.length === 0) {
        return;
    }

    selectedEntryId = getEntryKey(nextEntry);
    selectedClipId = String(nextEntry.clips[0].id);
}

function renderPlaybackPanel() {
    if (!playbackPanel) return;

    syncAutomaticSelection();

    const entries = getPlaybackMatches();
    const entry = getSelectedEntry();
    const clip = getSelectedClip(entry);

    if (!entry || !clip) {
        playbackPanel.classList.remove("hidden");
        playbackEmpty?.classList.remove("hidden");
        playbackShell?.classList.add("hidden");

        if (playbackPlaylist) {
            playbackPlaylist.innerHTML = `
                <div class="playback-list-empty">
                    No playback clips loaded yet. Add match entries in <code>features/playback/library.js</code>.
                </div>
            `;
        }
        if (playbackVideo) {
            playbackVideo.removeAttribute("src");
            playbackVideo.load();
        }
        return;
    }

    selectedEntryId = getEntryKey(entry);
    selectedClipId = String(clip.id);

    playbackEmpty?.classList.add("hidden");
    playbackShell?.classList.remove("hidden");

    if (playbackVideo) {
        if (playbackVideo.dataset.activeSrc !== clip.src) {
            playbackVideo.src = clip.src;
            playbackVideo.dataset.activeSrc = clip.src;
            playbackVideo.muted = true;
            playbackVideo.loop = true;
            playbackVideo.playsInline = true;
            if (clip.poster) {
                playbackVideo.poster = clip.poster;
            } else {
                playbackVideo.removeAttribute("poster");
            }
            playbackVideo.load();
            playbackVideo.play().catch(() => {});
        }
    }

    if (playbackStageTitle) {
        playbackStageTitle.textContent = clip.label || entry.title || "Playback";
    }

    if (playbackStageSummary) {
        const modePrefix = isManualSelection ? "Manual preview." : "Auto mode.";
        const baseSummary = entry.summary || "Playback clip set.";
        playbackStageSummary.textContent = `${modePrefix} ${baseSummary}`;
    }

    if (playbackAutoBtn) {
        playbackAutoBtn.disabled = !isManualSelection;
    }

    if (playbackClipMeta) {
        const badge = entry.badge || entry.title || "Playback";
        playbackClipMeta.textContent = `${badge}${clip.type ? ` | ${clip.type}` : ""}`;
    }

    if (playbackClipNote) {
        playbackClipNote.textContent = clip.note || "Select a clip to preview this state.";
    }

    if (playbackPlaylist) {
        playbackPlaylist.innerHTML = entries.map((playlistEntry) => {
            const entryKey = getEntryKey(playlistEntry);

            return `
                <div class="playback-match-group">
                    <div class="playback-match-heading">${playlistEntry.title}</div>
                    <div class="playback-match-summary">${playlistEntry.summary || "Recorded clip set."}</div>
                    <div class="playback-clip-list">
                        ${playlistEntry.clips.map((entryClip) => `
                            <button
                                type="button"
                                class="playback-clip-button ${entryKey === selectedEntryId && String(entryClip.id) === String(selectedClipId) ? "is-active" : ""}"
                                data-playback-match-id="${entryKey}"
                                data-playback-clip-id="${entryClip.id}"
                            >
                                <span>${entryClip.label}</span>
                                <span>${playlistEntry.badge || "State"}</span>
                            </button>
                        `).join("")}
                    </div>
                </div>
            `;
        }).join("");
    }
}

function selectPlaybackClip(entryId, clipId) {
    selectedEntryId = String(entryId);
    selectedClipId = String(clipId);
    isManualSelection = true;
    renderPlaybackPanel();
}

function returnPlaybackToAutoMode() {
    isManualSelection = false;
    renderPlaybackPanel();
}

function bindPlaybackEvents() {
    playbackPlaylist?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-playback-match-id][data-playback-clip-id]");
        if (!button) return;

        selectPlaybackClip(button.dataset.playbackMatchId, button.dataset.playbackClipId);
    });

    playbackAutoBtn?.addEventListener("click", returnPlaybackToAutoMode);
}

function initPlaybackController() {
    bindPlaybackEvents();
    subscribeAppState(() => {
        if (!isManualSelection) {
            renderPlaybackPanel();
        }
    });
    renderPlaybackPanel();
}

export {
    initPlaybackController,
    renderPlaybackPanel,
    returnPlaybackToAutoMode
};
