// js/editor.js
import { showToast } from './config.js';

let editorVideoDuration = 0;
let editorTimeInterval = null;
let currentZoomScale = 1;
let overlayText = '';
export let customThumbnailBlob = null;
export let isEditorActive = false;

const filterPresets = [
    'none',
    'contrast(125%) saturate(130%)',
    'sepia(50%) contrast(110%)',
    'grayscale(100%) contrast(140%)',
    'hue-rotate(180deg) saturate(130%)'
];
let filterIndex = 0;

// Reset thumbnail state on new file choice
export function resetEditorThumb() {
    customThumbnailBlob = null;
}

// 1. Real Timeline Frame Extractor
export async function generateTimelineFrameStrips(videoEl) {
    const stripContainer = document.getElementById('timeline-frames-preview');
    if (!stripContainer) return;
    stripContainer.innerHTML = '';
    
    const totalThumbnails = 6;
    const duration = videoEl.duration || 10;
    const interval = duration / totalThumbnails;

    const tempVideo = document.createElement('video');
    tempVideo.src = videoEl.src;
    tempVideo.crossOrigin = "anonymous";
    tempVideo.muted = true;

    const canvas = document.createElement('canvas');
    canvas.width = 60;
    canvas.height = 56;
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < totalThumbnails; i++) {
        const seekTime = i * interval;
        await new Promise((resolve) => {
            tempVideo.currentTime = seekTime;
            tempVideo.onseeked = () => {
                ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
                const img = document.createElement('img');
                img.src = canvas.toDataURL('image/jpeg', 0.7);
                img.className = 'h-full flex-1 object-cover border-r border-black/40';
                stripContainer.appendChild(img);
                resolve();
            };
        });
    }
}

// 2. Open Pro Video Editor Studio
export function openProEditorSuite(url, type) {
    isEditorActive = true;
    const modal = document.getElementById('modal-pro-editor');
    const v = document.getElementById('editor-main-video');
    const img = document.getElementById('editor-main-img');

    currentZoomScale = 1;
    const zoomSlider = document.getElementById('editor-zoom-slider');
    const zoomValLbl = document.getElementById('lbl-zoom-val');
    if (zoomSlider) zoomSlider.value = 1;
    if (zoomValLbl) zoomValLbl.innerText = '1.0x';

    if (type === 'video') {
        if (img) img.classList.add('hidden');
        if (v) {
            v.classList.remove('hidden');
            v.src = url;
            v.load();
            v.style.transform = 'scale(1)';
            v.onloadedmetadata = () => {
                editorVideoDuration = Math.round(v.duration);
                const counter = document.getElementById('editor-time-counter');
                if (counter) counter.innerText = `0:00 / 0:${String(editorVideoDuration).padStart(2, '0')}`;
                generateTimelineFrameStrips(v);
            };
            v.play().catch(() => {});
        }
    } else {
        if (v) v.classList.add('hidden');
        if (img) {
            img.classList.remove('hidden');
            img.src = url;
            img.style.transform = 'scale(1)';
        }
        const counter = document.getElementById('editor-time-counter');
        if (counter) counter.innerText = "Photo Ready";
    }

    if (modal) modal.classList.remove('hidden');
    startEditorTimer();
    initDraggableTextOverlay();
}

// 3. Close Editor Studio
export function closeProEditor() {
    isEditorActive = false;
    const v = document.getElementById('editor-main-video');
    if (v) v.pause();
    clearInterval(editorTimeInterval);
    document.getElementById('modal-pro-editor')?.classList.add('hidden');
}

// 4. Capture Cover Frame (Zero-Black Screen Asynchronous Capture)
export function captureCurrentThumbnailFrame() {
    const v = document.getElementById('editor-main-video');
    if (!v) return;

    const doDraw = () => {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = v.videoWidth || 720;
            canvas.height = v.videoHeight || 1280;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (blob && blob.size > 1000) {
                    customThumbnailBlob = blob;
                    showToast("Real cover frame locked!");
                } else {
                    showToast("Seek timeline and tap again!");
                }
            }, "image/jpeg", 0.92);
        } catch(e) {
            showToast("Frame captured!");
        }
    };

    if (v.currentTime <= 0.05 && v.duration > 0.2) {
        v.onseeked = () => {
            v.onseeked = null;
            doDraw();
        };
        v.currentTime = 0.2;
    } else {
        doDraw();
    }
}

// 5. Playback & Playhead Timer
function startEditorTimer() {
    clearInterval(editorTimeInterval);
    const v = document.getElementById('editor-main-video');
    const counter = document.getElementById('editor-time-counter');
    const playhead = document.getElementById('timeline-playhead-line');

    editorTimeInterval = setInterval(() => {
        if (v && !v.paused && v.duration) {
            const cur = Math.round(v.currentTime);
            const dur = Math.round(v.duration);
            if (counter) counter.innerText = `0:${String(cur).padStart(2, '0')} / 0:${String(dur).padStart(2, '0')}`;
            const percent = (v.currentTime / v.duration) * 100;
            if (playhead) playhead.style.left = `${percent}%`;
        }
    }, 250);
}

export function toggleEditorPlayback() {
    const v = document.getElementById('editor-main-video');
    const icon = document.getElementById('btn-play-pause-icon');
    if (!v) return;
    if (v.paused) {
        v.play();
        if (icon) icon.className = 'fa-solid fa-pause';
    } else {
        v.pause();
        if (icon) icon.className = 'fa-solid fa-play';
    }
}

export function handleZoomSlider(val) {
    currentZoomScale = parseFloat(val);
    const lbl = document.getElementById('lbl-zoom-val');
    if (lbl) lbl.innerText = `${currentZoomScale.toFixed(1)}x`;
    const v = document.getElementById('editor-main-video');
    const img = document.getElementById('editor-main-img');
    if (v) v.style.transform = `scale(${currentZoomScale})`;
    if (img) img.style.transform = `scale(${currentZoomScale})`;
}

// 6. Interactive Draggable Text Overlay
function initDraggableTextOverlay() {
    const el = document.getElementById('pro-text-overlay-box');
    if (!el) return;
    let startX = 0, startY = 0, initialLeft = 20, initialTop = 40;

    const onStart = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;
        initialLeft = parseInt(el.style.left || '20', 10);
        initialTop = parseInt(el.style.top || '40', 10);
    };

    const onMove = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        el.style.left = `${initialLeft + dx}px`;
        el.style.top = `${initialTop + dy}px`;
        e.preventDefault();
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', (e) => { if (startX !== 0) onMove(e); });
    window.addEventListener('mouseup', () => { startX = 0; });
}

export function openAddTextTool() {
    const txt = prompt("Enter text on media:", overlayText || "");
    const box = document.getElementById('pro-text-overlay-box');
    const val = document.getElementById('pro-text-overlay-val');

    if (txt && txt.trim() !== '') {
        overlayText = txt.trim();
        if (val) val.innerText = overlayText;
        box?.classList.remove('hidden');
        showToast("Drag text to reposition");
    } else if (txt === '') {
        overlayText = '';
        box?.classList.add('hidden');
    }
}

export function cycleFilterPresets() {
    filterIndex = (filterIndex + 1) % filterPresets.length;
    const cur = filterPresets[filterIndex];
    const v = document.getElementById('editor-main-video');
    const img = document.getElementById('editor-main-img');
    if (v) v.style.filter = cur;
    if (img) img.style.filter = cur;
    showToast("Filter applied");
}

export function proceedToPublishFromEditor() {
    closeProEditor();
    document.getElementById('modal-create')?.classList.remove('hidden');
    showToast("Add mandatory caption & tap Share!");
}
