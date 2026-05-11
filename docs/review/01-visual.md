# Visual / Aesthetic Review

**Note:** Playwright browser was locked by another process — falling back to code-only critique. No screenshots captured.

## What works
- Tone mapping pipeline is correct: ACESFilmic + sRGB output + PMREM-baked Sky environment (sky.js:27-32, main.js:50-52). That foundation is studio-grade and rare in first drafts.
- Warm/cool light split is intentional: hemisphere sky 0x87CEEB / ground 0xE8B87A pairs against a 0xFFF5E0 sun and a 0xFFE0AA lamp point light (main.js:66-69, house.js:97). The palette logic is there.
- Handwritten polaroid card (main.css:428-483) — Caveat on cream with rotated tape pseudo-element is the one moment of real art direction in the UI layer.

## What doesn't work (ranked)
1. **Lighting is one-key, no fill, no rim.** main.js:69 single DirectionalLight at intensity 1.5 + a hemi at 0.6, sun at world (5,10,5) — this never matches the Sky's sun direction (sky.js:22-24, phi=10° theta=220°). Result: the PMREM environment says "low golden-hour sun coming from one azimuth" while the key light points elsewhere. Specular highlights and shadow direction won't agree. No rim/back-light, so the house silhouette dies against the sky.
2. **Fireflies are commented out.** main.js:10 — `initParticles` is disabled. The design intent ("feel alive… fireflies, golden-hour") is literally not shipping. The aurora-bait shader in particles.js:50-76 (additive yellow points) exists and is unused.
3. **Terrain reads as a low-poly toy, not "studio."** environment.js:139-152: 8-segment cylinder trunk + 8x6 sphere canopy in flat MeshStandardMaterial. No normal maps, no instancing variation beyond uniform scale, only 8 trees + 15 dodecahedron rocks + 10 cone-on-cylinder flowers. PlaneGeometry has 256² verts but the noise field (env.js:26-30) is two octaves of value noise — too smooth, no silhouette interest.
4. **environmentIntensity = 0.3 (main.js:56) flattens everything.** PMREM Sky is the only IBL source; cutting it to 30% kills the lamp-shade specular kick and the wood/ceramic micro-highlights inside the house. Combined with toneMappingExposure 0.6 (and 0.495 indoors, main.js:126), the whole frame sits in mid-greys.
5. **Typography pairing is broken.** index.html:9 only loads Caveat. CSS body falls back to Helvetica Neue (main.css:12). The "serif + Caveat" pairing in the design intent is absent — body copy is grotesk sans, headings use generic uppercase letter-spacing. Six different overlay panels (vn-dialogue, focus-description, bookshelf-card white panel, about-panel, music-panel, tooltip) each have different radii (8/12/16/18px), different blur values (8/10/12/14/16), and three different gold accents (#E8B87A, #F3C98B, rgb 232,184,122) — no design token discipline.

## Top 3 improvements
1. **Match key-light vector to Sky sun + add fill/rim** — sync sunLight.position to `getSunPosition() * 10` (already imported, used once at main.js:185 then never again in static setup), add a 0.3-intensity cool DirectionalLight from opposite azimuth as fill, and a back-rim. Effort: S. Impact: high.
2. **Re-enable fireflies + tune to golden hour** — uncomment initParticles, change uColor from 0xFFDD66 to 0xFFE0AA to match lamp, fade in over scroll 0.6→0.9. Effort: S. Impact: high.
3. **Bump environmentIntensity to 1.0 outdoors / 0.6 indoors and raise exposure to 0.85** — the IBL is being throttled below useful. Effort: S. Impact: high.

## Top 3 next steps this week
1. Rebuild lighting rig in debug.js with three-light setup and live sliders; lock values.
2. Ship fireflies + a single low-frequency wind sway on tree canopies (one shader uniform, time-driven Y-rotation noise).
3. Consolidate overlay design tokens — one radius scale (8/14/20), one blur (12px), one gold (#E8B87A), pair Caveat with a real serif (e.g., Fraunces or Cormorant) loaded in index.html.

## Confidence: med
Code-only — no live screenshots to verify whether the rendered frame matches what the code suggests. Lighting/material critique is high-confidence (the math is in the source). Composition/motion timing critique would need the browser.
