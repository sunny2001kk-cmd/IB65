// js/app.js
import { 
    auth, 
    db, 
    doc, 
    getDoc, 
    collection, 
    getDocs, 
    arrayUnion, 
    arrayRemove, 
    increment, 
    onAuthStateChanged,
    showToast, 
    getVerificationBadgeSvg 
} from './config.js';

import { 
    loadPostsFeed, 
    loadReelsFeed, 
    loadExploreMedia, 
    loadStoriesTray, 
    openStoryQueueIndex, 
    closeStory, 
    openProfileFromStory, 
    openComments, 
    closeComments, 
    submitComment,
    openMediaViewer,
    closeMediaViewer,
    toggleCloudLike,
    toggleSavePost,
    deleteMyContent
} from './feed.js';

import { 
    openProEditorSuite, 
    closeProEditor, 
    captureCurrentThumbnailFrame, 
    toggleEditorPlayback, 
    handleZoomSlider, 
    openAddTextTool, 
    cycleFilterPresets, 
    proceedToPublishFromEditor 
} from './editor.js';

// Bind to Window
window.openProEditorSuite = openProEditorSuite;
window.closeProEditor = closeProEditor;
window.captureCurrentThumbnailFrame = captureCurrentThumbnailFrame;
window.toggleEditorPlayback = toggleEditorPlayback;
window.handleZoomSlider = handleZoomSlider;
window.openAddTextTool = openAddTextTool;
window.cycleFilterPresets = cycleFilterPresets;
window.proceedToPublishFromEditor = proceedToPublishFromEditor;

window.loadPostsFeed = loadPostsFeed;
window.loadReelsFeed = loadReelsFeed;
window.loadExploreMedia = loadExploreMedia;
window.loadStoriesTray = loadStoriesTray;
window.openStoryQueueIndex = openStoryQueueIndex;
window.closeStory = closeStory;
window.openProfileFromStory = openProfileFromStory;
window.openComments = openComments;
window.closeComments = closeComments;
window.submitComment = submitComment;
window.openMediaViewer = openMediaViewer;
window.closeMediaViewer = closeMediaViewer;
window.toggleCloudLike = toggleCloudLike;
window.toggleSavePost = toggleSavePost;
window.deleteMyContent = deleteMyContent;

// Tab Routing System
window.switchTab = function(tab) {
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Profile Loader
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

            document.getElementById('profile-top-username').innerHTML = `@${cleanHandle} ${badgeSvg}`;
            document.getElementById('my-profile-name').innerHTML = `<span>${d.name || user.displayName || 'User'}</span> ${badgeSvg}`;
            document.getElementById('my-profile-handle').innerText = '@' + cleanHandle;
            document.getElementById('my-profile-bio').innerText = d.bio || '';

            const fCount = typeof d.followers === 'number' ? d.followers : (d.followersList ? d.followersList.length : 0);
            const fgCount = typeof d.following === 'number' ? d.following : (d.followingList ? d.followingList.length : 0);
            
            document.getElementById('my-stat-followers').innerText = fCount;
            document.getElementById('my-stat-following').innerText = fgCount;
        }

        const [pSnap, rSnap] = await Promise.all([
            getDocs(collection(db, "posts")),
            getDocs(collection(db, "reels"))
        ]);
        const myMedia = [];
        pSnap.forEach(p => { if (p.data().authorEmail === user.email) myMedia.push({ id: p.id, col: 'posts', ...p.data() }); });
        rSnap.forEach(r => { if (r.data().authorEmail === user.email) myMedia.push({ id: r.id, col: 'reels', mediaType: 'video', mediaUrl: r.data().videoUrl, ...r.data() }); });

        document.getElementById('my-stat-posts').innerText = myMedia.length;

        const grid = document.getElementById('my-media-grid');
        if (grid) {
            grid.innerHTML = myMedia.length === 0 ? '<div class="col-span-3 text-gray-500 py-8 text-xs text-center">No media uploaded yet</div>' : myMedia.map(p => `
                <div class="relative h-32 bg-zinc-900 rounded-lg overflow-hidden cursor-pointer border border-zinc-800 flex items-center justify-center" onclick='window.openMediaViewer(${JSON.stringify(p)})'>
                    ${p.mediaType === 'video' ? `
                        <video src="${p.mediaUrl || p.videoUrl}#t=0.1" preload="metadata" muted playsinline class="w-full h-full object-cover"></video>
                    ` : `
                        <img src="${p.mediaUrl}" loading="lazy" class="w-full h-full object-cover">
                    `}
                </div>
            `).join('');
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
        const badgeSvg = getVerificationBadgeSvg(d.badgeType || 'none');

        document.getElementById('pub-top-handle').innerText = '@' + cleanHandle;
        document.getElementById('pub-name').innerHTML = `<span>${d.name || 'Creator'}</span> ${badgeSvg}`;
        document.getElementById('pub-handle').innerText = '@' + cleanHandle;
        document.getElementById('pub-bio').innerText = d.bio || '';

        const fCount = typeof d.followers === 'number' ? d.followers : (d.followersList ? d.followersList.length : 0);
        const fgCount = typeof d.following === 'number' ? d.following : (d.followingList ? d.followingList.length : 0);
        
        document.getElementById('pub-stat-followers').innerText = fCount;
        document.getElementById('pub-stat-following').innerText = fgCount;

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

        ['home', 'search', 'reels', 'live', 'profile'].forEach(t => document.getElementById('view-' + t)?.classList.add('hidden'));
        document.getElementById('view-public-profile')?.classList.remove('hidden');
    } catch(e) {}
};

// Follow/Unfollow Sync
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
    } catch(e) {}
};

window.shareLink = function() {
    navigator.clipboard.writeText(window.location.href);
    showToast("Link copied to clipboard!");
};

// Auto Start on Load
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.loadMyProfile();
        window.loadStoriesTray();
        window.loadPostsFeed();
    }
});
