import * as THREE from 'three';

// ── Corkboard gallery ──
// One wooden-framed corkboard on the back half of the left wall (x ≈ -2.33),
// with 9 polaroid-style photos pinned to the cork. Each polaroid is an
// individually-named Group so clicks walk up the parent chain in explore.js's
// findInteractiveName() and resolve to a specific Polaroid_* key.

// Corkboard dimensions (local space)
const FRAME_OUTER_W = 1.55;
const FRAME_OUTER_H = 1.05;
const FRAME_BORDER = 0.05;
const FRAME_DEPTH = 0.03;
const CORK_W = FRAME_OUTER_W - FRAME_BORDER * 2;  // 1.45
const CORK_H = FRAME_OUTER_H - FRAME_BORDER * 2;  // 0.95

// World position of the corkboard root
const CORKBOARD_POS = new THREE.Vector3(-2.33, 1.80, -0.50);

// Polaroid definitions. Dimensions come from actual image aspect ratios so
// no photo is ever squashed. All photoW/photoH are in meters (local space).
const POLAROIDS = [
  { key: 'GoatFinal',       texture: '/gallery/goat-house.png',     photoW: 0.20, photoH: 0.131 }, // 916x598
  { key: 'GoatTeam',        texture: '/gallery/goat-team.jpeg',     photoW: 0.20, photoH: 0.150 }, // 1920x1440
  { key: 'UNSpeaking',      texture: '/gallery/un.png',             photoW: 0.20, photoH: 0.124 }, // 1866x1160
  { key: 'UNPresenting',    texture: '/gallery/un-presenting.jpeg', photoW: 0.20, photoH: 0.150 }, // 1024x768
  { key: 'MicPeace',        texture: '/gallery/mic-peace.jpg',      photoW: 0.165, photoH: 0.22 }, // 1440x1920 portrait
  { key: 'MicEvent',        texture: '/gallery/mic-event.jpg',      photoW: 0.20, photoH: 0.133 }, // 1920x1280
  { key: 'BasketballLayup', texture: '/gallery/basketball.jpg',     photoW: 0.133, photoH: 0.22 }, // 1172x1944 portrait
  { key: 'BasketballShot',  texture: '/gallery/basketball-shot.png',photoW: 0.114, photoH: 0.22 }, // 598x1158 portrait
  { key: 'Education',       texture: '/gallery/education.png',      photoW: 0.20, photoH: 0.155 }, // 1320x1020
];

// Polaroid border proportions
const BORDER_SIDE = 0.01;   // left/right/top white border
const BORDER_BOTTOM = 0.04; // classic polaroid caption strip

// Thumbtack colors (shared across pins, indexed deterministically)
const PIN_COLORS = [0xd64545, 0x3a6ea5, 0xe8b442, 0xf2f2f2];

// Deterministic string hash — keeps jitter stable across loads so layout
// doesn't wobble between page refreshes.
function hashKey(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function createGallery(scene) {
  const loader = new THREE.TextureLoader();

  // ── Root group ──
  const corkboard = new THREE.Group();
  corkboard.name = 'Corkboard';
  corkboard.position.copy(CORKBOARD_POS);
  corkboard.rotation.y = Math.PI / 2; // local +Z → world +X, faces into room

  // ── Shared materials ──
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x3a261a,
    roughness: 0.75,
    metalness: 0.0,
  });
  const corkMat = new THREE.MeshStandardMaterial({
    color: 0xb08355,
    roughness: 0.95,
    metalness: 0.0,
  });
  const polaroidMat = new THREE.MeshStandardMaterial({
    color: 0xf8f5ee,
    roughness: 0.85,
    metalness: 0.0,
  });
  const pinMats = PIN_COLORS.map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3 }),
  );

  // ── Cork backing plane ──
  const corkGeo = new THREE.PlaneGeometry(CORK_W, CORK_H);
  const corkMesh = new THREE.Mesh(corkGeo, corkMat);
  corkMesh.position.z = 0;
  corkboard.add(corkMesh);

  // ── Wooden frame (4 bars) ──
  const halfW = FRAME_OUTER_W / 2;
  const halfH = FRAME_OUTER_H / 2;
  const barCenterZ = 0; // frame is flush with cork — polaroids will sit slightly forward

  const topGeo = new THREE.BoxGeometry(FRAME_OUTER_W, FRAME_BORDER, FRAME_DEPTH);
  const topBar = new THREE.Mesh(topGeo, woodMat);
  topBar.position.set(0, halfH - FRAME_BORDER / 2, barCenterZ);
  corkboard.add(topBar);

  const bottomBar = new THREE.Mesh(topGeo, woodMat);
  bottomBar.position.set(0, -halfH + FRAME_BORDER / 2, barCenterZ);
  corkboard.add(bottomBar);

  const sideGeo = new THREE.BoxGeometry(FRAME_BORDER, FRAME_OUTER_H, FRAME_DEPTH);
  const leftBar = new THREE.Mesh(sideGeo, woodMat);
  leftBar.position.set(-halfW + FRAME_BORDER / 2, 0, barCenterZ);
  corkboard.add(leftBar);

  const rightBar = new THREE.Mesh(sideGeo, woodMat);
  rightBar.position.set(halfW - FRAME_BORDER / 2, 0, barCenterZ);
  corkboard.add(rightBar);

  // ── Polaroid grid (3 cols × 3 rows inside the cork area) ──
  const cellW = CORK_W / 3;          // 0.483
  const cellH = CORK_H / 3;          // 0.317
  const originX = -CORK_W / 2 + cellW / 2;  // center of leftmost col
  const originY = CORK_H / 2 - cellH / 2;   // center of top row (local +Y is up)

  const polaroidGroups = [];

  POLAROIDS.forEach((def, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const h = hashKey(def.key);

    // Deterministic jitter from the key hash
    const jitterX = (((h >> 4) % 5) - 2) * 0.010; // ±0.02
    const jitterY = (((h >> 8) % 5) - 2) * 0.010; // ±0.02
    const rotDeg = ((h % 11) - 5);                // -5..+5 degrees
    const pinIdx = h % PIN_COLORS.length;
    const depthOffset = 0.018 + ((h >> 12) % 5) * 0.002; // 0.018..0.026

    const group = new THREE.Group();
    group.name = `Polaroid_${def.key}`;

    // Position the polaroid group at its cell center + jitter, pushed slightly
    // forward in local +Z so it sits on top of the cork without z-fighting.
    group.position.set(
      originX + col * cellW + jitterX,
      originY - row * cellH + jitterY,
      depthOffset,
    );
    group.rotation.z = (rotDeg * Math.PI) / 180;

    // White border backing (asymmetric: bigger bottom for the caption strip)
    const borderW = def.photoW + BORDER_SIDE * 2;
    const borderH = def.photoH + BORDER_SIDE + BORDER_BOTTOM;
    const borderGeo = new THREE.PlaneGeometry(borderW, borderH);
    const borderMesh = new THREE.Mesh(borderGeo, polaroidMat);
    borderMesh.position.z = 0;
    group.add(borderMesh);

    // Photo plane — unlit so it stays bright under the dimmed indoor exposure
    const texture = loader.load(def.texture);
    texture.colorSpace = THREE.SRGBColorSpace;
    const photoGeo = new THREE.PlaneGeometry(def.photoW, def.photoH);
    const photoMat = new THREE.MeshBasicMaterial({ map: texture });
    const photoMesh = new THREE.Mesh(photoGeo, photoMat);
    // Offset upward within the polaroid so the bottom caption strip is visible
    // (polaroid center is group origin; border has extra BORDER_BOTTOM on bottom)
    photoMesh.position.y = (BORDER_BOTTOM - BORDER_SIDE) / 2;
    photoMesh.position.z = 0.001;
    group.add(photoMesh);

    // Thumbtack — small sphere at top center, pushed forward in local +Z
    const pinGeo = new THREE.SphereGeometry(0.008, 12, 12);
    const pinMesh = new THREE.Mesh(pinGeo, pinMats[pinIdx]);
    pinMesh.position.set(0, borderH / 2 - 0.010, 0.008);
    group.add(pinMesh);

    corkboard.add(group);
    polaroidGroups.push(group);
  });

  scene.add(corkboard);

  // Debug hook — exposes corkboard + polaroids for e2e tests & console inspection.
  if (typeof window !== 'undefined') {
    window.__corkboard = corkboard;
    window.__galleryFrames = polaroidGroups; // keep old name for backward compat
  }

  return polaroidGroups;
}
