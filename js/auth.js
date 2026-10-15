// js/auth.js
import { 
    auth, 
    db, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail, 
    signOut, 
    updateProfile, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    collection, 
    query, 
    where, 
    showToast 
} from './config.js';

let activeSessions = JSON.parse(localStorage.getItem('ib65_active_sessions') || '[]');

function saveSessionLocally(email, handle, name) {
    if (!email) return;
    const exists = activeSessions.find(s => s.email === email);
    if (!exists) {
        activeSessions.push({ email, handle: handle || email.split('@')[0], name: name || 'User' });
        localStorage.setItem('ib65_active_sessions', JSON.stringify(activeSessions));
    }
}

export async function checkHandleAvailability(handle, context = 'signup') {
    const clean = handle.replace(/^@+/, '').trim().toLowerCase();
    const helper = document.getElementById(`${context}-handle-helper`);
    const icon = document.getElementById(`${context}-handle-status-icon`);
    
    if (!clean) {
        if (helper) helper.innerText = '';
        if (icon) icon.innerHTML = '';
        return false;
    }
    
    if (clean.length < 3) {
        if (helper) { helper.innerText = 'Handle must be at least 3 characters'; helper.className = 'text-[10px] text-red-500 mt-1 pl-1'; }
        if (icon) icon.innerHTML = '<i class="fa-solid fa-xmark text-red-500"></i>';
        return false;
    }

    try {
        const q = query(collection(db, "users"), where("handle", "==", clean));
        const snap = await getDocs(q);
        if (!snap.empty) {
            if (helper) { helper.innerText = 'Username taken'; helper.className = 'text-[10px] text-red-500 mt-1 pl-1'; }
            if (icon) icon.innerHTML = '<i class="fa-solid fa-xmark text-red-500"></i>';
            return false;
        } else {
            if (helper) { helper.innerText = 'Username available'; helper.className = 'text-[10px] text-emerald-400 mt-1 pl-1'; }
            if (icon) icon.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i>';
            return true;
        }
    } catch(e) {
        return true;
    }
}

export async function handleSignup() {
    const nameInput = document.getElementById('auth-input-name');
    const handleInput = document.getElementById('auth-input-handle');
    const emailInput = document.getElementById('auth-input-email');
    const passInput = document.getElementById('auth-input-pass');
    const btn = document.getElementById('btn-auth-signup');

    const name = nameInput ? nameInput.value.trim() : '';
    const rawHandle = handleInput ? handleInput.value.trim() : '';
    let email = emailInput ? emailInput.value.trim() : '';
    const pass = passInput ? passInput.value.trim() : '';

    if (!name || !pass || !rawHandle) {
        showToast("Please fill all required fields");
        return;
    }

    if (!email.includes('@')) {
        email = rawHandle.replace(/^@+/, '') + '@ib65.app';
    }

    const cleanHandle = rawHandle.replace(/^@+/, '').toLowerCase();
    if (btn) { btn.innerText = "Creating..."; btn.disabled = true; }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: name });

        const badgeType = cleanHandle === 'ib65' ? 'gold_red' : 'none';

        await setDoc(doc(db, "users", email), {
            name: name,
            handle: cleanHandle,
            email: email,
            bio: "Welcome to my IB65 profile!",
            badgeType: badgeType,
            followers: 0,
            following: 0,
            followersList: [],
            followingList: [],
            savedPosts: [],
            accountType: "creator",
            createdAt: Date.now()
        }, { merge: true });

        saveSessionLocally(email, cleanHandle, name);
        showToast("Welcome to IB65!");
        document.getElementById('modal-auth')?.classList.add('hidden');
        window.loadMyProfile?.();
        window.switchTab?.('home');
    } catch(e) {
        showToast(e.message);
    } finally {
        if (btn) { btn.innerText = "Sign Up"; btn.disabled = false; }
    }
}

export async function handleLogin() {
    const emailOrHandleInput = document.getElementById('auth-input-email');
    const passInput = document.getElementById('auth-input-pass');
    
    let identifier = emailOrHandleInput ? emailOrHandleInput.value.trim() : '';
    const pass = passInput ? passInput.value.trim() : '';

    if (!identifier || !pass) {
        showToast("Please enter email/username & password");
        return;
    }

    showToast("Logging in...");

    try {
        let finalEmail = identifier;
        if (!identifier.includes('@')) {
            const clean = identifier.replace(/^@+/, '').toLowerCase();
            const q = query(collection(db, "users"), where("handle", "==", clean));
            const snap = await getDocs(q);
            if (!snap.empty) {
                finalEmail = snap.docs[0].id;
            } else {
                finalEmail = clean + '@ib65.app';
            }
        }

        const cred = await signInWithEmailAndPassword(auth, finalEmail, pass);
        const uDoc = await getDoc(doc(db, "users", cred.user.email));
        const uData = uDoc.exists() ? uDoc.data() : {};
        
        saveSessionLocally(cred.user.email, uData.handle || finalEmail.split('@')[0], uData.name || 'User');
        showToast("Logged in successfully!");
        document.getElementById('modal-auth')?.classList.add('hidden');
        
        window.loadMyProfile?.();
        window.switchTab?.('home');
    } catch(e) {
        showToast("Login failed: " + e.message);
    }
}

export async function handleForgotPassword() {
    const emailInput = document.getElementById('auth-input-email');
    const id = emailInput ? emailInput.value.trim() : '';
    if (!id || !id.includes('@')) {
        showToast("Enter registered Gmail address");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, id);
        showToast("Password reset link sent to your email!");
    } catch(e) {
        showToast(e.message);
    }
}

export async function handleLogout() {
    try {
        await signOut(auth);
        showToast("Logged out");
        document.getElementById('modal-auth')?.classList.remove('hidden');
    } catch(e) {
        showToast(e.message);
    }
}

export function openAccountSwitcher() {
    const modal = document.getElementById('modal-account-switcher');
    const list = document.getElementById('switcher-accounts-list');
    if (!modal || !list) return;

    if (activeSessions.length === 0) {
        list.innerHTML = '<div class="text-zinc-500 text-xs py-3 text-center">No other accounts saved</div>';
    } else {
        list.innerHTML = activeSessions.map(s => `
            <div class="clay-card p-2.5 flex items-center justify-between cursor-pointer hover:border-zinc-500" onclick="window.switchActiveSession('${s.email}')">
                <div class="flex items-center space-x-2.5">
                    <div class="w-8 h-8 rounded-full bg-zinc-800 text-white font-bold flex items-center justify-center text-xs">
                        ${s.name[0]}
                    </div>
                    <div>
                        <p class="text-xs font-bold text-white">${s.name}</p>
                        <p class="text-[10px] text-zinc-400">@${s.handle}</p>
                    </div>
                </div>
                <span class="text-[10px] text-blue-400 font-bold">Switch</span>
            </div>
        `).join('');
    }
    modal.classList.remove('hidden');
}

export function switchActiveSession(email) {
    document.getElementById('modal-account-switcher')?.classList.add('hidden');
    const emailInput = document.getElementById('auth-input-email');
    if (emailInput) emailInput.value = email;
    document.getElementById('modal-auth')?.classList.remove('hidden');
    showToast("Enter password to switch to " + email);
}
