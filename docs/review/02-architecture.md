# Code Architecture Review

## What works (3 bullets, cite file:line)

1. **Scroll-driven camera spline system is clean**: scroll.js:17–42 defines two CatmullRomCurves (position + lookAt) sampled per-frame via ScrollTrigger. This decouples animation from game logic and would survive adding more scroll-triggered features.
2. **State machine enforces transitions, not sprawl**: state.js is deliberately minimal — 104 LOC with 6 states, entry/exit hooks via switch blocks. Prevents ad-hoc state checks scattered across codebase; main.js:120–180 shows proper coupling (onStateChange listeners for side effects like audio/overlays).
3. **Game iframe lifecycle is isolated**: computer.js:1810–1843 carefully sandboxes the embedded Godot game — removes canvas listeners before launch, re-adds after close, suppresses audio during gameplay. Won't leak into the Three.js render loop.

## What doesn't work (5 bullets, ranked by severity, cite file:line)

### Critical
1. **Listener leak: `iframe.addEventListener('keydown')` never removed (computer.js:1817)** — Added at iframe load, never removed in `closeGame()` (line 1852). Each game launch adds a new listener; replaying accumulates handlers. Fix: bind handler to named const, store ref, removeEventListener in closeGame.
2. **Listener leak: global document keydown (main.js:228)** — Added once at init, never removed. Harmless at app scope today, but bites under any SPA refactor. Fix: bind to enterComputer/exitComputer.
3. **Material disposal missing in clock.js (lines 30, 36, 42, 56, 70)** — 5 materials created, never disposed. Tiny but compounds if clocks recreated. Fix: expose `disposeClock()`.

### High
4. **Canvas texture updated unconditionally (computer.js:530, 644, 835, 946, 966)** — `canvasTexture.needsUpdate = true` set every redraw, even when no state changed. GPU re-uploads each frame unnecessarily. Fix: dirty-flag pattern.
5. **video 'canplaythrough' listener has no cleanup on project unload (computer.js:1492)** — once:true mitigates, but if videoCache cleared mid-load the event fires on orphan element. Fix: track load promises, cancel on exit.

## Top 3 improvements (ranked by velocity unlock)

### 1. Split computer.js into `computer/{desktop.js, detail.js, graph.js}`
Effort: M. Impact: high.
- **desktop.js**: folder/icon drawing + click dispatch (drawDesktop, drawFolderIcon, hitTestFolders, lines 402–531).
- **detail.js**: project cards, descriptions, buttons, video preview (drawFolderView, drawProjectDetail, startVideoFullscreen, lines 535–945).
- **graph.js wrapper**: drawGraphScreen, drawGraphDetailScreen wiring (lines 931–1031).
- Current: 1,898 LOC, 7 screen phases sharing global state. Adding "favorites"/"search" will explode.
- Why velocity: each screen testable in isolation; new features land in focused files.

### 2. Unify overlay show/hide boilerplate (state.js + computer.js + piano.js)
Effort: S. Impact: med.
- state.js:86–103 shows/hides hardcoded IDs; piano.js duplicates the pattern.
- Create `overlays.js`: `{ showOverlay(id, duration), hideOverlay(id, duration), isOverlayVisible(id) }`.
- Reduces state.js to a pure FSM; removes ~18 LOC of boilerplate.
- Adding a new mode becomes: define state → call showOverlay.

### 3. Hoist scroll thresholds + duplicated focus tweens into constants
Effort: S. Impact: low.
- main.js:306–311 hardcodes audio thresholds (0.10/0.30/0.70/0.85).
- explore.js:389–473 duplicates 5 nearly-identical camera focus tweens.
- Create `constants.js` for `SCROLL` and `CAMERA_TWEENS`.
- Enables one-pass tuning of pacing across the experience.

## Top 3 next steps (this week)

1. **Fix listener leaks in iframe keydown (computer.js:1817) and document keydown (main.js:228)** — bind handlers to named functions, store refs, removeEventListener in cleanup paths.
2. **Dispose clock materials on teardown** — add `disposeClock()` in clock.js, call from main.js when transitioning away from EXPLORING.
3. **Reduce canvas texture upload frequency** — gate `needsUpdate=true` behind an `isDirty` flag in redraw functions.

## Confidence: med — why
- High on listener leaks (direct inspection; removeEventListener is missing at cited lines).
- Med on state machine health (small, correct, but not integration-tested).
- Med on computer.js split — sampled deps but didn't trace every cross-module import.
- Low on canvas-update overhead — plausible but unmeasured. Profile first.
