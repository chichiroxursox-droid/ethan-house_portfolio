import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { windUniforms } from './wind.js';
import { getTerrainHeight } from './environment.js';

// Instanced grass meadow — one draw call.
// Clump = two crossed quads, base at y=0, unit height (instance scale sets size).
// Sway shader math adapted from Braffolk/fable5-world-demo `render/Wind.ts` (MIT):
// cantilever bend ∝ height², lean ∝ strength², fixed per-instance frequency
// with gust-driven amplitude.

const COUNT = 25000;

// Deterministic placement (same field every load)
let seed = 1337;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

export function initGrass(scene) {
  // ── Clump geometry ──
  const p1 = new THREE.PlaneGeometry(0.16, 1.0, 1, 2);
  p1.translate(0, 0.5, 0); // base at y=0, tip at y=1
  const p2 = p1.clone();
  p2.rotateY(Math.PI / 2);
  const geo = mergeGeometries([p1, p2]);
  p1.dispose();
  p2.dispose();

  const phases = new Float32Array(COUNT);
  const tints = new Float32Array(COUNT);

  // ── Material with wind sway + base→tip gradient ──
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindDir = windUniforms.uWindDir;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uBaseColor = { value: new THREE.Color(0x2e4a1e) };
    shader.uniforms.uTipColor = { value: new THREE.Color(0x7a9a40) };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPhase;
        attribute float aTint;
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        varying float vGrassH;
        varying float vTint;`
      )
      .replace(
        '#include <project_vertex>',
        `vGrassH = clamp(transformed.y, 0.0, 1.0);
        vTint = aTint;
        vec4 wPos = instanceMatrix * vec4(transformed, 1.0);
        float bend = vGrassH * vGrassH;                       // cantilever: tips move, roots don't
        float freq = 1.2 + fract(aPhase * 7.13) * 1.4;        // fixed per-instance frequency
        float sway = sin(uTime * freq + aPhase * 6.28318);    // gusts scale amplitude below, never freq
        float amp = bend * (uWindStrength * uWindStrength * 0.18 + uWindStrength * 0.08 * sway);
        wPos.x += uWindDir.x * amp;
        wPos.z += uWindDir.y * amp;
        vec4 mvPosition = modelViewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vGrassH;
        varying float vTint;
        uniform vec3 uBaseColor;
        uniform vec3 uTipColor;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(uBaseColor, uTipColor, vGrassH) * (0.85 + 0.3 * vTint);`
      );
  };

  // ── Scatter instances ──
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();

  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard < COUNT * 4) {
    guard++;
    const angle = rnd() * Math.PI * 2;
    // pow-bias density toward the house where the camera spends time
    const radius = 2.2 + Math.pow(rnd(), 1.4) * 22;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // Skip dirt path + walkway strip
    if (Math.abs(x) < 1.1 && z > 0.8 && z < 8.5) continue;
    // Skip house footprint
    if (x > -3.2 && x < 3.2 && z > -3.5 && z < 1.2) continue;

    pos.set(x, getTerrainHeight(x, z), z);
    quat.setFromAxisAngle(up, rnd() * Math.PI * 2);
    const w = 0.8 + rnd() * 0.4;
    scl.set(w, 0.16 + rnd() * 0.16, w); // blades 16–32 cm
    m.compose(pos, quat, scl);
    mesh.setMatrixAt(placed, m);
    phases[placed] = rnd();
    tints[placed] = rnd();
    placed++;
  }
  // If exclusion zones rejected some attempts, park leftover instances underground
  for (let i = placed; i < COUNT; i++) {
    m.makeTranslation(0, -10, 0);
    mesh.setMatrixAt(i, m);
  }

  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1));

  mesh.name = 'GrassMeadow';
  // Raycasting an InstancedMesh tests every instance — 25k hits per ray would
  // tank explore-mode picking. Grass is scenery, never a target: opt out entirely.
  mesh.raycast = () => {};
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}
