// ==========================================================
// chat.js — Advanced Real-Time Chat Engine
// Features: Text, Images, Videos, Voice Notes (Record/Pause/Speed/Waveform), Love Polls (Live Voting)
// ==========================================================

import {
    auth,
    db,
    doc,
    setDoc,
    deleteDoc,
    requireAuth,
    logoutUser,
    getUserProfile
} from "./firebase.js";
import {
    collection,
    addDoc,
    query,
    orderBy,
    limitToLast,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { uploadMediaToSupabase, deleteMediaFromSupabase } from "./supabase.js";
import { initWebRTC, startCall } from "./webrtc.js";

// State
let currentAuthUser = null;
let currentProfile = null;
let activeChatId = "our_story_room";
let unsubscribeCurrentChat = null;
let unsubscribeTyping = null;
let typingTimeout = null;
let isCurrentlyTyping = false;
let pendingMediaFile = null;
let activePreviewObjectUrl = null; // Memory leak prevention
let pendingDeleteInfo = null; // { docId, mediaUrl }
let isUserScrolledUp = false;
let unreadCountWhileScrolled = 0;
let isInitialBatchLoaded = false;

// Audio Playback Tracking
let activeAudioElement = null;
let activeAudioButton = null;

// Voice Recording Engine State
let mediaRecorder = null;
let audioStream = null;
let audioChunks = [];
let recordingSeconds = 0;
let recordingTimerInterval = null;
let audioCtx = null;
let analyserNode = null;
let waveAnimFrameId = null;
let isRecordingPaused = false;

// Poll State
let pollSelectedMediaFile = null;

// DOM Elements
const messagesContainer = document.getElementById("messages-container");
const emptyState = document.getElementById("empty-state");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const attachBtn = document.getElementById("attach-btn");
const micBtn = document.getElementById("mic-btn");
const pollBtn = document.getElementById("poll-btn");
const audioCallBtn = document.getElementById("audio-call-btn");
const videoCallBtn = document.getElementById("video-call-btn");
const mediaUploadInput = document.getElementById("media-upload-input");
const uploadProgressContainer = document.getElementById("upload-progress-container");
const uploadProgressText = document.getElementById("upload-progress-text");
const uploadProgressFill = document.getElementById("upload-progress-fill");
const typingIndicator = document.getElementById("typing-indicator");
const typingText = document.getElementById("typing-text");
const chatHeaderSubtitle = document.getElementById("chat-header-subtitle");
const currentUserNameEl = document.getElementById("current-user-name");
const signOutBtn = document.getElementById("sign-out-btn");
const chatHeaderTitle = document.getElementById("chat-header-title");
const chatSidebar = document.getElementById("chat-sidebar");
const mobileBackBtn = document.getElementById("mobile-back-btn");
const searchInput = document.getElementById("search-input");
const quickEmojis = document.querySelectorAll(".quick-emoji");
const chatItems = document.querySelectorAll(".chat-item");
const scrollBottomBtn = document.getElementById("scroll-bottom-btn");
const unreadCountBadge = document.getElementById("unread-count-badge");
const toastContainer = document.getElementById("toast-container");

// Recording Bar Elements
const recordingBar = document.getElementById("recording-bar");
const recordTimer = document.getElementById("record-timer");
const recordCanvas = document.getElementById("record-canvas");
const recordPauseBtn = document.getElementById("record-pause-btn");
const recordPauseIcon = document.getElementById("record-pause-icon");
const recordCancelBtn = document.getElementById("record-cancel-btn");
const recordSendBtn = document.getElementById("record-send-btn");

// Poll Modal Elements
const pollModal = document.getElementById("poll-modal");
const pollForm = document.getElementById("poll-form");
const pollCloseBtn = document.getElementById("poll-close-btn");
const pollCancelBtn = document.getElementById("poll-cancel-btn");
const pollQuestionInput = document.getElementById("poll-question-input");
const pollMediaInput = document.getElementById("poll-media-input");
const pollMediaBtn = document.getElementById("poll-media-btn");
const pollMediaLabel = document.getElementById("poll-media-label");
const pollMediaClearBtn = document.getElementById("poll-media-clear-btn");
const pollOptionsList = document.getElementById("poll-options-list");
const pollAddOptionBtn = document.getElementById("poll-add-option-btn");

// Lightbox & Media Preview Elements
const mediaLightbox = document.getElementById("media-lightbox");
const lightboxCloseBtn = document.getElementById("lightbox-close-btn");
const lightboxDownloadBtn = document.getElementById("lightbox-download-btn");
const lightboxContent = document.getElementById("lightbox-content");
const mediaPreviewModal = document.getElementById("media-preview-modal");
const mediaPreviewDisplay = document.getElementById("media-preview-display");
const mediaPreviewCaption = document.getElementById("media-preview-caption");
const mediaPreviewCloseBtn = document.getElementById("media-preview-close-btn");
const mediaPreviewCancelBtn = document.getElementById("media-preview-cancel-btn");
const mediaPreviewSendBtn = document.getElementById("media-preview-send-btn");
const previewMediaInfo = document.getElementById("preview-media-info");

// Delete Confirmation Modal Elements
const deleteModal = document.getElementById("delete-modal");
const deleteCancelBtn = document.getElementById("delete-cancel-btn");
const deleteConfirmBtn = document.getElementById("delete-confirm-btn");

// ==========================================================
// 1. Toast Notification System
// ==========================================================
export function showToast(message, type = "info", duration = 3500) {
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `chat-toast toast-${type}`;

    let icon = "info";
    if (type === "success") icon = "check_circle";
    else if (type === "error") icon = "error";

    toast.innerHTML = `
        <span class="material-symbols-outlined text-base ${type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-rose-500' : 'text-primary'}">${icon}</span>
        <span class="flex-1">${escapeHTML(message)}</span>
    `;

    toastContainer.appendChild(toast);

    const dismissToast = () => {
        toast.classList.add("toast-out");
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    };

    toast.addEventListener("click", dismissToast);
    setTimeout(dismissToast, duration);
}

// ==========================================================
// 2. Authenticate & Initialize User Session
// ==========================================================
requireAuth((user, profile) => {
    currentAuthUser = user;
    currentProfile = profile || getUserProfile(user);

    console.log("Authenticated Chat User:", currentAuthUser.email, "Profile:", currentProfile);

    // Update Top User Chip & Avatar
    if (currentUserNameEl) {
        currentUserNameEl.textContent = `👤 ${currentProfile.name}`;
    }

    const topUserAvatar = document.querySelector("#chat-sidebar img[alt='My Profile']");
    if (topUserAvatar && currentProfile.photo) {
        topUserAvatar.src = currentProfile.photo;
    }

    if (chatHeaderTitle) {
        chatHeaderTitle.textContent = currentProfile.partner;
    }

    const headerAvatar = document.getElementById("chat-header-avatar");
    if (headerAvatar) {
        headerAvatar.src = (currentProfile.role === 'rishi' ? 'assets/images/hetvi_profile.jpg' : 'assets/images/rishi_profile.jpg');
    }

    // Connect to initial active chat and typing listeners
    connectToChat(activeChatId);
    listenToPartnerTyping();

    // Initialize WebRTC Calling Engine
    initWebRTC(currentAuthUser, currentProfile, db, showToast);

    showToast(`Welcome back, ${currentProfile.name}! ❤️`, "success", 2500);
});

// Hook WebRTC Call Triggers
if (audioCallBtn) {
    audioCallBtn.addEventListener("click", () => startCall("audio"));
}
if (videoCallBtn) {
    videoCallBtn.addEventListener("click", () => startCall("video"));
}

// Hook Sign Out
if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to lock the app and sign out?")) {
            await setTypingState(false);
            await logoutUser();
        }
    });
}

// ==========================================================
// 3. Real-Time Typing Indicator
// ==========================================================
async function setTypingState(isTyping) {
    if (!currentAuthUser || isCurrentlyTyping === isTyping) return;
    isCurrentlyTyping = isTyping;

    try {
        const typingRef = doc(db, "typing_status", currentAuthUser.uid);
        await setDoc(typingRef, {
            uid: currentAuthUser.uid,
            email: currentAuthUser.email,
            name: currentProfile.name,
            isTyping: isTyping,
            updatedAt: new Date().getTime()
        });
    } catch (e) {
        console.warn("Typing status update error:", e);
    }
}

if (messageInput) {
    messageInput.addEventListener("input", () => {
        setTypingState(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            setTypingState(false);
        }, 2500);
    });

    messageInput.addEventListener("blur", () => {
        setTypingState(false);
    });
}

function listenToPartnerTyping() {
    if (unsubscribeTyping) unsubscribeTyping();

    const typingCol = collection(db, "typing_status");
    unsubscribeTyping = onSnapshot(
        typingCol,
        (snapshot) => {
            let partnerIsTyping = false;
            let partnerName = "Partner";

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (currentAuthUser && docSnap.id !== currentAuthUser.uid && data.isTyping) {
                    const now = new Date().getTime();
                    if (now - (data.updatedAt || 0) < 6000) {
                        partnerIsTyping = true;
                        partnerName = data.name || "Partner";
                    }
                }
            });

            if (partnerIsTyping) {
                if (chatHeaderSubtitle) chatHeaderSubtitle.classList.add("hidden");
                if (typingIndicator) {
                    typingIndicator.classList.remove("hidden");
                    if (typingText) typingText.textContent = `${partnerName} is typing...`;
                }
            } else {
                if (typingIndicator) typingIndicator.classList.add("hidden");
                if (chatHeaderSubtitle) chatHeaderSubtitle.classList.remove("hidden");
            }
        },
        (error) => {
            console.warn("[Typing Status] Snapshot notice:", error.message);
        }
    );
}

// ==========================================================
// 4. Fullscreen Media Lightbox Modal
// ==========================================================
window.openMediaLightbox = function (mediaUrl, mediaType, fileName = "media") {
    if (!mediaLightbox || !lightboxContent) return;

    if (lightboxDownloadBtn) {
        lightboxDownloadBtn.href = mediaUrl;
        lightboxDownloadBtn.setAttribute("download", fileName || "chat_media");
    }

    if (mediaType === "video") {
        lightboxContent.innerHTML = `
            <video src="${escapeHTML(mediaUrl)}" controls autoplay playsinline class="max-w-full max-h-[85vh] rounded-2xl shadow-2xl bg-black/80"></video>
        `;
    } else if (mediaType === "audio") {
        lightboxContent.innerHTML = `
            <div class="p-6 bg-white/95 rounded-3xl flex flex-col items-center gap-4 max-w-sm w-full shadow-2xl">
                <span class="material-symbols-outlined text-5xl text-primary animate-pulse">graphic_eq</span>
                <p class="font-quicksand font-bold text-gray-800 text-sm">Voice Note Audio</p>
                <audio src="${escapeHTML(mediaUrl)}" controls autoplay class="w-full"></audio>
            </div>
        `;
    } else {
        lightboxContent.innerHTML = `
            <img src="${escapeHTML(mediaUrl)}" alt="Full size photo" class="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
        `;
    }

    mediaLightbox.classList.remove("hidden");
    mediaLightbox.classList.add("flex");
};

function closeMediaLightbox() {
    if (!mediaLightbox) return;
    mediaLightbox.classList.add("hidden");
    mediaLightbox.classList.remove("flex");
    if (lightboxContent) lightboxContent.innerHTML = "";
}

if (lightboxCloseBtn) lightboxCloseBtn.addEventListener("click", closeMediaLightbox);

if (mediaLightbox) {
    mediaLightbox.addEventListener("click", (e) => {
        if (e.target === mediaLightbox) closeMediaLightbox();
    });
}

// ESC Key listener for closing modals
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (mediaLightbox && !mediaLightbox.classList.contains("hidden")) closeMediaLightbox();
        if (mediaPreviewModal && !mediaPreviewModal.classList.contains("hidden")) closeMediaPreview();
        if (deleteModal && !deleteModal.classList.contains("hidden")) closeDeleteModal();
        if (pollModal && !pollModal.classList.contains("hidden")) closePollModal();
    }
});

// ==========================================================
// 5. Message Deletion (Firestore + Supabase Dual Cleanup)
// ==========================================================
function openDeleteModal(docId, mediaUrl) {
    pendingDeleteInfo = { docId, mediaUrl };
    if (deleteModal) {
        deleteModal.classList.remove("hidden");
        deleteModal.classList.add("flex");
    }
}

function closeDeleteModal() {
    pendingDeleteInfo = null;
    if (deleteModal) {
        deleteModal.classList.add("hidden");
        deleteModal.classList.remove("flex");
    }
}

if (deleteCancelBtn) deleteCancelBtn.addEventListener("click", closeDeleteModal);

if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener("click", async () => {
        if (!pendingDeleteInfo) return;

        const { docId, mediaUrl } = pendingDeleteInfo;
        closeDeleteModal();

        try {
            showToast("Deleting message...", "info", 1500);

            // 1. Delete Firestore Document
            const docRef = doc(db, activeChatId, docId);
            await deleteDoc(docRef);

            // 2. Delete Supabase Storage file if attached
            if (mediaUrl) {
                await deleteMediaFromSupabase(mediaUrl);
            }

            showToast("Message deleted successfully ✨", "success");
            if (window.playTapSound) window.playTapSound();

        } catch (err) {
            console.error("Failed to delete message:", err);
            showToast("Failed to delete message. Please try again.", "error");
        }
    });
}

// ==========================================================
// 6. Voice Recording Engine (MediaRecorder + Waveform Visualizer)
// ==========================================================
async function startVoiceRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Microphone recording requires HTTPS or localhost in your browser.", "error");
        return;
    }

    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Find best supported audio MIME type across Chrome, Safari, Firefox, Edge
        let mimeType = 'audio/webm';
        if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                mimeType = 'audio/aac';
            } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                mimeType = 'audio/ogg';
            }
        }

        try {
            mediaRecorder = new MediaRecorder(audioStream, { mimeType });
        } catch (e) {
            console.warn("MediaRecorder with mimeType failed, falling back to default:", e);
            mediaRecorder = new MediaRecorder(audioStream);
        }

        audioChunks = [];
        recordingSeconds = 0;
        isRecordingPaused = false;

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        // Web Audio Analyser for Canvas visualizer
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }
            const source = audioCtx.createMediaStreamSource(audioStream);
            analyserNode = audioCtx.createAnalyser();
            analyserNode.fftSize = 64;
            source.connect(analyserNode);
        } catch (audioErr) {
            console.warn("Web Audio Analyser setup warning:", audioErr);
        }

        mediaRecorder.start(100);

        // Pause background music while recording
        const bgAudio = document.getElementById('global-bg-audio');
        if (bgAudio && !bgAudio.paused) {
            bgAudio.pause();
            window.isLocalMusicPlaying = true;
        }

        // UI Updates
        if (chatForm) chatForm.classList.add("hidden");
        if (recordingBar) {
            recordingBar.classList.remove("hidden");
            recordingBar.classList.add("flex");
        }
        if (recordTimer) recordTimer.textContent = "00:00";
        if (recordPauseIcon) recordPauseIcon.textContent = "pause";

        // Timer
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = setInterval(() => {
            if (!isRecordingPaused) {
                recordingSeconds++;
                const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
                const secs = String(recordingSeconds % 60).padStart(2, '0');
                if (recordTimer) recordTimer.textContent = `${mins}:${secs}`;
            }
        }, 1000);

        // Start Canvas Visualizer
        drawRecordingWave();

    } catch (err) {
        console.error("Microphone access error:", err);
        showToast(`Microphone error: ${err.message || 'Access denied'}`, "error");
        resetRecordingUI();
    }
}

function drawRecordingWave() {
    if (!recordCanvas || !analyserNode) return;
    const ctx = recordCanvas.getContext("2d");
    const width = recordCanvas.width = recordCanvas.offsetWidth || 200;
    const height = recordCanvas.height = 32;
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    function render() {
        if (!mediaRecorder || mediaRecorder.state === "inactive") return;
        waveAnimFrameId = requestAnimationFrame(render);

        analyserNode.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, width, height);

        const barWidth = 3;
        const gap = 2;
        const barCount = Math.floor(width / (barWidth + gap));
        const step = Math.floor(dataArray.length / barCount) || 1;

        for (let i = 0; i < barCount; i++) {
            const val = dataArray[i * step] || 0;
            const percent = val / 255;
            const barHeight = Math.max(4, percent * height);
            const x = i * (barWidth + gap);
            const y = (height - barHeight) / 2;

            ctx.fillStyle = isRecordingPaused ? "#cbd5e1" : "#d12450";
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
        }
    }
    render();
}

function pauseVoiceRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    if (isRecordingPaused) {
        mediaRecorder.resume();
        isRecordingPaused = false;
        if (recordPauseIcon) recordPauseIcon.textContent = "pause";
    } else {
        mediaRecorder.pause();
        isRecordingPaused = true;
        if (recordPauseIcon) recordPauseIcon.textContent = "play_arrow";
    }
}

function cancelVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    resetRecordingUI();
    showToast("Voice recording discarded.", "info", 2000);
}

function resetRecordingUI() {
    clearInterval(recordingTimerInterval);
    if (waveAnimFrameId) cancelAnimationFrame(waveAnimFrameId);
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => { });
        audioCtx = null;
    }
    mediaRecorder = null;
    audioChunks = [];
    recordingSeconds = 0;
    isRecordingPaused = false;

    if (recordingBar) {
        recordingBar.classList.add("hidden");
        recordingBar.classList.remove("flex");
    }
    if (chatForm) chatForm.classList.remove("hidden");
    window.isLocalMusicPlaying = false;
}

async function stopAndSendVoiceRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        cancelVoiceRecording();
        return;
    }

    const durationToSave = Math.max(1, recordingSeconds);

    mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const cleanType = mimeType.split(';')[0];
        const audioBlob = new Blob(audioChunks, { type: cleanType });
        const ext = (cleanType.includes('mp4') || cleanType.includes('aac')) ? 'm4a' : 'webm';
        const audioFile = new File([audioBlob], `voice_note_${Date.now()}.${ext}`, { type: cleanType });

        resetRecordingUI();

        // Upload and save to Firestore
        await executeVoiceUpload(audioFile, durationToSave);
    };

    try {
        mediaRecorder.requestData();
    } catch (e) { }
    mediaRecorder.stop();
}

async function executeVoiceUpload(audioFile, durationSec) {
    if (!currentAuthUser) return;

    if (uploadProgressContainer) uploadProgressContainer.classList.remove("hidden");
    if (uploadProgressFill) uploadProgressFill.style.width = "0%";
    if (uploadProgressText) uploadProgressText.textContent = `Uploading voice note... 0%`;

    try {
        const uploadResult = await uploadMediaToSupabase(audioFile, (percent) => {
            if (uploadProgressFill) uploadProgressFill.style.width = `${percent}%`;
            if (uploadProgressText) uploadProgressText.textContent = `Uploading voice note... ${percent}%`;
        });

        if (uploadProgressFill) uploadProgressFill.style.width = "100%";
        setTimeout(() => {
            if (uploadProgressContainer) uploadProgressContainer.classList.add("hidden");
        }, 400);

        // Save metadata payload to Cloud Firestore
        const payload = {
            uid: currentAuthUser.uid,
            email: currentAuthUser.email,
            displayName: currentProfile.name,
            mediaUrl: uploadResult.publicUrl,
            mediaType: "audio",
            fileName: uploadResult.fileName,
            fileSize: uploadResult.fileSize,
            duration: durationSec,
            createdAt: serverTimestamp()
        };

        const targetRef = collection(db, activeChatId);
        await addDoc(targetRef, payload);

        console.log("[Voice Note] Saved to Firestore:", payload);
        showToast("Voice note sent! 🎙️✨", "success");
        if (window.playTapSound) window.playTapSound();
        scrollToBottom(true);

    } catch (err) {
        console.error("Voice upload failed:", err);
        showToast(`Voice Note Failed: ${err.message || 'Upload error'}`, "error");
        if (uploadProgressContainer) uploadProgressContainer.classList.add("hidden");
    }
}

// Hook Voice Bar Triggers
if (micBtn) micBtn.addEventListener("click", startVoiceRecording);
if (recordPauseBtn) recordPauseBtn.addEventListener("click", pauseVoiceRecording);
if (recordCancelBtn) recordCancelBtn.addEventListener("click", cancelVoiceRecording);
if (recordSendBtn) recordSendBtn.addEventListener("click", stopAndSendVoiceRecording);

// ==========================================================
// 7. Global Audio Message Player Controller
// ==========================================================
window.toggleAudioMessagePlayback = function (btnEl, audioUrl) {
    const bubble = btnEl.closest(".voice-bubble");
    if (!bubble) return;

    const progressFill = bubble.querySelector(".voice-progress-fill");
    const timerLabel = bubble.querySelector(".voice-timer-label");
    const speedBtn = bubble.querySelector(".audio-speed-btn");

    // Pause background music if playing
    const bgAudio = document.getElementById("global-bg-audio");
    if (bgAudio && !bgAudio.paused) {
        bgAudio.pause();
        window.isLocalMusicPlaying = true;
    }

    // If clicking same active audio -> toggle
    if (activeAudioElement && (activeAudioElement.src === audioUrl || activeAudioElement.src.endsWith(encodeURI(audioUrl)) || encodeURI(activeAudioElement.src) === encodeURI(audioUrl))) {
        if (activeAudioElement.paused) {
            activeAudioElement.play().then(() => {
                btnEl.innerHTML = `<span class="material-symbols-outlined text-xl">pause</span>`;
            }).catch(err => {
                console.error("Audio resume error:", err);
                showToast("Cannot play audio: " + err.message, "error");
            });
        } else {
            activeAudioElement.pause();
            btnEl.innerHTML = `<span class="material-symbols-outlined text-xl">play_arrow</span>`;
        }
        return;
    }

    // Stop any previously playing audio
    if (activeAudioElement) {
        activeAudioElement.pause();
        if (activeAudioButton) {
            activeAudioButton.innerHTML = `<span class="material-symbols-outlined text-xl">play_arrow</span>`;
        }
    }

    // Initialize new audio element
    const audio = new Audio(audioUrl);
    activeAudioElement = audio;
    activeAudioButton = btnEl;

    // Default speed
    const currentSpeed = parseFloat(speedBtn ? speedBtn.getAttribute("data-speed") || "1" : "1");
    audio.playbackRate = currentSpeed;

    btnEl.innerHTML = `<span class="material-symbols-outlined text-xl">pause</span>`;

    audio.play().catch(err => {
        console.error("Audio play error:", err);
        btnEl.innerHTML = `<span class="material-symbols-outlined text-xl">play_arrow</span>`;
        showToast("Audio playback error: " + (err.message || "Format unsupported"), "error");
    });

    audio.addEventListener("timeupdate", () => {
        if (audio.duration && progressFill) {
            const percent = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = `${percent}%`;
            if (timerLabel) {
                timerLabel.textContent = formatDuration(Math.floor(audio.currentTime));
            }
        }
    });

    audio.addEventListener("ended", () => {
        btnEl.innerHTML = `<span class="material-symbols-outlined text-xl">play_arrow</span>`;
        if (progressFill) progressFill.style.width = "0%";
        if (timerLabel && audio.duration) {
            timerLabel.textContent = formatDuration(Math.floor(audio.duration));
        }
        window.isLocalMusicPlaying = false;
    });

    audio.addEventListener("pause", () => {
        btnEl.innerHTML = `<span class="material-symbols-outlined text-xl">play_arrow</span>`;
    });
};

window.handleAudioSeek = function (e, progressBarEl, audioUrl) {
    const bubble = progressBarEl.closest(".voice-bubble");
    if (!bubble) return;
    const playBtn = bubble.querySelector("button[onclick*='toggleAudioMessagePlayback']");

    if (!activeAudioElement || (activeAudioElement.src !== audioUrl && !activeAudioElement.src.endsWith(encodeURI(audioUrl)))) {
        if (playBtn) window.toggleAudioMessagePlayback(playBtn, audioUrl);
    }

    if (activeAudioElement) {
        const rect = progressBarEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, clickX / width));
        if (activeAudioElement.duration && !isNaN(activeAudioElement.duration)) {
            activeAudioElement.currentTime = percentage * activeAudioElement.duration;
        }
    }
};

window.cycleAudioSpeed = function (speedBtn) {
    const speeds = [1, 1.5, 2];
    const currentSpeed = parseFloat(speedBtn.getAttribute("data-speed") || "1");
    const nextIndex = (speeds.indexOf(currentSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];

    speedBtn.setAttribute("data-speed", nextSpeed);
    speedBtn.textContent = `${nextSpeed}x`;

    if (activeAudioElement) {
        activeAudioElement.playbackRate = nextSpeed;
    }
};

function formatDuration(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
    const mins = Math.floor(totalSeconds / 60);
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
}

// ==========================================================
// 8. Love Polls Engine (Creation & Real-time Voting)
// ==========================================================
function openPollModal() {
    if (pollModal) {
        pollModal.classList.remove("hidden");
        pollModal.classList.add("flex");
        if (pollQuestionInput) pollQuestionInput.focus();
    }
}

function closePollModal() {
    if (pollModal) {
        pollModal.classList.add("hidden");
        pollModal.classList.remove("flex");
    }
    if (pollForm) pollForm.reset();
    pollSelectedMediaFile = null;
    if (pollMediaLabel) pollMediaLabel.textContent = "Choose Media";
    if (pollMediaClearBtn) pollMediaClearBtn.classList.add("hidden");
}

if (pollBtn) pollBtn.addEventListener("click", openPollModal);
if (pollCloseBtn) pollCloseBtn.addEventListener("click", closePollModal);
if (pollCancelBtn) pollCancelBtn.addEventListener("click", closePollModal);

// Dynamic Option Rows
if (pollAddOptionBtn && pollOptionsList) {
    pollAddOptionBtn.addEventListener("click", () => {
        const rows = pollOptionsList.querySelectorAll(".option-row");
        if (rows.length >= 6) {
            showToast("Maximum 6 options allowed in a poll.", "info");
            return;
        }

        const nextNum = rows.length + 1;
        const newRow = document.createElement("div");
        newRow.className = "flex items-center gap-2 option-row";
        newRow.innerHTML = `
            <span class="w-6 h-6 rounded-full bg-pink-100 text-primary font-bold text-xs flex items-center justify-center flex-shrink-0">${nextNum}</span>
            <input type="text" required placeholder="Option ${nextNum}..." class="flex-1 px-3 py-2 bg-pink-50/30 border border-pink-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-sans" />
            <button type="button" class="remove-opt-btn p-1 text-gray-400 hover:text-rose-500 rounded-lg transition-all" title="Remove">
                <span class="material-symbols-outlined text-base">close</span>
            </button>
        `;

        newRow.querySelector(".remove-opt-btn").addEventListener("click", () => {
            newRow.remove();
            // Renumber
            pollOptionsList.querySelectorAll(".option-row").forEach((r, idx) => {
                r.querySelector("span").textContent = idx + 1;
            });
        });

        pollOptionsList.appendChild(newRow);
    });
}

// Media attachment for poll
if (pollMediaBtn && pollMediaInput) {
    pollMediaBtn.addEventListener("click", () => pollMediaInput.click());
    pollMediaInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        pollSelectedMediaFile = file;
        if (pollMediaLabel) pollMediaLabel.textContent = file.name.length > 20 ? file.name.slice(0, 18) + '...' : file.name;
        if (pollMediaClearBtn) pollMediaClearBtn.classList.remove("hidden");
    });

    if (pollMediaClearBtn) {
        pollMediaClearBtn.addEventListener("click", () => {
            pollSelectedMediaFile = null;
            pollMediaInput.value = "";
            if (pollMediaLabel) pollMediaLabel.textContent = "Choose Media";
            pollMediaClearBtn.classList.add("hidden");
        });
    }
}

// Submit Poll
if (pollForm) {
    pollForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentAuthUser) return;

        const question = (pollQuestionInput ? pollQuestionInput.value : "").trim();
        if (!question) return;

        const optionInputs = pollOptionsList.querySelectorAll("input");
        const options = [];
        optionInputs.forEach(inp => {
            const val = inp.value.trim();
            if (val) options.push(val);
        });

        if (options.length < 2) {
            showToast("Please provide at least 2 options for your poll.", "error");
            return;
        }

        const mediaToUpload = pollSelectedMediaFile;
        closePollModal();

        try {
            let uploadedMediaUrl = null;
            let pollMediaType = null;

            if (mediaToUpload) {
                showToast("Uploading poll media...", "info", 1500);
                const uploadRes = await uploadMediaToSupabase(mediaToUpload);
                uploadedMediaUrl = uploadRes.publicUrl;
                pollMediaType = uploadRes.mediaType;
            }

            const pollPayload = {
                uid: currentAuthUser.uid,
                email: currentAuthUser.email,
                displayName: currentProfile.name,
                mediaType: "poll",
                question: question,
                options: options,
                votes: {}, // { [userId]: optionIndex }
                mediaUrl: uploadedMediaUrl || null,
                pollMediaType: pollMediaType || null,
                createdAt: serverTimestamp()
            };

            const targetRef = collection(db, activeChatId);
            await addDoc(targetRef, pollPayload);

            showToast("Love Poll launched! 📊❤️", "success");
            if (window.playTapSound) window.playTapSound();
            scrollToBottom(true);

        } catch (err) {
            console.error("Poll launch error:", err);
            showToast(`Poll Failed: ${err.message || 'Could not launch poll'}`, "error");
        }
    });
}

// Voting on Poll Handler
window.handlePollVote = async function (docId, optionIndex) {
    if (!currentAuthUser) {
        showToast("Please sign in to vote.", "error");
        return;
    }

    try {
        const docRef = doc(db, activeChatId, docId);
        await setDoc(docRef, {
            votes: {
                [currentAuthUser.uid]: optionIndex
            }
        }, { merge: true });

        if (window.playTapSound) window.playTapSound();
        showToast("Vote recorded! ✨", "success", 1500);

    } catch (err) {
        console.error("Vote failed:", err);
        showToast("Failed to record vote.", "error");
    }
};

// ==========================================================
// 9. Format Timestamps
// ==========================================================
function formatMessageTime(timestamp) {
    if (!timestamp) return "Just now";

    let date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else if (typeof timestamp === "number" || typeof timestamp === "string") {
        date = new Date(timestamp);
    } else {
        return "Just now";
    }

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ==========================================================
// 10. Render Message Bubble (Text, Images, Videos, Voice Notes, Love Polls)
// ==========================================================
function createMessageElement(docId, data) {
    if (!currentAuthUser) return document.createElement("div");

    // Sent vs Received detection
    const isSentByMe = (data.uid && data.uid === currentAuthUser.uid) ||
        (data.email && data.email.toLowerCase() === currentAuthUser.email.toLowerCase()) ||
        ((data.sender || data.displayName || "").trim().toLowerCase() === currentProfile.name.trim().toLowerCase());

    const senderDisplayName = data.displayName || data.sender || data.name || "Special Someone";
    const timeFormatted = formatMessageTime(data.createdAt);
    const messageText = data.message || data.text || "";
    const mediaUrl = data.mediaUrl || null;
    const mediaType = data.mediaType || null; // 'image' | 'video' | 'audio' | 'poll'
    const fileName = data.fileName || "attachment";

    const wrapper = document.createElement("div");
    wrapper.className = `flex flex-col ${isSentByMe ? 'items-end' : 'items-start'} fade-up msg-group relative group`;
    wrapper.id = `msg-${docId}`;

    // ==========================================================
    // A. VOICE NOTE MESSAGE COMPONENT
    // ==========================================================
    if (mediaType === "audio" && mediaUrl) {
        const durSec = data.duration || 0;
        const durFormatted = formatDuration(durSec);

        const voiceHtml = `
            <div class="voice-bubble flex flex-col gap-2 p-3 ${isSentByMe ? 'text-white' : 'text-gray-800'}">
                <div class="flex items-center gap-2.5">
                    <button type="button" onclick="window.toggleAudioMessagePlayback(this, '${escapeHTML(mediaUrl)}')" class="w-10 h-10 rounded-full ${isSentByMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-primary/10 hover:bg-primary/20 text-primary'} flex items-center justify-center transition-all flex-shrink-0 shadow-xs" title="Play / Pause">
                        <span class="material-symbols-outlined text-xl">play_arrow</span>
                    </button>
                    
                    <div class="flex-1 flex flex-col gap-1 min-w-0">
                        <div class="voice-progress-bar" onclick="window.handleAudioSeek(event, this, '${escapeHTML(mediaUrl)}')">
                            <div class="voice-progress-fill" style="width: 0%"></div>
                        </div>
                        <div class="flex justify-between items-center text-[10px] ${isSentByMe ? 'text-white/80' : 'text-gray-400'} font-sans">
                            <span class="voice-timer-label">${durFormatted}</span>
                            <span class="flex items-center gap-1">
                                <span class="material-symbols-outlined text-[12px]">graphic_eq</span> Voice Note
                            </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-between pt-1 border-t ${isSentByMe ? 'border-white/20' : 'border-black/5'} text-xs">
                    <button type="button" onclick="window.cycleAudioSpeed(this)" data-speed="1" class="audio-speed-btn px-2 py-0.5 rounded-full ${isSentByMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-pink-100 hover:bg-pink-200 text-primary-dark'} text-[10px] font-bold font-quicksand transition-all" title="Playback Speed">
                        1x
                    </button>
                    <a href="${escapeHTML(mediaUrl)}" download="${escapeHTML(fileName)}" class="p-1 ${isSentByMe ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-primary'} transition-all" title="Download Voice Note">
                        <span class="material-symbols-outlined text-[16px]">download</span>
                    </a>
                </div>
            </div>
        `;

        wrapper.innerHTML = renderBubbleShell(isSentByMe, senderDisplayName, timeFormatted, voiceHtml, docId, mediaUrl);
        attachDeleteTrigger(wrapper, docId, mediaUrl);
        return wrapper;
    }

    // ==========================================================
    // B. LOVE POLLS MESSAGE COMPONENT
    // ==========================================================
    if (mediaType === "poll") {
        const question = data.question || "Love Poll";
        const options = data.options || [];
        const votes = data.votes || {};
        const totalVotes = Object.keys(votes).length;
        const myVoteIndex = currentAuthUser ? votes[currentAuthUser.uid] : undefined;

        let pollMediaHeader = "";
        if (data.mediaUrl) {
            if (data.pollMediaType === "video") {
                pollMediaHeader = `<video src="${escapeHTML(data.mediaUrl)}" controls playsinline class="w-full max-h-48 rounded-xl object-contain bg-black mb-2.5"></video>`;
            } else if (data.pollMediaType === "audio") {
                pollMediaHeader = `<audio src="${escapeHTML(data.mediaUrl)}" controls class="w-full mb-2.5"></audio>`;
            } else {
                pollMediaHeader = `<img src="${escapeHTML(data.mediaUrl)}" alt="Poll Image" class="w-full max-h-48 rounded-xl object-cover mb-2.5 cursor-pointer" onclick="window.openMediaLightbox('${escapeHTML(data.mediaUrl)}', 'image')" />`;
            }
        }

        let optionsHtml = "";
        options.forEach((optText, idx) => {
            const count = Object.values(votes).filter(v => v === idx).length;
            const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isMyVote = myVoteIndex === idx;

            optionsHtml += `
                <div class="poll-option-row p-2.5 ${isMyVote ? 'voted-by-me' : ''}" onclick="window.handlePollVote('${docId}', ${idx})">
                    <div class="poll-option-fill" style="width: ${percent}%"></div>
                    <div class="relative z-10 flex items-center justify-between text-xs font-quicksand font-semibold text-gray-800">
                        <div class="flex items-center gap-2 min-w-0 pr-2">
                            <span class="w-4 h-4 rounded-full border border-pink-300 flex items-center justify-center text-[10px] ${isMyVote ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500'} flex-shrink-0">
                                ${isMyVote ? '❤' : (idx + 1)}
                            </span>
                            <span class="truncate">${escapeHTML(optText)}</span>
                        </div>
                        <span class="text-xs font-bold text-primary flex-shrink-0">${percent}% (${count})</span>
                    </div>
                </div>
            `;
        });

        const pollHtml = `
            <div class="poll-bubble p-3 sm:p-4 text-gray-800">
                <div class="flex items-center gap-1.5 text-primary text-xs font-bold font-quicksand mb-1.5 uppercase tracking-wider">
                    <span class="material-symbols-outlined text-base">how_to_vote</span> Love Poll
                </div>
                ${pollMediaHeader}
                <h4 class="font-quicksand font-bold text-sm text-gray-900 mb-3 leading-snug">${escapeHTML(question)}</h4>
                <div class="space-y-2 mb-3">
                    ${optionsHtml}
                </div>
                <div class="flex justify-between items-center text-[10px] text-gray-400 font-sans border-t border-pink-100 pt-2">
                    <span>Total Votes: ${totalVotes}</span>
                    <span>${myVoteIndex !== undefined ? 'Your vote recorded ❤️' : 'Tap an option to vote'}</span>
                </div>
            </div>
        `;

        wrapper.innerHTML = renderBubbleShell(isSentByMe, senderDisplayName, timeFormatted, pollHtml, docId, mediaUrl, true);
        attachDeleteTrigger(wrapper, docId, mediaUrl);
        return wrapper;
    }

    // ==========================================================
    // C. IMAGE / VIDEO / TEXT COMPONENT
    // ==========================================================
    let mediaHtml = "";
    if (mediaUrl) {
        if (mediaType === "video") {
            mediaHtml = `
                <div class="rounded-2xl overflow-hidden mb-2 max-w-full bg-black/40 border border-white/20 relative group/video shadow-md">
                    <video src="${escapeHTML(mediaUrl)}" controls playsinline preload="metadata" class="w-full max-h-72 object-contain rounded-2xl bg-black"></video>
                    <button type="button" onclick="window.openMediaLightbox('${escapeHTML(mediaUrl)}', 'video', '${escapeHTML(fileName)}')" class="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover/video:opacity-100 transition-opacity z-10" title="Full Screen">
                        <span class="material-symbols-outlined text-[18px]">fullscreen</span>
                    </button>
                </div>
            `;
        } else {
            mediaHtml = `
                <div class="rounded-2xl overflow-hidden mb-2 max-w-full group/media relative cursor-pointer shadow-md" onclick="window.openMediaLightbox('${escapeHTML(mediaUrl)}', 'image', '${escapeHTML(fileName)}')">
                    <img src="${escapeHTML(mediaUrl)}" alt="Photo Attachment" class="w-full max-h-80 object-cover rounded-2xl transition-transform hover:scale-[1.02] duration-300" loading="lazy" />
                    <div class="absolute inset-0 bg-black/20 opacity-0 group-hover/media:opacity-100 transition-opacity rounded-2xl flex items-center justify-center pointer-events-none">
                        <span class="material-symbols-outlined text-white text-3xl drop-shadow-md">fullscreen</span>
                    </div>
                </div>
            `;
        }
    }

    const standardInner = `
        ${mediaHtml}
        ${messageText ? `<p class="text-sm leading-relaxed break-words">${escapeHTML(messageText)}</p>` : ''}
    `;

    wrapper.innerHTML = renderBubbleShell(isSentByMe, senderDisplayName, timeFormatted, standardInner, docId, mediaUrl);
    attachDeleteTrigger(wrapper, docId, mediaUrl);
    return wrapper;
}

function renderBubbleShell(isSentByMe, senderDisplayName, timeFormatted, innerContentHtml, docId, mediaUrl, isCustomGlassCard = false) {
    const deleteBtnHtml = `
        <button type="button" class="msg-delete-btn opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-600 hover:bg-white/80 rounded-full transition-all shadow-xs" title="Delete message">
            <span class="material-symbols-outlined text-[16px]">delete</span>
        </button>
    `;

    if (isSentByMe) {
        return `
            <div class="flex items-center gap-1.5 max-w-[88%] sm:max-w-[78%] md:max-w-[72%] justify-end">
                <div class="msg-actions flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    ${deleteBtnHtml}
                </div>
                <div class="flex flex-col items-end">
                    <div class="${isCustomGlassCard ? 'bubble-received' : 'bubble-sent'} p-3 sm:px-4 sm:py-2.5 rounded-2xl rounded-br-xs text-sm leading-relaxed break-words shadow-md">
                        ${innerContentHtml}
                    </div>
                    <div class="flex items-center gap-1 mt-1 mr-1">
                        <span class="text-[10px] text-gray-400 font-sans">${timeFormatted}</span>
                        <span class="material-symbols-outlined text-[12px] text-primary" style="font-variation-settings: 'FILL' 1;">favorite</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        const isHetvi = (senderDisplayName || "").toLowerCase().includes("hetvi") || (senderDisplayName || "").toLowerCase().includes("bakudi");
        const senderPhoto = isHetvi ? "assets/images/hetvi_profile.jpg" : "assets/images/rishi_profile.jpg";

        return `
            <div class="flex items-center gap-1.5 max-w-[88%] sm:max-w-[78%] md:max-w-[72%]">
                <div class="flex items-start gap-2.5">
                    <div class="w-8 h-8 rounded-full bg-pink-200 border border-white flex-shrink-0 overflow-hidden shadow-xs mt-1">
                        <img src="${senderPhoto}" onerror="this.src='assets/images/rishi_profile.jpg'" class="w-full h-full object-cover" alt="${escapeHTML(senderDisplayName)}" />
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[11px] font-quicksand font-semibold text-primary-dark ml-1 mb-0.5">${escapeHTML(senderDisplayName)}</span>
                        <div class="bubble-received p-3 sm:px-4 sm:py-2.5 rounded-2xl rounded-tl-xs text-sm leading-relaxed break-words shadow-sm">
                            ${innerContentHtml}
                        </div>
                        <span class="text-[10px] text-gray-400 font-sans mt-1 ml-1">${timeFormatted}</span>
                    </div>
                </div>
                <div class="msg-actions flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    ${deleteBtnHtml}
                </div>
            </div>
        `;
    }
}

function attachDeleteTrigger(wrapper, docId, mediaUrl) {
    const delBtn = wrapper.querySelector(".msg-delete-btn");
    if (delBtn) {
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openDeleteModal(docId, mediaUrl);
        });
    }
}

function escapeHTML(str) {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================================
// 11. Auto-Scroll & Scroll-To-Bottom Logic
// ==========================================================
function scrollToBottom(smooth = true) {
    if (messagesContainer) {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: smooth ? "smooth" : "auto"
        });
        isUserScrolledUp = false;
        unreadCountWhileScrolled = 0;
        if (scrollBottomBtn) scrollBottomBtn.classList.remove("visible");
        if (unreadCountBadge) unreadCountBadge.classList.add("hidden");
    }
}

if (messagesContainer) {
    messagesContainer.addEventListener("scroll", () => {
        const threshold = 120;
        const distanceFromBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;

        if (distanceFromBottom > threshold) {
            isUserScrolledUp = true;
            if (scrollBottomBtn) scrollBottomBtn.classList.add("visible");
        } else {
            isUserScrolledUp = false;
            unreadCountWhileScrolled = 0;
            if (scrollBottomBtn) scrollBottomBtn.classList.remove("visible");
            if (unreadCountBadge) unreadCountBadge.classList.add("hidden");
        }
    });
}

if (scrollBottomBtn) {
    scrollBottomBtn.addEventListener("click", () => {
        scrollToBottom(true);
    });
}

// ==========================================================
// 12. Connect to Firestore Collection in Real-Time
// ==========================================================
function connectToChat(chatId) {
    if (unsubscribeCurrentChat) {
        unsubscribeCurrentChat();
    }

    activeChatId = chatId;
    isInitialBatchLoaded = false;
    console.log(`Connecting real-time listener to chat collection: ${chatId} (limitToLast 60)`);

    const collectionRef = collection(db, chatId);
    const messagesQuery = query(collectionRef, orderBy("createdAt", "asc"), limitToLast(60));

    unsubscribeCurrentChat = onSnapshot(
        messagesQuery,
        (snapshot) => {
            console.log(`[Firestore Real-Time] Snapshot event with ${snapshot.docChanges().length} changes (Total: ${snapshot.size})`);

            if (snapshot.empty) {
                messagesContainer.innerHTML = "";
                if (emptyState) {
                    emptyState.classList.remove("hidden");
                    messagesContainer.appendChild(emptyState);
                }
                return;
            }

            if (emptyState) {
                emptyState.classList.add("hidden");
            }

            const changes = snapshot.docChanges();
            let lastMessageText = "";
            let lastMessageTime = "";

            if (!isInitialBatchLoaded) {
                // Initial Load Batch: render all items cleanly
                messagesContainer.innerHTML = "";
                snapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const msgEl = createMessageElement(docSnap.id, data);
                    messagesContainer.appendChild(msgEl);

                    if (data.mediaType === "audio") lastMessageText = "🎙️ Voice Note";
                    else if (data.mediaType === "poll") lastMessageText = `📊 Poll: ${data.question || ''}`;
                    else lastMessageText = data.mediaType ? `[${data.mediaType.toUpperCase()}] ${data.message || ''}` : (data.message || data.text || "");

                    lastMessageTime = formatMessageTime(data.createdAt);
                });
                isInitialBatchLoaded = true;
                scrollToBottom(false);
            } else {
                // Incremental Updates
                changes.forEach((change) => {
                    const docId = change.doc.id;
                    const data = change.doc.data();

                    if (change.type === "added") {
                        if (!document.getElementById(`msg-${docId}`)) {
                            const msgEl = createMessageElement(docId, data);
                            messagesContainer.appendChild(msgEl);

                            if (isUserScrolledUp) {
                                unreadCountWhileScrolled++;
                                if (unreadCountBadge) {
                                    unreadCountBadge.textContent = unreadCountWhileScrolled;
                                    unreadCountBadge.classList.remove("hidden");
                                }
                            } else {
                                scrollToBottom(true);
                            }
                        }
                    } else if (change.type === "removed") {
                        const existingEl = document.getElementById(`msg-${docId}`);
                        if (existingEl) {
                            existingEl.style.transition = "all 0.25s ease";
                            existingEl.style.opacity = "0";
                            existingEl.style.transform = "scale(0.9)";
                            setTimeout(() => existingEl.remove(), 250);
                        }
                    } else if (change.type === "modified") {
                        const existingEl = document.getElementById(`msg-${docId}`);
                        if (existingEl) {
                            const updatedEl = createMessageElement(docId, data);
                            existingEl.replaceWith(updatedEl);
                        }
                    }

                    if (data.mediaType === "audio") lastMessageText = "🎙️ Voice Note";
                    else if (data.mediaType === "poll") lastMessageText = `📊 Poll: ${data.question || ''}`;
                    else lastMessageText = data.mediaType ? `[${data.mediaType.toUpperCase()}] ${data.message || ''}` : (data.message || data.text || "");

                    lastMessageTime = formatMessageTime(data.createdAt);
                });
            }

            // Update preview on sidebar with latest item
            const activeItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
            if (activeItem && (lastMessageText || lastMessageTime)) {
                const previewEl = activeItem.querySelector("#last-msg-preview") || activeItem.querySelector("p");
                const timeEl = activeItem.querySelector("#last-msg-time") || activeItem.querySelector(".text-\\[11px\\]");
                if (previewEl && lastMessageText) previewEl.textContent = lastMessageText;
                if (timeEl && lastMessageTime) timeEl.textContent = lastMessageTime;
            }
        },
        (error) => {
            console.error("Firestore onSnapshot error:", error);
            showToast("Connection error with chat database.", "error");
        }
    );
}

// ==========================================================
// 13. Send Text Message
// ==========================================================
async function handleSendMessage(e) {
    if (e) e.preventDefault();

    if (!currentAuthUser) {
        showToast("Please sign in first to send messages.", "error");
        return;
    }

    const text = (messageInput.value || "").trim();
    if (!text) return;

    messageInput.value = "";
    messageInput.focus();
    setTypingState(false);

    try {
        if (sendBtn) sendBtn.disabled = true;

        const payload = {
            uid: currentAuthUser.uid,
            email: currentAuthUser.email,
            displayName: currentProfile.name,
            message: text,
            createdAt: serverTimestamp()
        };

        const targetRef = collection(db, activeChatId);
        await addDoc(targetRef, payload);

        console.log("Message sent to Firestore successfully:", payload);

        if (window.playTapSound) {
            window.playTapSound();
        }
    } catch (error) {
        console.error("Failed to send message:", error);
        showToast("Could not send message. Check network connection.", "error");
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        scrollToBottom(true);
    }
}

if (chatForm) {
    chatForm.addEventListener("submit", handleSendMessage);
}

// ==========================================================
// 14. WhatsApp-Style Media Preview & Supabase Storage Upload
// ==========================================================

async function compressImageIfNeeded(file) {
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;
                const maxDimension = 1920;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob && blob.size < file.size) {
                            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" }));
                        } else {
                            resolve(file);
                        }
                    },
                    "image/jpeg",
                    0.85
                );
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function openMediaPreview(file) {
    pendingMediaFile = file;
    const isVideo = file.type.startsWith("video");
    const isAudio = file.type.startsWith("audio");
    const mediaType = isVideo ? "Video" : isAudio ? "Audio" : "Image";

    if (previewMediaInfo) {
        previewMediaInfo.textContent = `${mediaType} • ${formatFileSize(file.size)}`;
    }

    if (activePreviewObjectUrl) {
        URL.revokeObjectURL(activePreviewObjectUrl);
        activePreviewObjectUrl = null;
    }

    activePreviewObjectUrl = URL.createObjectURL(file);

    if (mediaPreviewDisplay) {
        if (isVideo) {
            mediaPreviewDisplay.innerHTML = `
                <video src="${activePreviewObjectUrl}" controls autoplay playsinline class="max-h-72 w-full object-contain rounded-2xl bg-black"></video>
            `;
        } else if (isAudio) {
            mediaPreviewDisplay.innerHTML = `
                <div class="p-6 flex flex-col items-center gap-3">
                    <span class="material-symbols-outlined text-4xl text-primary animate-pulse">graphic_eq</span>
                    <audio src="${activePreviewObjectUrl}" controls class="w-full"></audio>
                </div>
            `;
        } else {
            mediaPreviewDisplay.innerHTML = `
                <img src="${activePreviewObjectUrl}" class="max-h-72 w-full object-contain rounded-2xl" alt="Preview" />
            `;
        }
    }

    if (mediaPreviewCaption) {
        mediaPreviewCaption.value = (messageInput ? messageInput.value : "").trim();
    }

    if (mediaPreviewModal) {
        mediaPreviewModal.classList.remove("hidden");
        mediaPreviewModal.classList.add("flex");
        if (mediaPreviewCaption) mediaPreviewCaption.focus();
    }
}

function closeMediaPreview() {
    pendingMediaFile = null;

    if (activePreviewObjectUrl) {
        URL.revokeObjectURL(activePreviewObjectUrl);
        activePreviewObjectUrl = null;
    }

    if (mediaPreviewModal) {
        mediaPreviewModal.classList.add("hidden");
        mediaPreviewModal.classList.remove("flex");
    }
    if (mediaPreviewDisplay) mediaPreviewDisplay.innerHTML = "";
    if (mediaPreviewCaption) mediaPreviewCaption.value = "";
}

if (mediaPreviewCloseBtn) mediaPreviewCloseBtn.addEventListener("click", closeMediaPreview);
if (mediaPreviewCancelBtn) mediaPreviewCancelBtn.addEventListener("click", closeMediaPreview);

// Attachment Trigger
if (attachBtn && mediaUploadInput) {
    attachBtn.addEventListener("click", () => {
        mediaUploadInput.click();
    });

    mediaUploadInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        mediaUploadInput.value = "";

        if (file.size > 50 * 1024 * 1024) {
            showToast("File is too large! Please select under 50MB.", "error");
            return;
        }

        openMediaPreview(file);
    });
}

// Enter key support for media caption
if (mediaPreviewCaption) {
    mediaPreviewCaption.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (mediaPreviewSendBtn) mediaPreviewSendBtn.click();
        }
    });
}

// Confirm Media Send via Supabase Storage
if (mediaPreviewSendBtn) {
    mediaPreviewSendBtn.addEventListener("click", async () => {
        if (!pendingMediaFile || !currentAuthUser) return;

        const fileToUpload = pendingMediaFile;
        const caption = (mediaPreviewCaption ? mediaPreviewCaption.value : "").trim();
        closeMediaPreview();

        if (messageInput) messageInput.value = "";

        await executeSupabaseMediaUpload(fileToUpload, caption);
    });
}

async function executeSupabaseMediaUpload(rawFile, caption) {
    const isVideo = rawFile.type.startsWith("video");
    const isAudio = rawFile.type.startsWith("audio");
    const mediaType = isVideo ? "video" : isAudio ? "audio" : "image";

    // Compress image if applicable
    const file = (isVideo || isAudio) ? rawFile : await compressImageIfNeeded(rawFile);

    // Show upload progress UI
    if (uploadProgressContainer) uploadProgressContainer.classList.remove("hidden");
    if (uploadProgressFill) uploadProgressFill.style.width = "0%";
    if (uploadProgressText) uploadProgressText.textContent = `Uploading ${mediaType}... 0%`;

    try {
        const uploadResult = await uploadMediaToSupabase(file, (percent) => {
            if (uploadProgressFill) uploadProgressFill.style.width = `${percent}%`;
            if (uploadProgressText) uploadProgressText.textContent = `Uploading ${mediaType}... ${percent}%`;
        });

        if (uploadProgressFill) uploadProgressFill.style.width = "100%";
        setTimeout(() => {
            if (uploadProgressContainer) uploadProgressContainer.classList.add("hidden");
        }, 400);

        const payload = {
            uid: currentAuthUser.uid,
            email: currentAuthUser.email,
            displayName: currentProfile.name,
            mediaUrl: uploadResult.publicUrl,
            mediaType: uploadResult.mediaType,
            fileName: uploadResult.fileName,
            fileSize: uploadResult.fileSize,
            message: caption || "",
            createdAt: serverTimestamp()
        };

        const targetRef = collection(db, activeChatId);
        await addDoc(targetRef, payload);

        console.log("[Supabase -> Firestore] Media saved:", payload);
        showToast(`${mediaType === 'video' ? 'Video' : mediaType === 'audio' ? 'Audio' : 'Photo'} sent! ✨`, "success");
        if (window.playTapSound) window.playTapSound();
        scrollToBottom(true);

    } catch (err) {
        console.error("Supabase Media upload error:", err);
        showToast(`Upload Failed: ${err.message || 'Please check keys & bucket.'}`, "error");
        if (uploadProgressContainer) uploadProgressContainer.classList.add("hidden");
    }
}

// Drag and drop support
if (messagesContainer) {
    ["dragenter", "dragover"].forEach(eventName => {
        messagesContainer.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            messagesContainer.classList.add("bg-pink-50/40");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        messagesContainer.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            messagesContainer.classList.remove("bg-pink-50/40");
        });
    });

    messagesContainer.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const files = dt ? dt.files : null;
        if (files && files[0]) {
            const file = files[0];
            if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/")) {
                openMediaPreview(file);
            }
        }
    });
}

// Paste image from clipboard support (Ctrl+V)
window.addEventListener("paste", (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
                openMediaPreview(blob);
                break;
            }
        }
    }
});

// ==========================================================
// 15. Quick Emojis & Suggestion Pills
// ==========================================================
quickEmojis.forEach((btn) => {
    btn.addEventListener("click", () => {
        if (mediaPreviewModal && !mediaPreviewModal.classList.contains("hidden") && mediaPreviewCaption) {
            mediaPreviewCaption.value += btn.textContent.trim();
            mediaPreviewCaption.focus();
        } else if (messageInput) {
            messageInput.value += btn.textContent.trim();
            messageInput.focus();
            setTypingState(true);
        }
    });
});

// Interactive Empty State Suggestion Pills
document.querySelectorAll(".chat-prompt-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
        const text = pill.textContent.trim();
        if (text.includes("photo") || text.includes("📸")) {
            if (mediaUploadInput) mediaUploadInput.click();
        } else if (messageInput) {
            messageInput.value = text;
            messageInput.focus();
            setTypingState(true);
        }
    });
});

// ==========================================================
// 16. Conversation Switching & Mobile Sidebar Toggle
// ==========================================================
chatItems.forEach((item) => {
    item.addEventListener("click", () => {
        chatItems.forEach((i) => i.classList.remove("active"));
        item.classList.add("active");

        const chatId = item.getAttribute("data-chat-id");
        const chatName = item.getAttribute("data-chat-name") || "Chat";
        const chatStatus = item.getAttribute("data-chat-status") || "Connected";

        if (chatHeaderTitle) chatHeaderTitle.textContent = chatName;
        if (chatHeaderSubtitle) chatHeaderSubtitle.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ${chatStatus}`;

        if (window.innerWidth < 768 && chatSidebar) {
            chatSidebar.classList.add("hidden");
        }

        connectToChat(chatId);
    });
});

if (mobileBackBtn && chatSidebar) {
    mobileBackBtn.addEventListener("click", () => {
        chatSidebar.classList.remove("hidden");
    });
}

// ==========================================================
// 17. Search Filter
// ==========================================================
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        chatItems.forEach((item) => {
            const name = (item.getAttribute("data-chat-name") || "").toLowerCase();
            const text = item.textContent.toLowerCase();
            if (name.includes(query) || text.includes(query)) {
                item.style.display = "flex";
            } else {
                item.style.display = "none";
            }
        });
    });
}
