import * as THREE from 'three';

// ── Config ──
const POINT_COUNT = 8000;
const SPHERE_RADIUS = 0.15;
const PARTICLE_SIZE = 0.008;
const BOB_SPEED = 0.8;
const BOB_AMPLITUDE = 0.03;
const REPULSION_RADIUS = 0.2;
const REPULSION_FORCE = 0.004;
const REPULSION_MAX = 0.015;
const DRIFT_BACK = 0.015;

// ── Module state ──
let orbGroup = null;
let points = null;
let homePositions = null;
let baseY = 0;
const mouseNDC = new THREE.Vector2(0, 0);
const mouse3D = new THREE.Vector3();
const tempVec = new THREE.Vector3();

function onOrbMouseMove(e) {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

// ── Surface point sampling (ported from GLACIAL) ──

function sampleSurfacePoints(geometry, count) {
  const posAttr = geometry.getAttribute('position');
  const index = geometry.getIndex();

  const triangles = [];
  const triCount = index ? index.count / 3 : posAttr.count / 3;

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  let totalArea = 0;

  for (let t = 0; t < triCount; t++) {
    let i0, i1, i2;
    if (index) {
      i0 = index.getX(t * 3);
      i1 = index.getX(t * 3 + 1);
      i2 = index.getX(t * 3 + 2);
    } else {
      i0 = t * 3;
      i1 = t * 3 + 1;
      i2 = t * 3 + 2;
    }

    vA.fromBufferAttribute(posAttr, i0);
    vB.fromBufferAttribute(posAttr, i1);
    vC.fromBufferAttribute(posAttr, i2);

    ab.subVectors(vB, vA);
    ac.subVectors(vC, vA);
    const area = ab.cross(ac).length() * 0.5;

    triangles.push({ a: vA.clone(), b: vB.clone(), c: vC.clone(), area });
    totalArea += area;
  }

  // Cumulative distribution for area-weighted sampling
  const cdf = [];
  let cumulative = 0;
  for (let t = 0; t < triangles.length; t++) {
    cumulative += triangles[t].area / totalArea;
    cdf.push(cumulative);
  }

  // Sample points
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let ti = 0;
    for (let j = 0; j < cdf.length; j++) {
      if (r <= cdf[j]) { ti = j; break; }
    }
    const tri = triangles[ti];

    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;

    pts[i * 3]     = tri.a.x * w + tri.b.x * u + tri.c.x * v;
    pts[i * 3 + 1] = tri.a.y * w + tri.b.y * u + tri.c.y * v;
    pts[i * 3 + 2] = tri.a.z * w + tri.b.z * u + tri.c.z * v;
  }

  return pts;
}

// ── Create ──

export function createParticleOrb(scene) {
  // Sample points on a sphere surface
  const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 32, 32);
  const sampled = sampleSurfacePoints(sphereGeo, POINT_COUNT);
  sphereGeo.dispose();

  // Store home positions for drift-back
  homePositions = new Float32Array(sampled.length);
  homePositions.set(sampled);

  // Particle cloud
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(sampled, 3));

  const material = new THREE.PointsMaterial({
    color: 0x3388ff,
    size: PARTICLE_SIZE,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    sizeAttenuation: true,
  });

  points = new THREE.Points(geometry, material);

  // Invisible hitbox for raycasting (THREE.Points doesn't respond to raycasts)
  const hitboxGeo = new THREE.SphereGeometry(SPHERE_RADIUS * 1.2, 16, 16);
  const hitboxMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });
  const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
  hitbox.name = 'ParticleOrbHitbox';

  // Group — contains particles + hitbox, bobs together
  orbGroup = new THREE.Group();
  orbGroup.name = 'ParticleOrb';
  orbGroup.add(points);
  orbGroup.add(hitbox);

  // Position above the shelf on the left wall
  baseY = 1.55;
  orbGroup.position.set(-2.3, baseY, 0.6);

  scene.add(orbGroup);

  // Track mouse NDC (always active, cheap)
  document.removeEventListener('mousemove', onOrbMouseMove);
  document.addEventListener('mousemove', onOrbMouseMove);
}

// ── Update (called every frame from main.js) ──

export function updateParticleOrb(elapsed, camera, isFocused) {
  if (!orbGroup) return;

  // Bobbing
  orbGroup.position.y = baseY + Math.sin(elapsed * BOB_SPEED) * BOB_AMPLITUDE;

  // Mouse repulsion only runs while focused, but drift-back must always run
  // so the orb settles back to its home shape after the user leaves focus.
  let localMouse = null;
  if (isFocused) {
    // Project mouse NDC into 3D at the orb's depth
    mouse3D.set(mouseNDC.x, mouseNDC.y, 0.5);
    mouse3D.unproject(camera);
    const dir = mouse3D.clone().sub(camera.position).normalize();
    const dist = camera.position.distanceTo(orbGroup.position);
    mouse3D.copy(camera.position).add(dir.multiplyScalar(dist));

    // Transform to orb's local space (accounts for position + bobbing)
    const invMatrix = new THREE.Matrix4().copy(orbGroup.matrixWorld).invert();
    localMouse = mouse3D.clone().applyMatrix4(invMatrix);
    // Guard against NaN from singular matrix inversion
    if (!isFinite(localMouse.x) || !isFinite(localMouse.y) || !isFinite(localMouse.z)) {
      localMouse = null;
    }
  }

  const positions = points.geometry.attributes.position.array;
  const count = positions.length / 3;
  let anyMoved = false;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const iy = i * 3 + 1;
    const iz = i * 3 + 2;

    if (localMouse) {
      // Displacement from mouse
      tempVec.set(
        positions[ix] - localMouse.x,
        positions[iy] - localMouse.y,
        positions[iz] - localMouse.z,
      );
      const d = tempVec.length();
      if (d < REPULSION_RADIUS && d > 0.001) {
        const force = Math.min(REPULSION_MAX, REPULSION_FORCE / (d * d));
        tempVec.normalize().multiplyScalar(force);
        positions[ix] += tempVec.x;
        positions[iy] += tempVec.y;
        positions[iz] += tempVec.z;
        anyMoved = true;
      }
    }

    // Drift back toward home — skip if already at rest to save work
    const dx = homePositions[ix] - positions[ix];
    const dy = homePositions[iy] - positions[iy];
    const dz = homePositions[iz] - positions[iz];
    if (dx * dx + dy * dy + dz * dz > 1e-10) {
      positions[ix] += dx * DRIFT_BACK;
      positions[iy] += dy * DRIFT_BACK;
      positions[iz] += dz * DRIFT_BACK;
      anyMoved = true;
    }
  }

  if (anyMoved) points.geometry.attributes.position.needsUpdate = true;
}
