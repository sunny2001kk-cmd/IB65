// js/app.js
import { 
    auth, 
    db, 
    doc, 
    getDoc, 
    updateDoc, 
    collection, 
    addDoc, 
    getDocs, 
    arrayUnion, 
    arrayRemove, 
    increment, 
    onAuthStateChanged,
    showToast, 
    getVerificationBadgeSvg, 
    CLOUDINARY_CONFIG 
} from './config.js';

import { 
    handleSignup, 
    handleLogin, 
    handleLogout, 
    handleForgotPassword, 
    checkHandleAvailability, 
    openAccountSwitcher, 
    switchActiveSession 
} from './auth.js';

import { 
    openProfessionalDashboard, 
    closeProfessionalDashboard 
} from './dashboard.js';

import { 
    openProEditorSuite, 
    closeProEditor, 
    captureCurrentThumbnailFrame, 
    toggleEditorPlayback, 
    handleZoomSlider, 
    openAddTextTool, 
    cycleFilterPresets, 
    proceedToPublishFromEditor, 
    resetEditorThumb, 
    customThumbnailBlob 
} from './editor.js';

import { 
    startBroadcast, 
    joinBroadcast, 
    resumeLiveStreamPlayback, 
    sendLiveMsg, 
    triggerLiveHeartGlobal, 
    exitLiveRoom, 
    loadLiveBroadcasters 
} from './live.js';

import { 
    openDirectInbox, 
    closeDirectInbox, 
    openDirectChatWithUser, 
    closeDirectChat, 
    navigateToChatUserProfile, 
    sendChatMessageDirect 
} from './direct.js';

import { 
    loadPostsFeed, 
    loadReelsFeed, 
    loadExploreMedia, 
    loadStoriesTray, 
    openStoryQueueIndex, 
    closeStory, 
    openProfileFromStory, 
    startWatchTracking, 
    stopWatchTracking, 
    openComments, 
    closeComments, 
    submitComment,
    handleSearch,
    openMediaViewer,
    closeMediaViewer,
    toggleCloudLike,
    triggerDoubleTapLike,
    toggleSavePost,
    deleteMyContent
} from './feed.js';

let currentTab = 'home';
let uploadType = 'post';
let selectedFileBlob = null;
let selectedFileUrl = '';
let selectedFileType = 'image';

// Bind to Window
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.handleForgotPassword = handleForgotPassword;
window.checkHandleAvailability = checkHandleAvailability;
window.openAccountSwitcher = openAccountSwitcher;
window.switchActiveSession = switchActiveSession;

window.openProfessionalDashboard = openProfessionalDashboard;
window.closeProfessionalDashboard = closeProfessionalDashboard;

window.closeProEditor = closeProEditor;
window.captureCurrentThumbnailFrame = captureCurrentThumbnailFrame;
window.toggleEditorPlayback = toggleEditorPlayback;
window.handleZoomSlider = handleZoomSlider;
window.openAddTextTool = openAddTextTool;
window.cycleFilterPresets = cycleFilterPresets;
window.proceedToPublishFromEditor = proceedToPublishFromEditor;

window.startBroadcast = startBroadcast;
window.joinBroadcast = joinBroadcast;
window.resumeLiveStreamPlayback = resumeLiveStreamPlayback;
window.sendLiveMsg = sendLiveMsg;
window.triggerLiveHeartGlobal = triggerLiveHeartGlobal;
window.exitLiveRoom = exitLiveRoom;

window.openDirectInbox = openDirectInbox;
window.closeDirectInbox = closeDirectInbox;
window.openDirectChatWithUser = openDirectChatWithUser;
window.closeDirectChat = closeDirectChat;
window.navigateToChatUserProfile = navigateToChatUserProfile;
window.sendChatMessageDirect = sendChatMessageDirect;

window.loadPostsFeed = loadPostsFeed;
window.loadReelsFeed = loadReelsFeed;
window.loadExploreMedia = loadExploreMedia;
window.loadStoriesTray = loadStoriesTray;
window.openStoryQueueIndex = openStoryQueueIndex;
window.closeStory = closeStory;
window.openProfileFromStory = openProfileFromStory;
window.startWatchTracking = startWatchTracking;
window.stopWatchTracking = stopWatchTracking;
window.openComments = openComments;
window.closeComments = closeComments;
window.submitComment = submitComment;

window.handleSearch = handleSearch;
window.openMediaViewer = openMediaViewer;
window.closeMediaViewer = closeMediaViewer;
window.toggleCloudLike = toggleCloudLike;
window.triggerDoubleTapLike = triggerDoubleTapLike;
window.toggleSavePost = toggleSavePost;
window.deleteMyContent = deleteMyContent;

// Tab Routing System
window.switchTab = function(tab) {
    currentTab = tab;
    document.querySelectorAll('.feed-video-card, .reel-video-element').forEach(v => v.pause());

    const header = document.getElementById('main-app-header');
    const homeActions = document.getElementById('home-header-actions');

    if (tab === 'reels') {
        header?.classList.add('hidden');
    } else {
        header?.classList.remove('hidden');
        if (tab === 'home') homeActions?.classList.remove('hidden');
        else homeActions?.classList.add('hidden');
    }

    ['home', 'search', 'reels', 'live', 'profile', 'public-profile'].forEach(t => {
        const view = document.getElementById('view-' + t);
        const nav = document.getElementById('nav-' + t);
        if (view) view.classList.add('hidden');
        if (nav) nav.className = 'text-gray-500 text-xl icon-btn';
    });

    const activeView = document.getElementById('view-' + tab);
    const activeNav = document.getElementById('nav-' + tab);
    if (activeView) activeView.classList.remove('hidden');
    if (activeNav) {
        if (tab === 'home') activeNav.className = 'neon-nav-home text-xl icon-btn';
        else if (tab === 'search') activeNav.className = 'neon-nav-search text-xl icon-btn';
        else if (tab === 'reels') activeNav.className = 'neon-nav-reels text-xl icon-btn';
        else if (tab === 'profile') activeNav.className = 'neon-nav-profile text-xl icon-btn';
        else activeNav.className = 'text-white text-xl icon-btn';
    }

    if (tab === 'home') { loadStoriesTray(); loadPostsFeed(); }
    if (tab === 'search') loadExploreMedia();
    if (tab === 'reels') loadReelsFeed();
    if (tab === 'profile') loadMyProfile();
    if (tab === 'live') loadLiveBroadcasters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Profile Loading Function
export async function loadMyProfile() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const uDoc = await getDoc(doc(db, "users", user.email));
        if (uDoc.exists()) {
            const d = uDoc.data();
            const cleanHandle = (d.handle || user.email.split('@')[0]).replace(/^@+/, '');
            const badgeType = d.badgeType || (cleanHandle.toLowerCase() === 'ib65' ? 'gold_red' : 'none');
            const badgeSvg = getVerificationBadgeSvg(badgeType);

            const topUserEl = document.getElementById('profile-top-username');
            const topBadgeEl = document.getElementById('profile-top-badge');
            const nameEl = document.getElementById('my-profile-name');
            const handleEl = document.getElementById('my-profile-handle');
            const bioEl = document.getElementById('my-profile-bio');

            if (topUserEl) topUserEl.innerHTML = `@${cleanHandle}`;
            if (topBadgeEl) topBadgeEl.innerHTML = badgeSvg;
            if (nameEl) nameEl.innerHTML = `<span>${d.name || user.displayName || 'User'}</span> ${badgeSvg}`;
            if (handleEl) handleEl.innerText = '@' + cleanHandle;
            if (bioEl) bioEl.innerText = d.bio || '';

            const avatarImg = document.getElementById('my-profile-avatar-img');
            const avatarTxt = document.getElementById('my-profile-avatar');
            if (d.photoUrl) {
                if (avatarImg) { avatarImg.src = d.photoUrl; avatarImg.classList.remove('hidden'); }
                if (avatarTxt) avatarTxt.classList.add('hidden');
            } else {
                if (avatarImg) avatarImg.classList.add('hidden');
                if (avatarTxt) { avatarTxt.classList.remove('hidden'); avatarTxt.innerText = (d.name || 'U')[0].toUpperCase(); }
            }

            const isPro = d.accountType === 'professional';
            document.getElementById('pro-dashboard-pill')?.classList.toggle('hidden', !isPro);

            const isPriv = !!d.isPrivate;
            document.getElementById('profile-privacy-badge')?.classList.toggle('hidden', !isPriv);

            const fCount = typeof d.followers === 'number' ? d.followers : (d.followersList ? d.followersList.length : 0);
            const fgCount = typeof d.following === 'number' ? d.following : (d.followingList ? d.followingList.length : 0);
            
            const followersEl = document.getElementById('my-stat-followers');
            const followingEl = document.getElementById('my-stat-following');
            if (followersEl) followersEl.innerText = fCount;
            if (followingEl) followingEl.innerText = fgCount;
        }

        const [pSnap, rSnap] = await Promise.all([
            getDocs(collection(db, "posts")),
            getDocs(collection(db, "reels"))
        ]);
        const myMedia = [];
        pSnap.forEach(p => { if (p.data().authorEmail === user.email) myMedia.push({ id: p.id, col: 'posts', ...p.data() }); });
        rSnap.forEach(r => { if (r.data().authorEmail === user.email) myMedia.push({ id: r.id, col: 'reels', mediaType: 'video', mediaUrl: r.data().videoUrl, ...r.data() }); });

        const postsStatEl = document.getElementById('my-stat-posts');
        if (postsStatEl) postsStatEl.innerText = myMedia.length;

        const grid = document.getElementById('my-media-grid');
        if (grid) {
            if (myMedia.length === 0) {
                grid.innerHTML = '<div class="col-span-3 text-gray-500 py-8 text-xs text-center">No media uploaded yet</div>';
            } else {
                grid.innerHTML = myMedia.map(p => {
                    const media = p.mediaUrl || p.videoUrl || p.url || '';
                    const isVid = p.mediaType === 'video' || p.col === 'reels';
                    return `
                        <div class="relative h-32 bg-zinc-900 rounded-lg overflow-hidden cursor-pointer border border-zinc-800 flex items-center justify-center" onclick='window.openMediaViewer(${JSON.stringify(p)})'>
                            ${isVid ? `
                                <video src="${media}#t=0.1" poster="${p.thumbnailUrl || ''}" preload="metadata" muted playsinline class="w-full h-full object-cover pointer-events-none"></video>
                                <span class="absolute top-1.5 right-1.5 bg-black/60 rounded-full px-1.5 py-0.5 text-[9px] text-white">
                                    <i class="fa-solid fa-play text-[8px]"></i>
                                </span>
                            ` : `
                                <img src="${media}" loading="lazy" class="w-full h-full object-cover">
                            `}
                        </div>
                    `;
                }).join('');
            }
        }
    } catch(e) {}
}

window.loadMyProfile = loadMyProfile;

// Public Profile Navigation
window.openPublicProfile = async function(email) {
    const user = auth.currentUser;
    if (user && user.email === email) {
        window.switchTab('profile');
        return;
    }

    try {
        const uSnap = await getDoc(doc(db, "users", email));
        if (!uSnap.exists()) return;
        const d = uSnap.data();

        const cleanHandle = (d.handle || email.split('@')[0]).replace(/^@+/, '');
        const badgeType = d.badgeType || (cleanHandle.toLowerCase() === 'ib65' ? 'gold_red' : 'none');
        const badgeSvg = getVerificationBadgeSvg(badgeType);

        const topHandle = document.getElementById('pub-top-handle');
        const nameEl = document.getElementById('pub-name');
        const handleEl = document.getElementById('pub-handle');
        const bioEl = document.getElementById('pub-bio');

        if (topHandle) topHandle.innerText = '@' + cleanHandle;
        if (nameEl) nameEl.innerHTML = `<span>${d.name || 'Creator'}</span> ${badgeSvg}`;
        if (handleEl) handleEl.innerText = '@' + cleanHandle;
        if (bioEl) bioEl.innerText = d.bio || '';

        const pubImg = document.getElementById('pub-avatar-img');
        const pubTxt = document.getElementById('pub-avatar');
        if (d.photoUrl) {
            if (pubImg) { pubImg.src = d.photoUrl; pubImg.classList.remove('hidden'); }
            if (pubTxt) pubTxt.classList.add('hidden');
        } else {
            if (pubImg) pubImg.classList.add('hidden');
            if (pubTxt) { pubTxt.classList.remove('hidden'); pubTxt.innerText = (d.name || 'C')[0].toUpperCase(); }
        }

        const fCount = typeof d.followers === 'number' ? d.followers : (d.followersList ? d.followersList.length : 0);
        const fgCount = typeof d.following === 'number' ? d.following : (d.followingList ? d.followingList.length : 0);
        
        const fEl = document.getElementById('pub-stat-followers');
        const fgEl = document.getElementById('pub-stat-following');
        if (fEl) fEl.innerText = fCount;
        if (fgEl) fgEl.innerText = fgCount;

        const mySnap = await getDoc(doc(db, "users", user.email));
        const myFollowing = mySnap.exists() ? (mySnap.data().followingList || []) : [];
        const isFollowing = myFollowing.includes(email);

        const fBtn = document.getElementById('pub-follow-btn');
        if (fBtn) {
            fBtn.innerText = isFollowing ? 'Following' : 'Follow';
            fBtn.className = isFollowing ? 'flex-1 border border-zinc-700 text-gray-300 py-2 rounded-xl text-xs font-bold' : 'flex-1 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-white glow-btn-red';
            fBtn.onclick = async () => {
                await window.toggleFollowUser(email, d.name || 'Creator');
                window.openPublicProfile(email);
            };
        }

        const msgBtn = document.getElementById('pub-msg-btn');
        if (msgBtn) {
            msgBtn.onclick = () => window.openDirectChatWithUser(email, d.name || cleanHandle, badgeType);
        }

        const [pSnap, rSnap] = await Promise.all([
            getDocs(collection(db, "posts")),
            getDocs(collection(db, "reels"))
        ]);
        const mediaItems = [];
        pSnap.forEach(p => { if (p.data().authorEmail === email) mediaItems.push({ id: p.id, col: 'posts', ...p.data() }); });
        rSnap.forEach(r => { if (r.data().authorEmail === email) mediaItems.push({ id: r.id, col: 'reels', mediaType: 'video', mediaUrl: r.data().videoUrl, ...r.data() }); });

        const postsEl = document.getElementById('pub-stat-posts');
        if (postsEl) postsEl.innerText = mediaItems.length;

        const grid = document.getElementById('pub-media-grid');
        if (grid) {
            grid.innerHTML = mediaItems.length === 0 ? '<div class="col-span-3 text-center text-gray-500 py-8 text-xs">No posts uploaded yet</div>' : mediaItems.map(p => `
                <div class="h-28 rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center cursor-pointer" onclick='window.openMediaViewer(${JSON.stringify(p)})'>
                    ${p.mediaType === 'video' ? `<video src="${p.mediaUrl \vert{}\vert{} p.videoUrl}#t=0.1" poster="${p.thumbnailUrl || ''}" class="w-full h-full object-cover"></video>` : `<img src="${p.mediaUrl}" class="w-full h-full object-cover">`}
                </div>
            `).join('');
        }

        ['home', 'search', 'reels', 'live', 'profile'].forEach(t => document.getElementById('view-' + t)?.classList.add('hidden'));
        document.getElementById('view-public-profile')?.classList.remove('hidden');
    } catch(e) {}
};

// Follow / Unfollow Logic
window.toggleFollowUser = async function(targetEmail, targetName) {
    const user = auth.currentUser;
    if (!user || user.email === targetEmail) return;

    const myRef = doc(db, "users", user.email);
    const targetRef = doc(db, "users", targetEmail);

    try {
        const mySnap = await getDoc(myRef);
        const myFollowing = mySnap.exists() ? (mySnap.data().followingList || []) : [];

        if (myFollowing.includes(targetEmail)) {
            await updateDoc(myRef, {
                followingList: arrayRemove(targetEmail),
                following: Math.max(0, (mySnap.data().following || 1) - 1)
            });
            await updateDoc(targetRef, {
                followersList: arrayRemove(user.email),
                followers: increment(-1)
            });
            showToast("Unfollowed " + targetName);
        } else {
            await updateDoc(myRef, {
                followingList: arrayUnion(targetEmail),
                following: (mySnap.data().following || 0) + 1
            });
            await updateDoc(targetRef, {
                followersList: arrayUnion(user.email),
                followers: increment(1)
            });
            showToast("Following " + targetName);
        }
        loadPostsFeed();
        loadReelsFeed();
    } catch(e) { showToast(e.message); }
};

// Media Create & Upload Handlers
window.openCreateModal = function(type) {
    uploadType = type || 'post';
    document.getElementById('modal-create')?.classList.remove('hidden');
};

window.closeCreateModal = function() {
    document.getElementById('modal-create')?.classList.add('hidden');
};

window.setUploadType = function(t) {
    uploadType = t;
    ['post', 'reel', 'story'].forEach(tp => {
        const btn = document.getElementById('type-btn-' + tp);
        if (btn) btn.className = tp === t ? 'font-bold text-white border-b-2 border-white pb-1 px-3' : 'text-gray-500 pb-1 px-3';
    });
};

window.handleFileSelected = function(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    showToast("Loading media...");
    selectedFileBlob = f;
    resetEditorThumb();
    selectedFileType = (f.type && f.type.startsWith('video')) ? 'video' : 'image';

    const reader = new FileReader();
    reader.onload = function(event) {
        selectedFileUrl = event.target.result;
        e.target.value = '';
        window.closeCreateModal();
        openProEditorSuite(selectedFileUrl, selectedFileType);
    };
    reader.readAsDataURL(f);
};

window.publishMedia = async function() {
    const user = auth.currentUser;
    if (!user) { showToast("Login required!"); return; }
    if (!selectedFileBlob && !selectedFileUrl) { showToast("Select media first!"); return; }

    const captionInput = document.getElementById('create-caption-input');
    const locationInput = document.getElementById('create-location-input');
    const caption = captionInput ? captionInput.value.trim() : '';
    const location = locationInput ? locationInput.value.trim() : '';

    if (!caption && uploadType !== 'story') {
        showToast("Caption is required!");
        captionInput?.focus();
        return;
    }

    const hashtags = (caption.match(/#[a-z0-9_]+/gi) || []).map(t => t.toLowerCase());
    const btn = document.getElementById('btn-publish');
    if (btn) { btn.innerText = "Sharing..."; btn.disabled = true; }

    try {
        let cloudUrl = selectedFileUrl;
        let uploadedThumbUrl = '';

        if (selectedFileBlob) {
            const fd = new FormData();
            fd.append("file", selectedFileBlob);
            fd.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);

            const endpoint = selectedFileType === 'video'
                ? `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/video/upload`
                : `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;

            const res = await fetch(endpoint, { method: "POST", body: fd });
            const data = await res.json();
            if (data.secure_url) cloudUrl = data.secure_url;
        }

        if (customThumbnailBlob) {
            const thumbFd = new FormData();
            thumbFd.append("file", customThumbnailBlob);
            thumbFd.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
            const thumbRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, { method: "POST", body: thumbFd });
            const thumbData = await thumbRes.json();
            if (thumbData.secure_url) uploadedThumbUrl = thumbData.secure_url;
        }

        const cleanAuthor = (user.displayName || user.email.split('@')[0]).replace(/^@+/, '');
        const uDoc = await getDoc(doc(db, "users", user.email));
        const badgeType = uDoc.data()?.badgeType || (cleanAuthor.toLowerCase() === 'ib65' ? 'gold_red' : 'none');

        const payload = {
            author: cleanAuthor,
            handle: cleanAuthor,
            authorEmail: user.email,
            caption: caption,
            location: location,
            tags: hashtags,
            mediaUrl: cloudUrl,
            thumbnailUrl: uploadedThumbUrl,
            badgeType: badgeType,
            mediaType: selectedFileType,
            views: 0,
            viewedUsers: [],
            shares: 0,
            watchSeconds: 0,
            likes: [],
            comments: [],
            isArchived: false,
            createdAt: Date.now()
        };

        if (uploadType === 'reel') {
            await addDoc(collection(db, "reels"), { ...payload, videoUrl: cloudUrl });
            window.switchTab('reels');
        } else if (uploadType === 'story') {
            await addDoc(collection(db, "stories"), payload);
            window.switchTab('home');
        } else {
            await addDoc(collection(db, "posts"), payload);
            window.switchTab('home');
        }

        window.closeCreateModal();
        selectedFileBlob = null;
        selectedFileUrl = '';
        if (captionInput) captionInput.value = '';
        if (locationInput) locationInput.value = '';
        showToast("Published successfully!");
    } catch(e) {
        showToast("Upload error: " + e.message);
    } finally {
        if (btn) { btn.innerText = "Share"; btn.disabled = false; }
    }
};

window.toggleFeedVideoAudio = function(vid) {
    if (!vid) return;
    const btn = vid.nextElementSibling;
    if (vid.muted) {
        vid.muted = false;
        if (btn) btn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    } else {
        vid.muted = true;
        if (btn) btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    }
};

window.shareLink = function() {
    navigator.clipboard.writeText(window.location.href);
    showToast("Link copied to clipboard!");
};

// Auto Firebase Auth Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('modal-auth')?.classList.add('hidden');
        window.loadMyProfile();
        window.switchTab('home');
    } else {
        document.getElementById('modal-auth')?.classList.remove('hidden');
    }
});
