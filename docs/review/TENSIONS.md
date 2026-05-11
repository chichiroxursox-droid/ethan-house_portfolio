# Review Team Tensions

## Strong consensus (3+ reviewers agreed)

- **Discoverability / signal is buried.** R3 (no object hints, 600vh forced scroll), R5 (5 clicks to first project, title says "Portfolio"), R1 (mid-grey frame, design intent commented out) — all three say the work is hidden behind ceremony.
- **Lifecycle / always-on cost.** R2 (listener + material leaks, dirty-flag canvas), R4 (always-on audio at gain=0, always-on update loops, no state gating), R1 (fireflies commented out but presumably still wired). The site never sleeps when it should.
- **Iframe / computer mode is the worst offender.** R2 (keydown leak on every open, never disposed), R4 (58 MB Godot WASM re-downloaded every open via `?v=Date.now()` cache-buster), R3 (pointer-lock hostility around the same flow). Three angles, one hot path.
- **Mobile is unaddressed.** R3 explicit (no isMobile branch, pointer-lock unsupported on iOS). R4 implicit (60+ MB heap will OOM). R5 implicit (recruiters open links on phones). No reviewer saw a fallback.

## Genuine disagreements

- **Should the 3D scene be the front door?** R3+R5 want a fast/skip path (recruiter-first, mobile-first, time-to-signal). R1 wants to *double down* on the cinematic (re-enable fireflies, exposure +0.25, rebuild lighting rig). VERDICT: **R3+R5 win for the default path; R1 wins for the polished path.** Ship a `?skip=1` 2D resume route AND fix the lighting — these aren't in conflict, but if forced to pick one sprint, the recruiter fix is higher leverage (R5 confidence: high; R1 confidence: med).
- **Computer.js: split it or instrument it?** R2 wants a 3-file split (desktop/detail/graph). R4 wants to keep the file but add state-gated updates and dirty-flagging. VERDICT: **R4's instrumentation first.** A split with leaks still in it is a bigger file with leaks in it. Fix the listener + canvas-update leaks (concrete LOC cited), then split.
- **Audio strategy.** R4 wants lazy-decode + stop at gain=0 (frees ~60 MB). R1/R5 don't mention audio. No counter-evidence — R4 wins by default, but watch that "stop at gain=0" doesn't break the cross-fade UX R3 implicitly trusts.

## Implicit tensions (pull in different directions)

- **Lazy-load Godot vs. snappy replay.** R4 wants iframe lazy + brotli + drop cache-buster. R3 wants computer mode to feel responsive. The cache-buster exists for a reason (probably stale-state bug); removing it without fixing that re-introduces the original bug. Design needed: replay should reset state via `postMessage`, not via re-download.
- **Pointer-lock vs. universal Esc.** R3 calls pointer-lock hostile; R2 praises the universal Esc affordance. They're describing the same control: Esc both releases the lock AND exits to menu, which is the bounce R3 flagged. Decision: two-stage Esc (first releases lock, second exits) or click-to-lock.
- **Re-enable fireflies (R1) vs. perf budget (R4).** Fireflies are particles + per-frame update. R1 says "ship them"; R4 says "state-gate everything and prune draw calls." Compromise: fireflies only inside the room, frustum-culled, instanced.

## What ALL FIVE missed (blind spots)

- **OG / social meta.** R5 hit `<title>` but missed `og:image`, `og:description`, `twitter:card`. A recruiter who shares the link in Slack gets a blank unfurl.
- **Analytics / funnel.** Nobody checked whether scroll depth, project clicks, or chat sends are instrumented. You can't fix "recruiters bounce at 99% scroll" without data confirming they do.
- **`.env` / API key exposure.** R5 read `ethan-prompt.txt` but no reviewer asked where the chat API key lives. If `chat.js` calls Anthropic/OpenAI directly client-side, the key is in the bundle.
- **Font loading strategy.** R1 noted Caveat-only but didn't flag missing `<link rel="preconnect">` to fonts.googleapis or `font-display: swap`. FOIT on cold load compounds R3's "slow to first signal."
- **SEO / robots / sitemap.** A portfolio with `<title>Portfolio</title>` (R5) almost certainly has no `robots.txt`, no `sitemap.xml`, no structured data — it won't surface for "Ethan Hauger portfolio" search.
- **Accessibility.** Zero reviewer mentioned a11y. Pointer-lock + scroll-jacking + no skip link + no `prefers-reduced-motion` (R4 touched this for perf, not a11y) = unusable for vestibular / screen-reader users. This is also a recruiter signal — "considers accessibility" reads as senior.
- **Deploy / CDN / build size guarantees.** R4 noted ~952 KB un-gzipped but no reviewer checked the deploy target (netlify.toml exists in repo root). Brotli + long-cache headers + immutable hashes are free wins not addressed.
- **Testing strategy.** No reviewer asked about tests. For a code-review pass on a portfolio that's also a hiring artifact, the *absence* of any test file is itself a signal.
- **Error telemetry.** R3 noted chat error swallowed; nobody asked if there's a Sentry / window.onerror catch-all. The site can be silently broken in prod and Ethan would never know.
- **Content for non-tech readers.** R5 fixed the bio framing but everyone treated this as a recruiter document. Family / friends / classmates are also audiences; the room objects (R5) speak to them but the navigation doesn't.

## Reviewer reliability notes

- **3 of 5 hit Playwright lock** (R1 visual, R3 UX, R4 perf). All five critiques are code-only — no observed runtime FPS, no real timing of the 600vh scroll, no actual frame inspection of the lighting. R1's "mid-grey frame" and R3's "recruiter-fatal 600vh" are inferences from CSS/JS, not screenshots. Treat them as strong hypotheses, not measurements.
- **R5 is the only high-confidence reviewer** and the only one who read `ethan-prompt.txt` against the shipped bio. That cross-doc check is why the CULTIVaITE gap surfaced. Lesson: pair every reviewer with a second source-of-truth file when possible.
- **R2 is high-confidence on leaks, low on canvas-update cost** — i.e., R2 explicitly down-weighted their own perf claim. R4's overlap on the same canvas-update concern (computer.js dirty-flag) corroborates it.
