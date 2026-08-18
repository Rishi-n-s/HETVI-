// ==========================================================
// chat.js — Advanced Real-Time Chat Engine (Supabase Storage + Firebase Auth/Firestore)
// ==========================================================

import { 
    auth, 
    db, 
    doc,
    setDoc,
    requireAuth, 
    logoutUser, 
    getUserProfile 
} from "./firebase.js";
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { uploadMediaToSupabase } from "./supabase.js";

// State
let currentAuthUser = null;
let currentProfile = null;
let activeChatId = "our_story_room";
let unsubscribeCurrentChat = null;
let unsubscribeTyping = null;
let typingTimeout = null;
let isCurrentlyTyping = false;
let pendingMediaFile = null;

// DOM Elements
const messagesContainer = document.getElementById("messages-container");
const emptyState = document.getElementById("empty-state");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const attachBtn = document.getElementById("attach-btn");
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

// Lightbox & Media Preview Elements
const mediaLightbox = document.getElementById("media-lightbox");
const lightboxCloseBtn = document.getElementById("lightbox-close-btn");
const lightboxContent = document.getElementById("lightbox-content");
const mediaPreviewModal = document.getElementById("media-preview-modal");
const mediaPreviewDisplay = document.getElementById("media-preview-display");
const mediaPreviewCaption = document.getElementById("media-preview-caption");
const mediaPreviewCloseBtn = document.getElementById("media-preview-close-btn");
const mediaPreviewCancelBtn = document.getElementById("media-preview-cancel-btn");
const mediaPreviewSendBtn = document.getElementById("media-preview-send-btn");

// ==========================================================
// 1. Authenticate & Initialize User Session
// ==========================================================
requireAuth((user, profile) => {
    currentAuthUser = user;
    currentProfile = profile || getUserProfile(user);

    console.log("Authenticated Chat User:", currentAuthUser.email, "Profile:", currentProfile);

    // Update Top User Chip
    if (currentUserNameEl) {
        currentUserNameEl.textContent = `👤 ${currentProfile.name}`;
    }

    // Connect to initial active chat and typing listeners
    connectToChat(activeChatId);
    listenToPartnerTyping();
});

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
// 2. Real-Time Typing Indicator
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
    unsubscribeTyping = onSnapshot(typingCol, (snapshot) => {
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
    });
}

// ==========================================================
// 3. Fullscreen Media Lightbox Modal
// ==========================================================
window.openMediaLightbox = function(mediaUrl, mediaType) {
    if (!mediaLightbox || !lightboxContent) return;

    if (mediaType === "video") {
        lightboxContent.innerHTML = `
            <video src="${escapeHTML(mediaUrl)}" controls autoplay playsinline class="max-w-full max-h-[85vh] rounded-2xl shadow-2xl bg-black/60"></video>
        `;
    } else {
        lightboxContent.innerHTML = `
            <img src="${escapeHTML(mediaUrl)}" alt="Full size photo" class="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
        `;
    }

    mediaLightbox.classList.remove("hidden");
    mediaLightbox.classList.add("flex");
};

if (lightboxCloseBtn && mediaLightbox) {
    lightboxCloseBtn.addEventListener("click", () => {
        mediaLightbox.classList.add("hidden");
        mediaLightbox.classList.remove("flex");
        if (lightboxContent) lightboxContent.innerHTML = "";
    });

    mediaLightbox.addEventListener("click", (e) => {
        if (e.target === mediaLightbox) {
            mediaLightbox.classList.add("hidden");
            mediaLightbox.classList.remove("flex");
            if (lightboxContent) lightboxContent.innerHTML = "";
        }
    });
}

// ==========================================================
// 4. Format Timestamps
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
// 5. Render Message Bubble (Text, Images & Videos)
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
    const mediaType = data.mediaType || null; // 'image' | 'video'

    const wrapper = document.createElement("div");
    wrapper.className = `flex flex-col ${isSentByMe ? 'items-end' : 'items-start'} fade-up`;
    wrapper.id = `msg-${docId}`;

    // Build Media HTML if attached
    let mediaHtml = "";
    if (mediaUrl) {
        if (mediaType === "video") {
            mediaHtml = `
                <div class="rounded-2xl overflow-hidden mb-2 max-w-full bg-black/40 border border-white/20 relative group/video shadow-md">
                    <video src="${escapeHTML(mediaUrl)}" controls playsinline preload="metadata" class="w-full max-h-72 object-contain rounded-2xl bg-black"></video>
                    <button type="button" onclick="window.openMediaLightbox('${escapeHTML(mediaUrl)}', 'video')" class="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover/video:opacity-100 transition-opacity z-10" title="Full Screen">
                        <span class="material-symbols-outlined text-[18px]">fullscreen</span>
                    </button>
                </div>
            `;
        } else {
            mediaHtml = `
                <div class="rounded-2xl overflow-hidden mb-2 max-w-full group/media relative cursor-pointer shadow-md" onclick="window.openMediaLightbox('${escapeHTML(mediaUrl)}', 'image')">
                    <img src="${escapeHTML(mediaUrl)}" alt="Photo Attachment" class="w-full max-h-80 object-cover rounded-2xl transition-transform hover:scale-[1.02] duration-300" loading="lazy" />
                    <div class="absolute inset-0 bg-black/20 opacity-0 group-hover/media:opacity-100 transition-opacity rounded-2xl flex items-center justify-center pointer-events-none">
                        <span class="material-symbols-outlined text-white text-3xl drop-shadow-md">fullscreen</span>
                    </div>
                </div>
            `;
        }
    }

    if (isSentByMe) {
        // Sent Message (Right align, romantic rose gradient)
        wrapper.innerHTML = `
            <div class="flex items-end gap-2 max-w-[88%] sm:max-w-[78%] md:max-w-[72%]">
                <div class="flex flex-col items-end">
                    <div class="bubble-sent p-3 sm:px-4 sm:py-2.5 rounded-2xl rounded-br-xs text-sm leading-relaxed break-words shadow-md">
                        ${mediaHtml}
                        ${messageText ? `<p class="text-sm">${escapeHTML(messageText)}</p>` : ''}
                    </div>
                    <span class="text-[10px] text-gray-400 font-sans mt-1 mr-1">${timeFormatted}</span>
                </div>
            </div>
        `;
    } else {
        // Received Message (Left align, pure white glass bubble with avatar)
        wrapper.innerHTML = `
            <div class="flex items-start gap-2.5 max-w-[88%] sm:max-w-[78%] md:max-w-[72%]">
                <div class="w-8 h-8 rounded-full bg-pink-200 border border-white flex-shrink-0 overflow-hidden shadow-xs mt-1">
                    <img src="assets/images/main.jpeg" onerror="this.src='https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80'" class="w-full h-full object-cover" alt="Sender" />
                </div>
                <div class="flex flex-col">
                    <span class="text-[11px] font-quicksand font-semibold text-primary-dark ml-1 mb-0.5">${escapeHTML(senderDisplayName)}</span>
                    <div class="bubble-received p-3 sm:px-4 sm:py-2.5 rounded-2xl rounded-tl-xs text-sm leading-relaxed break-words shadow-sm">
                        ${mediaHtml}
                        ${messageText ? `<p class="text-sm text-gray-800">${escapeHTML(messageText)}</p>` : ''}
                    </div>
                    <span class="text-[10px] text-gray-400 font-sans mt-1 ml-1">${timeFormatted}</span>
                </div>
            </div>
        `;
    }

    return wrapper;
}

function escapeHTML(str) {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function scrollToBottom() {
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// ==========================================================
// 6. Connect to Firestore Collection in Real-Time
// ==========================================================
function connectToChat(chatId) {
    if (unsubscribeCurrentChat) {
        unsubscribeCurrentChat();
    }

    activeChatId = chatId;
    console.log(`Connecting real-time listener to chat collection: ${chatId}`);

    const collectionRef = collection(db, chatId);
    const messagesQuery = query(collectionRef, orderBy("createdAt", "asc"));

    unsubscribeCurrentChat = onSnapshot(
        messagesQuery,
        (snapshot) => {
            console.log(`[Firestore Real-Time] Received ${snapshot.size} messages for '${chatId}'`);
            
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

            messagesContainer.innerHTML = "";
            let lastMessageText = "";
            let lastMessageTime = "";

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const msgEl = createMessageElement(docSnap.id, data);
                messagesContainer.appendChild(msgEl);

                lastMessageText = data.mediaType ? `[${data.mediaType.toUpperCase()}] ${data.message || ''}` : (data.message || data.text || "");
                lastMessageTime = formatMessageTime(data.createdAt);
            });

            // Update preview on sidebar
            const activeItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
            if (activeItem) {
                const previewEl = activeItem.querySelector("#last-msg-preview") || activeItem.querySelector("p");
                const timeEl = activeItem.querySelector("#last-msg-time") || activeItem.querySelector(".text-\\[11px\\]");
                if (previewEl && lastMessageText) previewEl.textContent = lastMessageText;
                if (timeEl && lastMessageTime) timeEl.textContent = lastMessageTime;
            }

            scrollToBottom();
        },
        (error) => {
            console.error("Firestore onSnapshot error:", error);
        }
    );
}

// ==========================================================
// 7. Send Text Message
// ==========================================================
async function handleSendMessage(e) {
    if (e) e.preventDefault();

    if (!currentAuthUser) {
        alert("Please sign in first to send messages.");
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
        alert("Could not send message. Please check Firestore security rules & network connection.");
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        scrollToBottom();
    }
}

if (chatForm) {
    chatForm.addEventListener("submit", handleSendMessage);
}

// ==========================================================
// 8. WhatsApp-Style Media Preview & Supabase Storage Upload
// ==========================================================

/**
 * Automatically compress client-side images using Canvas to ensure blazing-fast upload
 */
async function compressImageIfNeeded(file) {
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
        return file; // Return as-is for GIF or non-images
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

function openMediaPreview(file) {
    pendingMediaFile = file;
    const isVideo = file.type.startsWith("video");

    if (mediaPreviewDisplay) {
        const objectUrl = URL.createObjectURL(file);
        if (isVideo) {
            mediaPreviewDisplay.innerHTML = `
                <video src="${objectUrl}" controls playsinline class="max-h-72 w-full object-contain rounded-2xl bg-black"></video>
            `;
        } else {
            mediaPreviewDisplay.innerHTML = `
                <img src="${objectUrl}" class="max-h-72 w-full object-contain rounded-2xl" alt="Preview" />
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

        // Reset input for next selection
        mediaUploadInput.value = "";

        // File size check (Max 50MB for Supabase)
        if (file.size > 50 * 1024 * 1024) {
            alert("File is too large! Please select a photo or video under 50MB.");
            return;
        }

        openMediaPreview(file);
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
    const mediaType = isVideo ? "video" : "image";
    
    // Compress image if applicable
    const file = isVideo ? rawFile : await compressImageIfNeeded(rawFile);

    // Show upload progress UI
    if (uploadProgressContainer) uploadProgressContainer.classList.remove("hidden");
    if (uploadProgressFill) uploadProgressFill.style.width = "0%";
    if (uploadProgressText) uploadProgressText.textContent = `Uploading ${mediaType}... 0%`;

    try {
        // Upload to Supabase Storage with real-time progress
        const uploadResult = await uploadMediaToSupabase(file, (percent) => {
            if (uploadProgressFill) uploadProgressFill.style.width = `${percent}%`;
            if (uploadProgressText) uploadProgressText.textContent = `Uploading ${mediaType}... ${percent}%`;
        });

        // Upload complete (100%)
        if (uploadProgressFill) uploadProgressFill.style.width = "100%";
        if (uploadProgressText) uploadProgressText.textContent = `Uploading ${mediaType}... 100%`;

        setTimeout(() => {
            if (uploadProgressContainer) uploadProgressContainer.classList.add("hidden");
        }, 400);

        // Save metadata payload to Cloud Firestore
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

        console.log("[Supabase -> Firestore] Media message successfully saved:", payload);
        if (window.playTapSound) window.playTapSound();
        scrollToBottom();

    } catch (err) {
        console.error("Supabase Media upload execution error:", err);
        alert(`Supabase Upload Failed: ${err.message || 'Please check your Supabase Storage bucket configuration and keys.'}`);
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
            if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
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
// 9. Quick Emojis
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

// ==========================================================
// 10. Conversation Switching & Mobile Sidebar Toggle
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
// 11. Search Filter
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
