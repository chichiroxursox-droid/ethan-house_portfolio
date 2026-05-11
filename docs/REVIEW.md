# Portfolio Review — Multi-Agent Team Synthesis

_5 specialist reviewers (visual, architecture, UX, performance, recruiter) + 1 moderator + this synthesis + 1 live-test pass. First-draft assessment._

## TL;DR

Technically the bones are studio-grade for a self-taught 18-year-old, **and the live-test pass shows the experience is materially more polished than the code-only critiques implied** — vibrant green meadow + pastel room (not the predicted "mid-grey"), mobile renders cleanly, Escape behavior is correct, the project showcase is genuinely impressive. The work is just **buried** behind a 6-viewport scroll + 1 click + 1 folder open before any project is visible. The single highest-leverage move is not more polish; it is making the recruiter signal visible in the first 5 seconds and exposing the showcase that already exists.

## Live-test corrections (2026-05-06)

A live Playwright pass at 1440×900 + 390×844 confirmed and contradicted specific code-only inferences. Full report: `portfolio/docs/review/LIVE-FINDINGS.md` + 11 screenshots in `screenshots/`.

**Code reviewers were RIGHT about:**
- 6× viewport scroll length (5400 / 900 = 6.0 exact). Greeting only fires near 100%.
- No discoverability cues in Explore mode — verified visually, room shows zero affordance.
- 9 leftover `console.log` statements ("House loaded, door found", "Loaded room object: …", "Computer module initialized", "Knowledge graph data loaded", etc.).
- Always-on `AudioContext` warning before user gesture.
- "SCROLL TO EXPLORE" CTA never disappears — still visible after explore mode is open.

**Code reviewers were WRONG about:**
- ❌ R1 "frame sits in mid-greys" — site is **vibrant green meadow + pastel room** at every scroll depth.
- ❌ R3 "pointer-lock is hostile, Esc bounces user out" — `pointerLockElement` stays null in tests; Escape returns to menu correctly. R3's worry doesn't reliably reproduce.
- ❌ R4 "Godot 58 MB always loaded" — the WASM is **lazy-loaded** only when that project's iframe opens. Initial cold load is ~30–35 MB (gallery + character + projects + audio).
- ❌ R3 "mobile is broken-by-design" — at 390×844 the layout is intact, VN portrait scales, buttons stack & remain tappable, no mobile-specific console errors.

**New issues live-test surfaced:**
- Faithfully (formerly CULTIVaITE) **is** in the project showcase at `computer.js:67` — the reviewer missed it under the renamed name. Real fix is **naming consistency**: chat persona says "CULTIVaITE", project card says "Faithfully", graph hedges "CULTIVaiTE (Faithfully)". Pick one or bridge them.
- `favicon.ico` 404 — small recruiter polish miss.
- `index.html:47` iframe has unrecognized `pointer-lock` feature-policy token (typo from old MDN snippet).
- `Computer module initialized` and `Knowledge graph data loaded` print on initial load even if the user never opens that mode — eager init.
- The Websites folder content (8 project tiles with thumbnails, tech-stack chips, blurbs) is **genuinely strong recruiter content already built** — it's just hidden behind 6 viewports + 1 click.

**Priority shift:** the recruiter-signal items (#1, #2) move from "important" to "obvious" — you have great content, you're just not showing it. Items #6 (mobile fallback), #4 (pointer-lock fix), and the visual rebuild from #8 drop in priority because the live experience already mostly works.

## The 8 improvements that matter, ranked by impact x effort

### 1. Fix the recruiter's first 5 seconds: `<title>`, OG meta, and About bio [S / high — R5 + TENSIONS blind spots]

`index.html:6` ships as `<title>Portfolio</title>` — zero signal in the tab, the bookmark, the Slack unfurl, the Google result. `index.html:79` opens with "I'm a senior from West Philly who has been learning AI since November," which reads as an apology against what `ethan-prompt.txt` actually knows (UN speaker, CULTIVaITE co-founder, 15 shipped projects, 4.0). TENSIONS also flagged the missing `og:image`, `og:description`, and `twitter:card` — every shared link is a blank unfurl. This is the highest-leverage 30-minute change in the entire codebase.
Files: `portfolio/index.html:6`, `portfolio/index.html:79`, `portfolio/src/ethan-prompt.txt` (cross-reference for facts).

### 2. Add a skip-intro / fast path to the room or to projects [S / high — R3 + R5]

`portfolio/css/main.css:31` defines a 600vh forced scroll, gated by `progress >= 0.99` in `main.js:316` before the greeting fires. With scrub 1.5 (`scroll.js:48`) that's a multi-second wait *after* hitting the bottom. R5 counts 5 interactions before a recruiter sees a single project description. R3's fix is right: a floating "Enter the room ->" button and `?skip=1` URL param that jumps straight to MENU. R1 wants to keep the cinematic — both can ship; the cinematic becomes the polished path, not the only path.
Files: `portfolio/index.html` (add button near `#scroll-hint`), `portfolio/src/main.js:316`, `portfolio/css/main.css:31`.

### 3. Add CULTIVaITE as a project entry + rewrite the VN greeting [S / high — R5]

CULTIVaITE — the AI startup with siblings — is mentioned only inside `ethan-prompt.txt` and does not exist in the `PROJECTS` object inside `computer.js`. It is arguably the most hireable line in the entire portfolio and it is invisible. Same source critique: `vn.js:14` greets visitors with "Hey! Welcome to my space." — five seconds wasted on hospitality instead of identity. Replace with something like "Hey — I'm Ethan, I build things." and add CULTIVaITE to the showcase with the family-team angle.
Files: `portfolio/src/computer.js` (PROJECTS object), `portfolio/src/vn.js:14`.

### 4. Fix pointer-lock entry + listener leaks (the COMPUTER/EXPLORE hot path) [S / high — R2 + R3]

Three reviewers hit the same flow from different angles. R3: `explore.js:850` calls `requestPointerLock()` immediately on enter, before the user opts in — Mac shows a system "Press Esc to exit" banner that makes the back button unreachable, then Esc *also* triggers menu return (`main.js:235`), bouncing them out entirely. R2: `iframe.addEventListener('keydown')` at `computer.js:1817` is never removed in `closeGame()` (`computer.js:1852`); `document.addEventListener('keydown')` at `main.js:228` never removed. Fix both at once: gate pointer-lock behind an explicit "Click to look around" first click, and bind keydown handlers to named consts so they can be removed on exit.
Files: `portfolio/src/explore.js:817-851`, `portfolio/src/computer.js:1817,1852`, `portfolio/src/main.js:228-239`.

### 5. Lazy-load the Godot iframe + drop the cache-buster [S / high — R4]

`computer.js:1784` sets iframe `src` with `?v=${Date.now()}` on every game open, defeating HTTP cache. The Godot payload is `index.wasm` 36 MB + `index.pck` 22 MB + `index.js` 308 KB — ~58 MB redownloaded every time. R4 estimates ~10 s replay download on 50 Mbps; mid-range mobile will OOM. TENSIONS notes the cache-buster probably exists for a stale-state bug — fix by replaying via `postMessage` reset, not by re-downloading. Set `src` only on first user click; serve the WASM with a hashed filename and brotli.
Files: `portfolio/src/computer.js:1784`, `portfolio/public/games/parallax/`, server config (`netlify.toml`).

### 6. Mobile fallback page (detect touch, swap to 2D) [M / high — R3 + TENSIONS consensus]

`grep` confirmed zero `isMobile` branches in the codebase. Pointer-lock is unsupported on iOS Safari; `pointermove` hover in `computer.js:1289` doesn't fire on touch; the always-on audio buffers (~60 MB) will OOM mid-range phones (R4). Recruiters open links on phones first. The fix is not to port Three.js controls — it is to detect `maxTouchPoints > 0` and serve a tap-driven 2D project list + chat + email CTA. This is the single biggest "audience you are losing right now" gap.
Files: new `portfolio/src/mobile.js` or branch in `main.js`, plus a static fallback layout in `index.html`.

### 7. State-gate update loops + prune always-on cost [M / med — R4 + R2 consensus]

The site never sleeps. `updateClock`, `updateExplore`, `updateParticleOrb`, `updateSky` run every frame regardless of state (`main.js:345`). `audio.js:97,117,134,177-179` starts every ambient `source.start()` on init, decoded into ~50–80 MB resident PCM that runs through gain=0 forever. `computer.js:530,644,835,946,966` sets `canvasTexture.needsUpdate = true` on every redraw with no dirty flag. Sun shadow map is 2048² with `castShadow=true` on every loaded child including 52 piano keys (`roomObjects.js:442-447`). Wrap RAF work in `if (state === STATES.EXPLORING)` gates, add a `prefers-reduced-motion` short-circuit (`main.js` ticker), dirty-flag the canvas, prune `castShadow` on small geometry, drop sun shadow to 1024 with a tighter frustum.
Files: `portfolio/src/main.js:345,273-280`, `portfolio/src/audio.js:69-140`, `portfolio/src/computer.js:530-966`, `portfolio/src/roomObjects.js:442-447`.

### 8. Lighting + design-token cleanup (re-enable the cinematic intent) [S / med — R1]

`main.js:10` has `initParticles` commented out — the design intent ("fireflies, golden-hour") is literally not shipping. The single key `DirectionalLight` at `main.js:69` points to world (5,10,5) but the Sky sun is at phi=10° theta=220° (`sky.js:22-24`) — specular and shadows disagree with the IBL. `environmentIntensity = 0.3` (`main.js:56`) and exposure 0.6 flatten the frame to mid-grey. Six overlay panels use three different gold values (`#E8B87A`, `#F3C98B`, `rgb(232,184,122)`), four blur values, four radii — no token discipline. Sync key-light to `getSunPosition()*10`, add a 0.3 cool fill + back-rim, raise `environmentIntensity` to 1.0 outdoors / 0.6 indoors, exposure to 0.85, re-enable fireflies but state-gate them (R1+R4 compromise from TENSIONS), consolidate to one gold / one radius scale / one blur.
Files: `portfolio/src/main.js:10,56,66-79`, `portfolio/src/sky.js:22-32`, `portfolio/src/particles.js:50-76`, `portfolio/css/main.css` (overlay tokens), `portfolio/index.html:9` (pair Caveat with a real serif + `font-display: swap` + preconnect — TENSIONS blind spot).

## Next 5 steps — sequenced for one productive week

1. **Day 1 — Recruiter signal sprint (combine #1 + #3).** Rewrite `<title>`, add `og:title`/`og:description`/`og:image`/`twitter:card` to `index.html`, rewrite the About bio against `ethan-prompt.txt` (lead with CULTIVaITE, UN, 15 projects), add CULTIVaITE to the `PROJECTS` object in `computer.js`, swap the `vn.js:14` greeting. Half a day of editing, biggest leverage in the entire backlog. Ships immediately.

2. **Day 2 — Skip path + click-to-lock (#2 + half of #4).** Add a floating "Enter the room ->" button and `?skip=1` route that jumps straight to MENU. Replace `requestPointerLock()` on Explore enter with an explicit click-to-lock gate. Surface the chat-error mailto fallback (`chat.js:89-91`) while you're in that file. By end of day 2 a recruiter can land, see who you are, click one button, and reach the work.

3. **Day 3 — Listener and audio cleanup (#4 finish + #7 partial).** Bind `iframe.keydown` (`computer.js:1817`) and `document.keydown` (`main.js:228`) to named handlers and remove on exit. Stop ambient audio sources when their gain hits 0 in `audio.js`; lazy-decode interior MP3s on first room entry. Add `disposeClock()` and call from main.js. End of day: COMPUTER mode no longer leaks, idle CPU drops.

4. **Day 4 — Godot lazy-load + mobile detection scaffold (#5 + start of #6).** Move iframe `src` assignment to first-click; replace `?v=Date.now()` with hashed filename + brotli/gzip in `netlify.toml`. Add `postMessage`-based reset path so replay does not need a re-download. Then add `maxTouchPoints > 0` detection in `main.js` that swaps in a static 2D fallback `<section>` (you can build it out properly on day 5).

5. **Day 5 — Mobile fallback content + perf gate (#6 finish + #7 finish).** Build the 2D mobile layout: project cards (read straight from the `PROJECTS` object), chat input, mailto CTA, no Three.js. Add the `prefers-reduced-motion` short-circuit on the GSAP ticker. Drop sun shadow map to 1024, prune `castShadow` on piano keys / flowers / rocks. Wrap RAFs in state gates. Add `renderer.info.render.calls` to the on-screen `debug.js` overlay (you can not open DevTools — surface it on-screen instead).

## Don't do these (yet)

- **Splitting `computer.js` into desktop/detail/graph.** R2 wants this; TENSIONS verdict is fix the leaks first. A 1,898-line file with no leaks is fine for a first draft; a split file with leaks in it is just a bigger surface. Defer until step 3 is done.
- **Rebuilding the lighting rig with debug sliders.** R1's cinematic vision is real, but the recruiter cannot see your lighting if they bounce at the title tag. Ship items #1, #2, #3 first; lighting is item #8 for a reason.
- **Adding tests.** TENSIONS noted no test files exist. True, but test coverage on a first-draft solo portfolio is the wrong investment this week — fix the bounces first, harden later.
- **Converting piano keys to `InstancedMesh` and doing full draw-call optimization.** Real win (R4: +10–20 fps integrated GPU), but only after state-gating the update loops. State-gating alone wins back the same headroom for less work.
- **Re-enabling fireflies without state-gating them.** R1 says yes, R4 says no — TENSIONS compromise: fireflies only inside the room, frustum-culled, instanced. Don't ship them globally.

## Open questions for the owner

- **Why does the Godot iframe have a `?v=Date.now()` cache-buster?** TENSIONS suspects a stale-state bug. If yes, fix the replay path with `postMessage` before lazy-loading. If no, just remove it. Need you to confirm what bug it was working around.
- **Where does the chat API key live?** No reviewer checked, but if `chat.js` calls Anthropic/OpenAI/Groq directly client-side, the key is in the bundle — every visitor can read it. If there is a server proxy, document it; if not, this is a security item that jumps to Day 0.
- **What is the actual deploy target and analytics stack?** TENSIONS noted `netlify.toml` exists and zero reviewer checked CDN/brotli/cache headers, scroll-depth instrumentation, `window.onerror`, or Sentry. You cannot fix "recruiters bounce at 99% scroll" without confirming they do — and you cannot fix silent prod errors you never see.

## Methodology footnote

- 5 parallel critiques, 1 debate moderator (TENSIONS.md), 1 synthesis (this doc).
- 3 of 5 reviewers (R1 visual, R3 UX, R4 performance) fell back to code-only when the Playwright MCP browser was contended — their visual/timing claims are strong hypotheses, not measurements. Lighting math, listener-leak math, asset-size math are all from direct source reads and are high-confidence. Frame-rate, scroll-feel, and "mid-grey" claims are inferences.
- All `file:line` citations are pulled from the reviewers; trust but verify before each fix — line numbers can drift between review and patch.
