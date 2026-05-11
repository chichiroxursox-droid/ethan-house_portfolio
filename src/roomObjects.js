import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const OBJECTS = [
  {
    // Right side of room, keys face left into room
    name: 'Piano',
    path: '/models/piano.glb',
    position: [1.8, 0.02, -1.5],
    scale: [1.0, 1.0, 1.0],
    rotation: [0, -Math.PI / 2, 0],
  },
  {
    // On floor near couch/living area, right-front of room
    name: 'DogBed',
    path: '/models/dogbed.glb',
    position: [1.0, 0.02, 1.0],
    scale: [0.7, 0.7, 0.7],
    rotation: [0, 0.3, 0],
  },
  {
    // Wall-mounted on back wall, above eye level, facing room
    name: 'Cross',
    path: '/models/cross.glb',
    position: [-0.5, 2.2, -2.45],
    scale: [1.5, 1.5, 1.5],
    rotation: [0, Math.PI, 0],
  },
  {
    // Wall shelf with mic, mounted on back wall near potted plant
    name: 'Microphone',
    path: '/models/microphone.glb',
    position: [0.5, 0.76, -2.1],
    scale: [0.7, 0.7, 0.7],
    rotation: [0, Math.PI, 0],
  },
  {
    // On coffee table surface (center of living area)
    name: 'Controller',
    path: '/models/controller.glb',
    position: [0.0, 0.46, 0.2],
    scale: [1.0, 1.0, 1.0],
    rotation: [0, 0.4 + Math.PI, 0],
  },
  {
    // On the floor between couch and coffee table — open and clearly clickable
    name: 'Basketball',
    path: '/models/basketball.glb',
    position: [-0.8, 0.02, 0.4],
    scale: [1.0, 1.0, 1.0],
    rotation: [0, 0.3, 0],
  },
  {
    // Front-right of desk top, slightly turned — desk surface is at world Y ≈ 0.795
    name: 'Peanut',
    path: '/models/peanut.glb',
    position: [-1.55, 0.795, -1.28],
    scale: [2.4, 2.4, 2.4],
    rotation: [0, 0.6, 0],
  },
];

// ── Piano key data ──
// NOTE_NAMES covers 2 octaves (C4–B5) = 14 white keys + 10 black keys
const NOTE_NAMES = [
  'C4','D4','E4','F4','G4','A4','B4',
  'C5','D5','E5','F5','G5','A5','B5',
];
const BLACK_NOTE_NAMES = [
  'C#4','D#4','F#4','G#4','A#4',
  'C#5','D#5','F#5','G#5','A#5',
];
// Frequency table (equal temperament, A4 = 440)
const NOTE_FREQ = {
  'C4':261.63,'C#4':277.18,'D4':293.66,'D#4':311.13,'E4':329.63,
  'F4':349.23,'F#4':369.99,'G4':392.00,'G#4':415.30,'A4':440.00,
  'A#4':466.16,'B4':493.88,
  'C5':523.25,'C#5':554.37,'D5':587.33,'D#5':622.25,'E5':659.25,
  'F5':698.46,'F#5':739.99,'G5':783.99,'G#5':830.61,'A5':880.00,
  'A#5':932.33,'B5':987.77,
};
// Black key positions relative to white key indices (0-based within each octave)
// Pattern: after white keys 0(C),1(D),3(F),4(G),5(A) → black keys C#,D#,F#,G#,A#
const BLACK_OFFSETS = [0, 1, 3, 4, 5]; // white key index where black key sits to the right

let pianoKeys = [];
let pianoKeyMats = [];

export function getPianoKeys() { return pianoKeys; }

/**
 * Post-process the piano GLB: remove broken floating keys and skeletal bench,
 * replace with clean procedural geometry with individually raycastable keys.
 */
function fixPiano(group) {
  // Dispose previously cloned key materials
  pianoKeyMats.forEach(m => m.dispose());
  pianoKeyMats = [];
  pianoKeys = [];

  // ── Collect meshes to remove ──
  const toRemove = [];
  group.traverse((child) => {
    if (child.isMesh && /^[WB]K\d+$/.test(child.name)) {
      toRemove.push(child);
    }
    if (child.name === 'PianoBench') {
      toRemove.push(child);
    }
  });
  toRemove.forEach((obj) => obj.parent?.remove(obj));

  // ── Get local-space bounds from the PianoBody geometry ──
  let pianoBody = null;
  group.traverse((child) => {
    if (child.name === 'PianoBody') pianoBody = child;
  });
  if (!pianoBody) return;

  pianoBody.geometry.computeBoundingBox();
  const geoBox = pianoBody.geometry.boundingBox;
  const cx = (geoBox.min.x + geoBox.max.x) / 2;
  const bottomY = geoBox.min.y;
  const frontZ = geoBox.max.z;
  const keyboardY = bottomY + 0.22;

  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.6, metalness: 0.1 });

  const keyboardWidth = 0.62;
  const keyboardDepth = 0.07;
  const keyboardHeight = 0.02;
  const numWhiteKeys = NOTE_NAMES.length; // 14
  const whiteKeyWidth = keyboardWidth / numWhiteKeys;
  const startX = cx - keyboardWidth / 2 + whiteKeyWidth / 2;

  const whiteKeyMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.3 });
  const blackKeyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });

  // ── Individual white keys ──
  for (let i = 0; i < numWhiteKeys; i++) {
    const note = NOTE_NAMES[i];
    const geo = new THREE.BoxGeometry(whiteKeyWidth - 0.002, keyboardHeight, keyboardDepth);
    const mat = whiteKeyMat.clone();
    pianoKeyMats.push(mat);
    const key = new THREE.Mesh(geo, mat);
    key.position.set(startX + i * whiteKeyWidth, keyboardY, frontZ + keyboardDepth / 2 - 0.005);
    key.castShadow = true;
    key.receiveShadow = true;
    key.name = `PianoKey_${note}`;
    key.userData = { note, freq: NOTE_FREQ[note], keyType: 'white', restY: keyboardY };
    group.add(key);
    pianoKeys.push(key);
  }

  // ── Individual black keys ──
  for (let octave = 0; octave < 2; octave++) {
    for (let bi = 0; bi < BLACK_OFFSETS.length; bi++) {
      const whiteIdx = octave * 7 + BLACK_OFFSETS[bi];
      const note = BLACK_NOTE_NAMES[octave * 5 + bi];
      const geo = new THREE.BoxGeometry(whiteKeyWidth * 0.6, keyboardHeight * 1.3, keyboardDepth * 0.45);
      const mat = blackKeyMat.clone();
      pianoKeyMats.push(mat);
      const key = new THREE.Mesh(geo, mat);
      key.position.set(
        startX + (whiteIdx + 0.5) * whiteKeyWidth,
        keyboardY + 0.012,
        frontZ + keyboardDepth * 0.2,
      );
      key.castShadow = true;
      key.name = `PianoKey_${note}`;
      key.userData = { note, freq: NOTE_FREQ[note], keyType: 'black', restY: keyboardY + 0.012 };
      group.add(key);
      pianoKeys.push(key);
    }
  }

  // Keyboard shelf (dark wood lip under the keys)
  const shelfGeo = new THREE.BoxGeometry(keyboardWidth + 0.04, 0.015, keyboardDepth + 0.015);
  const shelf = new THREE.Mesh(shelfGeo, darkWood);
  shelf.position.set(cx, keyboardY - 0.018, frontZ + keyboardDepth / 2 - 0.005);
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  group.add(shelf);

  // ── Front panel below keyboard (closes gap to floor) ──
  const panelHeight = keyboardY - 0.018 - 0.015 / 2;  // from floor to bottom of shelf
  const panelGeo = new THREE.BoxGeometry(keyboardWidth + 0.04, panelHeight, 0.02);
  const panel = new THREE.Mesh(panelGeo, darkWood);
  panel.position.set(cx, panelHeight / 2, frontZ + 0.01);
  panel.castShadow = true;
  panel.receiveShadow = true;
  group.add(panel);

  // ── Solid bench ──
  const benchGroup = new THREE.Group();
  benchGroup.name = 'PianoBench';

  const seatWidth = 0.45;
  const seatDepth = 0.20;
  const seatThick = 0.04;
  const seatHeight = 0.30;
  const legRadius = 0.015;
  const legHeight = seatHeight - seatThick / 2;

  // Cushion top
  const seatGeo = new THREE.BoxGeometry(seatWidth, seatThick, seatDepth);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x8b2232, roughness: 0.5 });
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.y = seatHeight;
  seat.castShadow = true;
  seat.receiveShadow = true;
  benchGroup.add(seat);

  // Wood frame under cushion
  const frameGeo = new THREE.BoxGeometry(seatWidth + 0.02, seatThick * 0.4, seatDepth + 0.02);
  const frame = new THREE.Mesh(frameGeo, darkWood);
  frame.position.y = seatHeight - seatThick * 0.5;
  frame.castShadow = true;
  benchGroup.add(frame);

  // Four legs
  const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
  const legOffsets = [
    [-seatWidth / 2 + 0.03, -seatDepth / 2 + 0.03],
    [seatWidth / 2 - 0.03, -seatDepth / 2 + 0.03],
    [-seatWidth / 2 + 0.03, seatDepth / 2 - 0.03],
    [seatWidth / 2 - 0.03, seatDepth / 2 - 0.03],
  ];
  legOffsets.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, darkWood);
    leg.position.set(lx, legHeight / 2, lz);
    leg.castShadow = true;
    benchGroup.add(leg);
  });

  // Position bench in front of the piano, close to keyboard
  benchGroup.position.set(cx, 0, frontZ + 0.35);
  group.add(benchGroup);
}

/**
 * Post-process the controller GLB: the ControllerBody primitive contains
 * multiple disconnected triangle islands — the main body plus two floating
 * bumper-shaped chunks that sit above it in space. Identify connected
 * components by welding coincident vertices, then drop every component
 * except the largest (the actual body).
 */
function fixController(group) {
  let body = null;
  group.traverse((child) => {
    if (child.isMesh && child.material && child.material.name === 'ControllerBody') {
      body = child;
    }
  });
  if (!body) return;

  const geo = body.geometry;
  const posAttr = geo.attributes.position;
  if (!posAttr) return;
  const nVerts = posAttr.count;

  // Union-Find over vertex indices
  const parent = new Int32Array(nVerts);
  for (let i = 0; i < nVerts; i++) parent[i] = i;
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Weld vertices that share the same position (common in GLB exports where
  // triangle corners are duplicated even though they occupy the same point).
  const posMap = new Map();
  for (let i = 0; i < nVerts; i++) {
    const kx = Math.round(posAttr.getX(i) * 1e5);
    const ky = Math.round(posAttr.getY(i) * 1e5);
    const kz = Math.round(posAttr.getZ(i) * 1e5);
    const key = `${kx},${ky},${kz}`;
    const existing = posMap.get(key);
    if (existing !== undefined) union(i, existing);
    else posMap.set(key, i);
  }

  // Then union vertices that share a triangle.
  const index = geo.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      union(a, b);
      union(b, c);
    }
  } else {
    for (let i = 0; i < nVerts; i += 3) {
      union(i, i + 1);
      union(i + 1, i + 2);
    }
  }

  // Count component sizes.
  const counts = new Map();
  for (let i = 0; i < nVerts; i++) {
    const r = find(i);
    counts.set(r, (counts.get(r) || 0) + 1);
  }

  // Keep only the biggest component (the main body).
  let mainRoot = -1;
  let mainCount = -1;
  for (const [r, c] of counts) {
    if (c > mainCount) { mainCount = c; mainRoot = r; }
  }
  if (counts.size <= 1) return; // nothing to trim

  // Rebuild index skipping any triangle with a vertex outside the main component.
  if (index) {
    const kept = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      if (find(a) === mainRoot && find(b) === mainRoot && find(c) === mainRoot) {
        kept.push(a, b, c);
      }
    }
    geo.setIndex(kept);
  } else {
    // Non-indexed: build a fresh position buffer from the surviving triangles.
    const srcPos = posAttr.array;
    const itemSize = posAttr.itemSize;
    const normalAttr = geo.attributes.normal;
    const uvAttr = geo.attributes.uv;
    const newPos = [];
    const newNormal = [];
    const newUv = [];
    for (let i = 0; i < nVerts; i += 3) {
      if (find(i) !== mainRoot) continue;
      for (let k = 0; k < 3; k++) {
        const vi = i + k;
        newPos.push(srcPos[vi * itemSize + 0], srcPos[vi * itemSize + 1], srcPos[vi * itemSize + 2]);
        if (normalAttr) {
          newNormal.push(normalAttr.getX(vi), normalAttr.getY(vi), normalAttr.getZ(vi));
        }
        if (uvAttr) {
          newUv.push(uvAttr.getX(vi), uvAttr.getY(vi));
        }
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
    if (normalAttr) geo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormal, 3));
    if (uvAttr) geo.setAttribute('uv', new THREE.Float32BufferAttribute(newUv, 2));
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

function createMicShelf(scene) {
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.6, metalness: 0.1 });

  const shelfGroup = new THREE.Group();
  shelfGroup.name = 'MicShelf';

  // Shelf plate
  const plateGeo = new THREE.BoxGeometry(0.28, 0.02, 0.18);
  const plate = new THREE.Mesh(plateGeo, darkWood);
  plate.castShadow = true;
  plate.receiveShadow = true;
  shelfGroup.add(plate);

  // Two L-bracket supports
  const bracketGeo = new THREE.BoxGeometry(0.02, 0.07, 0.13);
  const leftBracket = new THREE.Mesh(bracketGeo, darkWood);
  leftBracket.position.set(-0.1, -0.045, 0.0);
  leftBracket.castShadow = true;
  shelfGroup.add(leftBracket);

  const rightBracket = new THREE.Mesh(bracketGeo, darkWood);
  rightBracket.position.set(0.1, -0.045, 0.0);
  rightBracket.castShadow = true;
  shelfGroup.add(rightBracket);

  // Position on back wall, just below the mic at [0.5, 0.85, -2.1]
  shelfGroup.position.set(0.5, 0.74, -2.1);

  scene.add(shelfGroup);
}

function createCoachNotebook(scene) {
  const group = new THREE.Group();
  group.name = 'CoachNotebook';

  // DIAGNOSTIC: oversized + bright red so we can confirm the object is reaching the scene.
  // Once visibility is confirmed, dial back to a proper notebook look.
  const coverMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.0, emissive: 0x441111, emissiveIntensity: 0.3 });
  const coverGeo = new THREE.BoxGeometry(0.32, 0.04, 0.44);

  const frontCover = new THREE.Mesh(coverGeo, coverMat);
  frontCover.position.y = 0.10;
  frontCover.castShadow = true;
  frontCover.receiveShadow = true;
  group.add(frontCover);

  const backCover = new THREE.Mesh(coverGeo, coverMat);
  backCover.position.y = 0.02;
  backCover.castShadow = true;
  backCover.receiveShadow = true;
  group.add(backCover);

  // Pages — off-white, slightly inset between covers
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xf3ebd9, roughness: 0.9, metalness: 0.0 });
  const pageGeo = new THREE.BoxGeometry(0.30, 0.04, 0.42);
  const pages = new THREE.Mesh(pageGeo, pageMat);
  pages.position.y = 0.06;
  pages.castShadow = true;
  pages.receiveShadow = true;
  group.add(pages);

  // Spiral binding suggested as a flat metallic strip along one short edge
  const bindingMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.4, metalness: 0.7 });
  const bindingGeo = new THREE.BoxGeometry(0.024, 0.06, 0.42);
  const binding = new THREE.Mesh(bindingGeo, bindingMat);
  binding.position.set(0.16, 0.06, 0);
  binding.castShadow = true;
  binding.receiveShadow = true;
  group.add(binding);

  // Diagnostic placement: more toward room center so it can't hide behind nearby geometry.
  group.position.set(-0.4, 0.05, 0.8);
  group.rotation.set(0, 0.26, 0);

  scene.add(group);
}

function createBibleShelf(scene) {
  // Small wall shelf directly below the cross, with a Bible resting on top.
  // Cross sits at [-0.5, 2.2, -2.45] facing the room.

  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.6, metalness: 0.1 });

  const shelfGroup = new THREE.Group();
  shelfGroup.name = 'BibleShelf';

  // Shelf plate
  const plateGeo = new THREE.BoxGeometry(0.30, 0.02, 0.18);
  const plate = new THREE.Mesh(plateGeo, darkWood);
  plate.castShadow = true;
  plate.receiveShadow = true;
  shelfGroup.add(plate);

  // Two L-bracket supports under the shelf
  const bracketGeo = new THREE.BoxGeometry(0.02, 0.07, 0.13);
  const leftBracket = new THREE.Mesh(bracketGeo, darkWood);
  leftBracket.position.set(-0.11, -0.045, 0.0);
  leftBracket.castShadow = true;
  shelfGroup.add(leftBracket);

  const rightBracket = new THREE.Mesh(bracketGeo, darkWood);
  rightBracket.position.set(0.11, -0.045, 0.0);
  rightBracket.castShadow = true;
  shelfGroup.add(rightBracket);

  // ── Bible on top of the shelf ──
  const bible = new THREE.Group();
  bible.name = 'Bible';

  // Realistic Bible proportions (~6"w x 9"h x 1.5"thick) lying flat
  const bibleW = 0.15;   // x
  const bibleH = 0.04;   // y (thickness when laid flat)
  const bibleD = 0.22;   // z (height of book when standing — depth when flat)

  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x2a1810,
    roughness: 0.55,
    metalness: 0.05,
  });
  const pageMat = new THREE.MeshStandardMaterial({
    color: 0xf5ecd5,
    roughness: 0.9,
    metalness: 0.0,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc9a23a,
    roughness: 0.35,
    metalness: 0.85,
  });

  // Cover (slightly larger than pages so pages are inset)
  const coverGeo = new THREE.BoxGeometry(bibleW, bibleH, bibleD);
  const cover = new THREE.Mesh(coverGeo, leatherMat);
  cover.castShadow = true;
  cover.receiveShadow = true;
  bible.add(cover);

  // Pages (slightly inset on three exposed sides)
  const pagesGeo = new THREE.BoxGeometry(bibleW - 0.012, bibleH - 0.006, bibleD - 0.012);
  const pages = new THREE.Mesh(pagesGeo, pageMat);
  pages.castShadow = true;
  pages.receiveShadow = true;
  bible.add(pages);

  // Gold cross on the front cover (top face)
  const crossVert = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.003, 0.06),
    goldMat,
  );
  crossVert.position.set(0, bibleH / 2 + 0.0015, 0);
  bible.add(crossVert);

  const crossHoriz = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.003, 0.012),
    goldMat,
  );
  crossHoriz.position.set(0, bibleH / 2 + 0.0015, -0.012);
  bible.add(crossHoriz);

  // Gold ribbon bookmark hanging out the bottom
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: 0x8b1a1a,
    roughness: 0.6,
    metalness: 0.1,
  });
  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.001, 0.05),
    ribbonMat,
  );
  ribbon.position.set(0.03, -bibleH / 2 + 0.0005, bibleD / 2 + 0.02);
  bible.add(ribbon);

  // Place Bible on top of the shelf, slight rotation for natural look
  bible.position.set(0, 0.01 + bibleH / 2, 0);
  bible.rotation.y = 0.18;
  shelfGroup.add(bible);

  // Position the whole shelf on the back wall, centered under the cross
  // Cross is at [-0.5, 2.2, -2.45]. Put shelf well below it at y=1.55.
  shelfGroup.position.set(-0.5, 1.55, -2.4);

  scene.add(shelfGroup);
}

function createOrbShelf(scene) {
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.6, metalness: 0.1 });

  const shelfGroup = new THREE.Group();
  shelfGroup.name = 'OrbShelf';

  // Shelf plate
  const plateGeo = new THREE.BoxGeometry(0.35, 0.02, 0.2);
  const plate = new THREE.Mesh(plateGeo, darkWood);
  plate.castShadow = true;
  plate.receiveShadow = true;
  shelfGroup.add(plate);

  // Two L-bracket supports
  const bracketGeo = new THREE.BoxGeometry(0.02, 0.08, 0.15);
  const leftBracket = new THREE.Mesh(bracketGeo, darkWood);
  leftBracket.position.set(-0.12, -0.05, 0.0);
  leftBracket.castShadow = true;
  shelfGroup.add(leftBracket);

  const rightBracket = new THREE.Mesh(bracketGeo, darkWood);
  rightBracket.position.set(0.12, -0.05, 0.0);
  rightBracket.castShadow = true;
  shelfGroup.add(rightBracket);

  // Position on left wall
  shelfGroup.position.set(-2.3, 1.4, 0.6);

  scene.add(shelfGroup);
}

export async function addRoomObjects(scene) {
  const loader = new GLTFLoader();

  const promises = OBJECTS.map(async (obj) => {
    try {
      const gltf = await loader.loadAsync(obj.path);
      const group = gltf.scene;

      group.name = obj.name;
      group.position.set(...obj.position);
      group.scale.set(...obj.scale);
      group.rotation.set(...obj.rotation);

      if (obj.name === 'Piano') {
        fixPiano(group);
      } else if (obj.name === 'Controller') {
        fixController(group);
      }

      group.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      scene.add(group);
    } catch (err) {
      console.error(`Failed to load ${obj.name}:`, err);
    }
  });

  await Promise.all(promises);

  createMicShelf(scene);
  createOrbShelf(scene);
  createCoachNotebook(scene);
  createBibleShelf(scene);
}
