import { fromWei } from "@ohlabs/js-chain/utility/ethers.js";
import { getState as getWalletState } from "@ohlabs/js-chain/utility/wallet.js";
import {
    availableMatchList,
    availableMatchPanel,
    appStatus,
    connectBtn,
    entryFeeSelector,
    joinQueueBtn,
    leaveQueueBtn,
    matchSizeSelector,
    matchStateDetail,
    matchStateDot,
    matchStateMeta,
    matchStateTitle,
    queueList,
    refreshQueueBtn,
    sessionBox,
    walletBox
} from "./dom.js";
import {
    getIsInQueue,
    getSelectedPreferences,
    getSessionTokenValue
} from "../state/app-state.js";

function setStatus(message) {
    if (appStatus) {
        appStatus.textContent = message;
    }
}

function shortenWalletAddress(walletAddress) {
    if (!walletAddress || walletAddress.length < 12) {
        return walletAddress || "-";
    }

    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function formatSelections() {
    const { matchSizes, entryFeesWei } = getSelectedPreferences();

    const sizeText = matchSizes.length
        ? matchSizes.map((n) => `${n}p`).join(", ")
        : "none";

    const feeText = entryFeesWei.length
        ? entryFeesWei.map((wei) => `${fromWei(wei)} ETH`).join(", ")
        : "none";

    return `Sizes: ${sizeText} · Fees: ${feeText}`;
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
        queueList.innerHTML = '<div class="queue-card">No live queues right now.</div>';
        return;
    }

    queueList.innerHTML = queues.map((q) => {
        const matchable = !!q.matchable;

        return `
            <div class="queue-card">
                <div class="queue-title">${q.maxPlayers} Players · ${fromWei(q.entryFeeWei)} ETH</div>
                <div class="queue-ready">Ready: ${q.readyCount} / ${q.maxPlayers}</div>
                <div class="queue-waiting">${matchable ? "Matchable now" : "Waiting for more players"}</div>
            </div>
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
                    ${match.maxPlayers} Players · ${fromWei(match.entryFeeWei)} ETH
                </div>
                <div class="available-match-meta">
                    ${match.readyCount} ready · Match is available now
                </div>
            </div>
            <button
                type="button"
                class="btn btn-join-match"
                data-max-players="${match.maxPlayers}"
                data-entry-fee-wei="${match.entryFeeWei}"
            >
                Join Match
            </button>
        </div>
    `).join("");
}

function setMatchmakingState({ searching, title, detail, meta }) {
    if (!matchStateDot || !matchStateTitle || !matchStateDetail || !matchStateMeta) return;

    matchStateDot.classList.remove("idle", "searching");
    matchStateDot.classList.add(searching ? "searching" : "idle");
    matchStateTitle.textContent = title;
    matchStateDetail.textContent = detail;
    matchStateMeta.textContent = meta;
}

export {
    formatSelections,
    renderAvailableMatches,
    renderQueues,
    setMatchmakingState,
    setSelectorsLocked,
    setStatus,
    updateActionButtons,
    updateWalletUI
};
