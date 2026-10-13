// js/direct.js
import { 
    auth, 
    db, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    onSnapshot, 
    showToast, 
    getVerificationBadgeSvg 
} from './config.js';

export let activeDirectRecipient = null;
let chatSnapshotUnsub = null;
let targetPresenceUnsub = null;

function getChatRoomId(em1, em2) {
    return [em1, em2].sort().join('_').replace(/[^a-zA-Z0-9]/g, '_');
}

export function formatLastSeen(lastSeenTime, isOnline) {
    if (isOnline) return `<span class="text-green-500 font-bold">🟢 Active now</span>`;
    if (!lastSeenTime) return `<span class="text-gray-400">Offline</span>`;

    const diff = Math.floor((Date.now() - lastSeenTime) / 1000);
    if (diff < 60) return `<span class="text-gray-400">Active a moment ago</span>`;
    if (diff < 3600) return `<span class="text-gray-400">Active ${Math.floor(diff / 60)}m ago</span>`;
    if (diff < 86400) return `<span class="text-gray-400">Active ${Math.floor(diff / 3600)}h ago</span>`;
    return `<span class="text-gray-400">Active ${Math.floor(diff / 86400)}d ago</span>`;
}

// 1. Open Inbox Conversations
export async function openDirectInbox() {
    const user = auth.currentUser;
    if (!user) {
        showToast("Please login first!");
        return;
    }

    const modal = document.getElementById('modal-direct-inbox');
    const list = document.getElementById('direct-inbox-list');
    if (modal) modal.classList.remove('hidden');
    if (list) list.innerHTML = '<div class="text-center text-gray-500 py-10 text-xs">Loading conversations...</div>';

    try {
        const uSnap = await getDocs(collection(db, "users"));
        const users = [];
        uSnap.forEach(d => {
            if (d.id !== user.email) users.push({ email: d.id, ...d.data() });
        });

        if (users.length === 0) {
            if (list) list.innerHTML = '<div class="text-center text-gray-500 py-10 text-xs">No users found</div>';
            return;
        }

        if (list) {
            list.innerHTML = users.map(u => {
                const bSvg = getVerificationBadgeSvg(u.badgeType || (u.handle?.toLowerCase() === 'ib65' ? 'gold_red' : 'none'));
                return `
                <div onclick="window.openDirectChatWithUser('${u.email}', '${u.name || u.handle}', '${u.badgeType || ''}')" class="clay-card p-3 flex justify-between items-center cursor-pointer hover:border-zinc-500 transition">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-white text-black font-extrabold flex items-center justify-center text-sm overflow-hidden">
                            ${u.photoUrl ? `<img src="${u.photoUrl}" class="w-full h-full object-cover">` : (u.name || 'U')[0]}
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-white flex items-center">${u.name || 'User'} ${bSvg}</h4>
                            <p class="text-[10px] text-gray-400">${formatLastSeen(u.lastSeen, u.isOnline)}</p>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-gray-600 text-xs"></i>
                </div>
                `;
            }).join('');
        }
    } catch(e) {
        if (list) list.innerHTML = '<div class="text-center text-gray-500 py-10 text-xs">Error loading inbox</div>';
    }
}

export function closeDirectInbox() {
    document.getElementById('modal-direct-inbox')?.classList.add('hidden');
}

// 2. Open Direct Chat Window with Clickable Profile Header
export function openDirectChatWithUser(targetEmail, targetName, badgeType) {
    activeDirectRecipient = targetEmail;
    const bSvg = getVerificationBadgeSvg(badgeType || (targetName.toLowerCase() === 'ib65' ? 'gold_red' : 'none'));
    
    const nameEl = document.getElementById('chat-user-name');
    const avatarEl = document.getElementById('chat-user-avatar');
    if (nameEl) nameEl.innerHTML = `${targetName} ${bSvg}`;
    if (avatarEl) avatarEl.innerText = targetName[0].toUpperCase();

    document.getElementById('modal-direct-chat')?.classList.remove('hidden');

    listenChatMessages();
    listenTargetPresence(targetEmail);
}

// 3. Header Click Fix: Navigate to Profile from Chat
export function navigateToChatUserProfile() {
    if (activeDirectRecipient) {
        closeDirectChat();
        if (window.openPublicProfile) {
            window.openPublicProfile(activeDirectRecipient);
        }
    }
}

export function closeDirectChat() {
    if (chatSnapshotUnsub) { chatSnapshotUnsub(); chatSnapshotUnsub = null; }
    if (targetPresenceUnsub) { targetPresenceUnsub(); targetPresenceUnsub = null; }
    document.getElementById('modal-direct-chat')?.classList.add('hidden');
}

function listenChatMessages() {
    const user = auth.currentUser;
    if (!user || !activeDirectRecipient) return;

    const roomId = getChatRoomId(user.email, activeDirectRecipient);
    const scrollBox = document.getElementById('chat-messages-scroll');

    if (chatSnapshotUnsub) chatSnapshotUnsub();
    chatSnapshotUnsub = onSnapshot(collection(db, "chats", roomId, "messages"), snap => {
        const msgs = [];
        snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
        msgs.sort((a,b) => (a.createdAt || 0) - (a.createdAt || 0));

        if (scrollBox) {
            scrollBox.innerHTML = msgs.map(m => {
                const isMe = m.sender === user.email;
                return `
                    <div class="flex ${isMe ? 'justify-end' : 'justify-start'}">
                        <div class="${isMe ? 'bg-blue-600 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-zinc-800 text-gray-200 rounded-r-2xl rounded-tl-2xl'} px-3.5 py-2 max-w-[75%] break-words">
                            <p class="text-xs">${m.text}</p>
                        </div>
                    </div>
                `;
            }).join('');
            scrollBox.scrollTop = scrollBox.scrollHeight;
        }
    });
}

function listenTargetPresence(targetEmail) {
    if (targetPresenceUnsub) targetPresenceUnsub();
    targetPresenceUnsub = onSnapshot(doc(db, "users", targetEmail), snap => {
        if (snap.exists()) {
            const d = snap.data();
            const presenceEl = document.getElementById('chat-user-presence');
            if (presenceEl) presenceEl.innerHTML = formatLastSeen(d.lastSeen, d.isOnline);
        }
    });
}

export async function sendChatMessageDirect() {
    const input = document.getElementById('chat-input-field');
    const txt = input ? input.value.trim() : '';
    const user = auth.currentUser;
    if (!txt || !user || !activeDirectRecipient) return;

    const roomId = getChatRoomId(user.email, activeDirectRecipient);
    try {
        if (input) input.value = '';
        await addDoc(collection(db, "chats", roomId, "messages"), {
            sender: user.email,
            recipient: activeDirectRecipient,
            text: txt,
            createdAt: Date.now()
        });
    } catch(e) {}
}
