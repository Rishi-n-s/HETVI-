// ==========================================================
// webrtc.js — Senior 1-to-1 Audio & Video WebRTC Calling Engine
// Pure Peer-to-Peer Media Streams + Cloud Firestore Signaling (Offer/Answer/ICE)
// ==========================================================

import {
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    collection,
    addDoc,
    serverTimestamp,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { 
    initWatchTogether, 
    connectWatchTogetherToCall, 
    cleanupWatchTogether 
} from "./watch-together.js";

// STUN Configuration (Google High-Availability Public STUN Servers)
const RTC_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ],
    iceCandidatePoolSize: 10
};

// WebRTC State
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;
let currentCallDocRef = null;
let isCaller = false;
let activeCallType = "video"; // "video" | "audio"
let isMicMuted = false;
let isCameraOff = false;
let currentFacingMode = "user";
let iceCandidateQueue = [];

// Signaling Listeners & Timers
let unsubscribeCallDoc = null;
let unsubscribeCallerCandidates = null;
let unsubscribeCalleeCandidates = null;
let unsubscribeIncomingCalls = null;
let callDurationTimer = null;
let callDurationSeconds = 0;

// Context
let currentUser = null;
let currentProfile = null;
let db = null;
let showToastFn = null;
let incomingCallData = null;

// Ringtone Synthesizer for incoming calls
let ringAudioCtx = null;
let ringOscillatorInterval = null;

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
let remoteVideo = null;
let localVideo = null;
let localVideoContainer = null;
let audioCallStage = null;
let audioStageAvatar = null;
let audioStageName = null;
let activeCallAvatar = null;
let activeCallPartnerName = null;
let activeCallStatusLabel = null;
let activeCallTimer = null;
let activeCallTypeBadge = null;

let callToggleMicBtn = null;
let callToggleMicIcon = null;
let callToggleCamBtn = null;
let callToggleCamIcon = null;
let callSwitchCamBtn = null;
let callHangupBtn = null;

/**
 * Initialize WebRTC Engine & DOM Bindings
 */
export function initWebRTC(user, profile, firestoreDb, showToast) {
    currentUser = user;
    currentProfile = profile;
    db = firestoreDb;
    showToastFn = showToast || console.log;

    bindDOMElements();
    bindEventHandlers();
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

    console.log("[WebRTC] Initialized successfully for user:", currentUser.email);
}

function bindDOMElements() {
    incomingCallModal = document.getElementById("incoming-call-modal");
    incomingCallerName = document.getElementById("incoming-caller-name");
    incomingCallerAvatar = document.getElementById("incoming-caller-avatar");
    incomingCallTypeLabel = document.getElementById("incoming-call-type-label");
    incomingCallIcon = document.getElementById("incoming-call-icon");
    declineCallBtn = document.getElementById("decline-call-btn");
    acceptCallBtn = document.getElementById("accept-call-btn");
    acceptCallIcon = document.getElementById("accept-call-icon");

    activeCallModal = document.getElementById("active-call-modal");
    remoteVideo = document.getElementById("remote-video");
    localVideo = document.getElementById("local-video");
    localVideoContainer = document.getElementById("local-video-container");
    audioCallStage = document.getElementById("audio-call-stage");
    audioStageAvatar = document.getElementById("audio-stage-avatar");
    audioStageName = document.getElementById("audio-stage-name");
    activeCallAvatar = document.getElementById("active-call-avatar");
    activeCallPartnerName = document.getElementById("active-call-partner-name");
    activeCallStatusLabel = document.getElementById("active-call-status-label");
    activeCallTimer = document.getElementById("active-call-timer");
    activeCallTypeBadge = document.getElementById("active-call-type-badge");

    callToggleMicBtn = document.getElementById("call-toggle-mic-btn");
    callToggleMicIcon = document.getElementById("call-toggle-mic-icon");
    callToggleCamBtn = document.getElementById("call-toggle-cam-btn");
    callToggleCamIcon = document.getElementById("call-toggle-cam-icon");
    callSwitchCamBtn = document.getElementById("call-switch-cam-btn");
    callHangupBtn = document.getElementById("call-hangup-btn");
}

function bindEventHandlers() {
    if (declineCallBtn) declineCallBtn.addEventListener("click", rejectIncomingCall);
    if (acceptCallBtn) acceptCallBtn.addEventListener("click", acceptIncomingCall);
    if (callHangupBtn) callHangupBtn.addEventListener("click", () => endActiveCall(true));

    if (callToggleMicBtn) callToggleMicBtn.addEventListener("click", toggleMicrophone);
    if (callToggleCamBtn) callToggleCamBtn.addEventListener("click", toggleCamera);
    if (callSwitchCamBtn) callSwitchCamBtn.addEventListener("click", switchCameraDevice);
}

// ==========================================================
// 1. Incoming Call Listener on Firestore
// ==========================================================
function listenForIncomingCalls() {
    if (!currentUser || !db) return;
    if (unsubscribeIncomingCalls) unsubscribeIncomingCalls();

    const cleanCalleeEmail = (currentUser.email || "").toLowerCase().trim();
    const callsCol = collection(db, "calls");
    const q = query(
        callsCol,
        where("callee.email", "==", cleanCalleeEmail),
        where("status", "==", "calling")
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

            // Handle active incoming call document
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                // Verify call is fresh (within last 45 seconds)
                const createdAt = data.createdAt ? (data.createdAt.toMillis ? data.createdAt.toMillis() : data.createdAt) : Date.now();
                if (Date.now() - createdAt < 45000 && data.status === "calling" && !currentCallId) {
                    showIncomingCallModal(docSnap.id, data);
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

    if (incomingCallerName) incomingCallerName.textContent = callerName;
    if (incomingCallTypeLabel) incomingCallTypeLabel.textContent = `Incoming ${isVideo ? 'Video' : 'Audio'} Call...`;
    if (incomingCallIcon) incomingCallIcon.textContent = isVideo ? "videocam" : "call";
    if (acceptCallIcon) acceptCallIcon.textContent = isVideo ? "videocam" : "call";

    if (incomingCallModal) {
        incomingCallModal.classList.remove("hidden");
        incomingCallModal.classList.add("flex");
    }

    startRingingSound();
}

function hideIncomingCallModal() {
    incomingCallData = null;
    stopRingingSound();
    if (incomingCallModal) {
        incomingCallModal.classList.add("hidden");
        incomingCallModal.classList.remove("flex");
    }
}

/**
 * Flush any queued ICE candidates once remote description is set
 */
async function flushQueuedIceCandidates() {
    if (!peerConnection || !peerConnection.remoteDescription) return;
    while (iceCandidateQueue.length > 0) {
        const candidate = iceCandidateQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn("[WebRTC] Error adding queued ICE candidate:", e);
        }
    }
}

// ==========================================================
// 2. Start Outgoing Call (Caller Workflow)
// ==========================================================
export async function startCall(type = "video") {
    if (currentCallId) {
        showToastFn("You are already in a call.", "info");
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToastFn("Calling requires Camera & Mic permissions on HTTPS or localhost.", "error");
        return;
    }

    activeCallType = type;
    isCaller = true;
    isMicMuted = false;
    isCameraOff = false;
    iceCandidateQueue = [];

    pauseBackgroundMusic();

    const partnerName = (currentProfile.name || "").toLowerCase().includes("rishi") ? "Bakudi ❤️" : "Rishi ❤️";
    const partnerEmail = (currentUser.email || "").toLowerCase().includes("rishi") ? "hetvidodiya2447@gmail.com" : "rishisolanki7319@gmail.com";

    try {
        // 1. Get Local Media Stream
        const constraints = {
            audio: true,
            video: activeCallType === "video" ? { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (localVideo) {
            localVideo.srcObject = localStream;
        }

        // 2. Setup RTCPeerConnection
        peerConnection = new RTCPeerConnection(RTC_CONFIG);
        remoteStream = new MediaStream();
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
        }

        // Add local tracks to peer connection
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });

        // Pull remote tracks
        peerConnection.ontrack = (event) => {
            console.log("[WebRTC] Remote track received:", event.track.kind);
            if (event.streams && event.streams[0]) {
                event.streams[0].getTracks().forEach((track) => {
                    remoteStream.addTrack(track);
                });
            } else if (event.track) {
                remoteStream.addTrack(event.track);
            }
            if (remoteVideo && remoteVideo.srcObject !== remoteStream) {
                remoteVideo.srcObject = remoteStream;
            }
        };

        // 3. Create Firestore Call Document
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

        // 4. Create & Set SDP Offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const callPayload = {
            callId: callId,
            callType: activeCallType,
            status: "calling",
            caller: {
                uid: currentUser.uid,
                email: currentUser.email.toLowerCase().trim(),
                name: currentProfile.name
            },
            callee: {
                email: partnerEmail.toLowerCase().trim(),
                name: partnerName
            },
            offer: {
                type: offer.type,
                sdp: offer.sdp
            },
            createdAt: serverTimestamp()
        };

        await setDoc(currentCallDocRef, callPayload);

        // 5. Update UI to Active Call Screen
        showActiveCallUI(partnerName, "Calling...");

        // 6. Listen for Remote Answer & Status Updates
        unsubscribeCallDoc = onSnapshot(
            currentCallDocRef,
            async (docSnap) => {
                const data = docSnap.data();
                if (!data) return;

                if (data.status === "rejected") {
                    showToastFn(`${partnerName} declined the call.`, "info");
                    endActiveCall(false);
                } else if (data.status === "ended") {
                    showToastFn("Call ended.", "info");
                    endActiveCall(false);
                } else if (data.status === "connected" && data.answer && (!peerConnection || !peerConnection.currentRemoteDescription)) {
                    try {
                        const answerDesc = new RTCSessionDescription(data.answer);
                        await peerConnection.setRemoteDescription(answerDesc);
                        console.log("[WebRTC] Remote Answer description set successfully.");
                        await flushQueuedIceCandidates();
                        startCallDurationTimer();
                        if (activeCallStatusLabel) activeCallStatusLabel.textContent = "Connected";
                        connectWatchTogetherToCall(currentCallId, remoteStream);
                    } catch (sdpErr) {
                        console.error("[WebRTC] Error setting remote answer:", sdpErr);
                    }
                }
            },
            (err) => console.warn("[WebRTC] Call doc listener notice:", err.message)
        );

        // 7. Listen for Callee ICE Candidates (with queueing)
        unsubscribeCalleeCandidates = onSnapshot(
            calleeCandidatesCol,
            async (snapshot) => {
                for (const change of snapshot.docChanges()) {
                    if (change.type === "added") {
                        const candidateData = change.doc.data();
                        if (peerConnection && peerConnection.remoteDescription) {
                            try {
                                await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
                            } catch (e) {
                                console.warn("[WebRTC] Error adding callee candidate:", e);
                            }
                        } else {
                            iceCandidateQueue.push(candidateData);
                        }
                    }
                }
            },
            (err) => console.warn("[WebRTC] Callee candidates notice:", err.message)
        );

    } catch (err) {
        console.error("[WebRTC] Start Call Error:", err);
        showToastFn(`Call failed: ${err.message || 'Media permission denied'}`, "error");
        endActiveCall(false);
    }
}

// ==========================================================
// 3. Accept Incoming Call (Callee Workflow)
// ==========================================================
async function acceptIncomingCall() {
    if (!incomingCallData) return;

    const { callId, callType, caller, offer } = incomingCallData;
    hideIncomingCallModal();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToastFn("Calling requires Camera & Mic permissions.", "error");
        return;
    }

    activeCallType = callType || "video";
    isCaller = false;
    isMicMuted = false;
    isCameraOff = false;
    currentCallId = callId;
    currentCallDocRef = doc(db, "calls", callId);

    pauseBackgroundMusic();

    try {
        // 1. Get Local Media Stream
        const constraints = {
            audio: true,
            video: activeCallType === "video" ? { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (localVideo) localVideo.srcObject = localStream;

        // 2. Setup RTCPeerConnection
        peerConnection = new RTCPeerConnection(RTC_CONFIG);
        remoteStream = new MediaStream();
        if (remoteVideo) remoteVideo.srcObject = remoteStream;

        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            console.log("[WebRTC] Remote track received on callee:", event.track.kind);
            if (event.streams && event.streams[0]) {
                event.streams[0].getTracks().forEach((track) => {
                    remoteStream.addTrack(track);
                });
            } else if (event.track) {
                remoteStream.addTrack(event.track);
            }
            if (remoteVideo && remoteVideo.srcObject !== remoteStream) {
                remoteVideo.srcObject = remoteStream;
            }
        };

        const calleeCandidatesCol = collection(db, "calls", callId, "calleeCandidates");
        const callerCandidatesCol = collection(db, "calls", callId, "callerCandidates");

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(calleeCandidatesCol, event.candidate.toJSON()).catch(console.warn);
            }
        };

        // 3. Set Remote Offer & Create SDP Answer
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        await flushQueuedIceCandidates();
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // 4. Update Firestore Call Doc with Answer & Connected status
        await updateDoc(currentCallDocRef, {
            answer: {
                type: answer.type,
                sdp: answer.sdp
            },
            status: "connected",
            connectedAt: serverTimestamp()
        });

        // 5. Update UI
        showActiveCallUI(caller ? caller.name : "Your Love", "Connected");
        startCallDurationTimer();
        connectWatchTogetherToCall(currentCallId, remoteStream);

        // 6. Listen for Caller Candidates
        unsubscribeCallerCandidates = onSnapshot(
            callerCandidatesCol,
            (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        const candidateData = change.doc.data();
                        peerConnection.addIceCandidate(new RTCIceCandidate(candidateData)).catch(console.warn);
                    }
                });
            },
            (err) => console.warn("[WebRTC] Caller candidates notice:", err.message)
        );

        // 7. Listen for Call Status (Hangup by caller)
        unsubscribeCallDoc = onSnapshot(
            currentCallDocRef,
            (docSnap) => {
                const data = docSnap.data();
                if (data && data.status === "ended") {
                    showToastFn("Call ended.", "info");
                    endActiveCall(false);
                }
            },
            (err) => console.warn("[WebRTC] Callee call doc notice:", err.message)
        );

    } catch (err) {
        console.error("[WebRTC] Accept Call Error:", err);
        showToastFn(`Could not connect call: ${err.message}`, "error");
        endActiveCall(true);
    }
}

// ==========================================================
// 4. Reject Incoming Call
// ==========================================================
async function rejectIncomingCall() {
    if (!incomingCallData) return;
    const { callId } = incomingCallData;
    hideIncomingCallModal();

    try {
        const callDocRef = doc(db, "calls", callId);
        await updateDoc(callDocRef, { status: "rejected" });
    } catch (e) {
        console.warn("Error rejecting call:", e);
    }
}

// ==========================================================
// 5. End Call & Full Hardware / Listener Cleanup
// ==========================================================
export async function endActiveCall(shouldUpdateFirestore = true) {
    console.log("[WebRTC] Ending active call and cleaning up resources...");

    // 0. Cleanup Watch Together if active
    cleanupWatchTogether();

    // 1. Update Firestore status if initiated by user
    if (shouldUpdateFirestore && currentCallDocRef) {
        try {
            await updateDoc(currentCallDocRef, {
                status: "ended",
                endedAt: serverTimestamp()
            });
        } catch (e) {
            console.warn("Could not update call ended status in Firestore:", e);
        }
    }

    // 2. Stop all hardware tracks immediately
    if (localStream) {
        localStream.getTracks().forEach((track) => {
            track.stop();
            console.log("[WebRTC] Stopped local track:", track.kind);
        });
        localStream = null;
    }

    if (remoteStream) {
        remoteStream.getTracks().forEach((track) => track.stop());
        remoteStream = null;
    }

    // 3. Close RTCPeerConnection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // 4. Unsubscribe listeners
    if (unsubscribeCallDoc) { unsubscribeCallDoc(); unsubscribeCallDoc = null; }
    if (unsubscribeCallerCandidates) { unsubscribeCallerCandidates(); unsubscribeCallerCandidates = null; }
    if (unsubscribeCalleeCandidates) { unsubscribeCalleeCandidates(); unsubscribeCalleeCandidates = null; }

    // 5. Reset Timers
    clearInterval(callDurationTimer);
    callDurationSeconds = 0;

    // 6. Reset UI State
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    if (activeCallModal) {
        activeCallModal.classList.add("hidden");
        activeCallModal.classList.remove("flex");
    }

    stopRingingSound();
    iceCandidateQueue = [];
    currentCallId = null;
    currentCallDocRef = null;
    isCaller = false;
    isMicMuted = false;
    isCameraOff = false;

    // Resume Background music
    resumeBackgroundMusic();
}

// ==========================================================
// 6. Call Controls (Mute, Camera Toggle, Flip Camera)
// ==========================================================
function toggleMicrophone() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        isMicMuted = !isMicMuted;
        audioTrack.enabled = !isMicMuted;

        if (callToggleMicBtn) {
            callToggleMicBtn.classList.toggle("bg-rose-500", isMicMuted);
            callToggleMicBtn.classList.toggle("hover:bg-rose-600", isMicMuted);
        }
        if (callToggleMicIcon) {
            callToggleMicIcon.textContent = isMicMuted ? "mic_off" : "mic";
        }
        showToastFn(isMicMuted ? "Microphone muted" : "Microphone unmuted", "info", 1500);
    }
}

function toggleCamera() {
    if (!localStream || activeCallType !== "video") return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        isCameraOff = !isCameraOff;
        videoTrack.enabled = !isCameraOff;

        if (callToggleCamBtn) {
            callToggleCamBtn.classList.toggle("bg-rose-500", isCameraOff);
            callToggleCamBtn.classList.toggle("hover:bg-rose-600", isCameraOff);
        }
        if (callToggleCamIcon) {
            callToggleCamIcon.textContent = isCameraOff ? "videocam_off" : "videocam";
        }
        showToastFn(isCameraOff ? "Camera turned off" : "Camera turned on", "info", 1500);
    }
}

async function switchCameraDevice() {
    if (!localStream || activeCallType !== "video") return;

    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";

    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldVideoTrack = localStream.getVideoTracks()[0];

        if (peerConnection) {
            const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");
            if (sender) {
                sender.replaceTrack(newVideoTrack);
            }
        }

        localStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
        localStream.addTrack(newVideoTrack);

        if (localVideo) localVideo.srcObject = localStream;
        showToastFn("Camera flipped", "info", 1500);

    } catch (err) {
        console.warn("Could not switch camera:", err);
        showToastFn("Could not flip camera.", "info");
    }
}

// ==========================================================
// 7. UI Helpers & Timers
// ==========================================================
function showActiveCallUI(partnerName, statusText) {
    if (activeCallPartnerName) activeCallPartnerName.textContent = partnerName;
    if (activeCallStatusLabel) activeCallStatusLabel.textContent = statusText;
    if (activeCallTimer) activeCallTimer.textContent = "00:00";

    const isVideo = activeCallType === "video";

    if (activeCallTypeBadge) {
        activeCallTypeBadge.innerHTML = `
            <span class="material-symbols-outlined text-sm">${isVideo ? 'videocam' : 'call'}</span>
            ${isVideo ? 'Video Call' : 'Audio Call'}
        `;
    }

    if (remoteVideo) remoteVideo.classList.toggle("hidden", !isVideo);
    if (localVideoContainer) localVideoContainer.classList.toggle("hidden", !isVideo);
    if (audioCallStage) audioCallStage.classList.toggle("hidden", isVideo);
    if (callToggleCamBtn) callToggleCamBtn.classList.toggle("hidden", !isVideo);
    if (callSwitchCamBtn) callSwitchCamBtn.classList.toggle("hidden", !isVideo);

    if (audioStageName) audioStageName.textContent = partnerName;

    if (activeCallModal) {
        activeCallModal.classList.remove("hidden");
        activeCallModal.classList.add("flex");
    }
}

function startCallDurationTimer() {
    clearInterval(callDurationTimer);
    callDurationSeconds = 0;

    callDurationTimer = setInterval(() => {
        callDurationSeconds++;
        const mins = String(Math.floor(callDurationSeconds / 60)).padStart(2, '0');
        const secs = String(callDurationSeconds % 60).padStart(2, '0');
        if (activeCallTimer) activeCallTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

// ==========================================================
// 8. Ringtone & Audio Helpers
// ==========================================================
function startRingingSound() {
    try {
        if (!ringAudioCtx) {
            ringAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        let isBeep = false;
        ringOscillatorInterval = setInterval(() => {
            if (!ringAudioCtx) return;
            const osc = ringAudioCtx.createOscillator();
            const gain = ringAudioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(isBeep ? 440 : 480, ringAudioCtx.currentTime);
            gain.gain.setValueAtTime(0.12, ringAudioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ringAudioCtx.currentTime + 0.8);
            osc.connect(gain);
            gain.connect(ringAudioCtx.destination);
            osc.start();
            osc.stop(ringAudioCtx.currentTime + 0.8);
            isBeep = !isBeep;
        }, 1500);
    } catch (e) {
        console.warn("Ringtone error:", e);
    }
}

function stopRingingSound() {
    clearInterval(ringOscillatorInterval);
    ringOscillatorInterval = null;
    if (ringAudioCtx && ringAudioCtx.state !== 'closed') {
        ringAudioCtx.close().catch(() => { });
        ringAudioCtx = null;
    }
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
        bgAudio.play().catch(() => { });
    }
}
