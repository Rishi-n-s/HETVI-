// ==========================================================
// webrtc.js — Production-Grade 1-to-1 WebRTC Calling Engine
// WhatsApp-Inspired UX, Call State Machine, Network Resilience,
// Bidirectional ICE Buffering & Cloud Firestore Signaling
// ==========================================================

import {
    doc,
    setDoc,
    updateDoc,
    getDoc,
    onSnapshot,
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    getDocs,
    limit
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { 
    initWatchTogether, 
    connectWatchTogetherToCall, 
    cleanupWatchTogether 
} from "./watch-together.js";

// ==========================================================
// 1. Call States & Configuration
// ==========================================================
export const CallState = Object.freeze({
    IDLE: "IDLE",
    CALLING: "CALLING",
    RINGING: "RINGING",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    DECLINED: "DECLINED",
    BUSY: "BUSY",
    MISSED: "MISSED",
    ENDED: "ENDED",
    FAILED: "FAILED"
});

/**
 * Build dynamic RTC Configuration supporting public STUN + configurable TURN fallback
 */
function getRTCConfiguration() {
    const iceServers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" }
    ];

    // Configurable TURN fallback (via runtime window, env variables, or localStorage)
    const turnUrl = (typeof window !== "undefined" && (window.VITE_TURN_URL || window.TURN_URL || localStorage.getItem("webrtc_turn_url"))) || null;
    const turnUsername = (typeof window !== "undefined" && (window.VITE_TURN_USERNAME || window.TURN_USERNAME || localStorage.getItem("webrtc_turn_user"))) || null;
    const turnCredential = (typeof window !== "undefined" && (window.VITE_TURN_CREDENTIAL || window.TURN_CREDENTIAL || localStorage.getItem("webrtc_turn_credential"))) || null;

    if (turnUrl) {
        const turnConfig = { urls: turnUrl };
        if (turnUsername) turnConfig.username = turnUsername;
        if (turnCredential) turnConfig.credential = turnCredential;
        iceServers.push(turnConfig);
        console.log("[WebRTC] Configured custom TURN server fallback.");
    }

    return {
        iceServers,
        iceCandidatePoolSize: 10
    };
}

// Media Constraints
const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
};

const VIDEO_CONSTRAINTS_USER = {
    facingMode: "user",
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
};

const VIDEO_CONSTRAINTS_ENV = {
    facingMode: "environment",
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
};

// ==========================================================
// 2. Engine State Variables
// ==========================================================
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;
let currentCallDocRef = null;
let currentCallState = CallState.IDLE;
let isCaller = false;
let activeCallType = "video"; // "video" | "audio"
let isMicMuted = false;
let isCameraOff = false;
let remoteCameraOff = false;
let remoteMicMuted = false;
let currentFacingMode = "user";
let isLocalMirrored = localStorage.getItem("webrtc_mirror_local") === "true";
let isRemoteMirrored = false;
let isInitiatingCall = false;

// Candidate Buffering & Deduplication
let iceCandidateQueue = [];
let processedCandidates = new Set();

// Signaling Listeners & Timers
let unsubscribeCallDoc = null;
let unsubscribeCallerCandidates = null;
let unsubscribeCalleeCandidates = null;
let unsubscribeIncomingCalls = null;

let callTimeoutTimer = null; // 35s unanswered timeout
let incomingTimeoutTimer = null; // 45s callee timeout
let callDurationTimer = null;
let callDurationSeconds = 0;
let statsMonitorTimer = null;
let heartbeatInterval = null;
let reconnectRecoveryTimer = null;

// Context
let currentUser = null;
let currentProfile = null;
let db = null;
let showToastFn = null;
let incomingCallData = null;

// Audio Context & Sound Synthesizers
let audioCtx = null;
let ringOscillatorInterval = null;
let ringbackInterval = null;

// DOM Elements
let incomingCallModal = null;
let incomingCallerName = null;
let incomingCallerAvatar = null;
let incomingCallTypeLabel = null;
let incomingCallIcon = null;
let declineCallBtn = null;
let acceptCallBtn = null;
let acceptCallIcon = null;

let activeCallModal = null;
let outgoingCallStage = null;
let outgoingCallerAvatar = null;
let outgoingPartnerName = null;
let outgoingStatusText = null;
let outgoingCancelBtn = null;
let outgoingCallTypeBadge = null;

let remoteVideo = null;
let localVideo = null;
let localVideoContainer = null;
let remoteCamOffPlaceholder = null;
let remoteCamOffAvatar = null;
let remoteCamOffName = null;
let localCamOffPlaceholder = null;
let localCamOffAvatar = null;

let audioCallStage = null;
let audioStageAvatar = null;
let audioStageName = null;
let activeCallAvatar = null;
let activeCallPartnerName = null;
let activeCallStatusLabel = null;
let activeCallStatusDot = null;
let activeCallTimer = null;
let activeCallTypeBadge = null;
let callReconnectingBanner = null;
let callQualityIndicator = null;
let callQualityDot = null;
let callQualityText = null;

let callToggleMicBtn = null;
let callToggleMicIcon = null;
let callToggleCamBtn = null;
let callToggleCamIcon = null;
let callToggleMirrorBtn = null;
let callToggleMirrorIcon = null;
let localMirrorBtn = null;
let callSwitchCamBtn = null;
let localSwitchCamBtn = null;
let callHangupBtn = null;

// Diagnostics Elements
let callDebugToggleBtn = null;
let webrtcDebugHud = null;
let webrtcDebugCloseBtn = null;
let debugConnState = null;
let debugIceState = null;
let debugRtt = null;
let debugLoss = null;
let debugResolution = null;
let debugFps = null;
let debugCandPair = null;

// ==========================================================
// 3. Initialization & DOM Bindings
// ==========================================================
export function initWebRTC(user, profile, firestoreDb, showToast) {
    currentUser = user;
    currentProfile = profile;
    db = firestoreDb;
    showToastFn = showToast || console.log;

    bindDOMElements();
    bindEventHandlers();
    setupDraggablePIP();
    applyMirrorStyles();
    listenForIncomingCalls();

    // Initialize Watch Together Engine
    initWatchTogether(currentUser, currentProfile, db, showToastFn);

    // Auto cleanup call if page is closed or refreshed
    window.addEventListener("beforeunload", () => {
        if (currentCallId) {
            endActiveCall(true);
        }
    });
    window.addEventListener("pagehide", () => {
        if (currentCallId) {
            endActiveCall(true);
        }
    });

    // Network connectivity listeners
    window.addEventListener("online", handleNetworkOnline);
    window.addEventListener("offline", handleNetworkOffline);

    // Global debug toggle helper
    window.toggleWebRTCDebug = toggleDebugHud;

    console.log("[WebRTC] Production Calling Engine initialized for:", currentUser.email);
}

function bindDOMElements() {
    // Incoming modal
    incomingCallModal = document.getElementById("incoming-call-modal");
    incomingCallerName = document.getElementById("incoming-caller-name");
    incomingCallerAvatar = document.getElementById("incoming-caller-avatar");
    incomingCallTypeLabel = document.getElementById("incoming-call-type-label");
    incomingCallIcon = document.getElementById("incoming-call-icon");
    declineCallBtn = document.getElementById("decline-call-btn");
    acceptCallBtn = document.getElementById("accept-call-btn");
    acceptCallIcon = document.getElementById("accept-call-icon");

    // Active call screen
    activeCallModal = document.getElementById("active-call-modal");
    outgoingCallStage = document.getElementById("outgoing-call-stage");
    outgoingCallerAvatar = document.getElementById("outgoing-caller-avatar");
    outgoingPartnerName = document.getElementById("outgoing-partner-name");
    outgoingStatusText = document.getElementById("outgoing-status-text");
    outgoingCancelBtn = document.getElementById("outgoing-cancel-btn");
    outgoingCallTypeBadge = document.getElementById("outgoing-call-type-badge");

    remoteVideo = document.getElementById("remote-video");
    localVideo = document.getElementById("local-video");
    localVideoContainer = document.getElementById("local-video-container");
    remoteCamOffPlaceholder = document.getElementById("remote-cam-off-placeholder");
    remoteCamOffAvatar = document.getElementById("remote-cam-off-avatar");
    remoteCamOffName = document.getElementById("remote-cam-off-name");
    localCamOffPlaceholder = document.getElementById("local-cam-off-placeholder");
    localCamOffAvatar = document.getElementById("local-cam-off-avatar");

    audioCallStage = document.getElementById("audio-call-stage");
    audioStageAvatar = document.getElementById("audio-stage-avatar");
    audioStageName = document.getElementById("audio-stage-name");
    activeCallAvatar = document.getElementById("active-call-avatar");
    activeCallPartnerName = document.getElementById("active-call-partner-name");
    activeCallStatusLabel = document.getElementById("active-call-status-label");
    activeCallStatusDot = document.getElementById("active-call-status-dot");
    activeCallTimer = document.getElementById("active-call-timer");
    activeCallTypeBadge = document.getElementById("active-call-type-badge");
    callReconnectingBanner = document.getElementById("call-reconnecting-banner");
    callQualityIndicator = document.getElementById("call-quality-indicator");
    callQualityDot = document.getElementById("call-quality-dot");
    callQualityText = document.getElementById("call-quality-text");

    // Controls
    callToggleMicBtn = document.getElementById("call-toggle-mic-btn");
    callToggleMicIcon = document.getElementById("call-toggle-mic-icon");
    callToggleCamBtn = document.getElementById("call-toggle-cam-btn");
    callToggleCamIcon = document.getElementById("call-toggle-cam-icon");
    callToggleMirrorBtn = document.getElementById("call-toggle-mirror-btn");
    callToggleMirrorIcon = document.getElementById("call-toggle-mirror-icon");
    localMirrorBtn = document.getElementById("local-mirror-btn");
    callSwitchCamBtn = document.getElementById("call-switch-cam-btn");
    localSwitchCamBtn = document.getElementById("local-switch-cam-btn");
    callHangupBtn = document.getElementById("call-hangup-btn");

    // Debug elements
    callDebugToggleBtn = document.getElementById("call-debug-toggle-btn");
    webrtcDebugHud = document.getElementById("webrtc-debug-hud");
    webrtcDebugCloseBtn = document.getElementById("webrtc-debug-close-btn");
    debugConnState = document.getElementById("debug-conn-state");
    debugIceState = document.getElementById("debug-ice-state");
    debugRtt = document.getElementById("debug-rtt");
    debugLoss = document.getElementById("debug-loss");
    debugResolution = document.getElementById("debug-resolution");
    debugFps = document.getElementById("debug-fps");
    debugCandPair = document.getElementById("debug-cand-pair");
}

function bindEventHandlers() {
    if (declineCallBtn) declineCallBtn.addEventListener("click", rejectIncomingCall);
    if (acceptCallBtn) acceptCallBtn.addEventListener("click", acceptIncomingCall);
    if (outgoingCancelBtn) outgoingCancelBtn.addEventListener("click", () => endActiveCall(true));
    if (callHangupBtn) callHangupBtn.addEventListener("click", () => endActiveCall(true));

    if (callToggleMicBtn) callToggleMicBtn.addEventListener("click", toggleMicrophone);
    if (callToggleCamBtn) callToggleCamBtn.addEventListener("click", toggleCamera);
    if (callToggleMirrorBtn) callToggleMirrorBtn.addEventListener("click", toggleLocalMirror);
    if (localMirrorBtn) localMirrorBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLocalMirror();
    });
    if (callSwitchCamBtn) callSwitchCamBtn.addEventListener("click", switchCameraDevice);
    if (localSwitchCamBtn) localSwitchCamBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        switchCameraDevice();
    });

    if (callDebugToggleBtn) callDebugToggleBtn.addEventListener("click", toggleDebugHud);
    if (webrtcDebugCloseBtn) webrtcDebugCloseBtn.addEventListener("click", toggleDebugHud);

    // Keyboard shortcut Ctrl+Shift+D for debug HUD
    window.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
            e.preventDefault();
            toggleDebugHud();
        }
    });
}

// ==========================================================
// 4. Call State Machine & UI Management
// ==========================================================
function setCallState(newState, detail = "") {
    const previousState = currentCallState;
    currentCallState = newState;
    console.log(`[WebRTC State] ${previousState} ➔ ${newState} ${detail ? `(${detail})` : ""}`);

    if (debugConnState) {
        debugConnState.textContent = newState;
    }

    switch (newState) {
        case CallState.IDLE:
            stopAllSounds();
            stopCallDurationTimer();
            stopStatsMonitoring();
            hideActiveCallUI();
            hideIncomingCallModal();
            break;

        case CallState.CALLING:
            showActiveCallModal();
            showOutgoingStage("Calling...");
            startRingbackTone();
            break;

        case CallState.RINGING:
            showActiveCallModal();
            showOutgoingStage("Ringing...");
            break;

        case CallState.CONNECTING:
            stopRingbackTone();
            stopRingingSound();
            if (activeCallStatusLabel) {
                activeCallStatusLabel.textContent = "Connecting...";
            }
            if (activeCallStatusDot) {
                activeCallStatusDot.className = "w-2 h-2 rounded-full bg-yellow-400 animate-pulse";
            }
            break;

        case CallState.CONNECTED:
            stopRingbackTone();
            stopRingingSound();
            clearTimeout(callTimeoutTimer);
            callTimeoutTimer = null;
            clearTimeout(reconnectRecoveryTimer);
            reconnectRecoveryTimer = null;

            if (callReconnectingBanner) {
                callReconnectingBanner.classList.add("hidden");
                callReconnectingBanner.classList.remove("flex");
            }

            hideOutgoingStage();
            startCallDurationTimer();
            startStatsMonitoring();
            startHeartbeat();

            if (activeCallStatusLabel) {
                activeCallStatusLabel.textContent = "Connected";
            }
            if (activeCallStatusDot) {
                activeCallStatusDot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
            }
            break;

        case CallState.RECONNECTING:
            if (callReconnectingBanner) {
                callReconnectingBanner.classList.remove("hidden");
                callReconnectingBanner.classList.add("flex");
            }
            if (activeCallStatusLabel) {
                activeCallStatusLabel.textContent = "Reconnecting...";
            }
            if (activeCallStatusDot) {
                activeCallStatusDot.className = "w-2 h-2 rounded-full bg-amber-400 animate-ping";
            }
            break;

        case CallState.DECLINED:
            showToastFn("Call declined.", "info", 3000);
            playTone("declined");
            endActiveCall(false);
            break;

        case CallState.BUSY:
            showToastFn("Partner is busy in another call.", "warning", 3500);
            playTone("busy");
            endActiveCall(false);
            break;

        case CallState.MISSED:
            showToastFn("No answer. Call ended.", "info", 3000);
            playTone("ended");
            endActiveCall(false);
            break;

        case CallState.FAILED:
            showToastFn("Call connection failed. Please check network.", "error", 4000);
            playTone("ended");
            endActiveCall(true);
            break;

        case CallState.ENDED:
            showToastFn("Call ended.", "info", 2000);
            playTone("ended");
            endActiveCall(false);
            break;
    }
}

function showActiveCallModal() {
    if (activeCallModal) {
        activeCallModal.classList.remove("hidden");
        activeCallModal.classList.add("flex");
    }
}

function hideActiveCallUI() {
    if (activeCallModal) {
        activeCallModal.classList.add("hidden");
        activeCallModal.classList.remove("flex");
    }
    if (outgoingCallStage) {
        outgoingCallStage.classList.add("hidden");
        outgoingCallStage.classList.remove("flex");
    }
}

function showOutgoingStage(statusText = "Calling...") {
    if (outgoingCallStage) {
        outgoingCallStage.classList.remove("hidden");
        outgoingCallStage.classList.add("flex");
    }
    if (outgoingStatusText) {
        outgoingStatusText.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-pink-400 animate-ping"></span>
            ${statusText}
        `;
    }
}

function hideOutgoingStage() {
    if (outgoingCallStage) {
        outgoingCallStage.classList.add("hidden");
        outgoingCallStage.classList.remove("flex");
    }
}

// ==========================================================
// 5. Incoming Call Listener on Firestore
// ==========================================================
function listenForIncomingCalls() {
    if (!currentUser || !db) return;
    if (unsubscribeIncomingCalls) unsubscribeIncomingCalls();

    const cleanCalleeEmail = (currentUser.email || "").toLowerCase().trim();
    const callsCol = collection(db, "calls");
    const q = query(
        callsCol,
        where("callee.email", "==", cleanCalleeEmail),
        where("status", "in", ["calling", "ringing"])
    );

    unsubscribeIncomingCalls = onSnapshot(
        q,
        (snapshot) => {
            if (snapshot.empty) {
                if (incomingCallModal && !incomingCallModal.classList.contains("hidden")) {
                    hideIncomingCallModal();
                }
                return;
            }

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const createdAt = data.createdAt ? (data.createdAt.toMillis ? data.createdAt.toMillis() : data.createdAt) : Date.now();
                const age = Date.now() - createdAt;

                // Call must be fresh (under 45 seconds old)
                if (age < 45000) {
                    // Check if current user is busy in an active call
                    if (currentCallId && currentCallId !== docSnap.id) {
                        console.warn("[WebRTC] Callee is busy in another call. Responding with BUSY status.");
                        updateDoc(doc(db, "calls", docSnap.id), {
                            status: "busy",
                            endedAt: serverTimestamp()
                        }).catch(console.warn);
                        return;
                    }

                    if (!currentCallId) {
                        showIncomingCallModal(docSnap.id, data);
                    }
                }
            });
        },
        (error) => {
            console.warn("[WebRTC] Incoming call listener notice:", error.message);
        }
    );
}

function showIncomingCallModal(callId, data) {
    incomingCallData = { callId, ...data };

    const isVideo = data.callType === "video";
    const callerName = data.caller ? data.caller.name : "Your Love";
    const callerAvatar = (data.caller && data.caller.avatar) || (callerName.toLowerCase().includes("rishi") ? "assets/images/rishi_profile.jpg" : "assets/images/hetvi_profile.jpg");

    if (incomingCallerName) incomingCallerName.textContent = callerName;
    if (incomingCallerAvatar) incomingCallerAvatar.src = callerAvatar;
    if (incomingCallTypeLabel) incomingCallTypeLabel.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-pink-400 animate-ping"></span>
        Incoming ${isVideo ? 'Video' : 'Audio'} Call...
    `;
    if (incomingCallIcon) incomingCallIcon.textContent = isVideo ? "videocam" : "call";
    if (acceptCallIcon) acceptCallIcon.textContent = isVideo ? "videocam" : "call";

    if (incomingCallModal) {
        incomingCallModal.classList.remove("hidden");
        incomingCallModal.classList.add("flex");
    }

    startRingingSound();

    // Acknowledge call receipt by updating status to "ringing" in Firestore
    try {
        const callDocRef = doc(db, "calls", callId);
        updateDoc(callDocRef, {
            status: "ringing",
            ringingAt: serverTimestamp()
        }).catch(() => {});
    } catch (e) {
        console.warn("[WebRTC] Failed to send ringing acknowledgment:", e);
    }

    // Auto-timeout incoming call after 40 seconds if unanswered
    clearTimeout(incomingTimeoutTimer);
    incomingTimeoutTimer = setTimeout(() => {
        if (incomingCallData && incomingCallData.callId === callId) {
            console.log("[WebRTC] Incoming call timed out.");
            hideIncomingCallModal();
        }
    }, 40000);
}

function hideIncomingCallModal() {
    incomingCallData = null;
    clearTimeout(incomingTimeoutTimer);
    incomingTimeoutTimer = null;
    stopRingingSound();
    if (incomingCallModal) {
        incomingCallModal.classList.add("hidden");
        incomingCallModal.classList.remove("flex");
    }
}

// ==========================================================
// 6. ICE Candidate Queue & Flush Engine
// ==========================================================
async function addOrQueueIceCandidate(candidateData) {
    if (!candidateData || !candidateData.candidate) return;

    // Deduplication check
    const candKey = `${candidateData.sdpMid}_${candidateData.sdpMLineIndex}_${candidateData.candidate}`;
    if (processedCandidates.has(candKey)) return;
    processedCandidates.add(candKey);

    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
        } catch (e) {
            console.warn("[WebRTC] Failed to add ICE candidate directly:", e);
        }
    } else {
        iceCandidateQueue.push(candidateData);
    }
}

async function flushQueuedIceCandidates() {
    if (!peerConnection || !peerConnection.remoteDescription) return;
    while (iceCandidateQueue.length > 0) {
        const candidateData = iceCandidateQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
        } catch (e) {
            console.warn("[WebRTC] Error adding buffered ICE candidate:", e);
        }
    }
}

// ==========================================================
// 7. Start Outgoing Call (Caller Workflow)
// ==========================================================
export async function startCall(type = "video") {
    if (currentCallId || isInitiatingCall) {
        showToastFn("A call is already in progress.", "info");
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToastFn("Camera & Microphone access requires HTTPS.", "error");
        return;
    }

    isInitiatingCall = true;
    activeCallType = type;
    isCaller = true;
    isMicMuted = false;
    isCameraOff = false;
    remoteCameraOff = false;
    remoteMicMuted = false;
    iceCandidateQueue = [];
    processedCandidates.clear();

    pauseBackgroundMusic();

    const isCurrentRishi = (currentUser.email || "").toLowerCase().includes("rishi") || (currentProfile.name || "").toLowerCase().includes("rishi");
    const partnerName = isCurrentRishi ? "Bakudi ❤️" : "Rishi ❤️";
    const partnerEmail = isCurrentRishi ? "hetvidodiya2447@gmail.com" : "rishisolanki7319@gmail.com";
    const partnerAvatar = isCurrentRishi ? "assets/images/hetvi_profile.jpg" : "assets/images/rishi_profile.jpg";
    const callerAvatar = isCurrentRishi ? "assets/images/rishi_profile.jpg" : "assets/images/hetvi_profile.jpg";

    try {
        // 1. Check if partner is currently in a call (Busy check)
        const callsCol = collection(db, "calls");
        const busyQuery = query(
            callsCol,
            where("callee.email", "==", partnerEmail),
            where("status", "in", ["calling", "ringing", "connected"]),
            limit(1)
        );
        const busySnap = await getDocs(busyQuery);
        if (!busySnap.empty) {
            const activeDoc = busySnap.docs[0].data();
            const createdAt = activeDoc.createdAt ? (activeDoc.createdAt.toMillis ? activeDoc.createdAt.toMillis() : activeDoc.createdAt) : Date.now();
            if (Date.now() - createdAt < 40000) {
                isInitiatingCall = false;
                setCallState(CallState.BUSY);
                return;
            }
        }

        // 2. Acquire Local Media Stream
        const constraints = {
            audio: AUDIO_CONSTRAINTS,
            video: activeCallType === "video" ? (currentFacingMode === "user" ? VIDEO_CONSTRAINTS_USER : VIDEO_CONSTRAINTS_ENV) : false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (localVideo) {
            localVideo.srcObject = localStream;
            applyMirrorStyles();
        }

        // 3. Populate Outgoing and Active Call UI
        setupCallUIStage(partnerName, partnerAvatar);
        setCallState(CallState.CALLING);

        // 4. Initialize RTCPeerConnection
        peerConnection = new RTCPeerConnection(getRTCConfiguration());
        remoteStream = new MediaStream();
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
        }

        // Attach local tracks
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });

        // Handle remote tracks defensively
        peerConnection.ontrack = handleRemoteTrackEvent;

        // Monitor connection & ICE connection states
        attachPeerConnectionStateListeners();

        // 5. Create Firestore Call Document
        const callId = `call_${Date.now()}_${currentUser.uid.slice(0, 6)}`;
        currentCallId = callId;
        currentCallDocRef = doc(db, "calls", callId);

        const callerCandidatesCol = collection(db, "calls", callId, "callerCandidates");
        const calleeCandidatesCol = collection(db, "calls", callId, "calleeCandidates");

        // Send local ICE candidates to Firestore
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(callerCandidatesCol, event.candidate.toJSON()).catch(console.warn);
            }
        };

        // 6. Create & Set SDP Offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const callPayload = {
            callId: callId,
            callType: activeCallType,
            status: "calling",
            caller: {
                uid: currentUser.uid,
                email: currentUser.email.toLowerCase().trim(),
                name: currentProfile.name,
                avatar: callerAvatar
            },
            callee: {
                email: partnerEmail.toLowerCase().trim(),
                name: partnerName,
                avatar: partnerAvatar
            },
            offer: {
                type: offer.type,
                sdp: offer.sdp
            },
            callerCamOff: isCameraOff,
            callerMicMuted: isMicMuted,
            calleeCamOff: false,
            calleeMicMuted: false,
            createdAt: serverTimestamp(),
            lastHeartbeat: serverTimestamp()
        };

        await setDoc(currentCallDocRef, callPayload);
        isInitiatingCall = false;

        // 7. Start 35s Call Timeout (Unanswered timeout)
        clearTimeout(callTimeoutTimer);
        callTimeoutTimer = setTimeout(() => {
            if (currentCallState === CallState.CALLING || currentCallState === CallState.RINGING) {
                console.log("[WebRTC] Outgoing call timed out after 35s.");
                if (currentCallDocRef) {
                    updateDoc(currentCallDocRef, { status: "missed", endedAt: serverTimestamp() }).catch(() => {});
                }
                setCallState(CallState.MISSED);
            }
        }, 35000);

        // 8. Listen for Remote Answer & Status updates
        unsubscribeCallDoc = onSnapshot(
            currentCallDocRef,
            async (docSnap) => {
                const data = docSnap.data();
                if (!data) return;

                // Sync remote camera/mic states
                if (typeof data.calleeCamOff === "boolean") {
                    updateRemoteCamPlaceholder(data.calleeCamOff);
                }

                if (data.status === "ringing" && currentCallState === CallState.CALLING) {
                    setCallState(CallState.RINGING);
                } else if (data.status === "rejected") {
                    setCallState(CallState.DECLINED);
                } else if (data.status === "busy") {
                    setCallState(CallState.BUSY);
                } else if (data.status === "missed") {
                    setCallState(CallState.MISSED);
                } else if (data.status === "ended") {
                    setCallState(CallState.ENDED);
                } else if (data.status === "connected" && data.answer && (!peerConnection || !peerConnection.currentRemoteDescription)) {
                    try {
                        setCallState(CallState.CONNECTING);
                        const answerDesc = new RTCSessionDescription(data.answer);
                        await peerConnection.setRemoteDescription(answerDesc);
                        console.log("[WebRTC] Remote Answer description applied successfully.");
                        await flushQueuedIceCandidates();
                        connectWatchTogetherToCall(currentCallId, remoteStream);
                    } catch (sdpErr) {
                        console.error("[WebRTC] Error setting remote answer:", sdpErr);
                    }
                }
            },
            (err) => console.warn("[WebRTC] Call doc listener notice:", err.message)
        );

        // 9. Listen for Callee ICE Candidates
        unsubscribeCalleeCandidates = onSnapshot(
            calleeCandidatesCol,
            (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        addOrQueueIceCandidate(change.doc.data());
                    }
                });
            },
            (err) => console.warn("[WebRTC] Callee candidates listener notice:", err.message)
        );

    } catch (err) {
        console.error("[WebRTC] Start Call Error:", err);
        isInitiatingCall = false;
        showToastFn(translateMediaError(err), "error");
        setCallState(CallState.FAILED);
    }
}

// ==========================================================
// 8. Accept Incoming Call (Callee Workflow)
// ==========================================================
async function acceptIncomingCall() {
    if (!incomingCallData) return;

    const { callId, callType, caller, offer } = incomingCallData;
    hideIncomingCallModal();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToastFn("Camera & Microphone access requires HTTPS.", "error");
        return;
    }

    activeCallType = callType || "video";
    isCaller = false;
    isMicMuted = false;
    isCameraOff = false;
    remoteCameraOff = false;
    remoteMicMuted = false;
    currentCallId = callId;
    currentCallDocRef = doc(db, "calls", callId);
    iceCandidateQueue = [];
    processedCandidates.clear();

    pauseBackgroundMusic();

    const partnerName = caller ? caller.name : "Your Love";
    const partnerAvatar = caller && caller.avatar ? caller.avatar : "assets/images/main.jpeg";

    try {
        setupCallUIStage(partnerName, partnerAvatar);
        showActiveCallModal();
        setCallState(CallState.CONNECTING);

        // 1. Acquire Local Media Stream
        const constraints = {
            audio: AUDIO_CONSTRAINTS,
            video: activeCallType === "video" ? (currentFacingMode === "user" ? VIDEO_CONSTRAINTS_USER : VIDEO_CONSTRAINTS_ENV) : false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (localVideo) {
            localVideo.srcObject = localStream;
            applyMirrorStyles();
        }

        // 2. Initialize RTCPeerConnection
        peerConnection = new RTCPeerConnection(getRTCConfiguration());
        remoteStream = new MediaStream();
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
        }

        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = handleRemoteTrackEvent;
        attachPeerConnectionStateListeners();

        const calleeCandidatesCol = collection(db, "calls", callId, "calleeCandidates");
        const callerCandidatesCol = collection(db, "calls", callId, "callerCandidates");

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(calleeCandidatesCol, event.candidate.toJSON()).catch(console.warn);
            }
        };

        // 3. Listen for Caller Candidates
        unsubscribeCallerCandidates = onSnapshot(
            callerCandidatesCol,
            (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        addOrQueueIceCandidate(change.doc.data());
                    }
                });
            },
            (err) => console.warn("[WebRTC] Caller candidates listener notice:", err.message)
        );

        // 4. Set Remote Offer & Create SDP Answer
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        await flushQueuedIceCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // 5. Update Firestore Call Doc with Answer & Connected status
        await updateDoc(currentCallDocRef, {
            answer: {
                type: answer.type,
                sdp: answer.sdp
            },
            status: "connected",
            calleeCamOff: isCameraOff,
            calleeMicMuted: isMicMuted,
            connectedAt: serverTimestamp(),
            lastHeartbeat: serverTimestamp()
        });

        connectWatchTogetherToCall(currentCallId, remoteStream);

        // 6. Listen for Call Status & Hangup by caller
        unsubscribeCallDoc = onSnapshot(
            currentCallDocRef,
            (docSnap) => {
                const data = docSnap.data();
                if (!data) return;

                if (typeof data.callerCamOff === "boolean") {
                    updateRemoteCamPlaceholder(data.callerCamOff);
                }

                if (data.status === "ended") {
                    setCallState(CallState.ENDED);
                } else if (data.status === "missed") {
                    setCallState(CallState.MISSED);
                }
            },
            (err) => console.warn("[WebRTC] Callee call doc listener notice:", err.message)
        );

    } catch (err) {
        console.error("[WebRTC] Accept Call Error:", err);
        showToastFn(translateMediaError(err), "error");
        setCallState(CallState.FAILED);
    }
}

// ==========================================================
// 9. Reject Incoming Call
// ==========================================================
async function rejectIncomingCall() {
    if (!incomingCallData) return;
    const { callId } = incomingCallData;
    hideIncomingCallModal();

    try {
        const callDocRef = doc(db, "calls", callId);
        await updateDoc(callDocRef, {
            status: "rejected",
            endedAt: serverTimestamp()
        });
    } catch (e) {
        console.warn("[WebRTC] Error rejecting call:", e);
    }
}

// ==========================================================
// 10. PeerConnection State Monitoring & Network Recovery
// ==========================================================
function attachPeerConnectionStateListeners() {
    if (!peerConnection) return;

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log("[WebRTC] RTCPeerConnection ConnectionState:", state);

        if (state === "connected") {
            setCallState(CallState.CONNECTED);
        } else if (state === "connecting") {
            setCallState(CallState.CONNECTING);
        } else if (state === "disconnected") {
            setCallState(CallState.RECONNECTING, "Temporary connection drop");
            scheduleReconnectRecovery();
        } else if (state === "failed") {
            console.warn("[WebRTC] Connection failed. Attempting ICE restart recovery...");
            attemptIceRestart();
        } else if (state === "closed") {
            if (currentCallState !== CallState.IDLE) {
                setCallState(CallState.ENDED);
            }
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        console.log("[WebRTC] ICE ConnectionState:", iceState);
        if (debugIceState) {
            debugIceState.textContent = iceState;
        }

        if (iceState === "disconnected") {
            setCallState(CallState.RECONNECTING);
            scheduleReconnectRecovery();
        } else if (iceState === "failed") {
            attemptIceRestart();
        } else if (iceState === "connected" || iceState === "completed") {
            if (currentCallState === CallState.RECONNECTING || currentCallState === CallState.CONNECTING) {
                setCallState(CallState.CONNECTED);
            }
        }
    };
}

async function attemptIceRestart() {
    if (!peerConnection || currentCallState === CallState.IDLE) return;

    try {
        setCallState(CallState.RECONNECTING, "Attempting ICE restart");
        if (peerConnection.restartIce) {
            peerConnection.restartIce();
        }

        if (isCaller && currentCallDocRef) {
            const offer = await peerConnection.createOffer({ iceRestart: true });
            await peerConnection.setLocalDescription(offer);
            await updateDoc(currentCallDocRef, {
                offer: { type: offer.type, sdp: offer.sdp },
                updatedAt: serverTimestamp()
            });
            console.log("[WebRTC] Renegotiated ICE restart offer.");
        }
    } catch (e) {
        console.warn("[WebRTC] ICE restart attempt failed:", e);
    }

    scheduleReconnectRecovery();
}

function scheduleReconnectRecovery() {
    if (reconnectRecoveryTimer) return;
    // Allow up to 14 seconds for WebRTC recovery before terminating
    reconnectRecoveryTimer = setTimeout(() => {
        if (currentCallState === CallState.RECONNECTING) {
            console.warn("[WebRTC] Reconnection timed out after 14s.");
            setCallState(CallState.FAILED, "Reconnection timeout");
        }
    }, 14000);
}

function handleNetworkOffline() {
    console.warn("[WebRTC] Browser reported OFFLINE network event.");
    if (currentCallId) {
        setCallState(CallState.RECONNECTING, "Browser offline");
    }
}

function handleNetworkOnline() {
    console.log("[WebRTC] Browser reported ONLINE network event. Triggering connection check.");
    if (currentCallId && (currentCallState === CallState.RECONNECTING || currentCallState === CallState.CONNECTING)) {
        attemptIceRestart();
    }
}

// ==========================================================
// 11. Remote Track & Autoplay Handling
// ==========================================================
function handleRemoteTrackEvent(event) {
    console.log("[WebRTC] Remote track received:", event.track.kind);

    if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
            if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                remoteStream.addTrack(track);
            }
        });
    } else if (event.track) {
        if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
            remoteStream.addTrack(event.track);
        }
    }

    if (remoteVideo && remoteVideo.srcObject !== remoteStream) {
        remoteVideo.srcObject = remoteStream;
    }

    // Defensive autoplay policy handling for iOS Safari / Chrome
    if (remoteVideo) {
        remoteVideo.play().catch((err) => {
            console.warn("[WebRTC] Remote video autoplay was deferred:", err.message);
            // Retry on next user interaction if blocked
            const retryPlay = () => {
                remoteVideo.play().catch(() => {});
                window.removeEventListener("click", retryPlay);
                window.removeEventListener("touchstart", retryPlay);
            };
            window.addEventListener("click", retryPlay, { once: true });
            window.addEventListener("touchstart", retryPlay, { once: true });
        });
    }
}

// ==========================================================
// 12. Central Cleanup Function (Idempotent)
// ==========================================================
export async function endActiveCall(shouldUpdateFirestore = true) {
    console.log("[WebRTC] Executing centralized call cleanup...");

    isInitiatingCall = false;

    // 0. Cleanup Watch Together
    cleanupWatchTogether();

    // 1. Update Firestore Status
    if (shouldUpdateFirestore && currentCallDocRef) {
        try {
            await updateDoc(currentCallDocRef, {
                status: "ended",
                endedAt: serverTimestamp()
            });
        } catch (e) {
            console.warn("[WebRTC] Could not mark call ended in Firestore:", e);
        }
    }

    // 2. Stop Hardware Tracks
    if (localStream) {
        localStream.getTracks().forEach((track) => {
            try {
                track.stop();
                console.log("[WebRTC] Stopped local track:", track.kind);
            } catch (e) {}
        });
        localStream = null;
    }

    if (remoteStream) {
        remoteStream.getTracks().forEach((track) => {
            try { track.stop(); } catch (e) {}
        });
        remoteStream = null;
    }

    // 3. Close RTCPeerConnection
    if (peerConnection) {
        try {
            peerConnection.onicecandidate = null;
            peerConnection.ontrack = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.oniceconnectionstatechange = null;
            peerConnection.close();
        } catch (e) {}
        peerConnection = null;
    }

    // 4. Unsubscribe Firestore listeners
    if (unsubscribeCallDoc) { unsubscribeCallDoc(); unsubscribeCallDoc = null; }
    if (unsubscribeCallerCandidates) { unsubscribeCallerCandidates(); unsubscribeCallerCandidates = null; }
    if (unsubscribeCalleeCandidates) { unsubscribeCalleeCandidates(); unsubscribeCalleeCandidates = null; }

    // 5. Clear Timers & Intervals
    clearTimeout(callTimeoutTimer);
    callTimeoutTimer = null;
    clearTimeout(incomingTimeoutTimer);
    incomingTimeoutTimer = null;
    clearTimeout(reconnectRecoveryTimer);
    reconnectRecoveryTimer = null;

    stopCallDurationTimer();
    stopStatsMonitoring();
    stopHeartbeat();
    stopAllSounds();

    // 6. Reset UI State
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    hideActiveCallUI();
    hideIncomingCallModal();

    if (remoteCamOffPlaceholder) remoteCamOffPlaceholder.classList.add("hidden");
    if (localCamOffPlaceholder) localCamOffPlaceholder.classList.add("hidden");
    if (callReconnectingBanner) {
        callReconnectingBanner.classList.add("hidden");
        callReconnectingBanner.classList.remove("flex");
    }

    // Reset control buttons
    if (callToggleMicBtn) {
        callToggleMicBtn.classList.remove("bg-rose-600", "text-white");
        callToggleMicBtn.classList.add("bg-white/15");
    }
    if (callToggleMicIcon) callToggleMicIcon.textContent = "mic";

    if (callToggleCamBtn) {
        callToggleCamBtn.classList.remove("bg-rose-600", "text-white");
        callToggleCamBtn.classList.add("bg-white/15");
    }
    if (callToggleCamIcon) callToggleCamIcon.textContent = "videocam";

    // 7. Reset Internal Variables
    currentCallState = CallState.IDLE;
    iceCandidateQueue = [];
    processedCandidates.clear();
    currentCallId = null;
    currentCallDocRef = null;
    isCaller = false;
    isMicMuted = false;
    isCameraOff = false;
    remoteCameraOff = false;
    remoteMicMuted = false;

    // Resume Background Music
    resumeBackgroundMusic();
}

// ==========================================================
// 13. Call Controls (Mute, Camera, Flip, Mirror)
// ==========================================================
function toggleMicrophone() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        isMicMuted = !isMicMuted;
        audioTrack.enabled = !isMicMuted;

        if (callToggleMicBtn) {
            callToggleMicBtn.classList.toggle("bg-rose-600", isMicMuted);
            callToggleMicBtn.classList.toggle("bg-white/15", !isMicMuted);
        }
        if (callToggleMicIcon) {
            callToggleMicIcon.textContent = isMicMuted ? "mic_off" : "mic";
        }

        // Sync mute status to Firestore
        if (currentCallDocRef) {
            const field = isCaller ? "callerMicMuted" : "calleeMicMuted";
            updateDoc(currentCallDocRef, { [field]: isMicMuted }).catch(() => {});
        }

        showToastFn(isMicMuted ? "Microphone muted" : "Microphone on", "info", 1500);
    }
}

function toggleCamera() {
    if (!localStream || activeCallType !== "video") return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        isCameraOff = !isCameraOff;
        videoTrack.enabled = !isCameraOff;

        if (callToggleCamBtn) {
            callToggleCamBtn.classList.toggle("bg-rose-600", isCameraOff);
            callToggleCamBtn.classList.toggle("bg-white/15", !isCameraOff);
        }
        if (callToggleCamIcon) {
            callToggleCamIcon.textContent = isCameraOff ? "videocam_off" : "videocam";
        }

        // Show local camera-off avatar
        if (localCamOffPlaceholder) {
            localCamOffPlaceholder.classList.toggle("hidden", !isCameraOff);
        }

        // Sync camera-off status to Firestore
        if (currentCallDocRef) {
            const field = isCaller ? "callerCamOff" : "calleeCamOff";
            updateDoc(currentCallDocRef, { [field]: isCameraOff }).catch(() => {});
        }

        showToastFn(isCameraOff ? "Camera turned off" : "Camera turned on", "info", 1500);
    }
}

function updateRemoteCamPlaceholder(isOff) {
    remoteCameraOff = isOff;
    if (remoteCamOffPlaceholder) {
        remoteCamOffPlaceholder.classList.toggle("hidden", !isOff);
    }
    if (remoteVideo) {
        remoteVideo.classList.toggle("opacity-0", isOff);
    }
}

function toggleLocalMirror() {
    isLocalMirrored = !isLocalMirrored;
    localStorage.setItem("webrtc_mirror_local", isLocalMirrored ? "true" : "false");
    applyMirrorStyles();
    showToastFn(
        isLocalMirrored ? "Mirror mode enabled" : "Normal orientation",
        "info",
        1500
    );
}

function applyMirrorStyles() {
    if (localVideo) {
        localVideo.classList.toggle("mirrored", isLocalMirrored && currentFacingMode === "user");
    }
    if (remoteVideo) {
        remoteVideo.classList.toggle("mirrored", isRemoteMirrored);
    }
    if (callToggleMirrorBtn) {
        callToggleMirrorBtn.classList.toggle("bg-pink-600", isLocalMirrored);
        callToggleMirrorBtn.classList.toggle("bg-white/15", !isLocalMirrored);
    }
    if (localMirrorBtn) {
        localMirrorBtn.classList.toggle("bg-pink-600", isLocalMirrored);
        localMirrorBtn.classList.toggle("bg-black/70", !isLocalMirrored);
    }
}

async function switchCameraDevice() {
    if (!localStream || activeCallType !== "video") return;

    try {
        // Enumerate devices to check if multiple cameras exist
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === "videoinput");
        if (videoDevices.length <= 1 && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
            showToastFn("Only one camera device detected.", "info", 2000);
        }

        currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
        const constraints = currentFacingMode === "user" ? VIDEO_CONSTRAINTS_USER : VIDEO_CONSTRAINTS_ENV;

        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: constraints
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldVideoTrack = localStream.getVideoTracks()[0];

        // Replace track on WebRTC sender seamlessly without renegotiation
        if (peerConnection) {
            const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");
            if (sender) {
                await sender.replaceTrack(newVideoTrack);
                console.log("[WebRTC] Replaced video track with facingMode:", currentFacingMode);
            }
        }

        localStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
        localStream.addTrack(newVideoTrack);

        if (localVideo) {
            localVideo.srcObject = localStream;
            applyMirrorStyles();
        }

        showToastFn(currentFacingMode === "user" ? "Front Camera" : "Back Camera", "info", 1500);

    } catch (err) {
        console.warn("[WebRTC] Could not switch camera:", err);
        showToastFn("Camera switch not supported on this device.", "info", 2000);
    }
}

// ==========================================================
// 14. Draggable Floating Local PIP Preview
// ==========================================================
function setupDraggablePIP() {
    if (!localVideoContainer) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let moved = false;

    const onPointerDown = (e) => {
        // Ignore clicks on buttons inside the PIP
        if (e.target.closest("button")) return;

        isDragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;

        const rect = localVideoContainer.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        localVideoContainer.classList.add("dragging");
        localVideoContainer.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            moved = true;
        }

        const parent = localVideoContainer.parentElement;
        const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        let newLeft = initialLeft + dx - parentRect.left;
        let newTop = initialTop + dy - parentRect.top;

        // Clamp inside parent container
        const maxLeft = parentRect.width - localVideoContainer.offsetWidth - 12;
        const maxTop = parentRect.height - localVideoContainer.offsetHeight - 12;

        newLeft = Math.max(12, Math.min(newLeft, maxLeft));
        newTop = Math.max(12, Math.min(newTop, maxTop));

        localVideoContainer.style.left = `${newLeft}px`;
        localVideoContainer.style.top = `${newTop}px`;
        localVideoContainer.style.right = "auto";
        localVideoContainer.style.bottom = "auto";
    };

    const onPointerUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        localVideoContainer.classList.remove("dragging");
        try {
            localVideoContainer.releasePointerCapture(e.pointerId);
        } catch (err) {}

        if (!moved) return;

        // Corner snapping for native feeling
        const parent = localVideoContainer.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        const currentLeft = parseFloat(localVideoContainer.style.left) || 0;
        const currentTop = parseFloat(localVideoContainer.style.top) || 0;

        const isLeft = currentLeft < (parentRect.width - localVideoContainer.offsetWidth) / 2;
        const isTop = currentTop < (parentRect.height - localVideoContainer.offsetHeight) / 2;

        localVideoContainer.style.transition = "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
        if (isLeft) {
            localVideoContainer.style.left = "16px";
            localVideoContainer.style.right = "auto";
        } else {
            localVideoContainer.style.left = `${parentRect.width - localVideoContainer.offsetWidth - 16}px`;
            localVideoContainer.style.right = "auto";
        }

        if (isTop) {
            localVideoContainer.style.top = "16px";
            localVideoContainer.style.bottom = "auto";
        } else {
            localVideoContainer.style.top = `${parentRect.height - localVideoContainer.offsetHeight - 16}px`;
            localVideoContainer.style.bottom = "auto";
        }
    };

    localVideoContainer.addEventListener("pointerdown", onPointerDown);
    localVideoContainer.addEventListener("pointermove", onPointerMove);
    localVideoContainer.addEventListener("pointerup", onPointerUp);
    localVideoContainer.addEventListener("pointercancel", onPointerUp);
}

// ==========================================================
// 15. UI Helpers, Timers & Heartbeat
// ==========================================================
function setupCallUIStage(partnerName, partnerAvatar) {
    if (activeCallPartnerName) activeCallPartnerName.textContent = partnerName;
    if (outgoingPartnerName) outgoingPartnerName.textContent = partnerName;
    if (audioStageName) audioStageName.textContent = partnerName;
    if (remoteCamOffName) remoteCamOffName.textContent = partnerName;

    if (activeCallAvatar) activeCallAvatar.src = partnerAvatar;
    if (outgoingCallerAvatar) outgoingCallerAvatar.src = partnerAvatar;
    if (audioStageAvatar) audioStageAvatar.src = partnerAvatar;
    if (remoteCamOffAvatar) remoteCamOffAvatar.src = partnerAvatar;

    const myAvatar = (currentProfile && currentProfile.photo) || (currentProfile && currentProfile.name && currentProfile.name.toLowerCase().includes("rishi") ? "assets/images/rishi_profile.jpg" : "assets/images/hetvi_profile.jpg");
    if (localCamOffAvatar) localCamOffAvatar.src = myAvatar;

    const isVideo = activeCallType === "video";

    if (activeCallTypeBadge) {
        activeCallTypeBadge.innerHTML = `
            <span class="material-symbols-outlined text-sm">${isVideo ? 'videocam' : 'call'}</span>
            ${isVideo ? 'Video Call' : 'Audio Call'}
        `;
    }
    if (outgoingCallTypeBadge) {
        outgoingCallTypeBadge.innerHTML = `
            <span class="material-symbols-outlined text-sm">${isVideo ? 'videocam' : 'call'}</span>
            ${isVideo ? 'Video Call' : 'Audio Call'}
        `;
    }

    if (remoteVideo) remoteVideo.classList.toggle("hidden", !isVideo);
    if (localVideoContainer) localVideoContainer.classList.toggle("hidden", !isVideo);
    if (audioCallStage) audioCallStage.classList.toggle("hidden", isVideo);
    if (callToggleCamBtn) callToggleCamBtn.classList.toggle("hidden", !isVideo);
    if (callToggleMirrorBtn) callToggleMirrorBtn.classList.toggle("hidden", !isVideo);
    if (callSwitchCamBtn) callSwitchCamBtn.classList.toggle("hidden", !isVideo);

    applyMirrorStyles();
}

function startCallDurationTimer() {
    clearInterval(callDurationTimer);
    callDurationSeconds = 0;
    if (activeCallTimer) activeCallTimer.textContent = "00:00";

    callDurationTimer = setInterval(() => {
        callDurationSeconds++;
        const mins = String(Math.floor(callDurationSeconds / 60)).padStart(2, '0');
        const secs = String(callDurationSeconds % 60).padStart(2, '0');
        if (activeCallTimer) activeCallTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallDurationTimer() {
    clearInterval(callDurationTimer);
    callDurationTimer = null;
    callDurationSeconds = 0;
}

function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (currentCallDocRef && currentCallState === CallState.CONNECTED) {
            updateDoc(currentCallDocRef, { lastHeartbeat: serverTimestamp() }).catch(() => {});
        }
    }, 15000);
}

function stopHeartbeat() {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
}

// ==========================================================
// 16. Connection Quality & Dev Diagnostics HUD
// ==========================================================
function startStatsMonitoring() {
    stopStatsMonitoring();
    statsMonitorTimer = setInterval(async () => {
        if (!peerConnection || currentCallState !== CallState.CONNECTED) return;

        try {
            const stats = await peerConnection.getStats();
            let currentRtt = 0;
            let packetsLost = 0;
            let packetsReceived = 0;
            let frameWidth = 0;
            let frameHeight = 0;
            let framesPerSecond = 0;
            let candidatePairInfo = "";

            stats.forEach((report) => {
                if (report.type === "candidate-pair" && (report.state === "succeeded" || report.nominated)) {
                    currentRtt = Math.round((report.currentRoundTripTime || 0) * 1000);
                    candidatePairInfo = `${report.localCandidateId || "local"} ➔ ${report.remoteCandidateId || "remote"}`;
                }

                if (report.type === "inbound-rtp" && report.kind === "video") {
                    packetsLost = report.packetsLost || 0;
                    packetsReceived = report.packetsReceived || 0;
                    frameWidth = report.frameWidth || 0;
                    frameHeight = report.frameHeight || 0;
                    framesPerSecond = report.framesPerSecond || 0;
                }
            });

            // Calculate packet loss percentage
            const totalPackets = packetsLost + packetsReceived;
            const lossPercent = totalPackets > 0 ? ((packetsLost / totalPackets) * 100).toFixed(1) : 0;

            // Connection Quality classification
            let quality = "Good";
            let dotClass = "w-2 h-2 rounded-full bg-emerald-400";

            if (currentRtt > 400 || lossPercent > 8) {
                quality = "Poor";
                dotClass = "w-2 h-2 rounded-full bg-rose-500 animate-ping";
            } else if (currentRtt > 200 || lossPercent > 3) {
                quality = "Unstable";
                dotClass = "w-2 h-2 rounded-full bg-amber-400";
            }

            if (callQualityDot) callQualityDot.className = dotClass;
            if (callQualityText) callQualityText.textContent = quality;

            // Update Debug HUD if visible
            if (debugRtt) debugRtt.textContent = `${currentRtt} ms`;
            if (debugLoss) debugLoss.textContent = `${lossPercent}%`;
            if (debugResolution) debugResolution.textContent = frameWidth ? `${frameWidth}x${frameHeight}` : "-";
            if (debugFps) debugFps.textContent = framesPerSecond ? `${framesPerSecond} fps` : "-";
            if (debugCandPair) debugCandPair.textContent = candidatePairInfo || "P2P Connected";

        } catch (e) {
            // Stats polling error
        }
    }, 3000);
}

function stopStatsMonitoring() {
    clearInterval(statsMonitorTimer);
    statsMonitorTimer = null;
}

function toggleDebugHud() {
    if (!webrtcDebugHud) return;
    const isHidden = webrtcDebugHud.classList.contains("hidden");
    webrtcDebugHud.classList.toggle("hidden", !isHidden);
    showToastFn(isHidden ? "Diagnostics HUD opened" : "Diagnostics HUD closed", "info", 1200);
}

// ==========================================================
// 17. Audio Synthesizers & Tones (Zero External Dependencies)
// ==========================================================
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    return audioCtx;
}

function startRingbackTone() {
    stopRingbackTone();
    try {
        const ctx = getAudioContext();

        const playChirp = () => {
            if (!audioCtx || audioCtx.state === "closed") return;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = "sine";
            osc2.type = "sine";
            osc1.frequency.setValueAtTime(440, ctx.currentTime);
            osc2.frequency.setValueAtTime(480, ctx.currentTime);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.04, ctx.currentTime + 1.2);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(ctx.currentTime);
            osc2.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 1.4);
            osc2.stop(ctx.currentTime + 1.4);
        };

        playChirp();
        ringbackInterval = setInterval(playChirp, 3500);
    } catch (e) {
        console.warn("[WebRTC] Ringback tone error:", e);
    }
}

function stopRingbackTone() {
    clearInterval(ringbackInterval);
    ringbackInterval = null;
}

function startRingingSound() {
    stopRingingSound();
    try {
        const ctx = getAudioContext();
        let isHigh = false;

        const playRingPattern = () => {
            if (!audioCtx || audioCtx.state === "closed") return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(isHigh ? 620 : 520, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.6);
            isHigh = !isHigh;
        };

        playRingPattern();
        ringOscillatorInterval = setInterval(playRingPattern, 1200);
    } catch (e) {
        console.warn("[WebRTC] Ringtone error:", e);
    }
}

function stopRingingSound() {
    clearInterval(ringOscillatorInterval);
    ringOscillatorInterval = null;
}

function playTone(type) {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (type === "ended") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } else if (type === "busy" || type === "declined") {
            osc.type = "square";
            osc.frequency.setValueAtTime(480, ctx.currentTime);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        }
    } catch (e) {}
}

function stopAllSounds() {
    stopRingbackTone();
    stopRingingSound();
}

function pauseBackgroundMusic() {
    const bgAudio = document.getElementById("global-bg-audio");
    if (bgAudio && !bgAudio.paused) {
        bgAudio.pause();
        window.isLocalMusicPlaying = true;
    }
}

function resumeBackgroundMusic() {
    window.isLocalMusicPlaying = false;
    const bgAudio = document.getElementById("global-bg-audio");
    if (bgAudio && sessionStorage.getItem('musicUserPaused') !== 'true') {
        bgAudio.play().catch(() => {});
    }
}

function translateMediaError(err) {
    if (!err) return "Call failed. Please try again.";
    const name = err.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        return "Camera and Microphone permissions are required for video calls.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        return "No camera or microphone found on your device.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
        return "Your camera or microphone is already in use by another application.";
    }
    if (name === "OverconstrainedError") {
        return "Requested camera resolution is not supported by your hardware.";
    }
    return `Call could not connect: ${err.message || "Unknown error"}`;
}
