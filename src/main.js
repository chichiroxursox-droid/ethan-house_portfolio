import '../styles/main.css';
import * as THREE from 'three';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initDebug } from './debug.js';
import { initSky, updateSky } from './sky.js';
import { initHouse, update as updateHouse, getHouseBounds } from './house.js';
import { initEnvironment, updateEnvironment } from './environment.js';
import { initGrass } from './grass.js';
import { updateWind, getWindStrength, windParams } from './wind.js';
import { initParticles, update as updateParticles, setParticlesVisible } from './particles.js';
import { initPostFX, renderPost, setPostSize, postState } from './postfx.js';
import { initScroll, getProgress, cameraState, refreshScroll } from './scroll.js';
import { initVN, showGreeting, showMenu, hideVN, hideChoicesOnly, setExpression } from './vn.js';
import { initState, getState, transitionTo, onStateChange, STATES } from './state.js';
import { initComputer, enterComputer, exitComputer, closeGame, gameActive, repositionGameIframe } from './computer.js';
import { initExplore, enableExplore, disableExplore, updateExplore, getFocusState } from './explore.js';
import { createClock, updateClock, setClockExploring } from './clock.js';
import { initPiano } from './piano.js';
import { createParticleOrb, updateParticleOrb } from './particleOrb.js';
import { addRoomObjects } from './roomObjects.js';
import { createGallery } from './gallery.js';
import { initChat, focusChat } from './chat.js';
import {
  initAudio,
  resumeAudio,
  setOutdoorVolume,
  setIndoorVolume,
  toggleMute,
  isMuted,
} from './audio.js';

gsap.registerPlugin(ScrollTrigger);

// Force scroll to top on refresh so animation always plays from the beginning
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// ── Shared params ──
const params = {
  fog: { near: 32, far: 110 },
  light: { sunIntensity: 1.5, hemiIntensity: 0.7 },
  render: { exposure: 0.62, envIntensity: 0.38 },
  particles: { count: 400 },
  perf: { fps: 0, calls: 0 },
};

// Fog deepens toward a richer amber as the camera descends — lighter fog at
// altitude reads as bright washed edges, so the descent goes darker, not lighter
const FOG_BASE = new THREE.Color(0xE8B87A);
const FOG_WARM = new THREE.Color(0xD9A05F);

// ── Renderer ──
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xE8B87A);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r183 (console-confirmed fallback)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.render.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Manual reset so the debug pane's draw-call count covers the WHOLE frame —
// autoReset would zero the counter on every internal composer pass.
renderer.info.autoReset = false;

// ── Scene ──
const scene = new THREE.Scene();
scene.environmentIntensity = params.render.envIntensity;
// Fog color is overwritten in init() once the time-of-day preset is known.
scene.fog = new THREE.Fog(0xE8B87A, params.fog.near, params.fog.far);

// ── Camera ──
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 30, 0);
camera.lookAt(0, 0, 0);

// ── Lights ──
const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0xE8B87A, params.light.hemiIntensity);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xFFF5E0, params.light.sunIntensity);
sunLight.position.set(5, 10, 5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.left = -10;
sunLight.shadow.camera.right = 10;
sunLight.shadow.camera.top = 10;
sunLight.shadow.camera.bottom = -10;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 30;
scene.add(sunLight);

// ── Lenis smooth scroll ──
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
});
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// ── Post-processing (bloom + golden-hour grade) ──
// ?nopost=1 skips the composer entirely; debug pane can also toggle at runtime.
// Coarse-pointer devices (phones/tablets) skip it too — the bloom chain's
// bandwidth cost is 30-50% of frame time on tile-based mobile GPUs.
const noPost =
  new URLSearchParams(window.location.search).get('nopost') === '1' ||
  window.matchMedia('(pointer: coarse)').matches;
if (!noPost) initPostFX(renderer, scene, camera);

// ── Debug ──
initDebug(params);

// ── Scroll ──
// Reset scroll to top BEFORE ScrollTrigger so it doesn't read stale position
window.scrollTo(0, 0);
lenis.scrollTo(0, { immediate: true });
initScroll();
ScrollTrigger.refresh();

// ── Timer ──
const timer = new THREE.Timer();

// ── State machine ──
initState(lenis);

let hasTriggeredGreeting = false;
let startupReady = false;
setTimeout(() => { startupReady = true; }, 500);

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
if (prefersReducedMotion) windParams.strength = 0; // stills the meadow + tree sway

// ── Skip-intro fast path ──
// Lets a recruiter bypass the 6-viewport scroll via a top-right button or ?skip=1.
const skipParam = new URLSearchParams(window.location.search).get('skip') === '1';
function skipIntro() {
  if (hasTriggeredGreeting) return;
  hasTriggeredGreeting = true;
  document.getElementById('scroll-hint')?.classList.add('hidden');
  document.getElementById('skip-btn')?.classList.add('hidden');

  // Camera is wherever the scroll spline left it — usually (0, 30, 0) up in the sky
  // if the visitor never scrolled. Cinematically descend it into the room.
  const lookProxy = { x: 0, y: 1.0, z: -1.0 };
  // Capture current lookAt direction as a world-space target so the tween starts from the actual orientation.
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const startLook = camera.position.clone().add(dir.multiplyScalar(5));
  lookProxy.x = startLook.x;
  lookProxy.y = startLook.y;
  lookProxy.z = startLook.z;

  gsap.to(camera.position, {
    x: ROOM_POS.x, y: ROOM_POS.y, z: ROOM_POS.z,
    duration: 0.9, ease: 'power2.inOut',
  });
  gsap.to(lookProxy, {
    x: ROOM_LOOK.x, y: ROOM_LOOK.y, z: ROOM_LOOK.z,
    duration: 0.9, ease: 'power2.inOut',
    onUpdate: () => camera.lookAt(lookProxy.x, lookProxy.y, lookProxy.z),
  });

  transitionTo(STATES.MENU);
  showMenu();
}

// Room overview position (where camera settles after scroll)
const ROOM_POS = new THREE.Vector3(0, 1.7, -0.5);
const ROOM_LOOK = new THREE.Vector3(-1.8, 1.0, -1.5);

// Per-frame camera lerp for EXPLORING → MENU return.
// Bypasses GSAP entirely so it can't be killed or conflict with anything.
let returnLerpActive = false;

onStateChange((newState, oldState) => {
  // Disable fog when inside the house
  if (newState !== STATES.SCROLLING) {
    scene.fog.near = 100;
    scene.fog.far = 200;
    // Reduce exposure + environment intensity for interior — prevents washed-out look
    renderer.toneMappingExposure = 0.9 * 0.55;
    scene.environmentIntensity = 0.3;
  } else {
    scene.fog.near = params.fog.near;
    scene.fog.far = params.fog.far;
    renderer.toneMappingExposure = params.render.exposure;
    scene.environmentIntensity = params.render.envIntensity;
  }

  // Bloom is tuned for the outdoor descent; indoors it halos the bright sky
  // seen through the door/windows onto the walls. Damp it hard inside.
  postState.bloomStrength = newState === STATES.SCROLLING ? 0.2 : 0.05;

  // ── Audio crossfade on state change ──
  const interiorStates = [STATES.GREETING, STATES.MENU, STATES.COMPUTER, STATES.EXPLORING, STATES.ABOUT];
  if (interiorStates.includes(newState)) {
    // Entering interior — fade outdoor out, indoor in
    setOutdoorVolume(0);
    // Indoor music starts when Ethan's sprite appears (triggered in vn.js),
    // not immediately on GREETING entry
    if (newState !== STATES.GREETING) setIndoorVolume(0.15);
  } else if (newState === STATES.SCROLLING) {
    // Returning to scroll — indoor fades out, outdoor ramps with progress
    setIndoorVolume(0);
  }

  // Handle mode-specific enter/exit
  if (oldState === STATES.COMPUTER) {
    exitComputer(camera, ROOM_POS, ROOM_LOOK);
  }
  if (oldState === STATES.EXPLORING) {
    disableExplore();
    gsap.killTweensOf(camera.position);
    // Use a per-frame lerp instead of GSAP — deterministic, can't be killed.
    returnLerpActive = true;
  }

  if (newState === STATES.COMPUTER) {
    enterComputer(camera);
  }
  if (newState === STATES.EXPLORING) {
    enableExplore();
    setClockExploring(true);
  } else {
    setClockExploring(false);
  }
  if (newState === STATES.ABOUT) {
    focusChat();
    // Hide audio toggle so it doesn't block the close button
    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) audioBtn.style.display = 'none';
  } else {
    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) audioBtn.style.display = '';
  }
  if (newState === STATES.MENU) {
    showMenu();
  }
});

// ── Init modules ──
async function init() {
  const { sunPosition } = initSky(scene, renderer);
  sunLight.position.copy(sunPosition).multiplyScalar(10);

  await initHouse(scene);
  await addRoomObjects(scene);
  createGallery(scene);

  // Debug hook — exposes scene + camera + renderer for e2e tests.
  // Harmless in production; useful for verifying from outside the app.
  if (typeof window !== 'undefined') {
    window.__three = { scene, camera, renderer };
  }

  initEnvironment(scene);
  initGrass(scene, getHouseBounds());
  if (!prefersReducedMotion) initParticles(scene, params); // fireflies
  createParticleOrb(scene);
  createClock(scene);
  initComputer(scene, camera, renderer);
  initExplore(scene, camera, renderer);
  initPiano(scene, camera, renderer);
  initChat();
  initVN({
    onChoice: (action) => {
      if (action === 'work') {
        hideVN();
        transitionTo(STATES.COMPUTER);
      } else if (action === 'explore') {
        hideVN();
        transitionTo(STATES.EXPLORING);
      } else if (action === 'about') {
        setExpression('chat');
        hideChoicesOnly();
        transitionTo(STATES.ABOUT);
      }
    },
  });

  // Wire back buttons
  document.getElementById('btn-back-computer')?.addEventListener('click', () => transitionTo(STATES.MENU));
  document.getElementById('btn-back-explore')?.addEventListener('click', () => transitionTo(STATES.MENU));
  document.getElementById('btn-close-about')?.addEventListener('click', () => transitionTo(STATES.MENU));
  document.getElementById('btn-close-game')?.addEventListener('click', () => closeGame());

  // Skip-intro button + ?skip=1 URL param
  document.getElementById('skip-btn')?.addEventListener('click', skipIntro);
  if (skipParam) skipIntro();

  // Work-in-progress banner — show once per browser, dismissed via localStorage
  const wipBanner = document.getElementById('wip-banner');
  if (wipBanner && !localStorage.getItem('wip-dismissed')) {
    wipBanner.hidden = false;
    wipBanner.querySelector('.wip-close')?.addEventListener('click', () => {
      wipBanner.classList.add('dismissed');
      localStorage.setItem('wip-dismissed', '1');
      setTimeout(() => { wipBanner.hidden = true; }, 300);
    });
  }


  // Escape key returns to menu (close game first if active)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (gameActive) {
        closeGame();
        return;
      }
      const state = getState();
      if (state === STATES.COMPUTER || state === STATES.EXPLORING || state === STATES.ABOUT) {
        transitionTo(STATES.MENU);
      }
    }
  });

  // ── Audio setup ──
  initAudio();

  // Mute toggle button
  const audioToggle = document.getElementById('audio-toggle');
  if (audioToggle) {
    // Start in muted state
    audioToggle.classList.add('muted');

    audioToggle.addEventListener('click', () => {
      resumeAudio();
      const nowMuted = toggleMute();
      audioToggle.classList.toggle('muted', nowMuted);
    });
  }

  // Resume AudioContext on first user scroll or click (browser policy requirement)
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    resumeAudio();
  }
  window.addEventListener('wheel', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  window.addEventListener('pointerdown', unlockAudio, { once: true });
}

init();

// ── Tab visibility ──
let isTabVisible = true;
document.addEventListener('visibilitychange', () => {
  isTabVisible = !document.hidden;
  if (document.hidden) {
    timer.disconnect();
  } else {
    timer.connect();
  }
});

// ── Render loop ──
function animate() {
  requestAnimationFrame(animate);
  if (!isTabVisible) return;

  timer.update();
  renderer.info.reset();
  const progress = getProgress();
  const state = getState();

  // Sync debug params
  if (state === STATES.SCROLLING) {
    scene.fog.near = params.fog.near;
    scene.fog.far = params.fog.far;
    // Live-tunable outdoors; interior values are set once on state transition
    renderer.toneMappingExposure = params.render.exposure;
    scene.environmentIntensity = params.render.envIntensity;
  }
  hemiLight.intensity = params.light.hemiIntensity;
  sunLight.intensity = params.light.sunIntensity;

  if (state === STATES.SCROLLING) {
    // Apply camera proxy from scroll spline
    camera.position.set(cameraState.x, cameraState.y, cameraState.z);
    camera.lookAt(cameraState.lookX, cameraState.lookY, cameraState.lookZ);

    // Golden haze deepens as the camera sinks toward the meadow
    scene.fog.color.copy(FOG_BASE).lerp(FOG_WARM, progress * 0.8);
    if (!prefersReducedMotion) {
      setParticlesVisible(true);
      updateParticles(progress); // fireflies fade in 0.3→0.7
    }

    // ── Outdoor ambient volume: ramp in 0.10→0.30, ramp out 0.70→0.85 ──
    let outdoorVol = 0;
    if (progress >= 0.10 && progress < 0.30) {
      outdoorVol = (progress - 0.10) / 0.20; // 0→1
    } else if (progress >= 0.30 && progress < 0.70) {
      outdoorVol = 1;
    } else if (progress >= 0.70 && progress < 0.85) {
      outdoorVol = 1 - (progress - 0.70) / 0.15; // 1→0
    }
    setOutdoorVolume(outdoorVol * 0.5); // scale to comfortable max volume

    // Trigger VN greeting when scroll reaches end
    if (progress >= 0.99 && !hasTriggeredGreeting && startupReady) {
      hasTriggeredGreeting = true;
      document.getElementById('scroll-hint')?.classList.add('hidden');
      document.getElementById('skip-btn')?.classList.add('hidden');
      transitionTo(STATES.GREETING);
      showGreeting();
    }
  } else {
    // Inside the house — keep outdoor ambient silent, hide the fireflies
    // (their spawn box spans the room; they'd hang frozen mid-air)
    setOutdoorVolume(0);
    setParticlesVisible(false);
  }

  // Update modules
  updateHouse(progress);
  const elapsed = timer.getElapsed();
  const delta = timer.getDelta();

  // Wind drives the grass shader + canopy/flower sway.
  // Runs in all states — the meadow is visible through the door/windows.
  updateWind(elapsed);
  updateEnvironment(elapsed, getWindStrength());

  // EXPLORING → MENU return lerp (frame-rate independent exponential ease)
  if (returnLerpActive) {
    const t = 1 - Math.exp(-4.0 * (delta || 1 / 60));
    camera.position.x += (ROOM_POS.x - camera.position.x) * t;
    camera.position.y += (ROOM_POS.y - camera.position.y) * t;
    camera.position.z += (ROOM_POS.z - camera.position.z) * t;
    camera.lookAt(ROOM_LOOK);
    if (camera.position.distanceTo(ROOM_POS) < 0.01) {
      camera.position.copy(ROOM_POS);
      returnLerpActive = false;
    }
  }

  // State-gated updates — skip work that's irrelevant in the current state.
  if (state === STATES.EXPLORING) {
    updateExplore(elapsed, delta);
  }
  if (state !== STATES.SCROLLING) {
    updateClock(camera);
    const focus = getFocusState();
    updateParticleOrb(elapsed, camera, focus.active && focus.name === 'ParticleOrb');
  }
  if (state === STATES.SCROLLING) {
    updateSky(elapsed);
  }

  if (!renderPost()) renderer.render(scene, camera);

  // Perf readout for the debug pane (user has no DevTools access)
  params.perf.calls = renderer.info.render.calls;
  if (delta > 0) params.perf.fps = params.perf.fps * 0.95 + (1 / delta) * 0.05;
}

animate();

// ── Resize ──
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    setPostSize(w, h);
    refreshScroll();
    repositionGameIframe();
  }, 150);
});
