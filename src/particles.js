import * as THREE from 'three';

const BOUNDS = 12;
const MAX_HEIGHT = 4;
const BASE_SIZE = 3.0; // in screen pixels at reference distance

let points = null;
let scene = null;
let params = null;
let material = null;

// Per-particle data
let positions = null;
let baseY = null;
let phases = null;       // sinusoidal bob phase offset
let amplitudes = null;   // bob amplitude
let pulsePhases = null;  // flicker phase offset
let sizes = null;        // current size attribute
let driftX = null;
let driftZ = null;

function createParticles(count) {
  positions = new Float32Array(count * 3);
  baseY = new Float32Array(count);
  phases = new Float32Array(count);
  amplitudes = new Float32Array(count);
  pulsePhases = new Float32Array(count);
  sizes = new Float32Array(count);
  driftX = new Float32Array(count);
  driftZ = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * BOUNDS * 2;
    positions[i * 3 + 1] = Math.random() * MAX_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * BOUNDS * 2;

    baseY[i] = positions[i * 3 + 1];
    phases[i] = Math.random() * Math.PI * 2;
    amplitudes[i] = 0.2 + Math.random() * 0.4;
    pulsePhases[i] = Math.random() * Math.PI * 2;
    sizes[i] = BASE_SIZE;
    driftX[i] = (Math.random() - 0.5) * 0.002;
    driftZ[i] = (Math.random() - 0.5) * 0.002;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xFFDD66) },
      uOpacity: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.05, d) * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);
}

export function initParticles(_scene, _params) {
  scene = _scene;
  params = _params;
  createParticles(params.particles.count);
  return { update, rebuild, cleanup: cleanupParticles };
}

export function cleanupParticles() {
  if (points) {
    points.geometry.dispose();
    points.material.dispose();
    scene.remove(points);
    points = null;
  }
}

function rebuild(newCount) {
  if (points) {
    points.geometry.dispose();
    points.material.dispose();
    scene.remove(points);
  }
  createParticles(newCount);
}

export function update(scrollProgress) {
  if (!positions) return;

  // Fade in between progress 0.3 and 0.7
  if (scrollProgress < 0.3) {
    material.uniforms.uOpacity.value = 0;
  } else if (scrollProgress < 0.7) {
    material.uniforms.uOpacity.value = ((scrollProgress - 0.3) / 0.4) * 0.3;
  } else {
    material.uniforms.uOpacity.value = 0.3;
  }

  const time = performance.now() * 0.001;
  const count = positions.length / 3;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const iy = i * 3 + 1;
    const iz = i * 3 + 2;

    // Drift X/Z
    positions[ix] += driftX[i];
    positions[iz] += driftZ[i];

    // Sinusoidal Y bob
    positions[iy] = baseY[i] + Math.sin(time * 0.8 + phases[i]) * amplitudes[i];

    // Wrap X/Z
    if (positions[ix] > BOUNDS) positions[ix] = -BOUNDS;
    if (positions[ix] < -BOUNDS) positions[ix] = BOUNDS;
    if (positions[iz] > BOUNDS) positions[iz] = -BOUNDS;
    if (positions[iz] < -BOUNDS) positions[iz] = BOUNDS;

    // Wrap Y — reset if drifted too high or too low
    if (positions[iy] > MAX_HEIGHT + 1) {
      baseY[i] = 0;
      positions[ix] = (Math.random() - 0.5) * BOUNDS * 2;
      positions[iz] = (Math.random() - 0.5) * BOUNDS * 2;
    }
    if (positions[iy] < -0.5) {
      baseY[i] = MAX_HEIGHT * 0.5;
    }

    // Size-based flicker
    sizes[i] = BASE_SIZE * (0.3 + 0.7 * Math.abs(Math.sin(time * 1.5 + pulsePhases[i])));
  }

  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.aSize.needsUpdate = true;
}
