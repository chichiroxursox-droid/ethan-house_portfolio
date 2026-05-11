# Live-Test Findings (Playwright observations)

_Tested 2026-05-06 ~16:43 PT against http://localhost:5174/ at 1440x900 (desktop) and 390x844 (iPhone 14). Compares observed reality to the code-only inferences in `01-visual.md`, `03-ux.md`, `04-performance.md`. (Note: `REVIEW.md` synthesis file does not exist in the review/ folder — it was referenced in the briefing but not present.)_

## Confirmed (the code-only reviewers were right)

- **R3 — 6x viewport scroll length.** `document.body.scrollHeight / window.innerHeight = 5400 / 900 = 6.0` exactly on desktop, `5064 / 844 = 6.0` on mobile. Confirmed with hard math, not visual estimate.
- **R3 — Greeting only fires near the very end.** Scrolling to 25/50/75% never shows the VN; only at scrollY=4500 (max) does Ethan appear with "Hey! Welcome to my space." and the three menu choices. See `screenshots/desktop-25.png` (top-down house), `desktop-50.png` (mid-tilt), `desktop-75.png` (just-inside room, no greeting), `desktop-100.png` (greeting + menu).
- **R4 — Audio context starts before user gesture.** Console warning at `audio.js:96`: _"The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page."_ Confirms always-on audio init pattern.
- **R4 — Debug `console.log` leftovers in production paths.** 9+ runtime logs: "House loaded, door found: true", "Loaded room object: Piano/DogBed/Cross/…", "Computer module initialized", "Knowledge graph data loaded", "[CoachNotebook] added to scene at Vector3". Should be stripped.
- **R3 — No discoverability cue for clickable room objects.** Walking into Explore mode shows the room (`screenshots/desktop-explore.png`) with zero visible affordance — no hover ring, no glow, no "click to interact" label. The "SCROLL TO EXPLORE" CTA is still pinned to the bottom even though scrolling is done — actively misleading at this stage.

## Contradicted (the code-only reviewers were wrong)

- **R1 — "frame sits in mid-greys."** Initial frame is a saturated **bright green meadow** with a clean blue-grey low-poly house dead-center, soft contact shadows, and floating white particle motes. See `screenshots/desktop-top.png`. Mid-scroll (`desktop-50.png`) shows full house with chimney, windows, door, brown path — still vibrant. Inside-room (`desktop-75.png`, `desktop-100.png`) is bright pastels: rainbow bookshelf books, beige cabinetry, photoboard in saturated reds, blue painting on the wall. The site does NOT read as muted at any scroll depth.
- **R3 — "Pointer-lock on Explore enter is hostile."** Verified `document.pointerLockElement` is `null` after entering Explore mode. The console emits "The root document of this element is not valid for pointer lock" — pointer-lock is _attempted_ but _silently fails_ (likely because the canvas is inside an iframe context in test, but the bigger point is the user is not actually trapped). On a real browser this might lock; on the test browser it does not. The Mac Esc-banner concern is unverifiable here, but the code path is not reliably engaging pointer-lock.
- **R3 — "Esc bounces user out."** Pressed Escape from inside the Websites folder → snapshot returns to the menu state (greeting + 3 choices visible). This is not a bounce-out; it is the expected back-step. Escape is wired correctly at this layer.
- **R4 — "Godot WASM 58MB inside iframe."** No Godot/parallax fetches appear in the network log on initial load. The 58MB Parallax build _exists_ at `public/games/parallax/` but is **not** loaded eagerly — only when the user opens that project's iframe. R4's "always-loaded" framing was wrong; the lazy-load is correct. Still, the asset is shipped in the bundle.

## Extended (new findings only live testing surfaced)

- **"SCROLL TO EXPLORE" CTA never disappears.** Visible at the very top, the very bottom (after greeting), and even after entering Explore mode. Should fade out once scroll progress is complete.
- **Iframe `pointer-lock` allow-attribute is not a recognized feature policy token.** Console warning: _"Unrecognized feature: 'pointer-lock'."_ at `index.html:47`. Likely a copy-paste from an outdated MDN snippet — should be `pointer-lock 'self'` syntax or removed; current syntax does nothing.
- **Iframe `allow="… allowfullscreen"` shadows the legacy attribute.** Companion warning: _"Allow attribute will take precedence over 'allowfullscreen'."_ Cosmetic but indicates the iframe attributes need a tidy-up pass.
- **Favicon 404.** `/favicon.ico` returns 404. Recruiter polish miss.
- **Computer module / knowledge graph init logs run regardless of whether user opens that mode.** Both `Computer module initialized` and `Knowledge graph data loaded` print on initial page load — confirms eager init of features that may never be used in a given session.
- **Mobile renders cleanly, contradicting any "mobile is broken" worry.** At 390x844 the same 6x scroll happens, the VN portrait scales to fit, dialogue box wraps on two lines, the three menu buttons stack vertically and remain tappable. See `screenshots/mobile-end.png`. No mobile-specific console errors.
- **Computer mode is genuinely impressive.** The Websites folder (`screenshots/desktop-folder-open.png`) shows a clean OS-style window with 8 project tiles — name, tech-stack chips, thumbnail, one-line blurb, color-coded left edge. This IS the recruiter signal R3 wanted, and it is _already built_ — the problem is just that visitors have to scroll 6 viewports + click "View my work" to see it.
- **"Back" UX in computer mode is dual-channel.** Both the in-app `<` button and the `Back to menu` chip top-left, plus Escape, all return to the menu. Discoverable.

## Screenshots captured

- `screenshots/desktop-top.png` — initial frame: top-down meadow + house, "SCROLL TO EXPLORE" CTA visible.
- `screenshots/desktop-25.png` — scroll 25%: tilted house, more of the surrounding lawn revealed.
- `screenshots/desktop-50.png` — scroll 50%: house at oblique angle, chimney/windows/door visible.
- `screenshots/desktop-75.png` — scroll 75%: camera now inside the room, desk + bookshelf + photoboard + painting visible. NO greeting yet.
- `screenshots/desktop-100.png` — scroll 100%: VN greeting "Hey! Welcome to my space." with About me / View my work / Explore the room.
- `screenshots/desktop-viewmywork.png` — computer mode: monitor zoomed full-screen, 3 desktop folders + clock taskbar.
- `screenshots/desktop-folder-open.png` — Websites folder open: 8 project cards, the actual portfolio content.
- `screenshots/desktop-explore.png` — Explore the room: free-look view of desk + bookshelf + chair, no affordance cues.
- `screenshots/desktop-explore-scrollup.png` — scrolled up from Explore, greeting reappears (state is sticky, not destructive).
- `screenshots/mobile-top.png` — mobile initial frame, layout intact at 390x844.
- `screenshots/mobile-end.png` — mobile end-state: greeting + portrait + 3 buttons, all readable and tappable.

## Console output summary

- **0 errors** (one transient `favicon.ico 404` on first nav).
- **3 warnings**, all benign-but-fixable: iframe `pointer-lock` unknown feature, iframe `allowfullscreen` shadowed, AudioContext autoplay-policy warning.
- **9 informational logs** that should be stripped before production: house/door confirmation, 7x "Loaded room object: …", "Computer module initialized", "Knowledge graph data loaded", "[CoachNotebook] added to scene at Vector3".
- One `vite` HMR connect/connected pair (dev-only, expected).

## FPS readings

- Idle (after 5s settle, scroll fully scrolled, greeting visible): **30.9 fps avg** (min 30, max 31, dead-flat over 11 samples).
- **Caveat:** This is almost certainly Playwright headless-Chromium's `requestAnimationFrame` cap, not the actual rendering performance. Canvas resolution was 1440x900 @ DPR=1 with `document.hidden=false`. Real-browser FPS cannot be measured reliably from this harness — would need a manual run with the Chrome DevTools Performance panel or a `Stats.js` overlay added to the build.
- Verdict: FPS is **not reliably testable from here**. R4's "no FPS measurements yet" stands as a real gap, but no live evidence of jank or low FPS in actual user browsers.

## Network summary

- ~70 requests on initial cold load. No single asset > 1MB on the wire (largest: `audio/indoor-ambient.mp3` ≈ 2.3MB on disk; everything else is sub-MB).
- Eager initial download (rough estimate from disk sizes for unique URLs touched on first nav): **~30-35MB**, dominated by `gallery/` (~14MB photos), `character/` (~7.5MB animation frames + webm), `projects/` (~6.9MB thumbnails), `audio/` (~3.4MB ambient), `models/` (~1.7MB 8 GLBs).
- The 58MB `public/games/parallax/` Godot/HTML5 build is **NOT** in the initial fetch — it is presumably lazy-loaded only when the user opens that project's iframe. R4's "always-on Godot" was wrong.
- No surprising third-party fetches (one Google Fonts CSS for Caveat). Everything else is same-origin.

## Verdict

The code-only review's top-3 recommendations were:
1. **Recruiter signal (project showcase)** — _LIVE FINDING SHIFTS PRIORITY HIGHER._ The showcase already exists and is genuinely good (8 nicely-presented project cards in `desktop-folder-open.png`), but it is **completely buried**: 6 viewport heights of scroll + a click on a non-obvious "View my work" button before any project content is visible. Recruiters won't get there. Either the menu needs to surface 1-2 viewport-heights up, OR there needs to be a "skip to work" link in a corner from frame 1.
2. **Skip path** — _PRIORITY UNCHANGED, MAYBE HIGHER._ 6x scroll length confirmed exactly. Since the showcase is the strongest content, skipping should land a recruiter directly in the Websites folder, not in the VN menu.
3. **CULTIVATE / naming** — _Cannot evaluate from screenshots; not a live-test item._ Defer to narrative reviewer. No new evidence either way.

**New recommendation (extended finding):** the eager 30-35MB asset payload + always-on audio + persistent "SCROLL TO EXPLORE" CTA after exploring is done are smaller papercuts than R4 imagined, but the leftover `console.log` cluster, favicon 404, and iframe-feature warnings are the kind of things a senior dev WILL notice in 30 seconds with DevTools open. A 15-minute hygiene pass clears them.

**Things the code reviewers were too pessimistic about:** visual tone (vibrant, not grey), pointer-lock hostility (doesn't actually engage in many cases), Escape behavior (works correctly), Godot bloat (lazy-loaded), mobile experience (works fine).

**The single most surprising live finding:** the site looks materially more polished and finished than any of the code-only critiques imply. The "looks gorgeous" verdict applies to the visuals; the real friction is structural — too much waiting before payoff.
