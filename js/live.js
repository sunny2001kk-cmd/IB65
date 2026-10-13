// js/live.js
import { 
    auth, 
    db, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    increment, 
    arrayUnion, 
    showToast, 
    getVerificationBadgeSvg 
} from './config.js';

export let isLiveBroadcasting = false;
let peerInstance = null;
let activeLiveStreamId = null;
let isHostingLive = false;
let localStreamMedia = null;
let liveSnapshotUnsub = null;
let liveHeartbeatInterval = null;
let lastObservedHeartsCount = 0;

// 1. Load Active Broadcasters
export async function loadLiveBroadcasters() {
    const list = document.getElementById('live-rooms-list');
    if (!list) return;

    try {
        const snap = await getDocs(collection(db, "lives"));
        const streams = [];
        const now = Date.now();

        snap.forEach(d => {
            const data = d.data();
            const age = now - (data.lastHeartbeat || data.createdAt || 0);
            if (age < 300000 && data.status === 'live') {
                streams.push({ id: d.id, ...data });
            } else {
                deleteDoc(doc(db, "lives", d.id)).catch(() => {});
            }
        });

        if (streams.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-500 py-10 text-xs">No active live streams right now.</div>';
            return;
        }

        list.innerHTML = streams.map(s => {
            const bSvg = getVerificationBadgeSvg((s.host || '').toLowerCase() === 'ib65' ? 'gold_red' : 'none');
            return `
            <div onclick="window.joinBroadcast('${s.id}', '${s.host}', '${s.peerId}')" class="clay-card p-3 flex justify-between items-center cursor-pointer hover:border-zinc-500 transition">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-full border-2 border-red-600 p-0.5 flex items-center justify-center">
                        <div class="w-full h-full bg-white text-black font-extrabold rounded-full flex items-center justify-center text-xs">${(s.host || 'H')[0]}</div>
                    </div>
                    <div>
                        <h4 class="text-xs font-bold text-white flex items-center">${s.host} ${bSvg} is LIVE</h4>
                        <p class="text-[10px] text-gray-400">Tap to watch broadcast</p>
                    </div>
                </div>
                <span class="bg-red-600/30 text-red-500 border border-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">👁️ ${s.viewers || 1}</span>
            </div>
            `;
        }).join('');
    } catch(e) {}
}

// 2. Start Live Stream (Host Mode)
export async function startBroadcast() {
    const user = auth.currentUser;
    if (!user) { 
        showToast("Login to broadcast live!"); 
        return; 
    }

    const hostDisplayName = (user.displayName || user.email.split('@')[0]).replace(/^@+/, '');

    try {
        localStreamMedia = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
            audio: true
        });
        isHostingLive = true;
        isLiveBroadcasting = true;

        if (peerInstance) peerInstance.destroy();
        peerInstance = new Peer({
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });

        peerInstance.on('open', async (peerId) => {
            const docRef = await addDoc(collection(db, "lives"), {
                host: hostDisplayName,
                hostEmail: user.email,
                peerId: peerId,
                viewers: 1,
                status: 'live',
                heartClicks: 0,
                comments: [],
                createdAt: Date.now(),
                lastHeartbeat: Date.now()
            });

            activeLiveStreamId = docRef.id;
            lastObservedHeartsCount = 0;

            const bSvg = getVerificationBadgeSvg(hostDisplayName.toLowerCase() === 'ib65' ? 'gold_red' : 'none');
            const titleEl = document.getElementById('live-host-title');
            const avatarEl = document.getElementById('live-host-avatar');
            const tagEl = document.getElementById('live-viewers-tag');

            if (titleEl) titleEl.innerHTML = `${hostDisplayName} ${bSvg}`;
            if (avatarEl) avatarEl.innerText = hostDisplayName[0].toUpperCase();
            if (tagEl) tagEl.innerText = "👁️ 1";

            const vid = document.getElementById('live-room-video');
            if (vid) {
                vid.srcObject = localStreamMedia;
                vid.muted = true;
                vid.setAttribute('playsinline', 'true');
                vid.play().catch(() => {});
            }

            clearInterval(liveHeartbeatInterval);
            liveHeartbeatInterval = setInterval(async () => {
                if (activeLiveStreamId && isHostingLive) {
                    await updateDoc(doc(db, "lives", activeLiveStreamId), { lastHeartbeat: Date.now() }).catch(() => {});
                }
            }, 20000);

            peerInstance.on('call', call => {
                call.answer(localStreamMedia);
            });

            document.getElementById('modal-live-room')?.classList.remove('hidden');
            listenLiveUpdates(activeLiveStreamId);
        });
    } catch(e) { 
        showToast("Live camera error: " + e.message); 
    }
}

// 3. Join Stream (Viewer Mode)
export async function joinBroadcast(liveId, hostName, peerId) {
    activeLiveStreamId = liveId;
    isHostingLive = false;
    isLiveBroadcasting = true;
    lastObservedHeartsCount = 0;

    if (peerInstance) peerInstance.destroy();
    peerInstance = new Peer({
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peerInstance.on('open', async () => {
        const vid = document.getElementById('live-room-video');
        if (vid) {
            vid.srcObject = null;
            vid.muted = false;
            vid.setAttribute('playsinline', 'true');
            vid.setAttribute('webkit-playsinline', 'true');
        }

        let emptyStream;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const dst = ctx.createMediaStreamDestination();
            osc.connect(dst);
            osc.start();
            emptyStream = dst.stream;
        } catch(e) {
            emptyStream = new MediaStream();
        }

        const call = peerInstance.call(peerId, emptyStream);
        
        call.on('stream', remoteStream => {
            if (vid) {
                vid.srcObject = remoteStream;
                vid.play().catch(() => {
                    vid.muted = true;
                    vid.play().then(() => {
                        showToast("Tap screen once to enable live audio");
                    }).catch(() => {});
                });
            }
        });

        const ref = doc(db, "lives", liveId);
        const snap = await getDoc(ref);
        if (snap.exists()) await updateDoc(ref, { viewers: (snap.data().viewers || 1) + 1 });

        const bSvg = getVerificationBadgeSvg(hostName.toLowerCase() === 'ib65' ? 'gold_red' : 'none');
        const titleEl = document.getElementById('live-host-title');
        const avatarEl = document.getElementById('live-host-avatar');

        if (titleEl) titleEl.innerHTML = `${hostName} ${bSvg}`;
        if (avatarEl) avatarEl.innerText = hostName[0].toUpperCase();

        document.getElementById('modal-live-room')?.classList.remove('hidden');
        listenLiveUpdates(liveId);
    });
}

export function resumeLiveStreamPlayback() {
    const vid = document.getElementById('live-room-video');
    if (vid && vid.srcObject) {
        vid.muted = false;
        vid.play().catch(() => {});
    }
}

function listenLiveUpdates(liveId) {
    if (liveSnapshotUnsub) liveSnapshotUnsub();
    liveSnapshotUnsub = onSnapshot(doc(db, "lives", liveId), snap => {
        if (!snap.exists()) {
            showToast("Live broadcast ended");
            exitLiveRoom(true);
            return;
        }
        const data = snap.data();
        const tagEl = document.getElementById('live-viewers-tag');
        if (tagEl) tagEl.innerText = "👁️ " + (data.viewers || 1);

        // Synchronize Flying Hearts across all viewer devices
        const currentHeartClicks = data.heartClicks || 0;
        if (currentHeartClicks > lastObservedHeartsCount) {
            const diff = Math.min(5, currentHeartClicks - lastObservedHeartsCount);
            for (let i = 0; i < diff; i++) {
                setTimeout(() => renderFlyingHeartAnimation(), i * 180);
            }
            lastObservedHeartsCount = currentHeartClicks;
        }

        const chatBox = document.getElementById('live-chat-messages');
        if (chatBox) {
            chatBox.innerHTML = (data.comments || []).map(c => `
                <div class="bg-black/60 px-2.5 py-1 rounded-xl w-max">
                    <strong class="text-gray-300">${c.user}:</strong> <span>${c.text}</span>
                </div>
            `).join('');
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });
}

export async function sendLiveMsg() {
    const input = document.getElementById('live-input-msg');
    const txt = input ? input.value.trim() : '';
    const user = auth.currentUser;
    if (!txt || !user || !activeLiveStreamId) return;

    try {
        await updateDoc(doc(db, "lives", activeLiveStreamId), {
            comments: arrayUnion({ user: user.displayName || 'User', text: txt, time: Date.now() })
        });
        if (input) input.value = '';
    } catch(e) {}
}

export async function triggerLiveHeartGlobal() {
    renderFlyingHeartAnimation();
    if (activeLiveStreamId) {
        try {
            await updateDoc(doc(db, "lives", activeLiveStreamId), {
                heartClicks: increment(1)
            });
        } catch(e) {}
    }
}

function renderFlyingHeartAnimation() {
    const container = document.getElementById('live-hearts-container');
    if (!container) return;
    const heart = document.createElement('div');
    heart.className = 'live-heart-fly text-red-500 text-2xl';
    heart.innerHTML = '<i class="fa-solid fa-heart drop-shadow-lg"></i>';
    container.appendChild(heart);
    setTimeout(() => heart.remove(), 1500);
}

// 4. Exit Broadcast & Story Save
export async function exitLiveRoom(forced = false) {
    clearInterval(liveHeartbeatInterval);
    if (liveSnapshotUnsub) { liveSnapshotUnsub(); liveSnapshotUnsub = null; }

    const user = auth.currentUser;
    if (activeLiveStreamId && !forced) {
        if (isHostingLive) {
            await deleteDoc(doc(db, "lives", activeLiveStreamId)).catch(() => {});
            if (user) {
                await addDoc(collection(db, "stories"), {
                    author: (user.displayName || user.email.split('@')[0]).replace(/^@+/, ''),
                    authorEmail: user.email,
                    caption: "🔴 Live Replay Broadcast",
                    mediaUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600",
                    mediaType: "image",
                    createdAt: Date.now(),
                    isArchived: false,
                    likes: []
                }).catch(() => {});
                showToast("Live stream shared as story for 24 hours!");
            }
        } else {
            const ref = doc(db, "lives", activeLiveStreamId);
            const snap = await getDoc(ref);
            if (snap.exists()) await updateDoc(ref, { viewers: Math.max(1, (snap.data().viewers || 2) - 1) }).catch(() => {});
        }
    }

    if (localStreamMedia) {
        localStreamMedia.getTracks().forEach(t => t.stop());
        localStreamMedia = null;
    }
    const vid = document.getElementById('live-room-video');
    if (vid) vid.srcObject = null;

    if (peerInstance) { peerInstance.destroy(); peerInstance = null; }
    activeLiveStreamId = null;
    isHostingLive = false;
    isLiveBroadcasting = false;
    document.getElementById('modal-live-room')?.classList.add('hidden');
    loadLiveBroadcasters();
}
