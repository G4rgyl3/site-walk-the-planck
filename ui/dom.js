const connectBtn = document.getElementById("connectBtn");
const joinQueueBtn = document.getElementById("joinQueueBtn");
const leaveQueueBtn = document.getElementById("leaveQueueBtn");
const refreshQueueBtn = document.getElementById("refreshQueueBtn");
const appStatus = document.getElementById("appStatus");
const walletBox = document.getElementById("connectedWalletBox");
const sessionBox = document.getElementById("sessionTokenBox");
const activityTabs = document.getElementById("activityTabs");
const queueTabBtn = document.getElementById("queueTabBtn");
const historyTabBtn = document.getElementById("historyTabBtn");
const queueList = document.getElementById("queueList");
const matchStateDot = document.getElementById("matchStateDot");
const matchStateTitle = document.getElementById("matchStateTitle");
const matchStateDetail = document.getElementById("matchStateDetail");
const matchStateMeta = document.getElementById("matchStateMeta");
const availableMatchPanel = document.getElementById("availableMatchPanel");
const availableMatchList = document.getElementById("availableMatchList");
const playerMatchList = document.getElementById("playerMatchList");
const playerMatchPanel = document.getElementById("playerMatchPanel");
const playbackBackdrop = document.getElementById("playbackBackdrop");
const playbackPanel = document.getElementById("playbackPanel");
const playbackEmpty = document.getElementById("playbackEmpty");
const playbackShell = document.getElementById("playbackShell");
const playbackVideo = document.getElementById("playbackVideo");
const playbackTransition = document.getElementById("playbackTransition");
const playbackVideoOverlay = document.getElementById("playbackVideoOverlay");
const playbackStageKicker = document.getElementById("playbackStageKicker");
const playbackStageTitle = document.getElementById("playbackStageTitle");
const playbackStageSummary = document.getElementById("playbackStageSummary");
const playbackPrimaryBtn = document.getElementById("playbackPrimaryBtn");
const playbackSkipBtn = document.getElementById("playbackSkipBtn");
const playbackExplorerBtn = document.getElementById("playbackExplorerBtn");
const playbackSecondaryBtn = document.getElementById("playbackSecondaryBtn");
const playbackClipMeta = document.getElementById("playbackClipMeta");
const playbackClipNote = document.getElementById("playbackClipNote");
const matchSizeSelector = document.getElementById("matchSizeSelector");
const entryFeeSelector = document.getElementById("entryFeeSelector");
const toastStack = document.getElementById("toastStack");

export {
    activityTabs,
    appStatus,
    availableMatchList,
    availableMatchPanel,
    connectBtn,
    entryFeeSelector,
    historyTabBtn,
    joinQueueBtn,
    leaveQueueBtn,
    matchSizeSelector,
    matchStateDetail,
    matchStateDot,
    matchStateMeta,
    matchStateTitle,
    playerMatchList,
    playerMatchPanel,
    playbackBackdrop,
    playbackClipMeta,
    playbackClipNote,
    playbackEmpty,
    playbackPanel,
    playbackExplorerBtn,
    playbackPrimaryBtn,
    playbackSkipBtn,
    playbackSecondaryBtn,
    playbackShell,
    playbackStageKicker,
    playbackStageSummary,
    playbackStageTitle,
    playbackTransition,
    playbackVideo,
    playbackVideoOverlay,
    queueList,
    queueTabBtn,
    refreshQueueBtn,
    sessionBox,
    toastStack,
    walletBox
};
