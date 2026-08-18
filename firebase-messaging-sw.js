// ==========================================================
// firebase-messaging-sw.js — Firebase Cloud Messaging Service Worker
// Handles Background Push Notifications for Messages and WebRTC Calls
// ==========================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize Firebase in Service Worker
firebase.initializeApp({
    apiKey: "AIzaSyBjebEXh_lAuQbHxJSHHU4IyfnQOMoXdEA",
    authDomain: "bakudi-c11bb.firebaseapp.com",
    projectId: "bakudi-c11bb",
    storageBucket: "bakudi-c11bb.firebasestorage.app",
    messagingSenderId: "362499672150",
    appId: "1:362499672150:web:efcf2f2d03a22f9c6a53f7",
});

const messaging = firebase.messaging();

// Handle Background Push Messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    const data = payload.data || {};
    const notification = payload.notification || {};

    const title = notification.title || data.title || 'Our Story ❤️';
    const body = notification.body || data.body || 'You have a new sweet message.';
    const icon = notification.icon || data.icon || 'assets/images/icon-192.png';
    const badge = 'assets/images/icon-192.png';
    const tag = data.tag || 'chat-notification';
    const url = data.url || 'chat.html';

    const notificationOptions = {
        body: body,
        icon: icon,
        badge: badge,
        tag: tag,
        data: {
            url: url,
            callId: data.callId || null
        },
        vibrate: [200, 100, 200, 100, 200],
        renotify: true,
        actions: [
            { action: 'open', title: 'Open Chat ❤️' }
        ]
    };

    self.registration.showNotification(title, notificationOptions);
});

// Handle Notification Click
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification);
    event.notification.close();

    const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : 'chat.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // If already open, focus it
            for (let client of windowClients) {
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
