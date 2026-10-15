// js/editor.js
export let isEditorActive = false;
export let customThumbnailBlob = null;

let currentMediaUrl = '';
let currentMediaType = 'image';
let currentZoom = 1.0;
let currentFilterIndex = 0;

const filters = [
    { name: 'Normal', filter: 'none' },
    { name: 'Vibrant', filter: 'saturate(1.5) contrast(1.1)' },
    { name: 'Cinema', filter: 'contrast(1.2) brightness(0.9) sepia(0.2)' },
    { name: 'B&W', filter: 'grayscale(1)' }
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

    if (!modal) return;
    modal.classList.remove('hidden');

    if (type === 'video') {
        if (imgEl) imgEl.classList.add('hidden');
        if (vEl) {
            vEl.classList.remove('hidden');
            vEl.src = url;
            vEl.muted = false;
            vEl.volume = 1.0;
            vEl.play().catch(() => {});
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

export function openAddTextTool() {
    const text = prompt("Enter text for overlay:");
    const box = document.getElementById('pro-text-overlay-box');
    const val = document.getElementById('pro-text-overlay-val');

    if (text && box && val) {
        val.innerText = text;
        box.classList.remove('hidden');
    }
}

export function cycleFilterPresets() {
    currentFilterIndex = (currentFilterIndex + 1) % filters.length;
    const f = filters[currentFilterIndex];

    const vEl = document.getElementById('editor-main-video');
    const imgEl = document.getElementById('editor-main-img');

    if (vEl) vEl.style.filter = f.filter;
    if (imgEl) imgEl.style.filter = f.filter;
    window.showToast?.("Filter: " + f.name);
}

export function captureCurrentThumbnailFrame() {
    const vEl = document.getElementById('editor-main-video');
    if (!vEl) return;

    const canvas = document.createElement('canvas');
    canvas.width = vEl.videoWidth || 640;
    canvas.height = vEl.videoHeight || 360;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(vEl, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
        customThumbnailBlob = blob;
        window.showToast?.("Cover Frame Captured! 📸");
    }, 'image/jpeg', 0.95);
}
