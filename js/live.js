// js/live.js
import { 
    auth, 
    db, 
    collection, 
    addDoc, 
    doc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    increment, 
    arrayUnion, 
    showToast 
} from './config.js';

export let isLiveBroadcasting = false;
let currentLocalStream = null;
let currentPeer = null;
let currentRoomId = null;
let roomUnsubscribe = null;
let currentCameraFacing = 'user'; // 'user' or 'environment'

// 1. Host Starts Broadcast
export async function startBroadcast() {
    const user = auth.currentUser;
    if (!user) {
        showToast("Login required to go live!");
        return;
    }

    try {
        showToast("Accessing camera & microphone...");
        currentLocalStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentCameraFacing, width: { ideal: 720 }, height: { ideal: 1280 } },
            audio: { echoCancellation: true, noiseSuppression: true }
        });

        const liveVid = document.getElementById('live-room-video');
        if (liveVid) {
            liveVid.srcObject = currentLocalStream;
            liveVid.muted = true; // Host listens to their own room muted to prevent feedback loop
            liveVid.play().catch(() => {});
        }

        // Initialize PeerJS for Video Relay
        currentPeer = new Peer();
        currentPeer.on('open', async (peerId) => {
            const cleanHost = (user.displayName || user.email.split('@')[0]).replace(/^@+/, '');

            const roomRef = await addDoc(collection(db, "live_rooms"), {
                hostEmail: user.email,
                hostName: cleanHost,
                peerId: peerId,
                viewersCount: 1,
                heartsCount: 0,
                status: 'live',
                createdAt: Date.now()
            });

            currentRoomId = roomRef.id;
            isLiveBroadcasting = true;

            setupLiveRoomUI(cleanHost, true);
            listenToLiveRoom(currentRoomId);
            showToast("You are now LIVE! 🔴");
        });

        currentPeer.on('call', (call) => {
            call.answer(currentLocalStream);
        });

    } catch (err) {
        showToast("Camera error: " + err.message);
    }
}

// 2. Viewer Joins Broadcast
export async function joinBroadcast(roomId) {
    const user = auth.currentUser;
    currentRoomId = roomId;

    try {
        showToast("Connecting to live stream...");
        const roomDoc = await getDoc(doc(db, "live_rooms", roomId));
        if (!roomDoc.exists() || roomDoc.data().status !== 'live') {
            showToast("Live stream has ended.");
            return;
        }

        const roomData = roomDoc.data();
        currentPeer = new Peer();

        currentPeer.on('open', () => {
            // Empty stream call to receive host's video/audio
            const call = currentPeer.call(roomData.peerId, createEmptyMediaStream());
            call.on('stream', (remoteStream) => {
                const liveVid = document.getElementById('live-room-video');
                if (liveVid) {
                    liveVid.srcObject = remoteStream;
                    liveVid.muted = false;
                    liveVid.volume = 1.0;
                    liveVid.play().catch(() => {
                        // If browser autoplay blocks voice, show audio unlock
                        const unlockBtn = document.getElementById('live-unmute-overlay');
                        if (unlockBtn) unlockBtn.classList.remove('hidden');
                    });
                }
            });
        });

        // Increment Viewer Count
        await updateDoc(doc(db, "live_rooms", roomId), {
            viewersCount: increment(1)
        });

        isLiveBroadcasting = false;
        setupLiveRoomUI(roomData.hostName, false);
        listenToLiveRoom(roomId);

    } catch (err) {
        showToast("Connection failed: " + err.message);
    }
}

function createEmptyMediaStream() {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const dst = osc.connect(ctx.createMediaStreamDestination());
    osc.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false;
    return dst.stream;
}

// 3. UI and Real-time Listeners
function setupLiveRoomUI(hostName, isHost) {
    const modal = document.getElementById('modal-live-room');
    if (!modal) return;

    modal.classList.remove('hidden');
    document.getElementById('live-host-title').innerText = hostName;
    document.getElementById('live-host-avatar').innerText = hostName[0].toUpperCase();

    const flipBtn = document.getElementById('btn-live-flip-cam');
    if (flipBtn) flipBtn.classList.toggle('hidden', !isHost);

    const endBtn = document.getElementById('btn-end-live');
    if (endBtn) endBtn.innerText = isHost ? "End" : "Leave";
}

let lastRenderedHearts = 0;

function listenToLiveRoom(roomId) {
    if (roomUnsubscribe) roomUnsubscribe();

    roomUnsubscribe = onSnapshot(doc(db, "live_rooms", roomId), (snap) => {
        if (!snap.exists()) {
            exitLiveRoom();
            return;
        }

        const data = snap.data();
        if (data.status !== 'live') {
            showToast("Stream ended by host");
            exitLiveRoom();
            return;
        }

        // 1. Real-time Viewer Counter
        const vTag = document.getElementById('live-viewers-tag');
        if (vTag) vTag.innerText = `👁️ ${data.viewersCount || 1}`;

        // 2. Real-time Shared Floating Hearts for EVERYONE
        const currentHearts = data.heartsCount || 0;
        if (currentHearts > lastRenderedHearts) {
            const diff = Math.min(5, currentHearts - lastRenderedHearts);
            for (let i = 0; i < diff; i++) {
                setTimeout(() => spawnSingleFloatingHeart(), i * 150);
            }
            lastRenderedHearts = currentHearts;
        }

        // 3. Real-time Chat Messages
        const chatBox = document.getElementById('live-chat-messages');
        if (chatBox && data.messages) {
            chatBox.innerHTML = data.messages.slice(-25).map(m => `
                <div class="bg-black/40 backdrop-blur-sm rounded-lg px-2.5 py-1 max-w-[85%] text-xs border border-white/10">
                    <span class="text-cyan-400 font-bold mr-1.5">${m.sender}:</span>
                    <span class="text-white">${m.text}</span>
                </div>
            `).join('');
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });
}

// 4. Trigger Global Shared Heart
export async function triggerLiveHeartGlobal() {
    if (!currentRoomId) return;
    spawnSingleFloatingHeart(); // Local immediate pop
    try {
        await updateDoc(doc(db, "live_rooms", currentRoomId), {
            heartsCount: increment(1)
        });
    } catch(e) {}
}

function spawnSingleFloatingHeart() {
    const container = document.getElementById('live-hearts-container');
    if (!container) return;

    const heart = document.createElement('div');
    const randomRight = Math.floor(Math.random() * 35);
    const size = Math.floor(Math.random() * 10) + 20;

    heart.innerHTML = '<i class="fa-solid fa-heart text-red-500 drop-shadow-[0_0_8px_#ff0033]"></i>';
    heart.style.position = 'absolute';
    heart.style.right = `${randomRight}px`;
    heart.style.bottom = '0px';
    heart.style.fontSize = `${size}px`;
    heart.className = 'live-heart-fly';

    container.appendChild(heart);
    setTimeout(() => {
        if (heart.parentNode) heart.parentNode.removeChild(heart);
    }, 1500);
}

// 5. Send Live Chat Message
export async function sendLiveMsg() {
    const input = document.getElementById('live-input-msg');
    const text = input ? input.value.trim() : '';
    const user = auth.currentUser;
    if (!text || !currentRoomId || !user) return;

    const senderName = (user.displayName || user.email.split('@')[0]).replace(/^@+/, '');

    try {
        await updateDoc(doc(db, "live_rooms", currentRoomId), {
            messages: arrayUnion({
                sender: senderName,
                text: text,
                time: Date.now()
            })
        });
        if (input) input.value = '';
    } catch(e) {}
}

// 6. Camera Flip (Front/Back)
export async function flipLiveCamera() {
    if (!isLiveBroadcasting || !currentLocalStream) return;

    currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user';
    showToast("Switching camera...");

    currentLocalStream.getTracks().forEach(t => t.stop());

    try {
        currentLocalStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentCameraFacing, width: { ideal: 720 }, height: { ideal: 1280 } },
            audio: { echoCancellation: true, noiseSuppression: true }
        });

        const liveVid = document.getElementById('live-room-video');
        if (liveVid) liveVid.srcObject = currentLocalStream;

        // Replace track for connected peers
        const videoTrack = currentLocalStream.getVideoTracks()[0];
        if (currentPeer) {
            for (let c in currentPeer.connections) {
                currentPeer.connections[c].forEach(conn => {
                    const sender = conn.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(videoTrack);
                });
            }
        }
    } catch(e) {
        showToast("Cannot switch camera: " + e.message);
    }
}

// 7. Audio Manual Unlock for Viewers
export function unlockLiveAudio() {
    const liveVid = document.getElementById('live-room-video');
    const overlay = document.getElementById('live-unmute-overlay');
    if (liveVid) {
        liveVid.muted = false;
        liveVid.volume = 1.0;
        liveVid.play().catch(() => {});
    }
    if (overlay) overlay.classList.add('hidden');
    showToast("Live sound unmuted 🔊");
}

// 8. Exit / End Live
export async function exitLiveRoom() {
    if (roomUnsubscribe) {
        roomUnsubscribe();
        roomUnsubscribe = null;
    }

    if (currentLocalStream) {
        currentLocalStream.getTracks().forEach(t => t.stop());
        currentLocalStream = null;
    }

    if (currentPeer) {
        currentPeer.destroy();
        currentPeer = null;
    }

    const liveVid = document.getElementById('live-room-video');
    if (liveVid) {
        liveVid.srcObject = null;
        liveVid.pause();
    }

    if (currentRoomId && isLiveBroadcasting) {
        try {
            await deleteDoc(doc(db, "live_rooms", currentRoomId));
        } catch(e) {}
    } else if (currentRoomId) {
        try {
            await updateDoc(doc(db, "live_rooms", currentRoomId), {
                viewersCount: increment(-1)
            });
        } catch(e) {}
    }

    currentRoomId = null;
    isLiveBroadcasting = false;
    lastRenderedHearts = 0;

    document.getElementById('modal-live-room')?.classList.add('hidden');
    showToast("Left live room");
    if (window.loadDirectPostsFeed) window.loadDirectPostsFeed();
}

// 9. Fetch Active Broadcasters for Live Tab
export async function loadLiveBroadcasters() {
    const list = document.getElementById('live-rooms-list');
    if (!list) return;

    try {
        const snap = await getDocs(collection(db, "live_rooms"));
        const rooms = [];
        snap.forEach(d => rooms.push({ id: d.id, ...d.data() }));

        if (rooms.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-500 py-10 text-xs">No active live streams right now.</div>';
            return;
        }

        list.innerHTML = rooms.map(r => `
            <div class="clay-card p-3 flex justify-between items-center cursor-pointer hover:border-red-500 transition" onclick="window.joinBroadcast('${r.id}')">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-full border-2 border-red-500 p-0.5 animate-pulse">
                        <div class="w-full h-full bg-zinc-900 rounded-full flex items-center justify-center font-black text-xs text-white">
                            ${r.hostName[0].toUpperCase()}
                        </div>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-white flex items-center space-x-1">
                            <span>@${r.hostName}</span>
                            <span class="bg-red-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold ml-1">LIVE</span>
                        </p>
                        <p class="text-[10px] text-gray-400">👁️ ${r.viewersCount || 1} watching</p>
                    </div>
                </div>
                <button class="px-3.5 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold shadow-lg">Watch</button>
            </div>
        `).join('');
    } catch(e) {
        list.innerHTML = '<div class="text-center text-gray-500 py-10 text-xs">Could not load live rooms.</div>';
    }
}
