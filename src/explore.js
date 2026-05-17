import * as THREE from 'three';
import gsap from 'gsap';
import { playChime, playLampClick, playDribble } from './audio.js';
import { getLampRefs } from './house.js';
import { enterPianoFocus, exitPianoFocus, isPianoFocused, updatePiano, hideMusicOverlay, showMusicOverlay } from './piano.js';
import { setClockFocused } from './clock.js';

// ── Interactive object definitions ──
const INTERACTIVE = {
  'Basketball': "Basketball has played a massive part in my life and identity. I've been playing seriously since 6th grade, and I've grown so much since then. I made varsity all four years and have started since 10th grade. It's taught me discipline and teamwork, and blessed me with many good relationships with my teammates and coaches.",
  'FloorLamp': "This thing's been on at 2am more times than I can count. Debugging hits different when the whole house is quiet.",
  'Piano': "I took lessons as a kid, and have been self-taught since 7th grade. I learn and memorize basically any song that catches my ear, spanning from classical to pop songs. I enjoy playing, I like good music, and it gives me a kind of peace.",
  'DogBed': "Honey. My pit bull mix. She's usually right here sleeping while I work. Best coding partner I've ever had.",
  'Cross': "My faith keeps me grounded. Everything I do — the coding, the mentoring, the basketball — it all comes back to something bigger than me.",
  'Microphone': "This is a Humanium microphone — made from melted-down illegal guns, built by me and my peers. I co-lead the Reforge Project. Check it out → reforgeproject.org",
  'Controller': "I've grown up playing video games. It started when my older brother showed me Minecraft, and I've been a gamer ever since. Nowadays, I play less, but I still enjoy playing games whenever my friends are on.",
  'Bookshelf': "I've always been a reader. Fantasy is probably my biggest love — the Scythe series really stuck with me. I'm also into murder mysteries (Agatha Christie especially), graphic novels and comics like Calvin and Hobbes, and Greek mythology (I devoured the Percy Jackson series as a kid). Every now and then I'll pick up a nonfiction book too — Tattoos on the Heart and How to Know a Person both hit me hard.",
  'ParticleOrb': "What's this...",
  'clock': "Just a clock :)",
  'Peanut': "Shout out to the Peanuts!",
  'CoachNotebook': "I tutored younger kids in basketball in my junior and senior year. Had my own little business and did local advertising, and peaked at 7 clients. It was nice to kind of give back what I was taught when I was younger, and it was especially rewarding to see their growth over time.",
  // ── Corkboard polaroids (left wall, back half) ──
  'Polaroid_GoatFinal':       "Three goat houses, done. Summer before senior year — turns out Philly has a goat farm.",
  'Polaroid_GoatTeam':        "Built from scratch with my engineering teacher (shout Mr. Larry) and friends. 90-degree heat, a lot of sweat.",
  'Polaroid_UNSpeaking':      "Speaking at the United Nations on gun violence. June 2024. I was terrified.",
  'Polaroid_UNPresenting':    "Brought the Microphone for Peace to the biggest room in the world.",
  'Polaroid_MicPeace':        "The Microphone for Peace. 3D-printed from humanium metal — recycled illegal firearms. Voices, not weapons.",
  'Polaroid_MicEvent':        "Putting the mic in people's hands. Community events across Philly.",
  'Polaroid_BasketballLayup': "SLA Beeber Varsity. Captain senior year.",
  'Polaroid_BasketballShot':  "14 PPG, 5 APG.",
  'Polaroid_Education':       "Standing up for Philly Schools. Shout out Ms. Anderson!",
};

// Corkboard polaroid names — used in enterFocus() to route them all through
// the same "pull-camera-off-the-left-wall" branch with a smaller offset.
const CORKBOARD_NAMES = new Set([
  'Polaroid_GoatFinal',
  'Polaroid_GoatTeam',
  'Polaroid_UNSpeaking',
  'Polaroid_UNPresenting',
  'Polaroid_MicPeace',
  'Polaroid_MicEvent',
  'Polaroid_BasketballLayup',
  'Polaroid_BasketballShot',
  'Polaroid_Education',
]);

// ── Click dispatch ──
const CLICK_HANDLERS = {};
function registerClickHandler(name, handler) {
  CLICK_HANDLERS[name] = handler;
}

// ── Lamp toggle state ──
let lampOn = true;
let lampTransitionProgress = null; // null = no transition, 0-1 = transitioning
let lampTransitionDir = 0; // 1 = turning on, -1 = turning off

// ── Basketball bounce state ──
let basketballMesh = null;
let basketballRestY = 0;
let basketballVelocityY = 0;
let isBouncing = false;
let bounceCount = 0;

// ── Bookshelf card state (no-zoom description) ──
let bookshelfCardShowing = false;

// ── Module state ──
let scene = null;
let camera = null;
let renderer = null;
let enabled = false;

const raycaster = new THREE.Raycaster();
const CENTER = new THREE.Vector2(0, 0); // always raycast from screen center

// ── Hover glow ──
let hoveredObject = null;
let originalEmissive = null;
let originalEmissiveIntensity = 0;

// ── Tooltip ──
let tooltipTimer = null;
const tooltipEl = () => document.getElementById('tooltip');

// ── Mesh cache ──
let meshCache = [];           // all meshes — used for collision raycasting
let interactionCache = [];    // excludes structural geometry — used for click/hover raycasting

// Names of structural meshes that should block the camera but not block clicks
const STRUCTURAL_MESHES = new Set(['Walls', 'Floor', 'Ceiling', 'Roof']);

// ── Camera orbit state (spherical coordinates around target) ──
const TARGET = new THREE.Vector3(-0.5, 1.0, -1.2);
let orbitRadius = 2.0;
let orbitTheta = Math.PI * 0.45; // polar angle from +Y axis
let orbitPhi = 0;                // azimuth angle in XZ plane

const SENSITIVITY = 0.003;
const MIN_THETA = Math.PI * 0.15;  // can look almost straight up
const MAX_THETA = Math.PI * 0.85;  // can look almost straight down
const MIN_RADIUS = 0.5;
const MAX_RADIUS = 3.5;
const ZOOM_SPEED = 0.003;

// ── Camera collision ──
const ROOM_MIN = new THREE.Vector3(-2.35, 0.25, -2.35);
const ROOM_MAX = new THREE.Vector3( 2.35, 2.35,  1.35);
const _collisionRay = new THREE.Raycaster();
const _collisionDir = new THREE.Vector3();
const COLLISION_MARGIN = 0.2;

// ── Focus mode state ──
let focusActive = false;
let focusName = null;
let focusTimeline = null;
const FOCUS_SWAY_SPEED = 0.4;     // oscillation speed (radians/sec of the sine input)
const FOCUS_SWAY_AMPLITUDE = 0.45; // max swing in each direction (radians)
let focusStartPhi = null;         // phi at the moment focus began (null = unset)
let focusTime = 0;                // accumulated time in focus mode

// Saved orbit state for returning
const savedTarget = new THREE.Vector3();
let savedRadius = 0;
let savedTheta = 0;
let savedPhi = 0;

// ── Helpers ──

function findInteractiveName(object) {
  let current = object;
  while (current) {
    if (current.name && current.name in INTERACTIVE) return current.name;
    current = current.parent;
  }
  return null;
}

function rebuildMeshCache() {
  meshCache = [];
  interactionCache = [];
  scene.traverse((child) => {
    if (child.isMesh) {
      meshCache.push(child);
      if (!STRUCTURAL_MESHES.has(child.name)) {
        interactionCache.push(child);
      }
    }
  });
}

// ── Hover glow ──

function clearHover() {
  // Only restore emissive if we actually captured one. Hitbox meshes (e.g.
  // ParticleOrbHitbox) use MeshBasicMaterial which has no .emissive, so
  // applyHover leaves originalEmissive null and we must skip the restore.
  if (
    hoveredObject &&
    hoveredObject.material &&
    hoveredObject.material.emissive &&
    originalEmissive
  ) {
    hoveredObject.material.emissive.copy(originalEmissive);
    hoveredObject.material.emissiveIntensity = originalEmissiveIntensity;
  }
  hoveredObject = null;
  originalEmissive = null;
  originalEmissiveIntensity = 0;
}

function applyHover(mesh) {
  if (mesh === hoveredObject) return;
  clearHover();
  hoveredObject = mesh;
  if (mesh.material && mesh.material.emissive) {
    originalEmissive = mesh.material.emissive.clone();
    originalEmissiveIntensity = mesh.material.emissiveIntensity;
    mesh.material.emissive.set(0x666666);
    mesh.material.emissiveIntensity = 0.6;
  }
}

// ── Tooltip ──

function showTooltip(text) {
  const tip = tooltipEl();
  if (!tip) return;
  tip.textContent = text;
  tip.style.display = 'block';
  // Position below center of screen
  tip.style.left = `${window.innerWidth / 2 - 125}px`;
  tip.style.top = `${window.innerHeight / 2 + 50}px`;
  if (tooltipTimer) clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => hideTooltip(), 3000);
}

function hideTooltip() {
  const tip = tooltipEl();
  if (tip) tip.style.display = 'none';
  if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
}

// ── Camera math ──

function updateCameraFromSpherical() {
  camera.position.set(
    TARGET.x + orbitRadius * Math.sin(orbitTheta) * Math.sin(orbitPhi),
    TARGET.y + orbitRadius * Math.cos(orbitTheta),
    TARGET.z + orbitRadius * Math.sin(orbitTheta) * Math.cos(orbitPhi),
  );
  camera.lookAt(TARGET);
}

function computeSphericalFromCamera() {
  const offset = camera.position.clone().sub(TARGET);
  orbitRadius = offset.length();
  orbitRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, orbitRadius));
  orbitTheta = Math.acos(Math.max(-1, Math.min(1, offset.y / orbitRadius)));
  orbitPhi = Math.atan2(offset.x, offset.z);
}

function applyCollision() {
  // Layer 1: Clamp camera inside room AABB
  camera.position.clamp(ROOM_MIN, ROOM_MAX);

  // Layer 2: Raycast from TARGET toward camera — pull back if hitting geometry
  // Skip during focus mode — focus positions are curated and the raycast
  // would incorrectly collide with the object being focused on
  if (!focusActive) {
    _collisionDir.copy(camera.position).sub(TARGET);
    const dist = _collisionDir.length();
    if (dist < 0.01) { camera.lookAt(TARGET); return; }
    _collisionDir.divideScalar(dist);

    _collisionRay.set(TARGET, _collisionDir);
    _collisionRay.far = dist;
    _collisionRay.near = 0;

    const hits = _collisionRay.intersectObjects(meshCache, false);
    if (hits.length > 0) {
      const safeDist = Math.max(0.05, hits[0].distance - COLLISION_MARGIN);
      camera.position.copy(TARGET).addScaledVector(_collisionDir, safeDist);
      orbitRadius = safeDist;
    }
  }

  camera.lookAt(TARGET);
}

// ── Center raycast (hover check) ──

function updateCenterHover() {
  raycaster.setFromCamera(CENTER, camera);
  const intersects = raycaster.intersectObjects(interactionCache, false);
  const crosshair = document.getElementById('explore-crosshair');

  for (const hit of intersects) {
    const name = findInteractiveName(hit.object);
    if (name) {
      applyHover(hit.object);
      if (crosshair) crosshair.classList.add('interactive');
      return;
    }
  }
  clearHover();
  if (crosshair) crosshair.classList.remove('interactive');
}

// ────────────────────────────────────────────
// Focus mode
// ────────────────────────────────────────────

function computeFocusParams(objectName) {
  let targetObj = null;
  scene.traverse((child) => {
    if (child.name === objectName) targetObj = child;
  });
  if (!targetObj) return null;

  const box = new THREE.Box3().setFromObject(targetObj);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  // Camera distance that frames the object nicely
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let idealRadius = (maxDim / 2) / Math.tan(fov / 2);
  idealRadius = Math.max(0.5, idealRadius * 1.4); // 40% padding, min 0.5

  return { center, idealRadius };
}

function showFocusDescription(text, name) {
  const el = document.getElementById('focus-description');
  if (!el) return;
  gsap.killTweensOf(el); // clear any stale tweens that could fight this
  el.querySelector('.focus-name').textContent = name;
  const textEl = el.querySelector('.focus-text');
  textEl.textContent = '';
  if (name === 'Microphone' && text.includes('reforgeproject.org')) {
    const parts = text.split('reforgeproject.org');
    textEl.appendChild(document.createTextNode(parts[0]));
    const link = document.createElement('a');
    link.href = 'https://reforgeproject.org';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = 'color:#f5c97a;text-decoration:underline;pointer-events:auto;';
    link.textContent = 'reforgeproject.org';
    textEl.appendChild(link);
    if (parts[1]) textEl.appendChild(document.createTextNode(parts[1]));
  } else {
    textEl.textContent = text;
  }
  // Corkboard polaroids get the handwritten-note treatment; everything else
  // uses the default golden-caption look.
  el.classList.toggle('handwritten', name.startsWith('Polaroid_'));

  // Piano focus: surface a clear button to watch the videos. The 3D
  // music-stand sign is still clickable, but a real HTML button is far
  // more discoverable and reliable than a tiny angled plane.
  let videoBtn = el.querySelector('.focus-action-btn');
  if (name === 'Piano') {
    if (!videoBtn) {
      videoBtn = document.createElement('button');
      videoBtn.type = 'button';
      videoBtn.className = 'focus-action-btn';
      videoBtn.textContent = '▶  Watch my piano videos';
      videoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showMusicOverlay();
      });
      const hint = el.querySelector('.focus-hint');
      el.insertBefore(videoBtn, hint);
    }
    videoBtn.style.display = '';
  } else if (videoBtn) {
    videoBtn.style.display = 'none';
  }

  el.style.display = 'block';
  el.style.opacity = '1';
}

function hideFocusDescription() {
  const el = document.getElementById('focus-description');
  if (!el) return;
  gsap.killTweensOf(el);
  el.style.display = 'none';
  el.style.opacity = '0';
}

function enterFocus(objectName) {
  // If a previous exit animation is still running, the current orbit state
  // is a mid-flight interpolation — DON'T treat it as the new "outer" save,
  // or we'll return to a half-transition pose when we exit this focus.
  // Keep the existing savedTarget/etc. (they already point at the real
  // outer-room pose the exit animation was heading toward).
  const midExit = !focusActive && focusTimeline && focusTimeline.isActive();

  focusActive = true;
  focusName = objectName;
  // Reset sway anchor; the entry animation's onComplete will set it.
  focusStartPhi = null;

  if (!midExit) {
    // Save current orbit for return trip
    savedTarget.copy(TARGET);
    savedRadius = orbitRadius;
    savedTheta = orbitTheta;
    savedPhi = orbitPhi;
  }

  // Exit pointer lock so user gets a cursor
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }

  // Clear hover glow and hide crosshair
  clearHover();
  hideTooltip();
  const crosshair = document.getElementById('explore-crosshair');
  if (crosshair) crosshair.style.display = 'none';

  // Hide the "click to look around" hint during focus
  const hint = document.getElementById('explore-lock-hint');
  if (hint) hint.style.display = 'none';

  // Show focus description UI
  showFocusDescription(INTERACTIVE[objectName], objectName);

  // Disable canvas pointer-events so UI buttons are clickable above it.
  // Route "click anywhere to return" through the overlay instead.
  // EXCEPTION: Piano needs canvas clicks so its key/music-stand raycaster can fire;
  // piano.js handles its own exit-on-miss via the exitCallback.
  if (objectName !== 'Piano') {
    renderer.domElement.style.pointerEvents = 'none';
    const overlay = document.getElementById('explore-overlay');
    if (overlay) {
      overlay.style.pointerEvents = 'auto';
      overlay.addEventListener('click', onOverlayClickDuringFocus);
    }
  }

  // Kill any in-progress transition
  if (focusTimeline) focusTimeline.kill();

  // ParticleOrb: skip GSAP — updateExplore handles camera via per-frame lerp
  if (objectName === 'ParticleOrb') {
    TARGET.set(-2.3, 1.55, 0.6);
    return;
  }

  if (objectName === 'Piano') {
    const pianoKeysCenter = new THREE.Vector3(1.65, 0.5, -1.5);
    TARGET.copy(pianoKeysCenter);

    focusTimeline = gsap.to(camera.position, {
      x: 0.55, y: 1.15, z: -1.5,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(pianoKeysCenter);
        computeSphericalFromCamera();
        applyCollision();
      },
      onComplete: () => {
        focusStartPhi = orbitPhi;
        focusTime = 0;
      },
    });
  } else if (objectName === 'Controller') {
    const params = computeFocusParams(objectName);
    if (!params) return;
    const c = params.center;
    TARGET.copy(c);

    // Camera above and in front of the controller, looking down at it
    focusTimeline = gsap.to(camera.position, {
      x: c.x, y: c.y + 0.4, z: c.z + params.idealRadius * 0.8,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(c);
        computeSphericalFromCamera();
        applyCollision();
      },
      onComplete: () => {
        focusStartPhi = orbitPhi;
        focusTime = 0;
      },
    });
  } else if (objectName === 'clock') {
    const clockCenter = new THREE.Vector3(2.42, 2.3, -1.5);
    TARGET.copy(clockCenter);
    setClockFocused(true);

    focusTimeline = gsap.to(camera.position, {
      x: 1.7, y: 2.3, z: -1.5,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(clockCenter);
        computeSphericalFromCamera();
        applyCollision();
      },
      onComplete: () => {
        focusStartPhi = orbitPhi;
        focusTime = 0;
      },
    });
  } else if (objectName === 'Microphone') {
    const params = computeFocusParams(objectName);
    if (!params) return;
    const c = params.center;
    TARGET.copy(c);

    // Pull camera forward from the wall so it doesn't clip
    focusTimeline = gsap.to(camera.position, {
      x: c.x, y: c.y + 0.1, z: c.z + 0.6,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(c);
        computeSphericalFromCamera();
        applyCollision();
      },
      onComplete: () => {
        focusStartPhi = orbitPhi;
        focusTime = 0;
      },
    });
  } else if (objectName === 'CoachNotebook') {
    // Flat-on-floor object — pull camera up and slightly back to look down at the cover
    const params = computeFocusParams(objectName);
    if (!params) return;
    const c = params.center;
    TARGET.copy(c);

    focusTimeline = gsap.to(camera.position, {
      x: c.x, y: c.y + 0.55, z: c.z + 0.25,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(c);
        computeSphericalFromCamera();
        applyCollision();
      },
      onComplete: () => {
        focusStartPhi = orbitPhi;
        focusTime = 0;
      },
    });
  } else if (CORKBOARD_NAMES.has(objectName)) {
    // Corkboard polaroids live on the left wall at x ≈ -2.33, facing +X.
    // Pull camera forward along +X so it doesn't clip into the cork. Polaroids
    // are small (~0.25m) so a 0.45m offset frames them tightly.
    const params = computeFocusParams(objectName);
    if (!params) return;
    const c = params.center;
    TARGET.copy(c);

    focusTimeline = gsap.to(camera.position, {
      x: c.x + 0.45, y: c.y, z: c.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(c);
        computeSphericalFromCamera();
        applyCollision();
      },
      onComplete: () => {
        focusStartPhi = orbitPhi;
        focusTime = 0;
      },
    });
  } else {
    // Standard spherical orbit animation
    const params = computeFocusParams(objectName);
    if (!params) return;

    const startTarget = { x: TARGET.x, y: TARGET.y, z: TARGET.z };
    const startRadius = orbitRadius;
    const startTheta = orbitTheta;

    focusTimeline = gsap.to({ p: 0 }, {
      p: 1,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: function () {
        const p = this.progress();
        TARGET.set(
          startTarget.x + (params.center.x - startTarget.x) * p,
          startTarget.y + (params.center.y - startTarget.y) * p,
          startTarget.z + (params.center.z - startTarget.z) * p,
        );
        orbitRadius = startRadius + (params.idealRadius - startRadius) * p;
        orbitTheta = startTheta + (Math.PI * 0.45 - startTheta) * p;
        updateCameraFromSpherical();
        applyCollision();
      },
      onComplete: () => {
        focusStartPhi = orbitPhi;
        focusTime = 0;
      },
    });
  }
}

function onOverlayClickDuringFocus(e) {
  // Let button clicks through to their own handlers
  if (e.target.closest('.back-btn')) return;
  // Let link clicks through (e.g. reforgeproject.org in Microphone overlay)
  if (e.target.closest('a')) return;
  exitFocus();
}

function cleanupFocusPointerEvents() {
  renderer.domElement.style.pointerEvents = '';
  const overlay = document.getElementById('explore-overlay');
  if (overlay) {
    overlay.style.pointerEvents = '';
    overlay.removeEventListener('click', onOverlayClickDuringFocus);
  }
}

function exitFocus() {
  if (!focusActive) return;
  setClockFocused(false);
  // Piano attaches its own canvas listeners in enterPianoFocus(); tear them
  // down on every exit path (click-off, Escape, etc.) or stale listeners will
  // fire on later clicks and immediately unwind any new focus.
  if (focusName === 'Piano') {
    exitPianoFocus();
    hideMusicOverlay();
  }
  focusActive = false;
  focusName = null;

  cleanupFocusPointerEvents();
  hideFocusDescription();

  if (focusTimeline) focusTimeline.kill();

  const startTarget = { x: TARGET.x, y: TARGET.y, z: TARGET.z };
  const startRadius = orbitRadius;
  const startTheta = orbitTheta;
  const startPhi = orbitPhi;

  focusTimeline = gsap.to({ p: 0 }, {
    p: 1,
    duration: 1.0,
    ease: 'power2.inOut',
    onUpdate: function () {
      const p = this.progress();
      TARGET.set(
        startTarget.x + (savedTarget.x - startTarget.x) * p,
        startTarget.y + (savedTarget.y - startTarget.y) * p,
        startTarget.z + (savedTarget.z - startTarget.z) * p,
      );
      orbitRadius = startRadius + (savedRadius - startRadius) * p;
      orbitTheta = startTheta + (savedTheta - startTheta) * p;
      orbitPhi = startPhi + (savedPhi - startPhi) * p;
      updateCameraFromSpherical();
      applyCollision();
    },
    onComplete: () => {
      // Re-request pointer lock
      renderer.domElement.requestPointerLock();
    },
  });
}

// ── Event handlers ──

function onMouseMove(event) {
  if (focusActive) return;
  if (document.pointerLockElement !== renderer.domElement) return;

  orbitPhi -= event.movementX * SENSITIVITY;
  orbitTheta -= event.movementY * SENSITIVITY;

  // No horizontal limit — full 360° rotation
  orbitTheta = Math.max(MIN_THETA, Math.min(MAX_THETA, orbitTheta));

  updateCameraFromSpherical();
  applyCollision();
  updateCenterHover();
}

function onClick() {
  // Focus mode: piano handles its own clicks; others exit on click
  if (focusActive) {
    if (focusName === 'Piano') return; // piano.js handles clicks
    exitFocus();
    return;
  }

  // Bookshelf card: any click dismisses it (still in explore mode)
  if (bookshelfCardShowing) {
    hideBookshelfCard();
    return;
  }

  if (document.pointerLockElement !== renderer.domElement) {
    // Not locked — re-request pointer lock
    renderer.domElement.requestPointerLock();
    return;
  }

  raycaster.setFromCamera(CENTER, camera);
  const intersects = raycaster.intersectObjects(interactionCache, false);

  for (const hit of intersects) {
    const name = findInteractiveName(hit.object);
    if (name) {
      // Check for custom click handler first
      if (CLICK_HANDLERS[name]) {
        CLICK_HANDLERS[name]();
        return;
      }
      playChime();
      enterFocus(name);
      return;
    }
  }
  hideTooltip();
}

function onWheel(event) {
  if (!enabled || focusActive) return;
  orbitRadius += event.deltaY * ZOOM_SPEED;
  orbitRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, orbitRadius));
  updateCameraFromSpherical();
  applyCollision();
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    if (bookshelfCardShowing) {
      event.stopImmediatePropagation();
      hideBookshelfCard();
      return;
    }
    if (focusActive) {
      event.stopImmediatePropagation();
      if (focusName === 'Piano') {
        exitPianoFocus();
        hideMusicOverlay();
      }
      exitFocus();
    }
  }
}

function onPointerLockChange() {
  const crosshair = document.getElementById('explore-crosshair');
  const hint = document.getElementById('explore-lock-hint');
  const locked = document.pointerLockElement === renderer.domElement;

  if (locked) {
    // Pointer locked — show crosshair, hide hint
    if (crosshair) crosshair.style.display = 'block';
    if (hint) hint.style.display = 'none';
  } else {
    // Pointer unlocked — hide crosshair, show hint if exploring (but not in focus)
    if (crosshair) crosshair.style.display = 'none';
    if (hint && enabled && !focusActive) hint.style.display = 'flex';
    clearHover();
  }
}

// ── Bound handlers (for clean removal) ──
let onMouseMoveBound = null;
let onClickBound = null;
let onWheelBound = null;
let onKeyDownBound = null;

// ── Public API ──

export function initExplore(sceneRef, cameraRef, rendererRef) {
  scene = sceneRef;
  camera = cameraRef;
  renderer = rendererRef;

  onMouseMoveBound = onMouseMove.bind(null);
  onClickBound = onClick.bind(null);
  onWheelBound = onWheel.bind(null);
  onKeyDownBound = onKeyDown.bind(null);

  document.addEventListener('pointerlockchange', onPointerLockChange);
}

// ── Lamp toggle handler ──
function handleLampClick() {
  lampOn = !lampOn;
  playLampClick();
  lampTransitionProgress = 0;
  lampTransitionDir = lampOn ? 1 : -1;
}

function updateLampTransition(delta) {
  if (lampTransitionProgress === null) return;

  lampTransitionProgress += delta / 0.3; // 0.3s transition
  if (lampTransitionProgress >= 1) lampTransitionProgress = null;

  const t = lampTransitionProgress !== null ? lampTransitionProgress : 1;
  const { lampPointLight, lampGroup } = getLampRefs();

  // Target values: on = 1.0 intensity, off = 0.05
  const targetIntensity = lampOn ? 1.0 : 0.05;
  const currentIntensity = lampOn ? 0.05 + t * 0.95 : 1.0 - t * 0.95;

  if (lampPointLight) {
    lampPointLight.intensity = lampTransitionProgress !== null ? currentIntensity : targetIntensity;
  }

  // Update lamp shade emissive
  if (lampGroup) {
    const emissiveVal = lampOn
      ? (lampTransitionProgress !== null ? t : 1)
      : (lampTransitionProgress !== null ? 1 - t : 0);
    lampGroup.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissiveIntensity = emissiveVal * 0.8;
      }
    });
  }
}

// ── Basketball bounce handler ──
function handleBasketballClick() {
  if (!isBouncing) {
    isBouncing = true;
    bounceCount = 0;
    basketballVelocityY = 3.0;
  }
  // Also zoom in with description
  playChime();
  enterFocus('Basketball');
}

function updateBasketball(delta) {
  if (!isBouncing || !basketballMesh) return;

  basketballVelocityY -= 9.8 * delta;
  basketballMesh.position.y += basketballVelocityY * delta;

  if (basketballMesh.position.y <= basketballRestY) {
    basketballMesh.position.y = basketballRestY;
    basketballVelocityY *= -0.55;
    bounceCount++;

    const volScale = Math.max(0.05, 1 - bounceCount * 0.25);
    const pitchScale = Math.max(0.7, 1 - bounceCount * 0.1);
    playDribble(0.2 * volScale, pitchScale);

    if (Math.abs(basketballVelocityY) < 0.3) {
      basketballVelocityY = 0;
      basketballMesh.position.y = basketballRestY;
      isBouncing = false;
    }
  }
}

// ── Piano click handler ──
function handlePianoClick() {
  playChime();
  enterFocus('Piano');
  enterPianoFocus(() => exitFocus());
}

// ── No-zoom card handler (shared by Bookshelf, Peanut, etc.) ──
// title === '' hides the title row entirely (used for items where the text
// stands on its own and a label like "BOOKSHELF" would feel redundant).
function showInfoCard(text, title = '') {
  const card = document.getElementById('bookshelf-card');
  if (!card) return;
  const nameEl = card.querySelector('.bookshelf-name');
  if (nameEl) {
    nameEl.textContent = title;
    nameEl.style.display = title ? 'block' : 'none';
  }
  card.querySelector('.bookshelf-text').textContent = text;
  card.style.display = 'block';
  bookshelfCardShowing = true;
}

function hideBookshelfCard() {
  const card = document.getElementById('bookshelf-card');
  if (card) card.style.display = 'none';
  bookshelfCardShowing = false;
}

function handleBookshelfClick() {
  playChime();
  showInfoCard(INTERACTIVE['Bookshelf'], 'Bookshelf');
}

function handlePeanutClick() {
  playChime();
  showInfoCard(INTERACTIVE['Peanut']);
}

export function enableExplore() {
  enabled = true;
  rebuildMeshCache();

  // Compute initial orbit angles from current camera position
  computeSphericalFromCamera();

  // Register click handlers
  registerClickHandler('FloorLamp', handleLampClick);
  registerClickHandler('Basketball', handleBasketballClick);
  registerClickHandler('Piano', handlePianoClick);
  registerClickHandler('Bookshelf', handleBookshelfClick);
  registerClickHandler('Peanut', handlePeanutClick);

  // Cache basketball mesh for physics
  scene.traverse((child) => {
    if (child.name === 'Basketball' && child.isGroup) {
      basketballMesh = child;
      basketballRestY = child.position.y;
    }
  });

  // Attach event listeners
  document.addEventListener('mousemove', onMouseMoveBound);
  renderer.domElement.addEventListener('click', onClickBound);
  renderer.domElement.addEventListener('click', onCanvasLockClick);
  renderer.domElement.addEventListener('wheel', onWheelBound, { passive: true });
  document.addEventListener('keydown', onKeyDownBound, { capture: true });

  // Show hint immediately (will hide once pointer lock is granted)
  const hint = document.getElementById('explore-lock-hint');
  if (hint) hint.style.display = 'flex';

  // Don't auto-request pointer lock — on Mac it throws a hostile system banner
  // before the user opted in. Lock is requested on first canvas click instead
  // (see onCanvasLockClick).
}

function onCanvasLockClick() {
  if (!document.pointerLockElement) {
    renderer.domElement.requestPointerLock?.();
  }
}

export function disableExplore() {
  enabled = false;

  // Always kill focus timeline (exitFocus may have set focusActive=false but left timeline running)
  if (focusTimeline) { focusTimeline.kill(); focusTimeline = null; }

  // Always clean up focus pointer-events (exitFocus may have already done this, but be safe)
  cleanupFocusPointerEvents();

  // Clean up focus if active
  if (focusActive) {
    if (focusName === 'Piano') {
      exitPianoFocus();
      hideMusicOverlay();
    }
    focusActive = false;
    focusName = null;
    hideFocusDescription();
    TARGET.copy(savedTarget);
    orbitRadius = savedRadius;
    orbitTheta = savedTheta;
    orbitPhi = savedPhi;
  }

  document.removeEventListener('mousemove', onMouseMoveBound);
  renderer.domElement.removeEventListener('click', onClickBound);
  renderer.domElement.removeEventListener('click', onCanvasLockClick);
  renderer.domElement.removeEventListener('wheel', onWheelBound);
  document.removeEventListener('keydown', onKeyDownBound, { capture: true });

  // Release pointer lock if active
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }

  clearHover();
  hideTooltip();
  hideBookshelfCard();
  meshCache = [];
  interactionCache = [];

  // Hide crosshair and hint
  const crosshair = document.getElementById('explore-crosshair');
  const hint = document.getElementById('explore-lock-hint');
  if (crosshair) crosshair.style.display = 'none';
  if (hint) hint.style.display = 'none';
}

export function getFocusState() {
  return { active: focusActive, name: focusName };
}

export function updateExplore(elapsed, delta) {
  // Always run interaction updates regardless of focus state
  updateLampTransition(delta || 1 / 60);
  updateBasketball(delta || 1 / 60);
  updatePiano();

  // ParticleOrb: force camera every frame via lerp (bypasses all GSAP/guard issues)
  if (focusActive && focusName === 'ParticleOrb') {
    const dt = delta || 1 / 60;
    const speed = 3.0;
    const t = 1 - Math.exp(-speed * dt);
    camera.position.x += (-1.5 - camera.position.x) * t;
    camera.position.y += (1.55 - camera.position.y) * t;
    camera.position.z += (0.6 - camera.position.z) * t;
    camera.lookAt(-2.3, 1.55, 0.6);
    computeSphericalFromCamera();
    return;
  }

  if (!focusActive || focusStartPhi === null) return;
  if (focusName === 'clock' || focusName === 'Piano' || CORKBOARD_NAMES.has(focusName)) return;

  focusTime += 1 / 60; // approximate frame time
  orbitPhi = focusStartPhi + Math.sin(focusTime * FOCUS_SWAY_SPEED) * FOCUS_SWAY_AMPLITUDE;
  updateCameraFromSpherical();
  applyCollision();
}
