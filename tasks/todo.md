# Tasks — Ethan House Portfolio

**About:** 3D house portfolio (Vite + Three.js + GSAP + Lenis). Repo `ethan-house_portfolio` → Vercel auto-deploys from `main`. `npm run build` takes ~4 min (copies the 100 MB `public/` folder).

## Active

## Resolved
- 2026-09-12 — Bright white flash on load: render loop now starts only after `init()` populates the scene (terrain used to arrive after the GLB awaits, leaving the bird's-eye camera staring at the sky dome's horizon glow + bloom); canvas fades in via `#webgl.ready`.
- 2026-09-12 — Scroll-down lag: removed `logarithmicDepthBuffer` (wrote gl_FragDepth → killed early-Z/TBDR hidden-surface removal for 25k grass blades + roof-occluded room), dropped 4x MSAA from the composer ping-pong targets (every fullscreen pass was resolving a 4x HalfFloat target) in favour of a final FXAA pass, and turned off canvas MSAA + DPR 2 while the composer is active.
