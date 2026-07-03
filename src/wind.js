import * as THREE from 'three';

// Shared wind state — one set of uniform objects referenced by every swaying
// material (grass shader) and by the JS-side canopy/flower sway.
//
// Recipe adapted from Braffolk/fable5-world-demo `render/Wind.ts` (MIT):
//  - mean lean scales with strength² (cantilever)
//  - each instance sways at a FIXED natural frequency; gusts drive AMPLITUDE,
//    never frequency (time × varying-frequency phase-explodes into jitter)
//  - gusts = two layered sine octaves (slow fronts + fast detail)

export const windUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindStrength: { value: 0 },
};

// Live-tunable via the debug pane
export const windParams = { strength: 0.7, speed: 1.0 };

export function updateWind(elapsed) {
  const t = elapsed * windParams.speed;
  // Slow gust fronts + fast detail, floored so there's always a light breeze
  const gust =
    0.6 +
    0.3 * Math.sin(t * 0.35 + Math.sin(t * 0.13) * 1.7) +
    0.1 * Math.sin(t * 1.7 + 2.1);
  windUniforms.uTime.value = t;
  windUniforms.uWindStrength.value = Math.max(0, gust) * windParams.strength;
}

export function getWindStrength() {
  return windUniforms.uWindStrength.value;
}
