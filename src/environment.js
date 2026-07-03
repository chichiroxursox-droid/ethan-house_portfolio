import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ── Noise helpers ──

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function terrainHeight(x, z) {
  return smoothNoise(x * 0.08, z * 0.08) * 0.6
       + smoothNoise(x * 0.15, z * 0.15) * 0.3
       + smoothNoise(x * 0.3, z * 0.3) * 0.1;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// World-space ground height (flat near the house, rolling hills outside).
// Exported so grass/props placed by other modules sit on the same surface.
export function getTerrainHeight(x, z) {
  const dist = Math.sqrt(x * x + z * z);
  const flatZone = smoothstep(4, 7, dist);
  return terrainHeight(x, z) * 0.8 * flatZone;
}

// ── Seeded random for deterministic prop placement ──

let seed = 42;
function seededRandom() {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}

const PALETTE = { grass: 0x4a6a2a, dirt: 0x6a5a40, canopy: 0x3d6a2d };

// Swaying scenery collected at build time, animated in updateEnvironment()
const swayTargets = []; // { obj, phase, freq, amp }

// ── Main ──

export function initEnvironment(scene) {
  createTerrain(scene, PALETTE);
  createTrees(scene, PALETTE);
  createWalkway(scene);
  createRocks(scene);
  createFlowers(scene);
}

// ── Terrain ──

function createTerrain(scene, palette) {
  const groundGeo = new THREE.PlaneGeometry(60, 60, 256, 256);
  const positions = groundGeo.attributes.position.array;
  const vertexCount = positions.length / 3;

  const grassColor = new THREE.Color(palette.grass);
  const dirtColor  = new THREE.Color(palette.dirt);
  const colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const localX = positions[i * 3];
    const localY = positions[i * 3 + 1];
    // After mesh rotation.x = -PI/2: worldX = localX, worldZ = -localY
    const worldX = localX;
    const worldZ = -localY;

    // Displacement: flat zone near house, rolling hills outside
    const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
    const flatZone = smoothstep(4, 7, dist);
    const height = terrainHeight(worldX, worldZ) * 0.8 * flatZone;
    positions[i * 3 + 2] = height; // localZ → worldY after rotation

    // Vertex color: grass base, dirt path along walkway
    const pathDist = Math.abs(worldX);
    const onPathStrip = worldZ > 1 && worldZ < 8;
    const pathBlend = onPathStrip ? smoothstep(0.8, 0.2, pathDist) : 0;

    const r = grassColor.r + (dirtColor.r - grassColor.r) * pathBlend;
    const g = grassColor.g + (dirtColor.g - grassColor.g) * pathBlend;
    const b = grassColor.b + (dirtColor.b - grassColor.b) * pathBlend;
    colors[i * 3]     = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.0,
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// ── Trees ──

function createTrees(scene, palette) {
  const treePositions = [
    [-4, 3],
    [4, 3],
    [-5, -2],
    [5, -1],
    [-3, -4],
    [4, -4],
    [-6, 1],
    [6, 0],
  ];

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.5, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 });

  for (const [x, z] of treePositions) {
    const tree = createTree(palette, trunkGeo, trunkMat);
    tree.position.set(x, getTerrainHeight(x, z), z);
    const s = 0.7 + seededRandom() * 0.6;
    tree.scale.set(s, s, s);
    scene.add(tree);
  }
}

function createTree(palette, trunkGeo, trunkMat) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  group.add(trunk);

  // Canopy: 3 overlapping blobs merged into one geometry (kills the lollipop
  // silhouette without extra draw calls), slight per-tree hue jitter.
  const b1 = new THREE.SphereGeometry(0.8, 8, 6);
  b1.translate(0, 2.0, 0);
  const b2 = new THREE.SphereGeometry(0.55, 8, 6);
  b2.translate(0.45, 1.75, 0.28);
  const b3 = new THREE.SphereGeometry(0.5, 8, 6);
  b3.translate(-0.42, 1.85, -0.22);
  const canopyGeo = mergeGeometries([b1, b2, b3]);
  b1.dispose(); b2.dispose(); b3.dispose();

  const canopyMat = new THREE.MeshStandardMaterial({ color: palette.canopy, roughness: 0.85 });
  canopyMat.color.offsetHSL(
    (seededRandom() - 0.5) * 0.05,
    (seededRandom() - 0.5) * 0.12,
    (seededRandom() - 0.5) * 0.06,
  );
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.castShadow = true;
  group.add(canopy);

  // Whole-crown sway: rotating about the group base reads as trunk flex
  swayTargets.push({
    obj: canopy,
    phase: seededRandom() * Math.PI * 2,
    freq: 0.5 + seededRandom() * 0.3, // fixed per-tree frequency
    amp: 0.018,
  });

  return group;
}

// ── Walkway ──

function createWalkway(scene) {
  const walkGeo = new THREE.BoxGeometry(1.2, 0.05, 3);
  const walkMat = new THREE.MeshStandardMaterial({
    color: 0x6a6560,
    roughness: 0.95,
  });
  const walkway = new THREE.Mesh(walkGeo, walkMat);
  walkway.position.set(0, 0.025, 2.5 + 1.5 + 1.0);
  walkway.receiveShadow = true;
  scene.add(walkway);
}

// ── Decorative rocks ──

function createRocks(scene) {
  const rockGeo = new THREE.DodecahedronGeometry(0.15, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x888880,
    roughness: 0.95,
    metalness: 0.0,
  });

  for (let i = 0; i < 15; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const radius = 6 + seededRandom() * 8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = getTerrainHeight(x, z);

    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, y + 0.05, z);
    rock.rotation.set(
      seededRandom() * Math.PI,
      seededRandom() * Math.PI,
      seededRandom() * Math.PI,
    );
    const s = 0.5 + seededRandom() * 1.0;
    rock.scale.set(s, s * 0.5, s); // flatten on Y
    rock.receiveShadow = true;
    scene.add(rock);
  }
}

// ── Decorative flowers ──

function createFlowers(scene) {
  const petalColors = [0xFFDD44, 0xFF9944, 0xFFAAAA];
  const petalMats = petalColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.8 });

  for (let i = 0; i < 10; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const radius = 5 + seededRandom() * 9;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = getTerrainHeight(x, z);

    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.3, 4);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.15;
    group.add(stem);

    // Petals — small cone on top
    const petalMat = petalMats[i % petalMats.length];
    const petalGeo = new THREE.ConeGeometry(0.06, 0.08, 5);
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.y = 0.34;
    petal.rotation.x = Math.PI; // flip upside down for flower shape
    group.add(petal);

    // Random rotation around Y
    group.rotation.y = seededRandom() * Math.PI * 2;

    // Flowers bob a little more than tree crowns
    swayTargets.push({
      obj: group,
      phase: seededRandom() * Math.PI * 2,
      freq: 0.9 + seededRandom() * 0.5,
      amp: 0.05,
    });

    scene.add(group);
  }
}

// ── Per-frame sway (8 canopies + 10 flowers — trivial JS cost) ──
// Fixed per-object frequency; wind strength drives amplitude only.
export function updateEnvironment(elapsed, windStrength) {
  for (const t of swayTargets) {
    const a = t.amp * windStrength;
    t.obj.rotation.z = Math.sin(elapsed * t.freq + t.phase) * a;
    t.obj.rotation.x = Math.sin(elapsed * t.freq * 0.83 + t.phase * 1.7) * a * 0.6;
  }
}
