// js/editor.js
export let isEditorActive = false;
export let customThumbnailBlob = null;

let currentMediaUrl = '';
let currentMediaType = 'image';
let currentZoom = 1.0;
let currentSpeed = 1.0;
let currentFilter = 'none';
let currentAspect = '9/16';
let currentVolume = 1.0;

const filterPresets = [
    { name: 'Original', css: 'none' },
    { name: 'Vibrant', css: 'saturate(1.5) contrast(1.1)' },
    { name: 'Cyberpunk', css: 'hue-rotate(190deg) contrast(1.2)' },
    { name: 'Warm Film', css: 'sepia(0.35) contrast(1.1) brightness(1.05)' },
    { name: 'Mono B&W', css: 'grayscale(1) contrast(1.2)' },
    { name: 'Neon Glow', css: 'contrast(1.4) brightness(1.1) saturate(1.8)' }
];

export function resetEditorThumb() {
    customThumbnailBlob = null;
}

export function openProEditorSuite(url, type) {
    isEditorActive = true;
    currentMediaUrl = url;
    currentMediaType = type;

    const modal = document.getElementById('modal-pro-editor');
    const vEl = document.getElementById('editor-main-video');
    const imgEl = document.getElementById('editor-main-img');
    const playhead = document.getElementById('timeline-playhead-line');

    if (!modal) return;
    modal.classList.remove('hidden');

    // Default InShot States
    currentZoom = 1.0;
    currentSpeed = 1.0;
    currentFilter = 'none';
    currentAspect = '9/16';
    currentVolume = 1.0;

    applyCanvasRatio('9/16');
    applyFilterEffect('none');

    if (type === 'video') {
        if (imgEl) imgEl.classList.add('hidden');
        if (vEl) {
            vEl.classList.remove('hidden');
            vEl.src = url;
            vEl.muted = false;
            vEl.volume = 1.0;
            vEl.playbackRate = 1.0;
            vEl.play().catch(() => {});

            vEl.ontimeupdate = () => {
                const cur = vEl.currentTime || 0;
                const dur = vEl.duration || 1;
                const pct = (cur / dur) * 100;
                if (playhead) playhead.style.left = `${pct}%`;
                
                const timerEl = document.getElementById('editor-time-counter');
                if (timerEl) {
                    const format = s => {
                        const m = Math.floor(s / 60);
                        const sec = Math.floor(s % 60);
                        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
                    };
                    timerEl.innerText = `${format(cur)} / ${format(dur)}`;
                }
            };
        }
    } else {
        if (vEl) { vEl.pause(); vEl.classList.add('hidden'); }
        if (imgEl) {
            imgEl.classList.remove('hidden');
            imgEl.src = url;
        }
    }
}

export function closeProEditor() {
    isEditorActive = false;
    const vEl = document.getElementById('editor-main-video');
    if (vEl) vEl.pause();
    document.getElementById('modal-pro-editor')?.classList.add('hidden');
    document.getElementById('inshot-text-panel')?.classList.add('hidden');
    document.getElementById('inshot-filter-panel')?.classList.add('hidden');
    document.getElementById('inshot-ratio-panel')?.classList.add('hidden');
}

export function proceedToPublishFromEditor() {
    closeProEditor();
    document.getElementById('modal-create')?.classList.remove('hidden');
}

export function toggleEditorPlayback() {
    const vEl = document.getElementById('editor-main-video');
    const icon = document.getElementById('btn-play-pause-icon');
    if (!vEl) return;

    if (vEl.paused) {
        vEl.play();
        if (icon) icon.className = 'fa-solid fa-pause';
    } else {
        vEl.pause();
        if (icon) icon.className = 'fa-solid fa-play';
    }
}

export function handleZoomSlider(val) {
    currentZoom = val;
    const vEl = document.getElementById('editor-main-video');
    const imgEl = document.getElementById('editor-main-img');
    const lbl = document.getElementById('lbl-zoom-val');

    if (lbl) lbl.innerText = val + 'x';
    if (vEl) vEl.style.transform = `scale(${val})`;
    if (imgEl) imgEl.style.transform = `scale(${val})`;
}

// InShot Tool Switchers
export function openToolPanel(panelId) {
    ['inshot-text-panel', 'inshot-filter-panel', 'inshot-ratio-panel'].forEach(p => {
        const el = document.getElementById(p);
        if (el) el.classList.add('hidden');
    });
    if (panelId) {
        document.getElementById(panelId)?.classList.remove('hidden');
    }
}

export function applyCanvasRatio(ratio) {
    currentAspect = ratio;
    const box = document.getElementById('editor-canvas-box');
    if (!box) return;

    if (ratio === '9/16') {
        box.style.aspectRatio = '9/16';
        box.style.maxWidth = '275px';
        box.style.height = '50vh';
    } else if (ratio === '1/1') {
        box.style.aspectRatio = '1/1';
        box.style.maxWidth = '310px';
        box.style.height = '310px';
    } else if (ratio === '16/9') {
        box.style.aspectRatio = '16/9';
        box.style.maxWidth = '350px';
        box.style.height = '197px';
    }
    window.showToast?.("Ratio: " + ratio);
}

export function cycleVideoSpeed() {
    const vEl = document.getElementById('editor-main-video');
    const btnLbl = document.getElementById('lbl-tool-speed');
    if (!vEl) return;

    if (currentSpeed === 1.0) currentSpeed = 1.5;
    else if (currentSpeed === 1.5) currentSpeed = 2.0;
    else if (currentSpeed === 2.0) currentSpeed = 0.5;
    else currentSpeed = 1.0;

    vEl.playbackRate = currentSpeed;
    if (btnLbl) btnLbl.innerText = currentSpeed + 'x';
    window.showToast?.("Speed: " + currentSpeed + "x");
}

export function toggleAudioBoost() {
    const vEl = document.getElementById('editor-main-video');
    const icon = document.getElementById('btn-tool-volume-icon');
    const lbl = document.getElementById('lbl-tool-volume');
    if (!vEl) return;

    if (vEl.muted) {
        vEl.muted = false;
        vEl.volume = 1.0;
        if (icon) icon.className = 'fa-solid fa-volume-high text-cyan-400';
        if (lbl) lbl.innerText = '100%';
        window.showToast?.("Volume 100%");
    } else if (vEl.volume === 1.0) {
        vEl.muted = true;
        if (icon) icon.className = 'fa-solid fa-volume-xmark text-red-500';
        if (lbl) lbl.innerText = 'Mute';
        window.showToast?.("Audio Muted");
    } else {
        vEl.muted = false;
        vEl.volume = 1.0;
        if (icon) icon.className = 'fa-solid fa-volume-high text-cyan-400';
        if (lbl) lbl.innerText = '100%';
    }
}

export function applyFilterEffect(filterCss, filterName) {
    currentFilter = filterCss;
    const vEl = document.getElementById('editor-main-video');
    const imgEl = document.getElementById('editor-main-img');

    if (vEl) vEl.style.filter = filterCss;
    if (imgEl) imgEl.style.filter = filterCss;
    if (filterName) window.showToast?.("Filter: " + filterName);
}

// InShot Style Sleek Text Engine (Live On-Screen Overlay)
export function updateInshotText(val) {
    const overlay = document.getElementById('pro-text-overlay-box');
    const textTarget = document.getElementById('pro-text-overlay-val');
    if (!val.trim()) {
        if (overlay) overlay.classList.add('hidden');
        return;
    }
    if (textTarget) textTarget.innerText = val;
    if (overlay) overlay.classList.remove('hidden');
}

export function setTextColor(colorHex) {
    const textTarget = document.getElementById('pro-text-overlay-val');
    const overlay = document.getElementById('pro-text-overlay-box');
    if (textTarget) textTarget.style.color = colorHex;
    if (overlay) overlay.style.borderColor = colorHex;
}

export function captureCurrentThumbnailFrame() {
    const vEl = document.getElementById('editor-main-video');
    if (!vEl) return;

    const canvas = document.createElement('canvas');
    canvas.width = vEl.videoWidth || 720;
    canvas.height = vEl.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(vEl, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
        customThumbnailBlob = blob;
        window.showToast?.("Cover Frame Saved! 📸");
    }, 'image/jpeg', 0.95);
}

// Interactive Timeline Seek
export function seekTimeline(event) {
    const track = document.getElementById('timeline-frames-track');
    const vEl = document.getElementById('editor-main-video');
    if (!track || !vEl || !vEl.duration) return;

    const rect = track.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    vEl.currentTime = pct * vEl.duration;
}

// Draggable Text Touch Handler
let isDraggingText = false;
let startX, startY, origX, origY;

window.initDraggableText = function() {
    const box = document.getElementById('pro-text-overlay-box');
    if (!box) return;

    const onStart = e => {
        isDraggingText = true;
        const pt = e.touches ? e.touches[0] : e;
        startX = pt.clientX;
        startY = pt.clientY;
        origX = box.offsetLeft;
        origY = box.offsetTop;
    };

    const onMove = e => {
        if (!isDraggingText) return;
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;
        box.style.left = (origX + dx) + 'px';
        box.style.top = (origY + dy) + 'px';
    };

    const onEnd = () => { isDraggingText = false; };

    box.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    box.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
};
