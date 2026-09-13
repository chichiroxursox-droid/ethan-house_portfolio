import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// Minimal post chain: render → output (tone map + sRGB) → golden-hour grade → bloom → FXAA.
// Grade recipe (teal shadows / warm highlights before tone mapping) adapted from
// Braffolk/fable5-world-demo render/ColorScript.ts + PostStack.ts (MIT).
//
// Kill switches: ?nopost=1 URL param skips creation entirely; the debug pane's
// PostFX.enabled toggle falls back to plain renderer.render() at runtime.

export const postState = {
  enabled: true,
  bloomStrength: 0.2,
  bloomRadius: 0.4,
  // Display-space threshold. The interior's cream walls sit ~0.85-0.9 —
  // anything lower blooms entire wall surfaces into white pools.
  bloomThreshold: 0.93,
  tintStrength: 0.12,
  saturation: 1.08,
  contrast: 1.04,
  vignette: 0.28,
};
// Live-tuning hook (debug pane binds these too; user has no DevTools)
if (typeof window !== 'undefined') window.__postState = postState;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShadowTint: { value: new THREE.Color(0x9fb8c4) },    // toward teal
    uHighlightTint: { value: new THREE.Color(0xffd9a0) }, // toward warm orange
    uTintStrength: { value: postState.tintStrength },
    uSaturation: { value: postState.saturation },
    uContrast: { value: postState.contrast },
    uVignette: { value: postState.vignette },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uTintStrength;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));

      // Split toning: shadows cool, highlights warm (display-space luminance)
      float sh = 1.0 - smoothstep(0.0, 0.45, l);
      float hi = smoothstep(0.55, 0.95, l);
      c.rgb = mix(c.rgb, c.rgb * uShadowTint, sh * uTintStrength);
      c.rgb = mix(c.rgb, c.rgb * uHighlightTint, hi * uTintStrength);

      // Saturation, then gentle contrast around linear mid-grey
      c.rgb = mix(vec3(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722))), c.rgb, uSaturation);
      c.rgb = max((c.rgb - 0.18) * uContrast + 0.18, 0.0);

      // Vignette — darkens the frame perimeter, aspect-weighted radial falloff
      float vd = distance(vUv, vec2(0.5)) * 1.15;
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.78, vd);

      gl_FragColor = c;
    }
  `,
};

let composer = null;
let bloomPass = null;
let gradePass = null;
let fxaaPass = null;
let pixelRatio = 1;

export function initPostFX(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  // Cap composer resolution at 1.5x — at DPR 2 the HalfFloat ping-pong targets
  // cost ~95MB + full-res passes; 1.5x cuts pixel count ~44% for slight softness.
  const pr = Math.min(renderer.getPixelRatio(), 1.5);
  pixelRatio = pr;
  // No MSAA here: EffectComposer clones this target for its ping-pong pair, so
  // `samples` would make every fullscreen pass (output, grade, bloom) render into
  // a 4x target and resolve it — ~4 extra full-res HalfFloat resolves per frame
  // for passes that draw a single quad. Edges are handled by the FXAA pass below.
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType,
  });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(size.x, size.y);

  composer.addPass(new RenderPass(scene, camera));

  // Tone mapping (ACESFilmic + per-state exposure) + sRGB conversion FIRST.
  // Both grade and bloom must run in display space: in pre-tonemap linear HDR
  // nearly every pixel reads as a "highlight" (l > 1), so the split-tone smears
  // the whole frame and any bloom threshold catches the entire scene.
  composer.addPass(new OutputPass());

  // Split-tone grade on display-space values (l is 0..1 here as designed)
  gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);

  // Bloom in display space — threshold 0.85 means "near-white pixels only"
  // (sun disc, lamp, fireflies), not "most of the sky".
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    postState.bloomStrength,
    postState.bloomRadius,
    postState.bloomThreshold,
  );
  composer.addPass(bloomPass);

  // Final pass to screen: FXAA on the finished display-space image (it wants
  // sRGB luma, which is exactly what we have here). Bloom must NOT be the last
  // pass: its render-to-screen path draws the base image through a
  // MeshBasicMaterial, which re-applies ACES tone mapping + sRGB encode to the
  // already-encoded buffer — double transform = washed-out pale frame. FXAA is a
  // raw ShaderMaterial, so the renderer applies no implicit transforms.
  // ponytail: FXAA over MSAA — if edges read too soft, give the RenderPass its
  // own 4x target and copy into the (non-MSAA) composer chain.
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms.resolution.value.set(1 / (size.x * pr), 1 / (size.y * pr));
  composer.addPass(fxaaPass);
}

export function renderPost() {
  if (!composer || !postState.enabled) return false;
  bloomPass.strength = postState.bloomStrength;
  bloomPass.radius = postState.bloomRadius;
  bloomPass.threshold = postState.bloomThreshold;
  gradePass.uniforms.uTintStrength.value = postState.tintStrength;
  gradePass.uniforms.uSaturation.value = postState.saturation;
  gradePass.uniforms.uContrast.value = postState.contrast;
  gradePass.uniforms.uVignette.value = postState.vignette;
  composer.render();
  return true;
}

export function setPostSize(w, h) {
  composer?.setSize(w, h);
  fxaaPass?.uniforms.resolution.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
}
