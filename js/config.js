// js/config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendEmailVerification, 
    sendPasswordResetEmail, 
    onAuthStateChanged, 
    signOut, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    where, 
    arrayUnion, 
    arrayRemove, 
    increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase App Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBlM05NZl4bKjRsrZ0ZUDpjYi0fdPP2-X4",
    authDomain: "ib65-67f62.firebaseapp.com",
    projectId: "ib65-67f62",
    storageBucket: "ib65-67f62.firebasestorage.app",
    messagingSenderId: "323877271127",
    appId: "1:323877271127:web:8318d8904784503b061512"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export Authentication & Firestore methods
export {
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendEmailVerification, 
    sendPasswordResetEmail, 
    onAuthStateChanged, 
    signOut, 
    updateProfile,
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    where, 
    arrayUnion, 
    arrayRemove, 
    increment
};

// Cloudinary Storage Config
export const CLOUDINARY_CONFIG = {
    cloudName: "mhj8jvag",
    uploadPreset: "ib65_upload"
};

// Global Floating Notification
export function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 2300);
}

// Relative Time Formatter (Fixes feed.js crash)
export function getRelativeTime(timestamp) {
    if (!timestamp) return 'Just now';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return `${Math.floor(diff / 604800)}w`;
}

// Verified Badge Icons
export function getVerificationBadgeSvg(badgeType) {
    if (badgeType === 'gold_red') {
        return `
        <svg class="inline-block w-4 h-4 ml-1 flex-shrink-0 align-middle" viewBox="0 0 24 24" fill="none">
            <defs>
                <radialGradient id="goldRedGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#ef4444" />
                    <stop offset="70%" stop-color="#dc2626" />
                    <stop offset="100%" stop-color="#eab308" />
                </radialGradient>
            </defs>
            <path d="M12 2l2.4 2.2 3.2-.5 1.5 2.9 3.1 1.1-.3 3.3 2.1 2.5-1.5 2.9.8 3.2-3.1 1.2-1.4 3-3.2-.4L12 22l-2.4-2.2-3.2.5-1.5-2.9-3.1-1.1.3-3.3-2.1-2.5 1.5-2.9-.8-3.2 3.1-1.2 1.4-3 3.2.4L12 2z" fill="url(#goldRedGrad)"/>
            <path d="M9.5 12.5l2 2 4.5-4.5" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    } else if (badgeType === 'red') {
        return `
        <svg class="inline-block w-4 h-4 ml-1 flex-shrink-0 align-middle" viewBox="0 0 24 24" fill="none">
            <path d="M12 2l2.4 2.2 3.2-.5 1.5 2.9 3.1 1.1-.3 3.3 2.1 2.5-1.5 2.9.8 3.2-3.1 1.2-1.4 3-3.2-.4L12 22l-2.4-2.2-3.2.5-1.5-2.9-3.1-1.1.3-3.3-2.1-2.5 1.5-2.9-.8-3.2 3.1-1.2 1.4-3 3.2.4L12 2z" fill="#dc2626"/>
            <path d="M9.5 12.5l2 2 4.5-4.5" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }
    return '';
}
