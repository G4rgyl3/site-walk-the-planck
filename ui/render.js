import { fromWei } from "@ohlabs/js-chain/utility/ethers.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import { getEntropyExplorerUrl } from "../lib/entropy-explorer.js";
import {
    activityTabs,
    availableMatchList,
    availableMatchPanel,
    connectBtn,
    entryFeeSelector,
    joinQueueBtn,
    leaveQueueBtn,
    matchSizeSelector,
    matchStateCard,
    matchStateDetail,
    matchStateDot,
    matchStateMeta,
    matchStateTitle,
    historyTabBtn,
    playerMatchList,
    queueList,
    queueTabBtn,
    refreshQueueBtn,
    sessionBox,
    toastStack,
    walletBox
} from "./dom.js";
import {
    getIsInQueue,
    getSelectedPreferences,
    getSessionTokenValue
} from "../state/app-state.js";

function setStatus(message) {
    showToast(message, { variant: "info" });
}

const TOAST_DEFAULT_DURATION = 4200;
let toastSequence = 0;
let activeActivityTab = "queues";

function setActivityTab(tabName) {
    const nextTab = tabName === "history" ? "history" : "queues";
    activeActivityTab = nextTab;

    [queueTabBtn, historyTabBtn].forEach((button) => {
        if (!button) return;

        const isActive = button.dataset.activityTab === nextTab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    document.querySelectorAll("[data-activity-panel]").forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.activityPanel !== nextTab);
    });
}

function showToast(message, options = {}) {
    if (!toastStack || !message) return;

    const variant = options.variant || "error";
    const duration = Number(options.duration) > 0 ? Number(options.duration) : TOAST_DEFAULT_DURATION;
    const toastId = `toast-${Date.now()}-${toastSequence++}`;
    const toast = document.createElement("div");
    toast.className = `toast toast-${variant}`;
    toast.dataset.toastId = toastId;
    toast.setAttribute("role", variant === "error" ? "alert" : "status");

    const messageEl = document.createElement("div");
    messageEl.className = "toast-message";
    messageEl.textContent = message;

    const lifeEl = document.createElement("div");
    lifeEl.className = "toast-life";
    lifeEl.style.setProperty("--toast-duration", `${duration}ms`);

    toast.append(messageEl, lifeEl);
    toastStack.append(toast);

    requestAnimationFrame(() => {
        toast.classList.add("is-visible");
        lifeEl.classList.add("is-running");
    });

    const removeToast = () => {
        toast.classList.remove("is-visible");
        window.setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 240);
    };

    window.setTimeout(removeToast, duration);
}

function shortenWalletAddress(walletAddress) {
    if (!walletAddress || walletAddress.length < 12) {
        return walletAddress || "-";
    }

    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function formatSelections() {
    const { matchSizes, entryFeesWei } = getSelectedPreferences();

    return {
        planks: matchSizes.length
            ? matchSizes.map((n) => `${n}p`)
            : [],
        stakes: entryFeesWei.length
            ? entryFeesWei.map((wei) => `${fromWei(wei)} ETH`)
            : []
    };
}

function updateActionButtons() {
    const connected = !!getWalletState().account;
    const isInQueue = getIsInQueue();

    if (connectBtn) {
        connectBtn.disabled = connected;
        connectBtn.textContent = connected ? "Wallet Connected" : "Connect Wallet";
        connectBtn.classList.toggle("connected", connected);
    }

    if (joinQueueBtn) {
        joinQueueBtn.disabled = !connected || isInQueue;
        joinQueueBtn.textContent = isInQueue ? "Searching..." : "Join queue";
    }

    if (leaveQueueBtn) {
        leaveQueueBtn.disabled = !connected || !isInQueue;
    }

    if (refreshQueueBtn) {
        refreshQueueBtn.disabled = !connected;
    }
}

function updateWalletUI() {
    const walletAddress = getWalletState().account || "";
    const connected = !!walletAddress;

    if (walletBox) {
        walletBox.title = walletAddress || "";
        walletBox.innerHTML = connected
            ? `
                <div class="wallet-identity">
                    <div class="wallet-presence is-connected">
                        <span class="wallet-presence-dot"></span>
                        <span class="wallet-presence-label">Connected</span>
                    </div>
                    <div class="wallet-address-short">${shortenWalletAddress(walletAddress)}</div>
                </div>
            `
            : `
                <div class="wallet-identity">
                    <div class="wallet-presence">
                        <span class="wallet-presence-dot"></span>
                        <span class="wallet-presence-label">Not connected</span>
                    </div>
                    <div class="wallet-address-short">-</div>
                </div>
            `;
    }

    if (sessionBox) {
        sessionBox.textContent = getSessionTokenValue() || "-";
    }

    updateActionButtons();
}

function setSelectorsLocked(locked) {
    [matchSizeSelector, entryFeeSelector].forEach((container) => {
        if (!container) return;

        container.querySelectorAll(".select-chip").forEach((button) => {
            button.disabled = locked;
            button.classList.toggle("locked", locked);
        });
    });
}

function renderQueues(queues) {
    if (!queueList) return;

    if (!Array.isArray(queues) || queues.length === 0) {
        queueList.innerHTML = '<div class="queue-card">No crews are gathering at the harbor right now.</div>';
        return;
    }

    const groupedQueues = queues.reduce((groups, queue) => {
        const groupKey = Number(queue.maxPlayers) || 0;
        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }

        groups.get(groupKey).push(queue);
        return groups;
    }, new Map());

    const orderedGroupKeys = [...groupedQueues.keys()].sort((a, b) => a - b);

    queueList.innerHTML = orderedGroupKeys.map((groupKey) => {
        const groupedCards = groupedQueues
            .get(groupKey)
            .slice()
            .sort((a, b) => Number(a.entryFeeWei) - Number(b.entryFeeWei))
            .map((q) => {
                const hasCommittedCounts = q.committedCount != null && q.readyCount != null;
                const queuedCount = Number(q.queuedCount ?? 0);
                const matchable = q.matchable === true;
                const readyCount = hasCommittedCounts ? Number(q.readyCount ?? 0) : queuedCount;
                const readyText = hasCommittedCounts
                    ? `${readyCount} / ${q.maxPlayers}`
                    : `${queuedCount} in harbor`;
                const committedText = hasCommittedCounts
                    ? `${q.committedCount ?? 0}`
                    : "Unknown";
                const statusLabel = hasCommittedCounts
                    ? (matchable ? "Crew Ready" : "Moored")
                    : "Queue Only";
                const statusText = hasCommittedCounts
                    ? (matchable ? "This ship can set sail right now." : "Awaiting more crew before this ship can sail.")
                    : "Showing harbored crew only. Boarded crew will appear here once committed.";
                const hasCommitted = Number(q.committedCount ?? 0) > 0;
                const peopleIcons = Array.from({ length: Number(q.maxPlayers) || 0 }, (_, index) => `
                    <span class="queue-slot ${index < readyCount ? "is-filled" : ""}">
                        <span class="queue-slot-head"></span>
                        <span class="queue-slot-body"></span>
                    </span>
                `).join("");

                return `
                    <div
                        class="queue-card ${matchable ? "is-matchable" : ""} ${hasCommitted ? "has-lock" : ""}"
                        data-queue-card
                        tabindex="0"
                        role="button"
                        aria-expanded="false"
                    >
                        ${hasCommitted ? `
                            <div class="queue-lock-indicator" aria-label="Committed players present" title="Committed players present">
                                <span class="queue-lock-shackle"></span>
                                <span class="queue-lock-body"></span>
                            </div>
                        ` : ""}
                        <div class="queue-card-compact">
                            <div class="queue-card-head">
                                <div class="queue-title">
                                    <span class="queue-title-amount">${fromWei(q.entryFeeWei)}</span>
                                    <span class="queue-title-unit">ETH</span>
                                </div>
                                <div class="queue-status-pill ${matchable ? "is-matchable" : ""}">${statusLabel}</div>
                            </div>
                            <div class="queue-slots" aria-label="Ready slots">
                                ${peopleIcons}
                            </div>
                            <div class="queue-compact-meta">
                                <span class="queue-ready">${readyText}</span>
                            </div>
                        </div>
                        <div class="queue-card-expanded">
                            <div class="queue-metrics">
                                <div class="queue-metric">
                                    <span class="queue-metric-label">Ready</span>
                                    <span class="queue-metric-value queue-ready">${readyText}</span>
                                </div>
                                <div class="queue-metric">
                                    <span class="queue-metric-label">Harbor</span>
                                    <span class="queue-metric-value">${queuedCount}</span>
                                </div>
                                <div class="queue-metric">
                                    <span class="queue-metric-label">Boarded</span>
                                    <span class="queue-metric-value">${committedText}</span>
                                </div>
                            </div>
                            <div class="queue-footnote">${statusText}</div>
                        </div>
                    </div>
                `;
            }).join("");

        return `
            <section class="queue-group">
                <div class="queue-group-head">
                    <h4 class="queue-group-title">${groupKey} Players</h4>
                </div>
                <div class="queue-group-grid">
                    ${groupedCards}
                </div>
            </section>
        `;
    }).join("");
}

function renderAvailableMatches(matches) {
    if (!availableMatchPanel || !availableMatchList) return;

    if (!Array.isArray(matches) || matches.length === 0) {
        availableMatchPanel.classList.add("hidden");
        availableMatchList.innerHTML = "";
        return;
    }

    availableMatchPanel.classList.remove("hidden");

    availableMatchList.innerHTML = matches.map((match) => `
        <div class="available-match-card">
            <div class="available-match-info">
                <div class="available-match-name">
                    ${match.maxPlayers} Players | ${fromWei(match.entryFeeWei)} ETH
                </div>
                <div class="available-match-meta">
                    ${match.readyCount} ready | Crew is ready to set sail
                </div>
                <div class="available-match-meta">
                    Harbor: ${match.queuedCount ?? 0} | Boarded: ${match.committedCount ?? 0}
                </div>
            </div>
            <button
                type="button"
                class="btn btn-join-match"
                data-max-players="${match.maxPlayers}"
                data-entry-fee-wei="${match.entryFeeWei}"
            >
                Board Ship
            </button>
        </div>
    `).join("");
}

function formatDateTime(unixSeconds) {
    if (!unixSeconds) {
        return "No deadline";
    }

    return new Date(unixSeconds * 1000).toLocaleString();
}

function renderPlayerMatches(matches) {
    if (!playerMatchList) return;

    if (!Array.isArray(matches) || matches.length === 0) {
        playerMatchList.innerHTML = "";
        return;
    }

    playerMatchList.innerHTML = matches.map((match) => {
        const playerList = match.players.length
            ? match.players.map(shortenWalletAddress).join(", ")
            : "Loading players...";
        const entropyExplorerUrl = getEntropyExplorerUrl(match);

        return `
            <div class="available-match-card">
                <div class="available-match-info">
                    <div class="available-match-name">
                        Match #${match.id} | ${match.maxPlayers} Players | ${fromWei(match.entryFeeWei)} ETH
                    </div>
                    <div class="available-match-meta">
                        ${match.playerStatus} | ${match.playerCount}/${match.maxPlayers} players | ${match.statusLabel}
                    </div>
                    <div class="available-match-meta">
                        Players: ${playerList}
                    </div>
                    <div class="available-match-meta">
                        Pot: ${fromWei(match.totalPotWei)} ETH | Deadline: ${formatDateTime(match.deadline)}
                    </div>
                    ${entropyExplorerUrl ? `
                        <div class="available-match-meta">
                            Entropy Sequence: ${match.sequenceNumber}
                        </div>
                    ` : ""}
                </div>
                <div>
                    ${entropyExplorerUrl ? `
                        <a
                            class="btn btn-neutral"
                            href="${entropyExplorerUrl}"
                            target="_blank"
                            rel="noreferrer noopener"
                        >
                            Entropy Explorer
                        </a>
                    ` : ""}
                    ${match.isClaimable ? `
                        <button
                            type="button"
                            class="btn btn-join-match"
                            data-claim-match-id="${match.id}"
                        >
                            Claim Spoils
                        </button>
                    ` : ""}
                    ${match.isRefundable ? `
                        <button
                            type="button"
                            class="btn btn-neutral"
                            data-refund-match-id="${match.id}"
                        >
                            Claim Refund
                        </button>
                    ` : ""}
                </div>
            </div>
        `;
    }).join("");
}

if (activityTabs) {
    activityTabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-activity-tab]");
        if (!button || !activityTabs.contains(button)) return;

        setActivityTab(button.dataset.activityTab);
    });
}

if (queueList) {
    queueList.addEventListener("click", (event) => {
        const card = event.target.closest("[data-queue-card]");
        if (!card || !queueList.contains(card)) return;

        queueList.querySelectorAll("[data-queue-card].is-expanded").forEach((activeCard) => {
            if (activeCard === card) return;
            activeCard.classList.remove("is-expanded");
            activeCard.setAttribute("aria-expanded", "false");
        });

        const isExpanded = card.classList.toggle("is-expanded");
        card.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    });

    queueList.addEventListener("keydown", (event) => {
        const card = event.target.closest("[data-queue-card]");
        if (!card || !queueList.contains(card)) return;
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        card.click();
    });
}

setActivityTab(activeActivityTab);

function setMatchmakingState({ searching, title, detail, meta, tone }) {
    if (!matchStateDot || !matchStateTitle || !matchStateDetail || !matchStateMeta) return;

    matchStateDot.classList.remove("idle", "searching");
    matchStateDot.classList.add(searching ? "searching" : "idle");
    const nextTone = tone || (searching ? "searching" : "idle");
    matchStateCard?.classList.remove("tone-idle", "tone-searching", "tone-active");
    matchStateCard?.classList.add(`tone-${nextTone}`);
    matchStateTitle.textContent = title;
    matchStateDetail.textContent = detail;

    const hasStructuredMeta = meta && typeof meta === "object" && !Array.isArray(meta);
    if (hasStructuredMeta) {
        const planks = Array.isArray(meta.planks) ? meta.planks : [];
        const stakes = Array.isArray(meta.stakes) ? meta.stakes : [];

        matchStateMeta.innerHTML = `
            <div class="match-state-meta-chips">
                ${planks.length > 0 ? `
                    <div class="match-state-meta-group">
                        <span class="match-state-meta-group-label">Planks</span>
                        ${planks.map((plank) => `<span class="match-state-meta-chip">${plank}</span>`).join("")}
                    </div>
                ` : ""}
                ${stakes.length > 0 ? `
                    <div class="match-state-meta-group">
                        <span class="match-state-meta-group-label">Stakes</span>
                        ${stakes.map((stake) => `<span class="match-state-meta-chip">${stake}</span>`).join("")}
                    </div>
                ` : ""}
            </div>
        `;
    } else {
        matchStateMeta.textContent = meta;
    }
}

export {
    formatSelections,
    renderAvailableMatches,
    renderPlayerMatches,
    renderQueues,
    setActivityTab,
    setMatchmakingState,
    setSelectorsLocked,
    setStatus,
    showToast,
    updateActionButtons,
    updateWalletUI
};

window.getWalletState = getWalletState;
