// ==========================================
// 1. Firebase SDK Imports (v12.17.1 ES Modules)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    browserLocalPersistence,
    setPersistence
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc,
    setDoc,
    deleteDoc,
    addDoc,
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ==========================================
// 2. Firebase Configuration Object
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBjebEXh_lAuQbHxJSHHU4IyfnQOMoXdEA",
    authDomain: "bakudi-c11bb.firebaseapp.com",
    projectId: "bakudi-c11bb",
    storageBucket: "bakudi-c11bb.firebasestorage.app",
    messagingSenderId: "362499672150",
    appId: "1:362499672150:web:efcf2f2d03a22f9c6a53f7",
};

// ==========================================
// 3. Initialize Firebase Services
// ==========================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("Firebase App, Auth & Firestore initialized successfully (Storage handled by Supabase)");

// ==========================================
// 4. Authorized Users Whitelist (Rishi & Bakudi)
// ==========================================
const ALLOWED_ACCOUNTS = {
    "rishisolanki7319@gmail.com": { name: "Rishi", partner: "Bakudi ❤️", role: "rishi" },
    "hetvidodiya2447@gmail.com": { name: "Bakudi", partner: "Rishi ❤️", role: "bakudi" }
};

/**
 * Check if given email is allowed to access the app
 * @param {string} email 
 * @returns {boolean}
 */
function isAuthorizedEmail(email) {
    if (!email) return false;
    const cleanEmail = email.trim().toLowerCase();
    return cleanEmail in ALLOWED_ACCOUNTS || cleanEmail.includes("rishi") || cleanEmail.includes("hetvi");
}

/**
 * Get profile information for an authenticated user
 * @param {object} user 
 * @returns {object}
 */
function getUserProfile(user) {
    if (!user) return null;
    const cleanEmail = (user.email || "").trim().toLowerCase();
    
    if (ALLOWED_ACCOUNTS[cleanEmail]) {
        return ALLOWED_ACCOUNTS[cleanEmail];
    }
    
    if (cleanEmail.includes("rishi")) {
        return { name: "Rishi", partner: "Bakudi ❤️", role: "rishi" };
    }
    return { name: "Bakudi", partner: "Rishi ❤️", role: "bakudi" };
}

// ==========================================
// 5. Authentication Helpers
// ==========================================
/**
 * Sign in user with Email and Password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<object>}
 */
async function loginUser(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    if (!isAuthorizedEmail(cleanEmail)) {
        throw new Error("Access restricted: Only Rishi and Bakudi accounts are authorized to enter.");
    }

    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    return userCredential.user;
}

/**
 * Sign out current user
 */
async function logoutUser() {
    await signOut(auth);
    window.location.href = "lock.html";
}

/**
 * Route protection: requires authentication or redirects to login
 * @param {Function} onAuthenticatedCallback 
 */
function requireAuth(onAuthenticatedCallback) {
    onAuthStateChanged(auth, (user) => {
        if (user && isAuthorizedEmail(user.email)) {
            if (onAuthenticatedCallback) {
                onAuthenticatedCallback(user, getUserProfile(user));
            }
        } else {
            console.warn("Unauthenticated or unauthorized user. Redirecting to lock.html...");
            window.location.href = "lock.html";
        }
    });
}

// ==========================================
// 6. Exports
// ==========================================
export { 
    app, 
    auth, 
    db,
    doc,
    setDoc,
    deleteDoc,
    ALLOWED_ACCOUNTS,
    isAuthorizedEmail,
    getUserProfile,
    loginUser,
    logoutUser,
    requireAuth,
    onAuthStateChanged
};
