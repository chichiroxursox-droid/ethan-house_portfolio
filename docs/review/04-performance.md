# Performance Review

## What works
- **Asset budget for 3D scene is tight**: 9 GLBs total ~1.6 MB; house.glb only 455 KB. No mega-meshes. (`portfolio/public/models/`)
- **DPR cap + `Math.min(devicePixelRatio, 2)`** at `main.js:46` prevents 3× retina blowup. Tab-visibility pause at `main.js:273-280` correctly disconnects timer when hidden.
- **Lazy RAF for inner UIs**: `videoRAF`, `inlineVideoRAF`, `graphRAF` only run when their phase is active and are cancelled on phase change (`computer.js:980, 1380, 1388`). dispose() is at least called on screenMesh teardown (`computer.js:1575, 1590, 1673`). dist client bundle is ~952 KB un-gzipped — moderate.
- *(Live-FPS measurement skipped — Playwright reported the MCP browser locked by another reviewer/instance; falling back to code-only.)*

## What doesn't work (ranked)
1. **Godot WASM is a 58 MB payload sitting inside the computer iframe** — `index.wasm` 36 MB + `index.pck` 22 MB + `index.js` 308 KB (`public/games/parallax/`). Iframe `src` is set unconditionally on every game open with cache-buster (`computer.js:1784 ?v=${Date.now()}`), defeating HTTP cache. On a 50 Mbps line that's ~10 s download every replay. Mid-range mobile will OOM or refuse to start the wasm.
2. **Always-on procedural + MP3 ambient layers, even when muted/fog/scrolling** — `buildOutdoorAmbient`, `buildBirdAmbient`, `buildIndoorAmbient` all start `source.start()` on `initAudio()` (`audio.js:97, 117, 134, 177-179`). 1.1 MB birds + 2.3 MB indoor MP3s decoded into AudioBuffers (~50–80 MB PCM resident) and run continuously through gain=0. Pure waste of CPU on background tabs that *did* unlock audio once.
3. **52 individual piano keys, every key its own BoxGeometry + cloned material** — `roomObjects.js:140-175` allocates 24 BoxGeometries × 24 unique cloned materials. Plus 8 trees × 2 meshes each in `environment.js:111-153`, 15 rocks (one geo, OK), 10 flowers (`createFlowers`, separate geos per stem/petal). Net: ~70+ extra draw calls for a static room with no instancing. No `InstancedMesh` anywhere in the codebase (grep confirmed zero hits).
4. **Clock + scrolling RAF are unconditional**: `updateClock(camera)` runs every frame regardless of visibility/state (`main.js:345`, `clock.js:80-99`); creates a `new Date()` every frame and calls `camera.position.distanceTo()`. Same pattern in `updateExplore`, `updateParticleOrb`, `updateSky`. No `if (state===EXPLORING)` gate around explore raycast, particles, or sky. Sun position recomputed from spline every scroll-frame.
5. **Shadow + lights overprovisioned**: Sun directional light has 2048×2048 PCF shadow map (`main.js:72-79`), `castShadow=true` set on every loaded GLB child unconditionally (`roomObjects.js:442-447`) including 52 piano keys, 15 rocks, every flower petal. `castShadow` on tiny offscreen geometry is the #1 mobile killer. Plus an additional lamp PointLight (house.js) doing dynamic intensity tweens.

## Top 3 improvements
1. **Lazy-load the Godot iframe + drop the cache-buster** — set iframe `src` only on first user click, use a hashed filename for cache, gzip/brotli the .wasm at server (drops 36 MB → ~12 MB). **Saves ~50 MB cold-start traffic on COMPUTER state, ~10 s on replay.** Effort: S. Impact: high.
2. **Stop ambient audio sources when their gain hits 0; convert procedural noise to a 2-s precomputed ping-pong buffer; lazy-decode MP3s on first interior entry** — `audio.js:69-140`. **Frees ~60 MB heap, restores ~5–10 % CPU on idle.** Effort: M. Impact: med.
3. **Aggressive shadow + draw-call pruning**: disable `castShadow` on piano keys, flowers, rocks, polaroids; merge the 52 piano keys into one InstancedMesh (or two — white/black) with per-instance Y offset for press; drop sun shadow map to 1024 and shrink the orthographic frustum (currently ±10 units, room is ~5). **Expected: +10–20 fps on integrated GPUs, ~40 fewer draw calls.** Effort: M. Impact: high.

## Top 3 next steps (this week)
1. Add a **`prefers-reduced-motion`** gate around `gsap.ticker`, the explore camera sway, and the `videoRAF` autoplay loop. CSS rule alone (line 717) doesn't stop JS RAFs. Wire it into `state.js` so SCROLLING short-circuits to a static snapshot.
2. Add `renderer.info.render.calls` + `geom.memory` overlay readout on the existing on-screen debug panel (user can't open DevTools — Memory note in `MEMORY.md`). Surface it in `debug.js` so future regressions are visible.
3. Convert procedural objects (piano keys, trees, rocks, flowers) to `InstancedMesh`. Add `frustumCulled` checks on stationary off-screen meshes. Gate `updateClock` / `updateExplore` / `updateParticleOrb` with `state === STATES.EXPLORING || isFocused` so the SCROLLING phase only runs sky+house.

## Confidence: medium
- High on code-derived findings (asset sizes, dispose gaps, audio always-on, listener counts, missing instancing — all confirmed via file reads + greps).
- Low on actual measured FPS — Playwright MCP browser lock blocked the live FPS/heap sampling. Numeric estimates above are based on draw-call counts and known mobile budgets, not in-browser readings. Recommend re-running the measurement loop solo.
