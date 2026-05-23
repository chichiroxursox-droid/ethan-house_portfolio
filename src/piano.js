import * as THREE from 'three';
import { playNote } from './audio.js';
import { getPianoKeys } from './roomObjects.js';

let scene = null;
let camera = null;
let renderer = null;
let focused = false;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Key animation state: { mesh, restY, pressedUntil }
const pressedKeys = [];

// Music stand
let musicStandMesh = null;
let musicStandTexture = null;

// Callbacks for explore.js integration
let onExitCallback = null;

export function isPianoFocused() { return focused; }

export function initPiano(sceneRef, cameraRef, rendererRef) {
  scene = sceneRef;
  camera = cameraRef;
  renderer = rendererRef;

  // Build the music stand once the piano keys exist
  buildMusicStand();
}

function buildMusicStand() {
  // Find the Piano group to attach the music stand
  let pianoGroup = null;
  scene.traverse((child) => {
    if (child.name === 'Piano' && child.isGroup) pianoGroup = child;
  });
  if (!pianoGroup) return;

  // Get PianoBody bounds for positioning
  let pianoBody = null;
  pianoGroup.traverse((child) => {
    if (child.name === 'PianoBody') pianoBody = child;
  });
  if (!pianoBody) return;

  pianoBody.geometry.computeBoundingBox();
  const geoBox = pianoBody.geometry.boundingBox;
  const cx = (geoBox.min.x + geoBox.max.x) / 2;
  const topY = geoBox.max.y;
  const frontZ = geoBox.max.z;

  // Create a canvas texture for "My Music" label
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx2d = canvas.getContext('2d');
  ctx2d.fillStyle = '#2a1a0e';
  ctx2d.fillRect(0, 0, 256, 128);
  ctx2d.fillStyle = '#d4c4a0';
  ctx2d.font = 'bold 28px serif';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText('♪ My Music ♪', 128, 50);
  ctx2d.font = '16px serif';
  ctx2d.fillStyle = '#a89878';
  ctx2d.fillText('click to view', 128, 85);

  if (musicStandTexture) musicStandTexture.dispose();
  musicStandTexture = new THREE.CanvasTexture(canvas);
  const texture = musicStandTexture;
  const standGeo = new THREE.PlaneGeometry(0.3, 0.15);
  const standMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  musicStandMesh = new THREE.Mesh(standGeo, standMat);
  musicStandMesh.name = 'MusicStand';
  musicStandMesh.position.set(cx, topY - 0.05, frontZ + 0.02);
  musicStandMesh.rotation.x = -0.5; // angled like a real music stand
  pianoGroup.add(musicStandMesh);
}

export function enterPianoFocus(exitCallback) {
  focused = true;
  onExitCallback = exitCallback;

  // Remove first to prevent duplication on rapid re-entry
  renderer.domElement.removeEventListener('mousemove', onPianoMouseMove);
  renderer.domElement.removeEventListener('click', onPianoClick);
  renderer.domElement.addEventListener('mousemove', onPianoMouseMove);
  renderer.domElement.addEventListener('click', onPianoClick);
}

export function exitPianoFocus() {
  focused = false;

  // Remove listeners
  renderer.domElement.removeEventListener('mousemove', onPianoMouseMove);
  renderer.domElement.removeEventListener('click', onPianoClick);

  // Reset any pressed keys
  pressedKeys.forEach(({ mesh }) => {
    mesh.position.y = mesh.userData.restY;
  });
  pressedKeys.length = 0;
}

function onPianoMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPianoClick(event) {
  if (!focused) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check music stand first
  if (musicStandMesh) {
    const standHits = raycaster.intersectObject(musicStandMesh);
    if (standHits.length > 0) {
      showMusicOverlay();
      event.stopPropagation();
      return;
    }
  }

  // Check piano keys
  const keys = getPianoKeys();
  const intersects = keys.length > 0 ? raycaster.intersectObjects(keys, false) : [];
  if (intersects.length > 0) {
    const keyMesh = intersects[0].object;
    if (keyMesh.userData && keyMesh.userData.freq) {
      playNote(keyMesh.userData.freq);
      pressKey(keyMesh);
      event.stopPropagation();
      return;
    }
  }

  // Click missed every interactive piano element — honor "click anywhere to return".
  if (onExitCallback) onExitCallback();
}

function pressKey(mesh) {
  // Check if already pressed
  if (pressedKeys.find(k => k.mesh === mesh)) return;

  mesh.position.y = mesh.userData.restY - 0.01;
  const pressedUntil = performance.now() + 150;
  pressedKeys.push({ mesh, pressedUntil });
}

export function updatePiano() {
  // Release keys after their press duration
  const now = performance.now();
  for (let i = pressedKeys.length - 1; i >= 0; i--) {
    if (now >= pressedKeys[i].pressedUntil) {
      pressedKeys[i].mesh.position.y = pressedKeys[i].mesh.userData.restY;
      pressedKeys.splice(i, 1);
    }
  }
}

// ── Music overlay ──

const MUSIC_VIDEOS = [
  { src: '/videos/piano-1.mp4', poster: '/videos/piano-1-thumb.jpg', title: 'Beanie' },
  { src: '/videos/piano-2.mp4', poster: '/videos/piano-2-thumb.jpg', title: 'I Broke a String Playing This' },
];

function stopVideoPlayback(overlay) {
  const video = overlay?.querySelector('.music-player video');
  if (!video) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
}

export function showMusicOverlay() {
  const overlay = document.getElementById('music-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  const grid = overlay.querySelector('.music-grid');
  const player = overlay.querySelector('.music-player');
  if (player) player.style.display = 'none';
  stopVideoPlayback(overlay);

  if (grid) {
    grid.innerHTML = '';
    grid.style.display = '';

    if (MUSIC_VIDEOS.length === 0) {
      grid.innerHTML = '<p style="color:rgba(255,255,255,0.5);text-align:center;width:100%;">Videos coming soon...</p>';
      return;
    }

    MUSIC_VIDEOS.forEach((video) => {
      const card = document.createElement('div');
      card.className = 'music-card';
      card.innerHTML = `
        <img src="${video.poster}" alt="${video.title}" />
        <span>${video.title}</span>
      `;
      card.addEventListener('click', () => openVideo(video));
      grid.appendChild(card);
    });
  }
}

function openVideo(video) {
  const overlay = document.getElementById('music-overlay');
  if (!overlay) return;
  const grid = overlay.querySelector('.music-grid');
  const player = overlay.querySelector('.music-player');
  const videoEl = overlay.querySelector('.music-player video');

  if (grid) grid.style.display = 'none';
  if (player) player.style.display = 'flex';
  if (videoEl) {
    videoEl.src = video.src;
    videoEl.poster = video.poster || '';
    videoEl.load();
    videoEl.play().catch(() => {});
  }
}

export function hideMusicOverlay() {
  const overlay = document.getElementById('music-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';

  stopVideoPlayback(overlay);

  const grid = overlay.querySelector('.music-grid');
  const player = overlay.querySelector('.music-player');
  if (grid) grid.style.display = '';
  if (player) player.style.display = 'none';
}

// Wire close buttons
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-close-music')?.addEventListener('click', hideMusicOverlay);
  document.getElementById('btn-back-music-grid')?.addEventListener('click', () => {
    const overlay = document.getElementById('music-overlay');
    const grid = overlay?.querySelector('.music-grid');
    const player = overlay?.querySelector('.music-player');
    if (grid) grid.style.display = '';
    if (player) player.style.display = 'none';
    stopVideoPlayback(overlay);
  });
});
