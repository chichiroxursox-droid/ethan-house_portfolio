# Skeptical Recruiter / Narrative Review

## What works (3 bullets)

- **The AI Ethan persona prompt is genuinely good.** It has specific, lived detail — MCL tear, UN speech, Kensington overdose witness, Narberth-to-West-Philly move. The "don't volunteer, just answer" brevity rule prevents it from reading like a LinkedIn bio. This is the strongest narrative asset in the project.
- **Project breadth is real and varied.** 15 projects across 3D web (Glacial, Luminary), Godot game dev (Parallax), Python automation (ClassBot, Email Organizer), civic tech (The Lamppost, Nate's Brakes), AI education (PromptCraft). For an 18-year-old, this is genuinely surprising volume with cross-domain range.
- **The room objects tell a coherent secondary story** without text: cross on the wall, basketball on the floor, microphone on a shelf, dog bed, piano. A recruiter who bothers to explore gets personality cues without a bio dump.

## What doesn't work (5 bullets, ranked by tab-close likelihood)

1. **The title tag is literally "Portfolio" (`index.html:6`).** Browser tab, OG preview, search result — all say "Portfolio." Zero signal. No name, no role, no hook. A recruiter who bookmarks 12 tabs closes this one first because they can't remember whose it is. This is the single fastest fix.
2. **The greeting (`vn.js:14`) is "Hey! Welcome to my space."** Within 5 seconds I know: (a) someone named Ethan lives here, (b) nothing else. Age, role, why I should care — absent. Compare to what the ethan-prompt.txt knows: UN speaker, AI startup founder, 4.0, self-taught Three.js. None of that surfaces without the recruiter clicking three menus deep. The 3D descent eats 20-30 seconds before this greeting even appears.
3. **The About bio (`index.html:79`) says "I'm a senior from West Philly who has been learning AI since November."** "Learning since November" is a liability framing. The prompt file says he's co-founded an AI startup, spoken at the UN, shipped 15 projects. The About copy sounds like an apology. It undersells by a factor of 10.
4. **Several projects have no live URL and no demo.** PromptCraft (`url: null`, no `demoVideo`), CULTIVaITE is mentioned only in the chat prompt and doesn't appear in the computer at all. CULTIVaITE — the AI startup with siblings — is arguably the most impressive line on the resume and it is nowhere in the project showcase.
5. **The 3D gimmick is carrying the room, not the work.** The computer screen is where projects live, but to get there: scroll to descend → wait for camera → talk to Ethan character → click "View my work" → click a folder → click a project card. That is 5 interactions before seeing a project description. If the scroll descent takes 15-20 seconds, a recruiter is gone before they see "Glacial" or "Parallax." There is no fast path.

## Top 3 improvements (ranked by recruiter-conversion impact)

1. **Rewrite the `<title>` and About bio.** Change `<title>Portfolio</title>` to `Ethan Hauger — Builder / West Philly` (or similar). Rewrite `index.html:79` About bio to lead with signal: "18, self-taught. Built 15 projects in 6 months — Three.js, Python, Godot. Co-founded CULTIVaITE. Spoke at the UN on gun violence." Effort: S. Impact: high.
2. **Add CULTIVaITE to the project showcase in `computer.js`.** It is the most hireable line — AI startup, real product, family team — and it does not exist in the `PROJECTS` object. Add it to Apps or give it its own entry. Effort: S. Impact: high.
3. **Replace the VN greeting with a role signal.** Change `GREETING_TEXT` in `vn.js:14` from "Hey! Welcome to my space." to something that establishes identity within 5 words: "Hey — I'm Ethan, I build things." Then surface the menu faster. Effort: S. Impact: med.

## Top 3 next steps (this week)

1. Fix the `<title>` tag and OG meta (add `og:title`, `og:description`, `og:image`). Takes 10 minutes. Pays off every time someone shares the URL or bookmarks it.
2. Add CULTIVaITE as a project entry with a real description and the sibling-co-founder angle. That's an interview conversation starter, not just a bullet.
3. Audit the About copy against the ethan-prompt.txt — every impressive fact in the prompt that doesn't appear in the bio or computer is a recruiter signal being hidden behind 5 clicks.

## Confidence: high

I read the actual source: `vn.js`, `ethan-prompt.txt`, `computer.js` (full project data), `gallery.js` (all 9 polaroids), `roomObjects.js` (room objects list), and `index.html` (title, about bio, VN choices). The gaps between what the prompt *knows* about Ethan and what the UI *surfaces* to a recruiter are not subjective — they are measurable and specific.
