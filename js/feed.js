// js/feed.js
import { 
    auth, 
    db, 
    collection, 
    getDocs, 
    getDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    increment, 
    arrayUnion, 
    arrayRemove, 
    showToast, 
    getVerificationBadgeSvg, 
    getRelativeTime 
} from './config.js';
import { isEditorActive } from './editor.js';
import { isLiveBroadcasting } from './live.js';

let globalVideoObserver = null;
let watchInterval = null;
let storiesQueue = [];
let currentStoryIndex = 0;
let storyTimer = null;

let activeCommentCol = 'posts';
let activeCommentDocId = null;

// 1. Single Active Video Observer (Muted Autoplay for Smooth Playback)
export function initGlobalSingleVideoObserver() {
    if (globalVideoObserver) {
        try { globalVideoObserver.disconnect(); } catch(e) {}
    }
    
    globalVideoObserver = new IntersectionObserver((entries) => {
        if (isEditorActive || isLiveBroadcasting) return;

        entries.forEach(entry => {
            const vid = entry.target;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                document.querySelectorAll('.feed-video-card, .reel-video-element').forEach(v => {
                    if (v !== vid && !v.paused) v.pause();
                });
                vid.play().catch(() => {});
            } else {
                if (!vid.paused) vid.pause();
            }
        });
    }, { threshold: 0.55 });

    document.querySelectorAll('.feed-video-card, .reel-video-element').forEach(el => globalVideoObserver.observe(el));
}

// 2. Stories Tray
export async function loadStoriesTray() {
    const tray = document.getElementById('stories-tray-items');
    if (!tray) return;

    try {
        const snap = await getDocs(collection(db, "stories"));
        const stories = [];
        const now = Date.now();
        snap.forEach(d => {
            const s = { id: d.id, ...d.data() };
            if (!s.isArchived && (now - (s.createdAt || 0) < 86400000)) stories.push(s);
        });
        stories.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (stories.length === 0) {
            tray.innerHTML = '<span class="text-[11px] text-gray-500 pl-2">No active stories</span>';
            return;
        }

        storiesQueue = stories;

        tray.innerHTML = stories.map((s, idx) => {
            const rawAuthor = (s.author || s.handle || 'Creator').replace(/^@+/, '');
            const isVid = s.mediaType === 'video';
            return `
                <div class="flex flex-col items-center space-y-1 cursor-pointer flex-shrink-0" onclick="window.openStoryQueueIndex(${idx})">
                    <div class="w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 via-pink-600 to-purple-600 flex items-center justify-center">
                        <div class="w-full h-full bg-black rounded-full overflow-hidden flex items-center justify-center">
                            ${isVid ? `<video src="${s.mediaUrl}" class="w-full h-full object-cover"></video>` : `<img src="${s.mediaUrl}" class="w-full h-full object-cover">`}
                        </div>
                    </div>
                    <span class="text-[10px] text-gray-300 truncate w-16 text-center">${rawAuthor}</span>
                </div>
            `;
        }).join('');
    } catch(e) {
        tray.innerHTML = '<span class="text-[11px] text-gray-500 pl-2">No active stories</span>';
    }
}

export function openStoryQueueIndex(idx) {
    if (!storiesQueue || idx < 0 || idx >= storiesQueue.length) {
        closeStory();
        return;
    }
    currentStoryIndex = idx;
    renderActiveStory(storiesQueue[idx]);
}

function renderActiveStory(story) {
    clearTimeout(storyTimer);
    const cleanAuthor = (story.author || story.handle || 'Creator').replace(/^@+/, '');
    const badgeSvg = getVerificationBadgeSvg(cleanAuthor.toLowerCase() === 'ib65' ? 'gold_red' : 'none');
    
    const authorEl = document.getElementById('story-top-author');
    const avatarEl = document.getElementById('story-top-avatar');
    if (authorEl) authorEl.innerHTML = `${cleanAuthor} ${badgeSvg}`;
    if (avatarEl) avatarEl.innerText = cleanAuthor[0].toUpperCase();

    const bar = document.getElementById('story-progress-bar');
    if (bar) {
        bar.classList.remove('story-progress-active');
        void bar.offsetWidth;
        bar.classList.add('story-progress-active');
    }

    const sImg = document.getElementById('story-img');
    const sVid = document.getElementById('story-vid');

    if (story.mediaType === 'video') {
        if (sImg) sImg.classList.add('hidden');
        if (sVid) {
            sVid.classList.remove('hidden');
            sVid.src = story.mediaUrl;
            sVid.muted = false;
            sVid.volume = 1.0;
            sVid.play().catch(() => {});
        }
    } else {
        if (sVid) sVid.classList.add('hidden');
        if (sImg) {
            sImg.classList.remove('hidden');
            sImg.src = story.mediaUrl;
        }
    }

    const isLiked = (story.likes || []).includes(auth.currentUser?.email);
    const likeIcon = document.getElementById('story-like-icon');
    if (likeIcon) likeIcon.innerHTML = isLiked ? '<i class="fa-solid fa-heart text-red-500"></i>' : '<i class="fa-regular fa-heart"></i>';

    document.getElementById('modal-story')?.classList.remove('hidden');
    storyTimer = setTimeout(() => {
        openStoryQueueIndex(currentStoryIndex + 1);
    }, 7000);
}

export function closeStory() {
    clearTimeout(storyTimer);
    const sVid = document.getElementById('story-vid');
    if (sVid) sVid.pause();
    document.getElementById('modal-story')?.classList.add('hidden');
}

export function openProfileFromStory() {
    const st = storiesQueue[currentStoryIndex];
    if (st && st.authorEmail) {
        closeStory();
        if (window.openPublicProfile) window.openPublicProfile(st.authorEmail);
    }
}

// 3. Home Feed Loader (With Clickable Sound Toggle)
export async function loadPostsFeed() {
    const container = document.getElementById('posts-stream');
    if (!container) return;

    try {
        const [postsSnap, reelsSnap] = await Promise.allSettled([
            getDocs(collection(db, "posts")),
            getDocs(collection(db, "reels"))
        ]);

        const allItems = [];
        if (postsSnap.status === 'fulfilled') {
            postsSnap.value.forEach(d => allItems.push({ id: d.id, col: 'posts', ...d.data() }));
        }
        if (reelsSnap.status === 'fulfilled') {
            reelsSnap.value.forEach(d => {
                const data = d.data();
                allItems.push({ 
                    id: d.id, 
                    col: 'reels', 
                    mediaType: 'video', 
                    mediaUrl: data.videoUrl || data.mediaUrl || data.url, 
                    ...data 
                });
            });
        }

        if (allItems.length === 0) {
            container.innerHTML = `
                <div class="clay-card p-8 text-center space-y-3 my-6">
                    <i class="fa-regular fa-compass text-3xl text-zinc-600"></i>
                    <p class="text-xs text-zinc-400">No posts yet on IB65.</p>
                    <button onclick="window.openCreateModal('post')" class="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-white glow-btn-blue">
                        Upload Your First Post
                    </button>
                </div>
            `;
            return;
        }

        allItems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const user = auth.currentUser;
        let myFollowing = [];
        let mySaved = [];
        if (user) {
            try {
                const uSnap = await getDoc(doc(db, "users", user.email));
                if (uSnap.exists()) {
                    myFollowing = uSnap.data().followingList || [];
                    mySaved = uSnap.data().savedPosts || [];
                }
            } catch(e) {}
        }

        container.innerHTML = allItems.map(p => {
            const rawAuthor = (p.author || p.handle || 'User').replace(/^@+/, '');
            const authorEmail = p.authorEmail || p.email || '';
            const media = p.mediaUrl || p.url || p.videoUrl || '';
            const isVid = p.mediaType === 'video' || p.col === 'reels';
            const isLiked = user && (p.likes || []).includes(user.email);
            const isSaved = mySaved.includes(p.id);
            const isFollowing = myFollowing.includes(authorEmail);
            const isSelf = user && user.email === authorEmail;
            const captionText = p.caption || p.title || '';
            const badgeSvg = getVerificationBadgeSvg(p.badgeType || (rawAuthor.toLowerCase() === 'ib65' ? 'gold_red' : 'none'));
            const relativeTime = getRelativeTime(p.createdAt);

            return `
            <div class="clay-card p-3 space-y-2.5">
                <div class="flex justify-between items-center">
                    <div class="flex items-center space-x-2.5 cursor-pointer" onclick="window.openPublicProfile('${authorEmail}')">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-600 p-0.5">
                            <div class="w-full h-full bg-black rounded-full flex items-center justify-center font-bold text-xs">${rawAuthor[0].toUpperCase()}</div>
                        </div>
                        <div>
                            <div class="flex items-center">
                                <span class="font-bold text-xs text-white hover:underline">@${rawAuthor}</span>
                                ${badgeSvg}
                                <span class="text-[10px] text-gray-400 ml-1.5">• ${relativeTime}</span>
                            </div>
                            ${p.location ? `<p class="text-[9px] text-gray-400"><i class="fa-solid fa-location-dot mr-1 text-red-500"></i>${p.location}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        ${!isSelf ? `
                            <button onclick="window.toggleFollowUser('${authorEmail}', '${rawAuthor}')" class="text-[11px] font-bold px-3 py-1 rounded-full bg-zinc-900 ${isFollowing ? 'border border-zinc-700 text-gray-300' : 'text-white glow-btn-red'}">
                                ${isFollowing ? 'Following' : 'Follow'}
                            </button>
                        ` : `
                            <button onclick="window.deleteMyContent('${p.col}', '${p.id}', '${authorEmail}')" class="text-gray-500 hover:text-red-500 p-1 icon-btn" title="Delete">
                                <i class="fa-solid fa-trash-can text-xs"></i>
                            </button>
                        `}
                    </div>
                </div>

                <div class="relative w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center min-h-[260px] max-h-[460px]">
                    ${isVid ? `
                        <video src="${media}" poster="${p.thumbnailUrl || ''}" loop playsinline preload="metadata" muted class="feed-video-card w-full h-full max-h-[460px] object-cover cursor-pointer" onclick="window.toggleFeedVideoAudio(this)"></video>
                        <button onclick="window.toggleFeedVideoAudio(this)" class="audio-btn-icon absolute bottom-3 right-3 bg-black/70 border border-white/20 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs z-20 shadow-lg">
                            <i class="fa-solid fa-volume-xmark"></i>
                        </button>
                    ` : `
                        <img src="${media}" class="w-full h-full max-h-[460px] object-cover" onerror="this.parentElement.style.display='none'">
                    `}
                    <div class="absolute pointer-events-none hidden" id="burst-${p.id}">
                        <i class="fa-solid fa-heart text-red-500 text-7xl drop-shadow-2xl"></i>
                    </div>
                </div>

                <div class="flex items-center justify-between pt-1 text-white text-base">
                    <div class="flex items-center space-x-4">
                        <button onclick="window.toggleCloudLike('${p.col}', '${p.id}')" class="flex items-center space-x-1.5 icon-btn ${isLiked ? 'text-red-500' : ''}">
                            <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart text-lg"></i>
                            <span class="text-xs font-bold text-white">${(p.likes || []).length}</span>
                        </button>
                        <button onclick="window.openComments('${p.col}', '${p.id}')" class="flex items-center space-x-1.5 icon-btn">
                            <i class="fa-regular fa-comment text-lg"></i>
                            <span class="text-xs font-bold">${(p.comments || []).length}</span>
                        </button>
                        <button onclick="window.shareLink()" class="icon-btn">
                            <i class="fa-solid fa-paper-plane text-base"></i>
                        </button>
                    </div>
                    <button onclick="window.toggleSavePost('${p.id}')" class="icon-btn">
                        <i class="${isSaved ? 'fa-solid text-white' : 'fa-regular text-gray-400'} fa-bookmark text-base"></i>
                    </button>
                </div>

                <div class="px-1 text-xs text-white">
                    <span class="font-bold mr-1">@${rawAuthor}</span>
                    <span class="text-gray-200 leading-relaxed">${captionText}</span>
                </div>
            </div>
            `;
        }).join('');

        initGlobalSingleVideoObserver();
    } catch(e) {
        container.innerHTML = `
            <div class="clay-card p-6 text-center space-y-2 my-6">
                <p class="text-xs text-zinc-400">Could not refresh feed.</p>
                <button onclick="window.loadPostsFeed()" class="px-3.5 py-1.5 rounded-xl bg-zinc-900 text-white text-xs glow-btn-blue">Retry</button>
            </div>
        `;
    }
}

// 4. Reels Feed Loader (With Audio Sync)
export async function loadReelsFeed() {
    const container = document.getElementById('reels-container');
    if (!container) return;

    try {
        const snap = await getDocs(collection(db, "reels"));
        const reels = [];
        snap.forEach(d => reels.push({ id: d.id, ...d.data() }));

        if (reels.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-24 text-xs">No reels available right now. Tap + to upload one!</div>';
            return;
        }

        reels.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
        const user = auth.currentUser;

        container.innerHTML = reels.map(r => {
            const rawAuthor = (r.author || r.handle || 'Creator').replace(/^@+/, '');
            const authorEmail = r.authorEmail || r.email || '';
            const vidUrl = r.videoUrl || r.mediaUrl || '';
            const isLiked = user && (r.likes || []).includes(user.email);
            const isSelf = user && user.email === authorEmail;
            const reelCaption = r.caption || r.title || '';
            const badgeSvg = getVerificationBadgeSvg(r.badgeType || (rawAuthor.toLowerCase() === 'ib65' ? 'gold_red' : 'none'));
            const relativeTime = getRelativeTime(r.createdAt);

            return `
            <div class="reel-item-box relative w-full bg-black flex flex-col justify-between overflow-hidden">
                <video src="${vidUrl}" poster="${r.thumbnailUrl || ''}" class="reel-video-element absolute inset-0 w-full h-full object-cover cursor-pointer" loop playsinline muted onclick="window.toggleFeedVideoAudio(this)"></video>
                
                <button onclick="window.toggleFeedVideoAudio(this)" class="audio-btn-icon absolute top-5 left-5 bg-black/60 border border-white/20 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs z-30 shadow-lg">
                    <i class="fa-solid fa-volume-xmark"></i>
                </button>

                <div class="relative z-20 flex justify-between items-center p-4">
                    <span class="text-lg font-bold text-white tracking-wide">Reels</span>
                    <button onclick="window.openCreateModal('reel')" class="text-white text-lg icon-btn"><i class="fa-solid fa-camera"></i></button>
                </div>

                <div class="absolute right-3 bottom-20 flex flex-col items-center space-y-4 z-20 text-white">
                    <button onclick="window.toggleCloudLike('reels', '${r.id}')" class="flex flex-col items-center space-y-1 icon-btn ${isLiked ? 'text-red-500' : ''}">
                        <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart text-2xl drop-shadow-lg"></i>
                        <span class="text-[11px] font-bold text-white">${(r.likes || []).length}</span>
                    </button>
                    <button onclick="window.openComments('reels', '${r.id}')" class="flex flex-col items-center space-y-1 icon-btn">
                        <i class="fa-regular fa-comment text-2xl drop-shadow-lg"></i>
                        <span class="text-[11px] font-bold text-white">${(r.comments || []).length}</span>
                    </button>
                    <button onclick="window.shareLink()" class="flex flex-col items-center space-y-1 icon-btn">
                        <i class="fa-solid fa-paper-plane text-xl drop-shadow-lg"></i>
                    </button>
                    ${isSelf ? `
                        <button onclick="window.deleteMyContent('reels', '${r.id}', '${authorEmail}')" class="text-gray-300 hover:text-red-500 icon-btn" title="Delete">
                            <i class="fa-solid fa-trash-can text-xl drop-shadow-lg"></i>
                        </button>
                    ` : ''}
                </div>

                <div class="relative z-20 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent space-y-2">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-600 p-0.5 cursor-pointer" onclick="window.openPublicProfile('${authorEmail}')">
                            <div class="w-full h-full bg-black rounded-full flex items-center justify-center font-extrabold text-xs">${rawAuthor[0].toUpperCase()}</div>
                        </div>
                        <div class="flex items-center">
                            <span class="font-bold text-xs text-white hover:underline cursor-pointer" onclick="window.openPublicProfile('${authorEmail}')">@${rawAuthor}</span>
                            ${badgeSvg}
                            <span class="text-[10px] text-gray-400 ml-1.5">• ${relativeTime}</span>
                        </div>
                    </div>
                    <p class="text-xs text-gray-200 line-clamp-3">${reelCaption}</p>
                </div>
            </div>
            `;
        }).join('');

        initGlobalSingleVideoObserver();
    } catch(e) {
        container.innerHTML = '<div class="text-center text-gray-500 py-24 text-xs">No reels found.</div>';
    }
}

// 5. Explore Loader
export async function loadExploreMedia() {
    const grid = document.getElementById('explore-grid');
    if (!grid) return;

    try {
        const [postsSnap, reelsSnap] = await Promise.allSettled([
            getDocs(collection(db, "posts")),
            getDocs(collection(db, "reels"))
        ]);

        const items = [];
        if (postsSnap.status === 'fulfilled') {
            postsSnap.value.forEach(d => {
                const data = d.data();
                if (data.mediaUrl || data.url) items.push({ id: d.id, col: 'posts', ...data });
            });
        }
        if (reelsSnap.status === 'fulfilled') {
            reelsSnap.value.forEach(d => {
                const data = d.data();
                const vidUrl = data.videoUrl || data.mediaUrl || data.url;
                if (vidUrl) items.push({ id: d.id, col: 'reels', mediaType: 'video', mediaUrl: vidUrl, ...data });
            });
        }

        if (items.length === 0) {
            grid.innerHTML = '<div class="col-span-3 text-center text-gray-500 py-12 text-xs">No explore media found</div>';
            return;
        }

        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        grid.innerHTML = items.map(it => {
            const media = it.mediaUrl || it.url || it.videoUrl || '';
            const isVid = it.mediaType === 'video' || it.col === 'reels';

            return `
                <div class="relative h-32 bg-zinc-900 overflow-hidden cursor-pointer rounded-lg border border-zinc-800 flex items-center justify-center" onclick='window.openMediaViewer(${JSON.stringify(it)})'>
                    ${isVid ? `
                        <video src="${media}#t=0.1" poster="${it.thumbnailUrl || ''}" preload="metadata" muted playsinline class="w-full h-full object-cover pointer-events-none"></video>
                        <span class="absolute top-1.5 right-1.5 bg-black/60 rounded-full px-1.5 py-0.5 text-[9px] text-white">
                            <i class="fa-solid fa-play text-[8px]"></i>
                        </span>
                    ` : `
                        <img src="${media}" loading="lazy" class="w-full h-full object-cover" onerror="this.parentElement.style.display='none'">
                    `}
                </div>
            `;
        }).join('');
    } catch(e) {}
}

export function openMediaViewer(it) {
    const modal = document.getElementById('modal-media-viewer');
    const container = document.getElementById('media-viewer-content');
    if (!modal || !container) return;

    const media = it.mediaUrl || it.url || it.videoUrl || '';
    const isVid = it.mediaType === 'video' || it.col === 'reels';
    const cleanAuthor = (it.author || it.handle || 'Creator').replace(/^@+/, '');

    container.innerHTML = `
        <div class="clay-card p-3 w-full max-w-sm space-y-3">
            <span class="font-bold text-xs text-white">@${cleanAuthor}</span>
            <div class="rounded-xl overflow-hidden bg-black max-h-80 flex items-center justify-center">
                ${isVid ? `<video src="${media}" class="w-full max-h-80 object-cover" controls autoplay playsinline></video>` : `<img src="${media}" class="w-full max-h-80 object-cover">`}
            </div>
            ${it.caption ? `<p class="text-xs text-gray-200">${it.caption}</p>` : ''}
        </div>
    `;
    modal.classList.remove('hidden');
}

export function closeMediaViewer() {
    const modal = document.getElementById('modal-media-viewer');
    if (modal) modal.classList.add('hidden');
}

export async function toggleCloudLike(col, id) {
    const user = auth.currentUser;
    if (!user) return;
    const docRef = doc(db, col, id);
    try {
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;
        const likes = snap.data()?.likes || [];
        if (likes.includes(user.email)) {
            await updateDoc(docRef, { likes: arrayRemove(user.email) });
        } else {
            await updateDoc(docRef, { likes: arrayUnion(user.email) });
        }
        if (col === 'posts') loadPostsFeed();
        if (col === 'reels') loadReelsFeed();
    } catch(e) {}
}

export async function toggleSavePost(docId) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const uRef = doc(db, "users", user.email);
        const uSnap = await getDoc(uRef);
        const saved = uSnap.data()?.savedPosts || [];

        if (saved.includes(docId)) {
            await updateDoc(uRef, { savedPosts: arrayRemove(docId) });
            showToast("Removed from saved");
        } else {
            await updateDoc(uRef, { savedPosts: arrayUnion(docId) });
            showToast("Saved to collection");
        }
        loadPostsFeed();
    } catch(e) {}
}

export async function deleteMyContent(col, docId, authorEmail) {
    const user = auth.currentUser;
    if (!user || user.email !== authorEmail) return;
    if (!confirm("Delete this permanently?")) return;

    try {
        await deleteDoc(doc(db, col, docId));
        showToast("Deleted successfully");
        if (col === 'posts') loadPostsFeed();
        if (col === 'reels') loadReelsFeed();
    } catch(e) {}
}

export function openComments(col, id) {
    activeCommentCol = col;
    activeCommentDocId = id;
    document.getElementById('modal-comments')?.classList.remove('hidden');
    loadCommentsData();
}

export function closeComments() {
    document.getElementById('modal-comments')?.classList.add('hidden');
}

async function loadCommentsData() {
    const list = document.getElementById('comments-items-list');
    if (!list) return;

    try {
        const snap = await getDoc(doc(db, activeCommentCol, activeCommentDocId));
        const comments = snap.exists() ? (snap.data().comments || []) : [];
        if (comments.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-500 py-8">No comments yet.</div>';
            return;
        }
        list.innerHTML = comments.map(c => `
            <div class="clay-card p-2 space-y-0.5">
                <strong class="text-white text-[11px]">${c.user}</strong>
                <p class="text-gray-300 text-xs">${c.text}</p>
            </div>
        `).join('');
    } catch(e) {}
}

export async function submitComment() {
    const input = document.getElementById('comment-text-input');
    const txt = input ? input.value.trim() : '';
    const user = auth.currentUser;
    if (!txt || !user || !activeCommentDocId) return;

    try {
        await updateDoc(doc(db, activeCommentCol, activeCommentDocId), {
            comments: arrayUnion({ user: user.displayName || 'User', text: txt, time: Date.now() })
        });
        if (input) input.value = '';
        loadCommentsData();
    } catch(e) {}
}
