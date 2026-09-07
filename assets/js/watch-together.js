// ==========================================================
// watch-together.js — 1-to-1 "Watch Together" Synchronization Engine
// YouTube & Screen Share (with System Audio) & Local Video Real-Time Sync
// ==========================================================

import { doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// State
let firestoreDb = null;
let currentAuthUser = null;
let currentProfile = null;
let currentCallId = null;
let showToastFn = null;
let unsubscribeWatchTogether = null;
let screenShareBridge = null;
let activeRemoteStream = null;

let isRemoteSync = false;
let isTheaterActive = false;
let currentMode = "youtube"; // "youtube" | "screenshare" | "local"
let isLocalSharer = false;
let ytPlayer = null;
let isYTReady = false;
let ytReadyPromise = null;
let localVideoUrl = null;
let activeVideoDuration = 0;

// Loopback and ping-pong prevention
let lastRemoteActionTimestamp = 0;
let lastBroadcastState = null;
let lastBroadcastTime = 0;

// DOM Elements
let watchTogetherModal = null;
let wtModalCloseBtn = null;
let wtTabYT = null;
let wtTabScreen = null;
let wtTabLocal = null;
let wtPanelYT = null;
let wtPanelScreen = null;
let wtPanelLocal = null;
let wtYTUrlInput = null;
let wtStartYtBtn = null;
let wtStartScreenBtn = null;
let wtLocalFileInput = null;
let wtLocalFileLabel = null;
let wtStartLocalBtn = null;
let wtQuickButtons = [];

// Theater Stage DOM
let watchTogetherStage = null;
let wtStageTitle = null;
let wtStageIcon = null;
let wtStageExitBtn = null;
let wtYTContainer = null;
let wtYTWrapper = null;
let wtScreenContainer = null;
let syncedScreenVideo = null;
let wtScreenAudioBadge = null;
let wtScreenAudioText = null;
let wtLocalContainer = null;
let syncedLocalVideo = null;
let wtVideoControls = null;
let wtCtrlPlayBtn = null;
let wtCtrlPlayIcon = null;
let wtCtrlCurrentTime = null;
let wtCtrlDuration = null;
let wtCtrlTimeline = null;
let wtCtrlSpeed = null;

// Webcam Dual PIP Containers
let remoteVideoPipContainer = null;
let remotePipVideo = null;
let localVideoContainer = null;
let remoteVideoStandard = null;
let callWatchTogetherBtn = null;

function bindWatchTogetherDOM() {
    watchTogetherModal = document.getElementById("watch-together-modal");
    wtModalCloseBtn = document.getElementById("wt-modal-close-btn");
    wtTabYT = document.getElementById("wt-tab-yt");
    wtTabScreen = document.getElementById("wt-tab-screen");
    wtTabLocal = document.getElementById("wt-tab-local");
    wtPanelYT = document.getElementById("wt-panel-yt");
    wtPanelScreen = document.getElementById("wt-panel-screen");
    wtPanelLocal = document.getElementById("wt-panel-local");
    wtYTUrlInput = document.getElementById("wt-yt-url-input");
    wtStartYtBtn = document.getElementById("wt-start-yt-btn");
    wtStartScreenBtn = document.getElementById("wt-start-screen-btn");
    wtLocalFileInput = document.getElementById("wt-local-file-input");
    wtLocalFileLabel = document.getElementById("wt-local-file-label");
    wtStartLocalBtn = document.getElementById("wt-start-local-btn");
    wtQuickButtons = document.querySelectorAll(".wt-quick-yt");

    watchTogetherStage = document.getElementById("watch-together-stage");
    wtStageTitle = document.getElementById("wt-stage-title");
    wtStageIcon = document.getElementById("wt-stage-icon");
    wtStageExitBtn = document.getElementById("wt-stage-exit-btn");
    wtYTContainer = document.getElementById("wt-yt-container");
    wtYTWrapper = document.getElementById("wt-yt-wrapper");
    wtScreenContainer = document.getElementById("wt-screen-container");
    syncedScreenVideo = document.getElementById("synced-screen-video");
    wtScreenAudioBadge = document.getElementById("wt-screen-audio-badge");
    wtScreenAudioText = document.getElementById("wt-screen-audio-text");
    wtLocalContainer = document.getElementById("wt-local-container");
    syncedLocalVideo = document.getElementById("synced-local-video");
    wtVideoControls = document.getElementById("wt-video-controls");
    wtCtrlPlayBtn = document.getElementById("wt-ctrl-play-btn");
    wtCtrlPlayIcon = document.getElementById("wt-ctrl-play-icon");
    wtCtrlCurrentTime = document.getElementById("wt-ctrl-current-time");
    wtCtrlDuration = document.getElementById("wt-ctrl-duration");
    wtCtrlTimeline = document.getElementById("wt-ctrl-timeline");
    wtCtrlSpeed = document.getElementById("wt-ctrl-speed");

    remoteVideoPipContainer = document.getElementById("remote-video-pip-container");
    remotePipVideo = document.getElementById("remote-pip-video");
    localVideoContainer = document.getElementById("local-video-container");
    remoteVideoStandard = document.getElementById("remote-video");
    callWatchTogetherBtn = document.getElementById("call-watch-together-btn");
}

/**
 * Initialize Watch Together Engine
 */
export function initWatchTogether(user, profile, db, showToast, screenShareController = null) {
    currentAuthUser = user;
    currentProfile = profile;
    firestoreDb = db;
    showToastFn = showToast || console.log;
    screenShareBridge = screenShareController || window.webrtcScreenShare;

    bindWatchTogetherDOM();
    setupModalEvents();
    setupTheaterControls();
    loadYouTubeIFrameAPI();

    // Register global bridge callbacks from WebRTC engine for screen sharing
    window.handleScreenShareStarted = (screenStream, title, hasSystemAudio) => {
        isLocalSharer = true;
        enterTheaterMode("screenshare", title || "Your Shared Screen 🖥️");
        
        if (syncedScreenVideo) {
            syncedScreenVideo.srcObject = screenStream;
            // Mute local video preview to avoid echo of the user's own system audio
            syncedScreenVideo.muted = true;
            syncedScreenVideo.play().catch(console.warn);
        }

        if (wtScreenAudioBadge) {
            wtScreenAudioBadge.classList.remove("hidden");
            if (wtScreenAudioText) {
                wtScreenAudioText.textContent = hasSystemAudio ? "System Audio Live 🔊" : "Screen Only (No Audio)";
            }
        }

        broadcastSyncState({
            active: true,
            mode: "screenshare",
            title: title || "Shared Screen 🖥️",
            hasSystemAudio: !!hasSystemAudio,
            sharerUid: currentAuthUser.uid,
            state: "sharing"
        });
    };

    window.handleScreenShareStopped = (notifyRemote = true) => {
        if (syncedScreenVideo && isLocalSharer) {
            syncedScreenVideo.srcObject = null;
        }
        isLocalSharer = false;
        if (isTheaterActive && currentMode === "screenshare") {
            exitTheaterMode(notifyRemote);
        }
    };
}

/**
 * Connect Watch Together to Active Call Session
 */
export function connectWatchTogetherToCall(callId, remoteStream) {
    currentCallId = callId;
    activeRemoteStream = remoteStream;

    if (remotePipVideo && remoteStream) {
        remotePipVideo.srcObject = remoteStream;
    }
    listenToWatchTogetherState();

    // If caller picked a session before the call connected, launch it automatically
    if (window.pendingWatchTogetherSession) {
        const pending = window.pendingWatchTogetherSession;
        window.pendingWatchTogetherSession = null;
        setTimeout(() => {
            if (pending.mode === "youtube") {
                enterTheaterMode("youtube", pending.title || "YouTube Video ❤️");
                createOrLoadYouTubePlayer(pending.src, true);
                broadcastSyncState({
                    active: true,
                    mode: "youtube",
                    src: pending.src,
                    title: pending.title || "YouTube Video ❤️",
                    state: "playing",
                    currentTime: 0,
                    playbackRate: 1.0
                });
            } else if (pending.mode === "local") {
                enterTheaterMode("local", pending.title || "Local Movie ❤️");
                setupLocalVideoPlayer(pending.src);
                broadcastSyncState({
                    active: true,
                    mode: "local",
                    src: pending.src,
                    title: pending.title || "Local Movie ❤️",
                    state: "playing",
                    currentTime: 0,
                    playbackRate: 1.0
                });
            }
        }, 800);
    }
}

/**
 * Cleanup & Teardown when Call Ends
 */
export function cleanupWatchTogether() {
    if (unsubscribeWatchTogether) {
        unsubscribeWatchTogether();
        unsubscribeWatchTogether = null;
    }
    exitTheaterMode(false);
    currentCallId = null;
    activeRemoteStream = null;
    isLocalSharer = false;

    if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
        localVideoUrl = null;
    }
}

// ==========================================================
// 1. YouTube IFrame API Loader (Safe & Promisified)
// ==========================================================
function loadYouTubeIFrameAPI() {
    if (window.YT && window.YT.Player) {
        isYTReady = true;
        return;
    }

    if (!ytReadyPromise) {
        ytReadyPromise = new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                isYTReady = true;
                return resolve();
            }

            const existingScript = document.getElementById("yt-iframe-script");
            if (!existingScript) {
                const tag = document.createElement("script");
                tag.id = "yt-iframe-script";
                tag.src = "https://www.youtube.com/iframe_api";
                const firstScriptTag = document.getElementsByTagName("script")[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            }

            const prevOnReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof prevOnReady === "function") prevOnReady();
                console.log("[WatchTogether] YouTube IFrame API Ready");
                isYTReady = true;
                resolve();
            };

            // Fallback poll in case onYouTubeIframeAPIReady already fired
            const checkInterval = setInterval(() => {
                if (window.YT && window.YT.Player) {
                    clearInterval(checkInterval);
                    isYTReady = true;
                    resolve();
                }
            }, 150);

            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 10000);
        });
    }
}

async function ensureYouTubeReady() {
    if (window.YT && window.YT.Player) {
        isYTReady = true;
        return true;
    }
    loadYouTubeIFrameAPI();
    if (ytReadyPromise) {
        await ytReadyPromise;
    }
    return !!(window.YT && window.YT.Player);
}

// ==========================================================
// 2. Real-Time Firestore State Sync (Publisher & Subscriber)
// ==========================================================
function listenToWatchTogetherState() {
    if (!firestoreDb || !currentCallId) return;

    if (unsubscribeWatchTogether) unsubscribeWatchTogether();

    const stateDocRef = doc(firestoreDb, "calls", currentCallId, "watch_together", "state");

    unsubscribeWatchTogether = onSnapshot(stateDocRef, (docSnap) => {
        const data = docSnap.data();
        if (!data) return;

        // Ignore echo events sent by self
        if (data.updatedBy === currentAuthUser.uid) return;

        console.log("[WatchTogether Sync] Remote State:", data);

        if (!data.active) {
            if (isTheaterActive) {
                if (showToastFn) showToastFn("Partner closed Watch Together.", "info", 2500);
                exitTheaterMode(false);
            }
            return;
        }

        // Apply Remote State
        applyRemoteSyncState(data);
    }, (err) => console.warn("[WatchTogether] Sync notice:", err.message));
}

async function broadcastSyncState(updates = {}) {
    if (!firestoreDb || !currentCallId || isRemoteSync) return;

    try {
        const stateDocRef = doc(firestoreDb, "calls", currentCallId, "watch_together", "state");
        await setDoc(stateDocRef, {
            active: isTheaterActive,
            mode: currentMode,
            ...updates,
            updatedBy: currentAuthUser.uid,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (err) {
        console.error("[WatchTogether] Broadcast state error:", err);
    }
}

/**
 * Apply Incoming State from Partner
 */
function applyRemoteSyncState(data) {
    isRemoteSync = true;
    lastRemoteActionTimestamp = Date.now();

    // If theater not opened yet, enter theater mode
    if (!isTheaterActive) {
        enterTheaterMode(data.mode, data.title || "Watching Together ❤️");
    }

    if (data.mode === "youtube") {
        syncYouTubeRemoteState(data);
    } else if (data.mode === "screenshare") {
        syncScreenShareRemoteState(data);
    } else if (data.mode === "local") {
        syncLocalVideoRemoteState(data);
    }

    setTimeout(() => {
        isRemoteSync = false;
    }, 1200);
}

// ==========================================================
// 3. YouTube Player Controller & Loopback Protection
// ==========================================================
async function createOrLoadYouTubePlayer(videoId, autoPlay = true) {
    if (wtYTContainer) wtYTContainer.classList.remove("hidden");
    if (wtScreenContainer) wtScreenContainer.classList.add("hidden");
    if (wtLocalContainer) wtLocalContainer.classList.add("hidden");
    if (wtVideoControls) wtVideoControls.classList.add("hidden");

    const ready = await ensureYouTubeReady();
    if (!ready) {
        if (showToastFn) showToastFn("Loading YouTube player... please retry in a moment.", "info", 2000);
        return;
    }

    // Reset iframe container if player doesn't exist
    if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
        try {
            ytPlayer.loadVideoById({
                videoId: videoId,
                startSeconds: 0
            });
            if (autoPlay) ytPlayer.playVideo();
            return;
        } catch (e) {
            console.warn("[WatchTogether] Reloading YouTube player instance:", e);
        }
    }

    // Ensure pristine target div exists inside wrapper
    if (wtYTWrapper) {
        wtYTWrapper.innerHTML = '<div id="yt-player" class="w-full h-full aspect-video"></div>';
    }

    ytPlayer = new window.YT.Player("yt-player", {
        videoId: videoId,
        playerVars: {
            autoplay: autoPlay ? 1 : 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1
        },
        events: {
            onReady: (event) => {
                if (autoPlay) {
                    try {
                        event.target.playVideo();
                    } catch (e) {
                        console.warn("[WatchTogether] Autoplay deferred by browser policy.");
                    }
                }
            },
            onStateChange: onYouTubeStateChange
        }
    });
}

function onYouTubeStateChange(event) {
    if (isRemoteSync || !isTheaterActive) return;

    // Suppress loopback echoes within 1.5s of remote action
    if (Date.now() - lastRemoteActionTimestamp < 1500) return;

    const playerState = event.data;
    const currentTime = ytPlayer && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    const playbackRate = ytPlayer && ytPlayer.getPlaybackRate ? ytPlayer.getPlaybackRate() : 1.0;

    if (playerState === window.YT.PlayerState.PLAYING) {
        if (lastBroadcastState === "playing" && Math.abs(currentTime - lastBroadcastTime) < 1.0) {
            return;
        }
        lastBroadcastState = "playing";
        lastBroadcastTime = currentTime;

        broadcastSyncState({
            state: "playing",
            currentTime: currentTime,
            playbackRate: playbackRate
        });
    } else if (playerState === window.YT.PlayerState.PAUSED) {
        if (lastBroadcastState === "paused") return;
        lastBroadcastState = "paused";
        lastBroadcastTime = currentTime;

        broadcastSyncState({
            state: "paused",
            currentTime: currentTime,
            playbackRate: playbackRate
        });
    }
}

function syncYouTubeRemoteState(data) {
    lastRemoteActionTimestamp = Date.now();

    if (!ytPlayer || !ytPlayer.getPlayerState) {
        createOrLoadYouTubePlayer(data.src, data.state === "playing");
        return;
    }

    // Check if video source changed
    const currentUrl = ytPlayer.getVideoUrl ? ytPlayer.getVideoUrl() : "";
    if (data.src && !currentUrl.includes(data.src)) {
        createOrLoadYouTubePlayer(data.src, data.state === "playing");
        return;
    }

    // Time Seek Sync (threshold > 2.0s to avoid minor jitter)
    const localTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    if (typeof data.currentTime === "number" && Math.abs(localTime - data.currentTime) > 2.0) {
        ytPlayer.seekTo(data.currentTime, true);
    }

    // Playback Rate Sync
    if (typeof data.playbackRate === "number" && ytPlayer.setPlaybackRate) {
        ytPlayer.setPlaybackRate(data.playbackRate);
    }

    // Play / Pause Sync
    const currentState = ytPlayer.getPlayerState();
    if (data.state === "playing" && currentState !== window.YT.PlayerState.PLAYING && currentState !== window.YT.PlayerState.BUFFERING) {
        ytPlayer.playVideo();
    } else if (data.state === "paused" && currentState !== window.YT.PlayerState.PAUSED) {
        ytPlayer.pauseVideo();
    }
}

// ==========================================================
// 4. Screen Share Controller (System Audio Live)
// ==========================================================
function syncScreenShareRemoteState(data) {
    if (wtYTContainer) wtYTContainer.classList.add("hidden");
    if (wtScreenContainer) wtScreenContainer.classList.remove("hidden");
    if (wtLocalContainer) wtLocalContainer.classList.add("hidden");
    if (wtVideoControls) wtVideoControls.classList.add("hidden");

    if (syncedScreenVideo) {
        // As viewer, attach incoming remote WebRTC stream containing shared screen & mixed system audio
        if (activeRemoteStream && syncedScreenVideo.srcObject !== activeRemoteStream) {
            syncedScreenVideo.srcObject = activeRemoteStream;
        }
        syncedScreenVideo.muted = false; // Viewer must hear the audio!
        syncedScreenVideo.play().catch(console.warn);
    }

    if (wtScreenAudioBadge) {
        wtScreenAudioBadge.classList.remove("hidden");
        if (wtScreenAudioText) {
            wtScreenAudioText.textContent = data.hasSystemAudio ? "System Audio Live 🔊" : "Screen Sharing Active";
        }
    }
}

// ==========================================================
// 5. HTML5 Local Video Player Controller
// ==========================================================
function setupLocalVideoPlayer(src) {
    if (wtYTContainer) wtYTContainer.classList.add("hidden");
    if (wtScreenContainer) wtScreenContainer.classList.add("hidden");
    if (wtLocalContainer) wtLocalContainer.classList.remove("hidden");
    if (wtVideoControls) wtVideoControls.classList.remove("hidden");

    if (syncedLocalVideo) {
        syncedLocalVideo.src = src;
        syncedLocalVideo.play().catch(console.warn);
    }
}

function syncLocalVideoRemoteState(data) {
    if (!syncedLocalVideo) return;

    if (data.src && !data.src.startsWith("blob:") && syncedLocalVideo.src !== data.src && !syncedLocalVideo.src.includes(data.src)) {
        syncedLocalVideo.src = data.src;
    } else if (data.mode === "local" && !localVideoUrl && !syncedLocalVideo.src) {
        if (showToastFn) {
            showToastFn("Partner started a local video. (Tip: Use Screen Share to stream with audio without needing the file!) 🎬", "info", 5000);
        }
    }

    // Time Seek Sync (threshold > 1.8s)
    if (typeof data.currentTime === "number" && Math.abs(syncedLocalVideo.currentTime - data.currentTime) > 1.8) {
        syncedLocalVideo.currentTime = data.currentTime;
    }

    // Playback Rate Sync
    if (typeof data.playbackRate === "number") {
        syncedLocalVideo.playbackRate = data.playbackRate;
        if (wtCtrlSpeed) wtCtrlSpeed.value = String(data.playbackRate);
    }

    // Play / Pause Sync
    if (data.state === "playing" && syncedLocalVideo.paused) {
        syncedLocalVideo.play().catch(console.warn);
    } else if (data.state === "paused" && !syncedLocalVideo.paused) {
        syncedLocalVideo.pause();
    }
}

// ==========================================================
// 6. Theater Mode Layout Coordinator
// ==========================================================
export function enterTheaterMode(mode, title = "Watching Together ❤️") {
    isTheaterActive = true;
    currentMode = mode;

    if (wtStageTitle) wtStageTitle.textContent = title;
    if (wtStageIcon) {
        if (mode === "youtube") wtStageIcon.textContent = "smart_display";
        else if (mode === "screenshare") wtStageIcon.textContent = "screen_share";
        else wtStageIcon.textContent = "movie";
    }

    if (watchTogetherStage) {
        watchTogetherStage.classList.remove("hidden");
        watchTogetherStage.classList.add("flex");
    }

    // Activate Dual Floating PIP Webcams
    if (remoteVideoPipContainer) remoteVideoPipContainer.classList.remove("hidden");
    
    // Instead of hiding remoteVideoStandard completely, ensure it remains in DOM for uninterrupted audio
    if (remoteVideoStandard) {
        remoteVideoStandard.classList.add("opacity-0", "pointer-events-none");
    }
    if (localVideoContainer) {
        localVideoContainer.classList.add("scale-90");
    }

    // Stage Mode Switching
    if (mode === "youtube") {
        if (wtYTContainer) wtYTContainer.classList.remove("hidden");
        if (wtScreenContainer) wtScreenContainer.classList.add("hidden");
        if (wtLocalContainer) wtLocalContainer.classList.add("hidden");
        if (wtVideoControls) wtVideoControls.classList.add("hidden");
    } else if (mode === "screenshare") {
        if (wtYTContainer) wtYTContainer.classList.add("hidden");
        if (wtScreenContainer) wtScreenContainer.classList.remove("hidden");
        if (wtLocalContainer) wtLocalContainer.classList.add("hidden");
        if (wtVideoControls) wtVideoControls.classList.add("hidden");
    } else if (mode === "local") {
        if (wtYTContainer) wtYTContainer.classList.add("hidden");
        if (wtScreenContainer) wtScreenContainer.classList.add("hidden");
        if (wtLocalContainer) wtLocalContainer.classList.remove("hidden");
        if (wtVideoControls) wtVideoControls.classList.remove("hidden");
    }

    if (showToastFn) showToastFn(`Theater Mode: ${title}`, "info", 2500);
}

export function exitTheaterMode(broadcast = true) {
    const previousMode = currentMode;
    isTheaterActive = false;

    if (watchTogetherStage) {
        watchTogetherStage.classList.add("hidden");
        watchTogetherStage.classList.remove("flex");
    }

    // Stop Screen Sharing if user was sharing
    if (previousMode === "screenshare" && isLocalSharer) {
        const bridge = screenShareBridge || window.webrtcScreenShare;
        if (bridge && typeof bridge.stopScreenShare === "function") {
            bridge.stopScreenShare(false);
        }
    }
    isLocalSharer = false;

    // Pause any playing media
    if (ytPlayer && ytPlayer.pauseVideo) {
        try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    if (syncedLocalVideo) {
        syncedLocalVideo.pause();
    }
    if (syncedScreenVideo) {
        syncedScreenVideo.srcObject = null;
    }

    // Restore Standard Fullscreen Remote Video
    if (remoteVideoPipContainer) remoteVideoPipContainer.classList.add("hidden");
    if (remoteVideoStandard) {
        remoteVideoStandard.classList.remove("opacity-0", "pointer-events-none");
    }
    if (localVideoContainer) {
        localVideoContainer.classList.remove("scale-90");
    }

    if (broadcast) {
        broadcastSyncState({ active: false });
    }
}

// ==========================================================
// 7. UI Events & Modal Setup
// ==========================================================
function setupModalEvents() {
    // Toolbar Trigger Button in Active Call
    if (callWatchTogetherBtn) {
        callWatchTogetherBtn.addEventListener("click", () => {
            if (watchTogetherModal) {
                watchTogetherModal.classList.remove("hidden");
                watchTogetherModal.classList.add("flex");
            }
        });
    }

    // Close Modal Button
    if (wtModalCloseBtn) {
        wtModalCloseBtn.addEventListener("click", () => {
            if (watchTogetherModal) {
                watchTogetherModal.classList.add("hidden");
                watchTogetherModal.classList.remove("flex");
            }
        });
    }

    // Backdrop Click Dismiss
    if (watchTogetherModal) {
        watchTogetherModal.addEventListener("click", (e) => {
            if (e.target === watchTogetherModal) {
                watchTogetherModal.classList.add("hidden");
                watchTogetherModal.classList.remove("flex");
            }
        });
    }

    // Exit Theater Stage Button
    if (wtStageExitBtn) {
        wtStageExitBtn.addEventListener("click", () => {
            exitTheaterMode(true);
        });
    }

    // Tab Switching
    function setTabActive(activeTab, activePanel) {
        const tabs = [wtTabYT, wtTabScreen, wtTabLocal];
        const panels = [wtPanelYT, wtPanelScreen, wtPanelLocal];

        tabs.forEach((tab) => {
            if (tab === activeTab) {
                tab.className = "flex-1 py-2 rounded-xl text-xs font-quicksand font-bold bg-white text-primary shadow-xs transition-all flex items-center justify-center gap-1";
            } else if (tab) {
                tab.className = "flex-1 py-2 rounded-xl text-xs font-quicksand font-bold text-gray-600 hover:text-primary transition-all flex items-center justify-center gap-1";
            }
        });

        panels.forEach((panel) => {
            if (panel === activePanel) {
                panel.classList.remove("hidden");
            } else if (panel) {
                panel.classList.add("hidden");
            }
        });
    }

    if (wtTabYT) {
        wtTabYT.addEventListener("click", () => {
            currentMode = "youtube";
            setTabActive(wtTabYT, wtPanelYT);
        });
    }

    if (wtTabScreen) {
        wtTabScreen.addEventListener("click", () => {
            currentMode = "screenshare";
            setTabActive(wtTabScreen, wtPanelScreen);
        });
    }

    if (wtTabLocal) {
        wtTabLocal.addEventListener("click", () => {
            currentMode = "local";
            setTabActive(wtTabLocal, wtPanelLocal);
        });
    }

    // Quick YouTube Suggestion Buttons
    wtQuickButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const ytId = btn.getAttribute("data-yt-id");
            if (wtYTUrlInput && ytId) {
                wtYTUrlInput.value = `https://www.youtube.com/watch?v=${ytId}`;
            }
        });
    });

    // Helper to check if call is active
    const isSessionCallActive = () => {
        return !!currentCallId || (screenShareBridge && typeof screenShareBridge.isCallActive === "function" && screenShareBridge.isCallActive()) || (window.isCallActive && window.isCallActive());
    };

    // Helper to start call if needed
    const ensureCallStarted = async () => {
        if (screenShareBridge && typeof screenShareBridge.startCall === "function") {
            await screenShareBridge.startCall();
        } else if (window.webrtcStartCall) {
            await window.webrtcStartCall("video");
        }
    };

    // Start YouTube Sync Button
    if (wtStartYtBtn) {
        wtStartYtBtn.addEventListener("click", async () => {
            if (watchTogetherModal) {
                watchTogetherModal.classList.add("hidden");
                watchTogetherModal.classList.remove("flex");
            }

            const rawInput = (wtYTUrlInput ? wtYTUrlInput.value : "").trim();
            const videoId = extractYouTubeID(rawInput) || "jfKfPfyJRdk"; // Default romantic lofi

            if (!isSessionCallActive()) {
                window.pendingWatchTogetherSession = {
                    mode: "youtube",
                    src: videoId,
                    title: "YouTube Video ❤️"
                };
                if (showToastFn) showToastFn("Starting video call for Watch Together ❤️", "info", 3000);
                await ensureCallStarted();
            } else {
                enterTheaterMode("youtube", "YouTube Video ❤️");
                createOrLoadYouTubePlayer(videoId, true);

                broadcastSyncState({
                    active: true,
                    mode: "youtube",
                    src: videoId,
                    title: "YouTube Video ❤️",
                    state: "playing",
                    currentTime: 0,
                    playbackRate: 1.0
                });
            }
        });
    }

    // Start Screen Share with System Audio Button
    if (wtStartScreenBtn) {
        wtStartScreenBtn.addEventListener("click", async () => {
            if (watchTogetherModal) {
                watchTogetherModal.classList.add("hidden");
                watchTogetherModal.classList.remove("flex");
            }

            const bridge = screenShareBridge || window.webrtcScreenShare;
            if (!isSessionCallActive()) {
                if (showToastFn) showToastFn("Starting video call for Screen Share ❤️", "info", 3000);
                await ensureCallStarted();
                setTimeout(async () => {
                    if (bridge && typeof bridge.startScreenShare === "function") {
                        await bridge.startScreenShare();
                    }
                }, 1500);
            } else {
                if (bridge && typeof bridge.startScreenShare === "function") {
                    await bridge.startScreenShare();
                } else {
                    if (showToastFn) showToastFn("Screen sharing requires an active call session.", "info", 3000);
                }
            }
        });
    }

    // Local Video File Input
    if (wtLocalFileInput) {
        wtLocalFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                if (wtLocalFileLabel) wtLocalFileLabel.textContent = `Selected: ${file.name}`;
                if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
                localVideoUrl = URL.createObjectURL(file);
            }
        });
    }

    // Start Local Video Sync Button
    if (wtStartLocalBtn) {
        wtStartLocalBtn.addEventListener("click", async () => {
            if (!localVideoUrl) {
                if (showToastFn) showToastFn("Please pick a video file first.", "info");
                return;
            }

            if (watchTogetherModal) {
                watchTogetherModal.classList.add("hidden");
                watchTogetherModal.classList.remove("flex");
            }

            if (!isSessionCallActive()) {
                window.pendingWatchTogetherSession = {
                    mode: "local",
                    src: localVideoUrl,
                    title: "Local Movie ❤️"
                };
                if (showToastFn) showToastFn("Starting video call for Movie Night ❤️", "info", 3000);
                await ensureCallStarted();
            } else {
                enterTheaterMode("local", "Local Movie ❤️");
                setupLocalVideoPlayer(localVideoUrl);

                broadcastSyncState({
                    active: true,
                    mode: "local",
                    src: localVideoUrl,
                    title: "Local Movie ❤️",
                    state: "playing",
                    currentTime: 0,
                    playbackRate: 1.0
                });
            }
        });
    }
}

function setupTheaterControls() {
    if (!syncedLocalVideo) return;

    // Play/Pause Local Button
    if (wtCtrlPlayBtn) {
        wtCtrlPlayBtn.addEventListener("click", () => {
            if (syncedLocalVideo.paused) {
                syncedLocalVideo.play();
            } else {
                syncedLocalVideo.pause();
            }
        });
    }

    syncedLocalVideo.addEventListener("play", () => {
        if (wtCtrlPlayIcon) wtCtrlPlayIcon.textContent = "pause";
        if (!isRemoteSync) {
            broadcastSyncState({
                state: "playing",
                currentTime: syncedLocalVideo.currentTime,
                playbackRate: syncedLocalVideo.playbackRate
            });
        }
    });

    syncedLocalVideo.addEventListener("pause", () => {
        if (wtCtrlPlayIcon) wtCtrlPlayIcon.textContent = "play_arrow";
        if (!isRemoteSync) {
            broadcastSyncState({
                state: "paused",
                currentTime: syncedLocalVideo.currentTime,
                playbackRate: syncedLocalVideo.playbackRate
            });
        }
    });

    syncedLocalVideo.addEventListener("timeupdate", () => {
        if (syncedLocalVideo.duration) {
            activeVideoDuration = syncedLocalVideo.duration;
            const progress = (syncedLocalVideo.currentTime / syncedLocalVideo.duration) * 100;
            if (wtCtrlTimeline) wtCtrlTimeline.value = progress;
            if (wtCtrlCurrentTime) wtCtrlCurrentTime.textContent = formatDuration(syncedLocalVideo.currentTime);
            if (wtCtrlDuration) wtCtrlDuration.textContent = formatDuration(syncedLocalVideo.duration);
        }
    });

    // Seek Timeline
    if (wtCtrlTimeline) {
        wtCtrlTimeline.addEventListener("input", (e) => {
            if (syncedLocalVideo.duration) {
                const targetTime = (e.target.value / 100) * syncedLocalVideo.duration;
                syncedLocalVideo.currentTime = targetTime;
                if (!isRemoteSync) {
                    broadcastSyncState({
                        currentTime: targetTime,
                        state: syncedLocalVideo.paused ? "paused" : "playing"
                    });
                }
            }
        });
    }

    // Playback Speed
    if (wtCtrlSpeed) {
        wtCtrlSpeed.addEventListener("change", (e) => {
            const speed = parseFloat(e.target.value) || 1.0;
            syncedLocalVideo.playbackRate = speed;
            if (!isRemoteSync) {
                broadcastSyncState({
                    playbackRate: speed
                });
            }
        });
    }
}

// ==========================================================
// 8. Robust YouTube URL & ID Parser
// ==========================================================
export function extractYouTubeID(url) {
    if (!url) return null;
    url = url.trim();

    // Direct 11-char ID check
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

    // Supports shorts, watch?v=, youtu.be/, embed/, live/
    const patterns = [
        /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+&v=))([\w-]{11})/,
        /youtube\.com\/.*[?&]v=([\w-]{11})/,
        /youtube\.com\/shorts\/([\w-]{11})/
    ];

    for (const regex of patterns) {
        const match = url.match(regex);
        if (match && match[1] && match[1].length === 11) {
            return match[1];
        }
    }
    return null;
}

function formatDuration(sec) {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    return `${m}:${remainder < 10 ? '0' : ''}${remainder}`;
}
