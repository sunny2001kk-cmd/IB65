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

// 1. Single Active Video Observer
export function initGlobalSingleVideoObserver() {
    if (globalVideoObserver) globalVideoObserver.disconnect();
    
    globalVideoObserver = new IntersectionObserver((entries) => {
        if (isEditorActive || isLiveBroadcasting) return;

        entries.forEach(entry => {
            const vid = entry.target;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
                document.querySelectorAll('.feed-video-card, .reel-video-element').forEach(v => {
                    if (v !== vid && !v.paused) v.pause();
                });
                vid.play().catch(() => {});
            } else {
                if (!vid.paused) vid.pause();
            }
        });
    }, { threshold: 0.65 });

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
    } catch(e) {}
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

    const user = auth.currentUser;
    const delBtn = document.getElementById('btn-delete-story-opt');
    if (delBtn) {
        if (user && story.authorEmail === user.email) delBtn.classList.remove('hidden');
        else delBtn.classList.add('hidden');
    }

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

// 3. Home Feed
export async function loadPostsFeed() {
    const container = document.getElementById('posts-stream');
    if (!container) return;

    try {
        const [postsSnap, reelsSnap] = await Promise.all([
            getDocs(collection(db, "posts")),
            getDocs(collection(db, "reels"))
        ]);

        const allItems = [];
        postsSnap.forEach(d => allItems.push({ id: d.id, col: 'posts', ...d.data() }));
        reelsSnap.forEach(d => {
            const data = d.data();
            allItems.push({ 
                id: d.id, 
                col: 'reels', 
                mediaType: 'video', 
                mediaUrl: data.videoUrl || data.mediaUrl || data.url, 
                ...data 
            });
        });

        if (allItems.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-16 text-xs">No posts yet. Tap + to upload!</div>';
            return;
        }

        allItems.sort((a, b) => {
            const aIsOwner = (a.author || a.handle || '').toLowerCase() === 'ib65';
            const bIsOwner = (b.author || b.handle || '').toLowerCase() === 'ib65';
            if (aIsOwner && !bIsOwner) return -1;
            if (!aIsOwner && bIsOwner) return 1;
            return (b.createdAt || 0) - (a.createdAt || 0);
        });

        const user = auth.currentUser;
        let myFollowing = [];
        let mySaved = [];
        if (user) {
            const uSnap = await getDoc(doc(db, "users", user.email));
            if (uSnap.exists()) {
                myFollowing = uSnap.data().followingList || [];
                mySaved = uSnap.data().savedPosts || [];
            }
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
                            <button onclick="window.toggleFollowUser('${authorEmail}', '${rawAuthor}')" class="text-[11px] font-bold px-3 py-1 rounded-full ${isFollowing ? 'border border-zinc-700 text-gray-300' : 'clay-btn'}">
                                ${isFollowing ? 'Following' : 'Follow'}
                            </button>
                        ` : `
                            <button onclick="window.deleteMyContent('${p.col}', '${p.id}', '${authorEmail}')" class="text-gray-500 hover:text-red-500 p-1 icon-btn" title="Delete">
                                <i class="fa-solid fa-trash-can text-xs"></i>
                            </button>
                        `}
                    </div>
                </div>

                <div class="relative w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center min-h-[260px] max-h-[460px]" ondblclick="window.triggerDoubleTapLike('${p.col}', '${p.id}', event)">
                    ${isVid ? `
                        <video src="${media}" poster="${p.thumbnailUrl || ''}" loop playsinline preload="metadata" muted onplay="window.startWatchTracking('${p.col}', '${p.id}', '${authorEmail}')" onpause="window.stopWatchTracking()" class="feed-video-card w-full h-full max-h-[460px] object-cover" onclick="window.toggleFeedVideoAudio(this)"></video>
                        <button onclick="window.toggleFeedVideoAudio(this.previousElementSibling)" class="absolute bottom-3 right-3 bg-black/60 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs z-10 shadow">
                            <i class="fa-solid fa-volume-xmark"></i>
                        </button>
                    ` : `
                        <img src="${media}" style="filter: ${p.filter || 'none'}" class="w-full h-full max-h-[460px] object-cover">
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
                        <button onclick="window.shareMediaTracked('${p.col}', '${p.id}', '${authorEmail}')" class="icon-btn">
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
    } catch(e) {}
}

// 4. Reels Feed
export async function loadReelsFeed() {
    const container = document.getElementById('reels-container');
    if (!container) return;

    try {
        const snap = await getDocs(collection(db, "reels"));
        const reels = [];
        snap.forEach(d => reels.push({ id: d.id, ...d.data() }));

        if (reels.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-24 text-xs">No reels available right now.</div>';
            return;
        }

        reels.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
        const user = auth.currentUser;

        let myFollowing = [];
        let mySaved = [];
        if (user) {
            const uSnap = await getDoc(doc(db, "users", user.email));
            if (uSnap.exists()) {
                myFollowing = uSnap.data().followingList || [];
                mySaved = uSnap.data().savedPosts || [];
            }
        }

        container.innerHTML = reels.map(r => {
            const rawAuthor = (r.author || r.handle || 'Creator').replace(/^@+/, '');
            const authorEmail = r.authorEmail || r.email || '';
            const vidUrl = r.videoUrl || r.mediaUrl || '';
            const isLiked = user && (r.likes || []).includes(user.email);
            const isSaved = mySaved.includes(r.id);
            const isFollowing = myFollowing.includes(authorEmail);
            const isSelf = user && user.email === authorEmail;
            const reelCaption = r.caption || r.title || '';
            const badgeSvg = getVerificationBadgeSvg(r.badgeType || (rawAuthor.toLowerCase() === 'ib65' ? 'gold_red' : 'none'));
            const relativeTime = getRelativeTime(r.createdAt);

            return `
            <div class="reel-item-box relative w-full bg-black flex flex-col justify-between overflow-hidden" ondblclick="window.triggerDoubleTapLike('reels', '${r.id}', event)">
                <video src="${vidUrl}" poster="${r.thumbnailUrl || ''}" style="filter: ${r.filter || 'none'}" onplay="window.startWatchTracking('reels', '${r.id}', '${authorEmail}')" onpause="window.stopWatchTracking()" class="reel-video-element absolute inset-0 w-full h-full object-cover" loop playsinline></video>
                
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none hidden" id="burst-${r.id}">
                    <i class="fa-solid fa-heart text-red-500 text-7xl drop-shadow-2xl"></i>
                </div>

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
                    <button onclick="window.shareMediaTracked('reels', '${r.id}', '${authorEmail}')" class="flex flex-col items-center space-y-1 icon-btn">
                        <i class="fa-solid fa-paper-plane text-xl drop-shadow-lg"></i>
                    </button>
                    <button onclick="window.toggleSavePost('${r.id}')" class="flex flex-col items-center space-y-1 icon-btn">
                        <i class="${isSaved ? 'fa-solid text-white' : 'fa-regular text-gray-400'} fa-bookmark text-xl drop-shadow-lg"></i>
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
                        ${!isSelf ? `
                            <button onclick="window.toggleFollowUser('${authorEmail}', '${rawAuthor}')" class="px-3 py-1 rounded-full text-[11px] font-bold ${isFollowing ? 'border border-zinc-700 text-gray-300' : 'bg-white text-black'}">
                                ${isFollowing ? 'Following' : 'Follow'}
                            </button>
                        ` : ''}
                    </div>
                    <p class="text-xs text-gray-200 line-clamp-3">${reelCaption}</p>
                </div>
            </div>
            `;
        }).join('');

        initGlobalSingleVideoObserver();
    } catch(e) {}
}

// 5. Explore Media Loader
export async function loadExploreMedia() {
    const grid = document.getElementById('explore-grid');
    if (!grid) return;

    try {
        const [postsSnap, reelsSnap] = await Promise.all([
            getDocs(collection(db, "posts")),
            getDocs(collection(db, "reels"))
        ]);

        const items = [];
        postsSnap.forEach(d => {
            const data = d.data();
            if (data.mediaUrl || data.url) items.push({ id: d.id, col: 'posts', ...data });
        });
        reelsSnap.forEach(d => {
            const data = d.data();
            const vidUrl = data.videoUrl || data.mediaUrl || data.url;
            if (vidUrl) {
                items.push({ 
                    id: d.id, 
                    col: 'reels', 
                    mediaType: 'video', 
                    mediaUrl: vidUrl, 
                    ...data 
                });
            }
        });

        if (items.length === 0) {
            grid.innerHTML = '<div class="col-span-3 text-center text-gray-500 py-12 text-xs">No media found</div>';
            return;
        }

        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        grid.innerHTML = items.map(it => {
            const media = it.mediaUrl || it.url || it.videoUrl || '';
            const isVid = it.mediaType === 'video' || it.col === 'reels';
            const videoSrc = isVid ? (media.includes('#t=') ? media : media + '#t=0.1') : '';

            return `
                <div class="relative h-32 bg-zinc-900 overflow-hidden cursor-pointer rounded-lg border border-zinc-800 flex items-center justify-center" onclick='window.openMediaViewer(${JSON.stringify(it)})'>
                    ${isVid ? `
                        <video src="${videoSrc}" poster="${it.thumbnailUrl || ''}" preload="metadata" muted playsinline class="w-full h-full object-cover pointer-events-none"></video>
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

// 6. Media Viewer Modal Fix
export function openMediaViewer(it) {
    const modal = document.getElementById('modal-media-viewer');
    const container = document.getElementById('media-viewer-content');
    if (!modal || !container) return;

    const media = it.mediaUrl || it.url || it.videoUrl || '';
    const isVid = it.mediaType === 'video' || it.col === 'reels';
    const cleanAuthor = (it.author || it.handle || 'Creator').replace(/^@+/, '');
    const badgeSvg = getVerificationBadgeSvg(cleanAuthor.toLowerCase() === 'ib65' ? 'gold_red' : 'none');

    container.innerHTML = `
        <div class="clay-card p-3 w-full max-w-sm space-y-3">
            <div class="flex items-center space-x-2 cursor-pointer" onclick="window.closeMediaViewer(); window.openPublicProfile('${it.authorEmail || ''}')">
                <div class="w-8 h-8 rounded-full bg-white text-black font-extrabold flex items-center justify-center text-xs">${cleanAuthor[0]}</div>
                <span class="font-bold text-xs text-white flex items-center">@${cleanAuthor} ${badgeSvg}</span>
            </div>
            <div class="rounded-xl overflow-hidden bg-black max-h-80 flex items-center justify-center">
                ${isVid ? `<video src="${media}" poster="${it.thumbnailUrl || ''}" class="w-full max-h-80 object-cover" controls autoplay playsinline></video>` : `<img src="${media}" class="w-full max-h-80 object-cover">`}
            </div>
            ${it.caption || it.title ? `<p class="text-xs text-gray-200">${it.caption || it.title}</p>` : ''}
        </div>
    `;
    modal.classList.remove('hidden');
}

export function closeMediaViewer() {
    const modal = document.getElementById('modal-media-viewer');
    const container = document.getElementById('media-viewer-content');
    if (container) container.innerHTML = '';
    if (modal) modal.classList.add('hidden');
}

// 7. Global Search Fix (Users + Hashtags)
export async function handleSearch(e) {
    const q = e.target.value.toLowerCase().trim();
    const resultsBox = document.getElementById('search-users-results');
    if (!resultsBox) return;

    if (!q) {
        resultsBox.classList.add('hidden');
        loadExploreMedia();
        return;
    }

    resultsBox.classList.remove('hidden');
    try {
        const [uSnap, pSnap, rSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "posts")),
            getDocs(collection(db, "reels"))
        ]);

        const matchedUsers = [];
        uSnap.forEach(d => {
            const u = d.data();
            const name = (u.name || '').toLowerCase();
            const handle = (u.handle || d.id.split('@')[0]).toLowerCase();
            if (name.includes(q) || handle.includes(q)) {
                matchedUsers.push({ email: d.id, priority: handle === 'ib65' ? 1 : 0, ...u });
            }
        });

        matchedUsers.sort((a,b) => b.priority - a.priority);

        const matchedMedia = [];
        const checkMatch = (d, col) => {
            const data = d.data();
            const cap = (data.caption || data.title || '').toLowerCase();
            const tags = data.tags || [];
            if (cap.includes(q) || tags.some(t => t.includes(q))) {
                matchedMedia.push({ id: d.id, col, ...data });
            }
        };
        pSnap.forEach(d => checkMatch(d, 'posts'));
        rSnap.forEach(d => checkMatch(d, 'reels'));

        let html = '';
        if (matchedUsers.length > 0) {
            html += matchedUsers.map(u => {
                const bType = u.badgeType || (u.handle?.toLowerCase() === 'ib65' ? 'gold_red' : 'none');
                return `
                <div onclick="window.openPublicProfile('${u.email}')" class="clay-card p-2.5 flex justify-between items-center cursor-pointer hover:border-zinc-500 transition">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-9 h-9 rounded-full bg-white text-black font-extrabold flex items-center justify-center text-xs overflow-hidden">
                            ${u.photoUrl ? `<img src="${u.photoUrl}" class="w-full h-full object-cover">` : (u.name || 'U')[0]}
                        </div>
                        <div>
                            <p class="font-bold text-xs text-white flex items-center">${u.name || 'User'} ${getVerificationBadgeSvg(bType)}</p>
                            <p class="text-[10px] text-gray-400">@${(u.handle || u.email.split('@')[0]).replace(/^@+/, '')}</p>
                        </div>
                    </div>
                    <span class="text-[10px] text-gray-400 font-bold pr-2">Profile</span>
                </div>
                `;
            }).join('');
        }

        if (matchedMedia.length > 0) {
            html += `
                <p class="text-[10px] font-bold text-gray-400 mt-2 uppercase">Matching Posts & Tags</p>
                <div class="grid grid-cols-3 gap-1">
                    ${matchedMedia.map(m => `
                        <div onclick='window.openMediaViewer(${JSON.stringify(m)})' class="h-24 bg-zinc-900 rounded overflow-hidden cursor-pointer border border-zinc-800">
                            ${m.mediaType === 'video' || m.col === 'reels' ? `<video src="${m.mediaUrl || m.videoUrl}#t=0.001" poster="${m.thumbnailUrl || ''}" class="w-full h-full object-cover"></video>` : `<img src="${m.mediaUrl}" class="w-full h-full object-cover">`}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (!html) html = '<div class="text-gray-500 text-xs py-3 text-center">No results found for "' + q + '"</div>';
        resultsBox.innerHTML = html;
    } catch(e) {}
}

// 8. Like / Double Tap / Save Handlers
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

export async function triggerDoubleTapLike(col, docId, event) {
    const burst = document.getElementById('burst-' + docId);
    if (burst) {
        burst.classList.remove('hidden');
        burst.classList.remove('heart-burst-animate');
        void burst.offsetWidth;
        burst.classList.add('heart-burst-animate');
        setTimeout(() => burst.classList.add('hidden'), 750);
    }
    const user = auth.currentUser;
    if (!user) return;
    await updateDoc(doc(db, col, docId), { likes: arrayUnion(user.email) }).catch(()=>{});
    if (col === 'posts') loadPostsFeed();
    if (col === 'reels') loadReelsFeed();
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
            showToast("Saved to your collection");
        }
        loadPostsFeed();
        loadReelsFeed();
    } catch(e) {}
}

export async function deleteMyContent(col, docId, authorEmail) {
    const user = auth.currentUser;
    if (!user || user.email !== authorEmail) {
        showToast("You can only delete your own content!");
        return;
    }
    if (!confirm("Delete this permanently?")) return;

    try {
        await deleteDoc(doc(db, col, docId));
        showToast("Deleted successfully");
        if (col === 'posts') loadPostsFeed();
        if (col === 'reels') loadReelsFeed();
    } catch(e) { showToast(e.message); }
}

// 9. Watch Tracking
export async function startWatchTracking(col, docId, authorEmail) {
    const user = auth.currentUser;
    if (!user) return;

    if (user.email !== authorEmail) {
        try {
            const docRef = doc(db, col, docId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const viewed = snap.data().viewedUsers || [];
                if (!viewed.includes(user.email)) {
                    const viewerDoc = await getDoc(doc(db, "users", user.email));
                    const vData = viewerDoc.data() || {};
                    const viewerCity = vData.city || "Delhi, IN";
                    const viewerGender = vData.gender || "male";

                    await updateDoc(docRef, {
                        viewedUsers: arrayUnion(user.email),
                        views: increment(1)
                    });

                    if (authorEmail) {
                        await updateDoc(doc(db, "users", authorEmail), {
                            totalViews: increment(1),
                            [`demographics_locations.${viewerCity}`]: increment(1),
                            [`demographics_genders.${viewerGender}`]: increment(1)
                        });
                    }
                }
            }
        } catch(e) {}
    }

    clearInterval(watchInterval);
    watchInterval = setInterval(async () => {
        try {
            await updateDoc(doc(db, col, docId), { watchSeconds: increment(2) });
            if (authorEmail) {
                await updateDoc(doc(db, "users", authorEmail), { totalWatchSeconds: increment(2) });
            }
        } catch(e) {}
    }, 2000);
}

export function stopWatchTracking() {
    clearInterval(watchInterval);
}

// 10. Comments
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
            <div class="clay-card p-2.5 space-y-0.5">
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
        if (activeCommentCol === 'posts') loadPostsFeed();
        if (activeCommentCol === 'reels') loadReelsFeed();
    } catch(e) {}
}
