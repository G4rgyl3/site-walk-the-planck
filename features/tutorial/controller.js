import {
    tutorialBackBtn,
    tutorialBody,
    tutorialDialog,
    tutorialHelpBtn,
    tutorialNextBtn,
    tutorialOverlay,
    tutorialSkipBtn,
    tutorialSpotlight,
    tutorialStepLabel,
    tutorialTitle
} from "../../ui/dom.js";

const TUTORIAL_STEPS = [
    {
        title: "Connect your wallet",
        body: "Start here. Connect your wallet so the harbor can track your queue, ships, and outcomes.",
        selectors: ["#tutorialWalletStrip", "#tutorialWalletSection"]
    },
    {
        title: "Choose your voyage",
        body: "Pick the crew sizes and stake tiers you want to sail with. You can select more than one at a time.",
        selectors: ["#tutorialMatchSetupPanel"]
    },
    {
        title: "Join the queue",
        body: "Once your planks and stakes are set, join the queue. The matchmaking panel will keep watch while crews gather.",
        selectors: ["#tutorialQueueActions", "#matchStateCard"]
    },
    {
        title: "Board a ship",
        body: "When a crew is ready, a ship appears here. Board it to commit on chain and lock your place aboard.",
        selectors: ["#availableMatchPanel", "#tutorialMatchmakingPanel"]
    },
    {
        title: "Watch the outcome",
        body: "After the ship fills, the game window takes over here. Follow the sequence, then settle up in the Ship Log when the sea is done deciding.",
        selectors: ["#playbackPanel", "#historyTabBtn", "#tutorialMatchmakingPanel"]
    }
];

const TUTORIAL_STORAGE_KEY = "wtp:tutorial-phase-1";

let isTutorialOpen = false;
let activeStepIndex = 0;
let resizeHandler = null;
let scrollHandler = null;
let keydownHandler = null;

function readTutorialState() {
    try {
        const raw = window.localStorage.getItem(TUTORIAL_STORAGE_KEY);
        if (!raw) {
            return { dismissed: false, completed: false };
        }

        const parsed = JSON.parse(raw);
        return {
            dismissed: parsed?.dismissed === true,
            completed: parsed?.completed === true
        };
    } catch (error) {
        return { dismissed: false, completed: false };
    }
}

function writeTutorialState(nextState) {
    try {
        window.localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({
            dismissed: nextState?.dismissed === true,
            completed: nextState?.completed === true
        }));
    } catch (error) {
        // Ignore storage failures and keep the tutorial usable for the session.
    }
}

function isVisibleElement(element) {
    if (!element) {
        return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
        return false;
    }

    return element.getClientRects().length > 0;
}

function getStep(index) {
    return TUTORIAL_STEPS[Math.max(0, Math.min(index, TUTORIAL_STEPS.length - 1))];
}

function resolveStepTarget(step) {
    for (const selector of step.selectors) {
        const element = document.querySelector(selector);
        if (isVisibleElement(element)) {
            return element;
        }
    }

    return null;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function positionTutorialElements() {
    if (!isTutorialOpen || !tutorialDialog || !tutorialSpotlight) {
        return;
    }

    const step = getStep(activeStepIndex);
    const target = resolveStepTarget(step);

    if (!target) {
        tutorialSpotlight.classList.add("hidden");
        tutorialDialog.style.left = "50%";
        tutorialDialog.style.top = "50%";
        tutorialDialog.style.transform = "translate(-50%, -50%)";
        return;
    }

    const padding = 14;
    const rect = target.getBoundingClientRect();
    const spotlightLeft = clamp(rect.left - padding, 12, window.innerWidth - 40);
    const spotlightTop = clamp(rect.top - padding, 12, window.innerHeight - 40);
    const spotlightWidth = clamp(rect.width + (padding * 2), 40, window.innerWidth - spotlightLeft - 12);
    const spotlightHeight = clamp(rect.height + (padding * 2), 40, window.innerHeight - spotlightTop - 12);

    tutorialSpotlight.classList.remove("hidden");
    tutorialSpotlight.style.left = `${spotlightLeft}px`;
    tutorialSpotlight.style.top = `${spotlightTop}px`;
    tutorialSpotlight.style.width = `${spotlightWidth}px`;
    tutorialSpotlight.style.height = `${spotlightHeight}px`;

    const dialogRect = tutorialDialog.getBoundingClientRect();
    const viewportPadding = 20;
    const preferredLeft = rect.left + Math.max(0, rect.width - dialogRect.width);
    const preferredTop = rect.bottom + 20;
    const fitsBelow = preferredTop + dialogRect.height <= window.innerHeight - viewportPadding;
    const fallbackTop = rect.top - dialogRect.height - 20;
    const nextTop = fitsBelow
        ? preferredTop
        : Math.max(viewportPadding, fallbackTop);
    const nextLeft = clamp(
        preferredLeft,
        viewportPadding,
        window.innerWidth - dialogRect.width - viewportPadding
    );

    tutorialDialog.style.left = `${nextLeft}px`;
    tutorialDialog.style.top = `${nextTop}px`;
    tutorialDialog.style.transform = "none";
}

function renderTutorialStep() {
    if (!tutorialTitle || !tutorialBody || !tutorialStepLabel || !tutorialBackBtn || !tutorialNextBtn) {
        return;
    }

    const step = getStep(activeStepIndex);
    const isLastStep = activeStepIndex === (TUTORIAL_STEPS.length - 1);

    tutorialTitle.textContent = step.title;
    tutorialBody.textContent = step.body;
    tutorialStepLabel.textContent = `${activeStepIndex + 1} / ${TUTORIAL_STEPS.length}`;
    tutorialBackBtn.disabled = activeStepIndex === 0;
    tutorialNextBtn.textContent = isLastStep ? "Done" : "Next";

    requestAnimationFrame(positionTutorialElements);
}

function addTutorialListeners() {
    resizeHandler = () => positionTutorialElements();
    scrollHandler = () => positionTutorialElements();
    keydownHandler = (event) => {
        if (!isTutorialOpen) {
            return;
        }

        if (event.key === "Escape") {
            closeTutorial({ dismissed: true });
        }
    };

    window.addEventListener("resize", resizeHandler);
    window.addEventListener("scroll", scrollHandler, true);
    window.addEventListener("keydown", keydownHandler);
}

function removeTutorialListeners() {
    if (resizeHandler) {
        window.removeEventListener("resize", resizeHandler);
        resizeHandler = null;
    }

    if (scrollHandler) {
        window.removeEventListener("scroll", scrollHandler, true);
        scrollHandler = null;
    }

    if (keydownHandler) {
        window.removeEventListener("keydown", keydownHandler);
        keydownHandler = null;
    }
}

function openTutorial(startIndex = 0) {
    if (!tutorialOverlay) {
        return;
    }

    activeStepIndex = Math.max(0, Math.min(startIndex, TUTORIAL_STEPS.length - 1));
    isTutorialOpen = true;
    tutorialOverlay.classList.remove("hidden");
    tutorialOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("tutorial-open");
    addTutorialListeners();
    renderTutorialStep();
}

function closeTutorial(options = {}) {
    if (!tutorialOverlay) {
        return;
    }

    const {
        dismissed = false,
        completed = false
    } = options;

    isTutorialOpen = false;
    tutorialOverlay.classList.add("hidden");
    tutorialOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tutorial-open");
    removeTutorialListeners();

    if (dismissed || completed) {
        writeTutorialState({
            dismissed,
            completed
        });
    }
}

function handleNextTutorialStep() {
    if (activeStepIndex >= (TUTORIAL_STEPS.length - 1)) {
        closeTutorial({ completed: true });
        return;
    }

    activeStepIndex += 1;
    renderTutorialStep();
}

function handlePreviousTutorialStep() {
    if (activeStepIndex <= 0) {
        return;
    }

    activeStepIndex -= 1;
    renderTutorialStep();
}

function bindTutorialEvents() {
    tutorialHelpBtn?.addEventListener("click", () => {
        openTutorial(0);
    });

    tutorialNextBtn?.addEventListener("click", handleNextTutorialStep);
    tutorialBackBtn?.addEventListener("click", handlePreviousTutorialStep);
    tutorialSkipBtn?.addEventListener("click", () => {
        closeTutorial({ dismissed: true });
    });
    tutorialOverlay?.addEventListener("click", (event) => {
        if (event.target === tutorialOverlay) {
            closeTutorial({ dismissed: true });
        }
    });
}

function initTutorialController() {
    bindTutorialEvents();
    const tutorialState = readTutorialState();

    if (!tutorialState.dismissed && !tutorialState.completed) {
        window.setTimeout(() => {
            openTutorial(0);
        }, 240);
    }
}

export {
    initTutorialController,
    openTutorial
};
