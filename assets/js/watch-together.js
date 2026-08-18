// ==========================================================
// watch-together.js — 1-to-1 "Watch Together" Synchronization Engine
// YouTube & Local Video Real-Time Play/Pause/Seek/Speed Sync + Dual Floating PIP Webcams
// ==========================================================

import { doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// State
let firestoreDb = null;
let currentAuthUser = null;
let currentProfile = null;
let currentCallId = null;
let showToastFn = null;
let unsubscribeWatchTogether = null;

let isRemoteSync = false;
let isTheaterActive = false;
let currentMode = "youtube"; // "youtube" | "local"
let ytPlayer = null;
let isYTReady = false;
let localVideoUrl = null;
let activeVideoDuration = 0;

// DOM Elements
const watchTogetherModal = document.getElementById("watch-together-modal");
const wtModalCloseBtn = document.getElementById("wt-modal-close-btn");
const wtTabYT = document.getElementById("wt-tab-yt");
const wtTabLocal = document.getElementById("wt-tab-local");
const wtPanelYT = document.getElementById("wt-panel-yt");
const wtPanelLocal = document.getElementById("wt-panel-local");
const wtYTUrlInput = document.getElementById("wt-yt-url-input");
const wtLocalFileInput = document.getElementById("wt-local-file-input");
const wtLocalFileLabel = document.getElementById("wt-local-file-label");
const wtStartBtn = document.getElementById("wt-start-btn");
const wtQuickButtons = document.querySelectorAll(".wt-quick-yt");

// Theater Stage DOM
const watchTogetherStage = document.getElementById("watch-together-stage");
const wtStageTitle = document.getElementById("wt-stage-title");
const wtStageExitBtn = document.getElementById("wt-stage-exit-btn");
const wtYTContainer = document.getElementById("wt-yt-container");
const wtLocalContainer = document.getElementById("wt-local-container");
const syncedLocalVideo = document.getElementById("synced-local-video");
const wtVideoControls = document.getElementById("wt-video-controls");
const wtCtrlPlayBtn = document.getElementById("wt-ctrl-play-btn");
const wtCtrlPlayIcon = document.getElementById("wt-ctrl-play-icon");
const wtCtrlCurrentTime = document.getElementById("wt-ctrl-current-time");
const wtCtrlDuration = document.getElementById("wt-ctrl-duration");
const wtCtrlTimeline = document.getElementById("wt-ctrl-timeline");
const wtCtrlSpeed = document.getElementById("wt-ctrl-speed");

// Webcam Dual PIP Containers
const remoteVideoPipContainer = document.getElementById("remote-video-pip-container");
const remotePipVideo = document.getElementById("remote-pip-video");
const localVideoContainer = document.getElementById("local-video-container");
const remoteVideoStandard = document.getElementById("remote-video");
const callWatchTogetherBtn = document.getElementById("call-watch-together-btn");

/**
 * Initialize Watch Together Engine
 */
export function initWatchTogether(user, profile, db, showToast) {
    currentAuthUser = user;
    currentProfile = profile;
    firestoreDb = db;
    showToastFn = showToast || console.log;

    setupModalEvents();
    setupTheaterControls();
    loadYouTubeIFrameAPI();
}

/**
 * Connect Watch Together to Active Call Session
 */
export function connectWatchTogetherToCall(callId, remoteStream) {
    currentCallId = callId;
    if (remotePipVideo && remoteStream) {
        remotePipVideo.srcObject = remoteStream;
    }
    listenToWatchTogetherState();
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
    if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
        localVideoUrl = null;
    }
}

// ==========================================================
// 1. YouTube IFrame API Loader
// ==========================================================
function loadYouTubeIFrameAPI() {
    if (window.YT && window.YT.Player) {
        isYTReady = true;
        return;
    }
    if (!document.getElementById("yt-iframe-script")) {
        const tag = document.createElement("script");
        tag.id = "yt-iframe-script";
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
            console.log("[WatchTogether] YouTube IFrame API Ready");
            isYTReady = true;
        };
    }
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
                if (showToastFn) showToastFn("Partner closed Watch Together.", "info");
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

    // If theater not opened yet, enter theater mode
    if (!isTheaterActive) {
        enterTheaterMode(data.mode, data.title || "Watching Together ❤️");
    }

    if (data.mode === "youtube") {
        syncYouTubeRemoteState(data);
    } else if (data.mode === "local") {
        syncLocalVideoRemoteState(data);
    }

    setTimeout(() => {
        isRemoteSync = false;
    }, 400);
}

// ==========================================================
// 3. YouTube Player Controller
// ==========================================================
function createOrLoadYouTubePlayer(videoId, autoPlay = true) {
    if (wtYTContainer) wtYTContainer.classList.remove("hidden");
    if (wtLocalContainer) wtLocalContainer.classList.add("hidden");
    if (wtVideoControls) wtVideoControls.classList.add("hidden"); // YouTube handles its own controls

    if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
        ytPlayer.loadVideoById({
            videoId: videoId,
            startSeconds: 0
        });
        if (autoPlay) ytPlayer.playVideo();
        return;
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
                if (autoPlay) event.target.playVideo();
            },
            onStateChange: onYouTubeStateChange
        }
    });
}

function onYouTubeStateChange(event) {
    if (isRemoteSync || !isTheaterActive) return;

    const playerState = event.data;
    const currentTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    const playbackRate = ytPlayer.getPlaybackRate ? ytPlayer.getPlaybackRate() : 1.0;

    if (playerState === window.YT.PlayerState.PLAYING) {
        broadcastSyncState({
            state: "playing",
            currentTime: currentTime,
            playbackRate: playbackRate
        });
    } else if (playerState === window.YT.PlayerState.PAUSED) {
        broadcastSyncState({
            state: "paused",
            currentTime: currentTime,
            playbackRate: playbackRate
        });
    }
}

function syncYouTubeRemoteState(data) {
    if (!ytPlayer) {
        createOrLoadYouTubePlayer(data.src, data.state === "playing");
        return;
    }

    // Check if video source changed
    const currentUrl = ytPlayer.getVideoUrl ? ytPlayer.getVideoUrl() : "";
    if (!currentUrl.includes(data.src)) {
        createOrLoadYouTubePlayer(data.src, data.state === "playing");
    }

    // Time Seek Sync (threshold > 1.8s to avoid stutter)
    const localTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    if (typeof data.currentTime === "number" && Math.abs(localTime - data.currentTime) > 1.8) {
        ytPlayer.seekTo(data.currentTime, true);
    }

    // Playback Rate Sync
    if (typeof data.playbackRate === "number" && ytPlayer.setPlaybackRate) {
        ytPlayer.setPlaybackRate(data.playbackRate);
    }

    // Play / Pause Sync
    if (data.state === "playing" && ytPlayer.getPlayerState() !== window.YT.PlayerState.PLAYING) {
        ytPlayer.playVideo();
    } else if (data.state === "paused" && ytPlayer.getPlayerState() !== window.YT.PlayerState.PAUSED) {
        ytPlayer.pauseVideo();
    }
}

// ==========================================================
// 4. HTML5 Local Video Player Controller
// ==========================================================
function setupLocalVideoPlayer(src) {
    if (wtYTContainer) wtYTContainer.classList.add("hidden");
    if (wtLocalContainer) wtLocalContainer.classList.remove("hidden");
    if (wtVideoControls) wtVideoControls.classList.remove("hidden");

    if (syncedLocalVideo) {
        syncedLocalVideo.src = src;
        syncedLocalVideo.play().catch(console.warn);
    }
}

function syncLocalVideoRemoteState(data) {
    if (!syncedLocalVideo) return;

    if (data.src && syncedLocalVideo.src !== data.src && !syncedLocalVideo.src.includes(data.src)) {
        syncedLocalVideo.src = data.src;
    }

    // Time Seek Sync (threshold > 1.5s)
    if (typeof data.currentTime === "number" && Math.abs(syncedLocalVideo.currentTime - data.currentTime) > 1.5) {
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
// 5. Theater Mode Layout Coordinator
// ==========================================================
function enterTheaterMode(mode, title = "Watching Together ❤️") {
    isTheaterActive = true;
    currentMode = mode;

    if (wtStageTitle) wtStageTitle.textContent = title;
    if (watchTogetherStage) {
        watchTogetherStage.classList.remove("hidden");
        watchTogetherStage.classList.add("flex");
    }

    // Activate Dual Floating PIP Webcams
    if (remoteVideoPipContainer) remoteVideoPipContainer.classList.remove("hidden");
    if (remoteVideoStandard) remoteVideoStandard.classList.add("hidden");
    if (localVideoContainer) {
        localVideoContainer.classList.add("scale-90");
    }

    if (showToastFn) showToastFn(`Theater Mode Active: ${title}`, "info", 3000);
}

function exitTheaterMode(broadcast = true) {
    isTheaterActive = false;

    if (watchTogetherStage) {
        watchTogetherStage.classList.add("hidden");
        watchTogetherStage.classList.remove("flex");
    }

    // Pause any playing media
    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    if (syncedLocalVideo) syncedLocalVideo.pause();

    // Restore Standard Fullscreen Remote Video
    if (remoteVideoPipContainer) remoteVideoPipContainer.classList.add("hidden");
    if (remoteVideoStandard) remoteVideoStandard.classList.remove("hidden");
    if (localVideoContainer) localVideoContainer.classList.remove("scale-90");

    if (broadcast) {
        broadcastSyncState({ active: false });
    }
}

// ==========================================================
// 6. UI Events & Modal Setup
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

    // Exit Theater Stage Button
    if (wtStageExitBtn) {
        wtStageExitBtn.addEventListener("click", () => {
            exitTheaterMode(true);
        });
    }

    // Tabs
    if (wtTabYT && wtTabLocal) {
        wtTabYT.addEventListener("click", () => {
            currentMode = "youtube";
            wtTabYT.className = "flex-1 py-2 rounded-xl text-xs font-quicksand font-bold bg-white text-primary shadow-xs transition-all flex items-center justify-center gap-1";
            wtTabLocal.className = "flex-1 py-2 rounded-xl text-xs font-quicksand font-bold text-gray-600 hover:text-primary transition-all flex items-center justify-center gap-1";
            if (wtPanelYT) wtPanelYT.classList.remove("hidden");
            if (wtPanelLocal) wtPanelLocal.classList.add("hidden");
        });

        wtTabLocal.addEventListener("click", () => {
            currentMode = "local";
            wtTabLocal.className = "flex-1 py-2 rounded-xl text-xs font-quicksand font-bold bg-white text-primary shadow-xs transition-all flex items-center justify-center gap-1";
            wtTabYT.className = "flex-1 py-2 rounded-xl text-xs font-quicksand font-bold text-gray-600 hover:text-primary transition-all flex items-center justify-center gap-1";
            if (wtPanelLocal) wtPanelLocal.classList.remove("hidden");
            if (wtPanelYT) wtPanelYT.classList.add("hidden");
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

    // Start Watching Button
    if (wtStartBtn) {
        wtStartBtn.addEventListener("click", () => {
            if (watchTogetherModal) {
                watchTogetherModal.classList.add("hidden");
                watchTogetherModal.classList.remove("flex");
            }

            if (currentMode === "youtube") {
                const rawInput = (wtYTUrlInput ? wtYTUrlInput.value : "").trim();
                const videoId = extractYouTubeID(rawInput) || "jfKfPfyJRdk"; // Default romantic lofi
                
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
            } else {
                if (!localVideoUrl) {
                    if (showToastFn) showToastFn("Please pick a video file first.", "info");
                    return;
                }

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
// 7. Helpers
// ==========================================================
function extractYouTubeID(url) {
    if (!url) return null;
    // Direct ID check (11 chars)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function formatDuration(sec) {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    return `${m}:${remainder < 10 ? '0' : ''}${remainder}`;
}
