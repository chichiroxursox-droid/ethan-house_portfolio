import * as THREE from 'three';
import { playTick, setIndoorVolume } from './audio.js';

let clockGroup = null;
let minuteHand = null;
let hourHand = null;
let lastTickSecond = -1;
let isExploring = false;
let isFocused = false;

export function setClockExploring(exploring) {
  isExploring = exploring;
}

export function setClockFocused(focused) {
  isFocused = focused;
  // Duck indoor ambient when focused on clock so ticks are audible,
  // then return to the standard ambient level (0.15) — not 1.0 — when unfocused.
  setIndoorVolume(focused ? 0.05 : 0.15);
}

export function createClock(scene) {
  clockGroup = new THREE.Group();
  clockGroup.name = 'clock';

  const R = 0.2; // clock radius (20cm)

  // Face
  const faceGeo = new THREE.CircleGeometry(R, 32);
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xF5F0E8, roughness: 0.5, side: THREE.DoubleSide });
  const face = new THREE.Mesh(faceGeo, faceMat);
  clockGroup.add(face);

  // Frame ring
  const ringGeo = new THREE.RingGeometry(R, R + 0.025, 32);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.z = 0.001;
  clockGroup.add(ring);

  // Tick marks (12)
  const tickMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const tickGeo = new THREE.BoxGeometry(0.01, 0.025, 0.003);
    const tick = new THREE.Mesh(tickGeo, tickMat);
    const r = R * 0.82;
    tick.position.set(Math.sin(angle) * r, Math.cos(angle) * r, 0.002);
    tick.rotation.z = -angle;
    clockGroup.add(tick);
  }

  // Hour hand (shorter, wider)
  const hourGeo = new THREE.BoxGeometry(0.015, R * 0.52, 0.004);
  hourGeo.translate(0, R * 0.26, 0); // pivot at base
  const handMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  hourHand = new THREE.Mesh(hourGeo, handMat);
  hourHand.position.z = 0.003;
  clockGroup.add(hourHand);

  // Minute hand (longer, thinner)
  const minuteGeo = new THREE.BoxGeometry(0.01, R * 0.72, 0.004);
  minuteGeo.translate(0, R * 0.36, 0); // pivot at base
  minuteHand = new THREE.Mesh(minuteGeo, handMat);
  minuteHand.position.z = 0.004;
  clockGroup.add(minuteHand);

  // Center dot
  const dotGeo = new THREE.CircleGeometry(0.012, 16);
  const dot = new THREE.Mesh(dotGeo, handMat);
  dot.position.z = 0.005;
  clockGroup.add(dot);

  // Position on right wall above the piano
  clockGroup.rotation.y = -Math.PI / 2; // face into room (toward -X)
  clockGroup.position.set(2.42, 2.3, -1.5);
  scene.add(clockGroup);
}

export function updateClock(camera) {
  if (!clockGroup || !minuteHand || !hourHand) return;

  const now = new Date();
  const minutes = now.getMinutes() + now.getSeconds() / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  minuteHand.rotation.z = -(minutes / 60) * Math.PI * 2;
  hourHand.rotation.z = -(hours / 12) * Math.PI * 2;

  // Ticking sound — only in explore mode and within 2m (or always when focused)
  if (isExploring) {
    const dist = camera.position.distanceTo(clockGroup.position);
    const currentSecond = now.getSeconds();
    if ((isFocused || dist < 2) && currentSecond !== lastTickSecond) {
      lastTickSecond = currentSecond;
      playTick(isFocused ? 0.18 : 0.04);
    }
  }
}
