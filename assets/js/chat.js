// ==========================================================
// chat.js — Real-Time Chat Engine with Firebase Auth & Firestore
// ==========================================================

import { 
    auth, 
    db, 
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

// State
let currentAuthUser = null;
let currentProfile = null;
let activeChatId = "our_story_room";
let unsubscribeCurrentChat = null;

// DOM Elements
const messagesContainer = document.getElementById("messages-container");
const emptyState = document.getElementById("empty-state");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const currentUserNameEl = document.getElementById("current-user-name");
const signOutBtn = document.getElementById("sign-out-btn");
const chatHeaderTitle = document.getElementById("chat-header-title");
const chatHeaderSubtitle = document.getElementById("chat-header-subtitle");
const chatSidebar = document.getElementById("chat-sidebar");
const mobileBackBtn = document.getElementById("mobile-back-btn");
const searchInput = document.getElementById("search-input");
const quickEmojis = document.querySelectorAll(".quick-emoji");
const chatItems = document.querySelectorAll(".chat-item");

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

    // Connect to initial active chat
    connectToChat(activeChatId);
});

// Hook Sign Out
if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to lock the app and sign out?")) {
            await logoutUser();
        }
    });
}

// ==========================================================
// 2. Format Timestamps
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
// 3. Render Message Bubble
// ==========================================================
function createMessageElement(docId, data) {
    if (!currentAuthUser) return document.createElement("div");

    // Sent vs Received detection using Firebase Auth UID or Email
    const isSentByMe = (data.uid && data.uid === currentAuthUser.uid) || 
                       (data.email && data.email.toLowerCase() === currentAuthUser.email.toLowerCase()) ||
                       ((data.sender || data.displayName || "").trim().toLowerCase() === currentProfile.name.trim().toLowerCase());

    const senderDisplayName = data.displayName || data.sender || data.name || "Special Someone";
    const timeFormatted = formatMessageTime(data.createdAt);
    const messageText = data.message || data.text || "";

    const wrapper = document.createElement("div");
    wrapper.className = `flex flex-col ${isSentByMe ? 'items-end' : 'items-start'} fade-up`;
    wrapper.id = `msg-${docId}`;

    if (isSentByMe) {
        // Sent Message (Right align, romantic rose gradient)
        wrapper.innerHTML = `
            <div class="flex items-end gap-2 max-w-[85%] md:max-w-[72%]">
                <div class="flex flex-col items-end">
                    <div class="bubble-sent px-4 py-2.5 rounded-2xl rounded-br-xs text-sm leading-relaxed break-words shadow-sm">
                        ${escapeHTML(messageText)}
                    </div>
                    <span class="text-[10px] text-gray-400 font-sans mt-1 mr-1">${timeFormatted}</span>
                </div>
            </div>
        `;
    } else {
        // Received Message (Left align, pure white glass bubble with avatar)
        wrapper.innerHTML = `
            <div class="flex items-start gap-2.5 max-w-[85%] md:max-w-[72%]">
                <div class="w-8 h-8 rounded-full bg-pink-200 border border-white flex-shrink-0 overflow-hidden shadow-xs mt-1">
                    <img src="assets/images/main.jpeg" onerror="this.src='https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80'" class="w-full h-full object-cover" alt="Sender" />
                </div>
                <div class="flex flex-col">
                    <span class="text-[11px] font-quicksand font-semibold text-primary-dark ml-1 mb-0.5">${escapeHTML(senderDisplayName)}</span>
                    <div class="bubble-received px-4 py-2.5 rounded-2xl rounded-tl-xs text-sm leading-relaxed break-words">
                        ${escapeHTML(messageText)}
                    </div>
                    <span class="text-[10px] text-gray-400 font-sans mt-1 ml-1">${timeFormatted}</span>
                </div>
            </div>
        `;
    }

    return wrapper;
}

function escapeHTML(str) {
    return str
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
// 4. Connect to Firestore Collection in Real-Time
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

            snapshot.forEach((doc) => {
                const data = doc.data();
                const msgEl = createMessageElement(doc.id, data);
                messagesContainer.appendChild(msgEl);

                lastMessageText = data.message || data.text || "";
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
// 5. Send Message to Firestore (with Auth Identity & serverTimestamp)
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

    try {
        if (sendBtn) sendBtn.disabled = true;

        // Structured payload with complete Firebase Auth User Identity & serverTimestamp
        const payload = {
            uid: currentAuthUser.uid,
            email: currentAuthUser.email,
            displayName: currentProfile.name,
            sender: currentProfile.name,
            message: text,
            createdAt: serverTimestamp() // Firestore server-side canonical timestamp
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
// 6. Quick Emojis
// ==========================================================
quickEmojis.forEach((btn) => {
    btn.addEventListener("click", () => {
        if (messageInput) {
            messageInput.value += btn.textContent.trim();
            messageInput.focus();
        }
    });
});

// ==========================================================
// 7. Conversation Switching & Mobile Sidebar Toggle
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
// 8. Search Filter
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
