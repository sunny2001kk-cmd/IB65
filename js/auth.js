// js/auth.js
import { 
    auth, 
    db, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendEmailVerification, 
    sendPasswordResetEmail, 
    signOut, 
    updateProfile, 
    collection, 
    getDocs, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    query, 
    where, 
    showToast, 
    getVerificationBadgeSvg 
} from './config.js';

let handleCheckTimer = null;
let isSignupHandleValid = false;
let isEditHandleValid = true;

// Multi-account session storage
export function getStoredSessions() {
    try { return JSON.parse(localStorage.getItem('ib65_saved_accounts') || '[]'); } catch(e) { return []; }
}

export function saveSessionAccount(userObj) {
    let accounts = getStoredSessions();
    accounts = accounts.filter(a => a.email !== userObj.email);
    accounts.unshift(userObj);
    if (accounts.length > 5) accounts = accounts.slice(0, 5);
    localStorage.setItem('ib65_saved_accounts', JSON.stringify(accounts));
}

// Real-time handle validation
export function checkHandleAvailability(val, mode) {
    clearTimeout(handleCheckTimer);
    const clean = val.toLowerCase().trim().replace(/[^a-z0-9._]/g, '');
    const iconEl = document.getElementById(mode === 'signup' ? 'signup-handle-status-icon' : 'edit-handle-status-icon');
    const helpEl = document.getElementById(mode === 'signup' ? 'signup-handle-helper' : 'edit-handle-helper');

    if (!clean || clean.length < 3) {
        if (iconEl) iconEl.innerHTML = '';
        if (helpEl) {
            helpEl.innerText = 'Username must be at least 3 characters.';
            helpEl.className = 'text-[10px] text-gray-500 mt-1';
        }
        if (mode === 'signup') isSignupHandleValid = false;
        else isEditHandleValid = false;
        return;
    }

    if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-spinner animate-spin text-gray-400"></i>';
    
    handleCheckTimer = setTimeout(async () => {
        try {
            if (clean === 'ib65' && auth.currentUser?.email !== 'ib65@official.com') {
                if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-lock text-yellow-500 text-sm"></i>';
                if (helpEl) {
                    helpEl.innerText = 'This username is reserved and protected.';
                    helpEl.className = 'text-[10px] text-yellow-500 mt-1 font-bold';
                }
                if (mode === 'signup') isSignupHandleValid = false;
                else isEditHandleValid = false;
                return;
            }

            const qSnap = await getDocs(query(collection(db, "users"), where("handle", "==", clean)));
            let isTaken = false;

            qSnap.forEach(d => {
                if (mode === 'edit' && d.id === auth.currentUser?.email) return;
                isTaken = true;
            });

            if (isTaken) {
                if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark text-red-500 text-sm"></i>';
                if (helpEl) {
                    helpEl.innerText = 'Username already taken (choose another)';
                    helpEl.className = 'text-[10px] text-red-500 mt-1 font-bold';
                }
                if (mode === 'signup') isSignupHandleValid = false;
                else isEditHandleValid = false;
            } else {
                if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-check text-green-500 text-sm"></i>';
                if (helpEl) {
                    helpEl.innerText = 'Username available!';
                    helpEl.className = 'text-[10px] text-green-500 mt-1 font-bold';
                }
                if (mode === 'signup') isSignupHandleValid = true;
                else isEditHandleValid = true;
            }
        } catch(e) {
            if (iconEl) iconEl.innerHTML = '';
        }
    }, 350);
}

// 5-Account Multi Profile Signup
export async function handleSignup() {
    const name = document.getElementById('auth-input-name').value.trim();
    const handle = document.getElementById('auth-input-handle').value.toLowerCase().trim().replace(/^@+/, '');
    const emailInput = document.getElementById('auth-input-email').value.trim();
    const pass = document.getElementById('auth-input-pass').value.trim();

    if (!name || !handle || !emailInput || pass.length < 6) { 
        showToast("All fields are mandatory (Password 6+ chars)!"); 
        return; 
    }
    if (!isSignupHandleValid) {
        showToast("Please choose an available username with green checkmark!");
        return;
    }

    try {
        const accountsSnap = await getDocs(query(collection(db, "users"), where("primaryEmail", "==", emailInput)));
        if (accountsSnap.size >= 5) {
            showToast("Maximum limit reached: Only 5 accounts allowed per email!");
            return;
        }

        const authEmail = (accountsSnap.size === 0) ? emailInput : emailInput.replace('@', `+${handle}@`);

        const res = await createUserWithEmailAndPassword(auth, authEmail, pass);
        await updateProfile(res.user, { displayName: name });
        await sendEmailVerification(res.user);

        const badgeType = (handle === 'ib65') ? 'gold_red' : 'none';

        const newUserData = {
            name: name,
            handle: handle,
            email: authEmail,
            primaryEmail: emailInput,
            bio: 'Hey there! Using IB65.',
            photoUrl: '',
            badgeType: badgeType,
            status: 'active',
            dpLikes: [],
            followers: 0,
            following: 0,
            followersList: [],
            followingList: [],
            followRequests: [],
            savedPosts: [],
            accountType: 'personal',
            isPrivate: false,
            lastHandleChange: 0,
            totalViews: 0,
            totalShares: 0,
            totalWatchSeconds: 0,
            isOnline: true,
            lastSeen: Date.now(),
            createdAt: Date.now()
        };

        await setDoc(doc(db, "users", authEmail), newUserData);
        saveSessionAccount({ email: authEmail, name, handle, badgeType, cachedPass: pass });
        showToast("Account created successfully!");
    } catch(e) { 
        showToast("Signup error: " + e.message); 
    }
}

// Smart Login (Supports both @username & Email)
export async function handleLogin() {
    const inputVal = document.getElementById('auth-input-email').value.trim();
    const pass = document.getElementById('auth-input-pass').value.trim();
    if (!inputVal || !pass) { 
        showToast("Enter credentials!"); 
        return; 
    }

    try {
        let targetEmail = inputVal;

        if (!inputVal.includes('@')) {
            const cleanHandle = inputVal.toLowerCase().replace(/^@+/, '');
            const uSnap = await getDocs(query(collection(db, "users"), where("handle", "==", cleanHandle)));
            if (uSnap.empty) { 
                showToast("Username not found!"); 
                return; 
            }
            targetEmail = uSnap.docs[0].id;
        }

        await signInWithEmailAndPassword(auth, targetEmail, pass);
        
        const userDocSnap = await getDoc(doc(db, "users", targetEmail));
        if (userDocSnap.exists()) {
            const uData = userDocSnap.data();
            
            if (uData.status === 'inactive_pending_deletion') {
                const confirmRestore = confirm("Aapka account delete schedule par hai. Wapas activate karein?");
                if (confirmRestore) {
                    await updateDoc(doc(db, "users", targetEmail), {
                        status: 'active',
                        deletionRequestedAt: null
                    });
                    showToast("Account recover ho gaya!");
                } else {
                    await signOut(auth);
                    return;
                }
            }

            saveSessionAccount({ 
                email: targetEmail, 
                name: uData.name, 
                handle: uData.handle, 
                badgeType: uData.badgeType, 
                cachedPass: pass 
            });
        }
        showToast("Welcome back!");
    } catch(e) { 
        showToast("Login failed: " + e.message); 
    }
}

// 1-Tap Account Switcher (No password loop)
export function openAccountSwitcher() {
    const list = document.getElementById('switcher-accounts-list');
    if (!list) return;

    const accounts = getStoredSessions();
    const curEmail = auth.currentUser?.email;

    list.innerHTML = accounts.map(acc => `
        <div class="clay-card p-2.5 flex justify-between items-center cursor-pointer hover:border-zinc-500" onclick="window.switchActiveSession('${acc.email}')">
            <div class="flex items-center space-x-2.5">
                <div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs">${acc.name ? acc.name[0].toUpperCase() : 'U'}</div>
                <div>
                    <p class="text-xs font-bold text-white flex items-center">${acc.handle || acc.email.split('@')[0]} ${getVerificationBadgeSvg(acc.badgeType)}</p>
                    <p class="text-[10px] text-gray-400">${acc.email}</p>
                </div>
            </div>
            ${acc.email === curEmail ? '<i class="fa-solid fa-circle-check text-blue-500 text-sm"></i>' : ''}
        </div>
    `).join('');

    document.getElementById('modal-account-switcher')?.classList.remove('hidden');
}

export async function switchActiveSession(email) {
    document.getElementById('modal-account-switcher')?.classList.add('hidden');
    if (auth.currentUser?.email === email) return;

    const accounts = getStoredSessions();
    const targetAcc = accounts.find(a => a.email === email);

    if (auth.currentUser) {
        await updateDoc(doc(db, "users", auth.currentUser.email), { isOnline: false, lastSeen: Date.now() }).catch(() => {});
    }

    if (targetAcc && targetAcc.cachedPass) {
        showToast("Switching to @" + targetAcc.handle + "...");
        try {
            await signInWithEmailAndPassword(auth, targetAcc.email, targetAcc.cachedPass);
            showToast("Switched successfully!");
            window.location.reload();
            return;
        } catch(e) {}
    }

    await signOut(auth);
    document.getElementById('modal-auth')?.classList.remove('hidden');
    const emailField = document.getElementById('auth-input-email');
    if (emailField) {
        emailField.value = email;
        document.getElementById('auth-input-pass')?.focus();
    }
}

export async function handleLogout() {
    const user = auth.currentUser;
    if (user) {
        await updateDoc(doc(db, "users", user.email), { isOnline: false, lastSeen: Date.now() }).catch(() => {});
    }
    await signOut(auth);
    showToast("Logged out");
}

export async function handleForgotPassword() {
    const email = document.getElementById('auth-input-email').value.trim();
    if (!email) {
        showToast("Enter registered email!");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Password reset link sent to " + email);
    } catch(e) {
        showToast("Reset error: " + e.message);
    }
}
