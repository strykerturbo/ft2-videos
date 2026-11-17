# FT2 (Fast Tigers Futbol Training) — Claude Code Instructions

This file loads automatically at the start of every Claude Code session in this
repo. It's the standing ruleset — not a session log. Session history and deep
background live in `FT2_Project_Context.md`; read that for context on past
decisions, but treat *this* file as the rules to follow going forward.

## How you operate

- **Reuse before building.** If a task looks like something already
  solved elsewhere in this repo (a scripted CSS remap, a validated JS
  pattern), extend or reuse that approach instead of solving it fresh
  each time.
- **Prefer deterministic scripts for mechanical, repeatable work.**
  Large, uniform changes (bulk CSS token remaps, find/replace across a
  big file) are more reliable done via a small script than via manual
  line-by-line edits — this repo doesn't have a `tools/` folder today,
  but if a scripted approach earns its keep on a recurring task, add
  one rather than repeating manual edits each time.
- **Treat failures as information, not just obstacles.** When
  something breaks (a sync failure, a deploy gotcha, an edge case),
  fix it, verify the fix, and add what you learned to "Known gotchas"
  below so it doesn't get rediscovered from scratch next session.
- **Don't restructure or rewrite this file, or the project's
  structure, without asking first.** This file is the standing
  ruleset — refine it as you learn things, but treat wholesale
  rewrites or new top-level folders/conventions as something to
  propose, not just do.
- **Check in before repeating anything costly or destructive** —
  re-running something against the live Sheet/Apps Script endpoint,
  force-pushing, or anything else hard to undo.

## Who you're working with

Tisan is a volunteer soccer coach, not a developer. He does not read code and
should never be expected to. Every explanation goes in plain English — what
changed and why it matters for the coach experience, not how the code works
internally.

## What this project is

A mobile-first coaching app for a youth soccer club. One primary user (a
coach with limited prep time) browses a tagged exercise library and builds a
training session across six standard phases, on their phone, in under a
minute. Built as a single self-contained `index.html` — vanilla JS, no build
step, no framework.

- **Hosting:** GitHub Pages, repo `strykerturbo/ft2-videos`
- **Data:** the exercise library syncs one-way from a Google Sheet via an
  Apps Script Web App (`claude_FT2_AppsScript_Code.gs`), with a bundled
  JSON fallback if sync fails. Saved practice sessions sync **two-way**
  through the same Apps Script to a second tab (`Sessions`) in the same
  spreadsheet, added Sep 2026 so sessions follow a coach across devices
  and can be shared with the friend group — see "Coach identity & shared
  sessions" under Known gotchas.
- **Identity:** lightweight, no passwords — a coach picks/types their name
  once (`state.coachName`, `renderWhoIsCoaching()`) and it's remembered on
  that device (`ft2_coach_name_v1` in `localStorage`). This is who saved
  sessions are attributed to and how "My Sessions" is filtered.
- **Assets:** exercise videos and Club Feed PDFs hosted in the same GitHub
  repo, linked directly

## Design work: always invoke the frontend-design skill

Any time you touch UI — new screens, redesigns, new components, or even
visual tweaks to existing ones — invoke the **frontend-design** skill before
writing CSS or markup. Specifically:

- Ground choices in what this actually is: a fast, glanceable tool a coach
  uses on a sideline or in a parking lot before practice, not a generic SaaS
  dashboard. Avoid template defaults (generic card-grid-with-shadows, tracked
  ALL-CAPS eyebrows, the AI-cliché palettes) unless they're a deliberate fit.
- Keep the existing design language consistent unless a redesign is
  explicitly requested: rounded cards/buttons, pill chips, bold condensed
  display type (Barlow Condensed) over Inter body text, dark exercise
  cards with gradient-tinted section tags. As of 2026-09 this follows the
  **FT2 UI/UX Brand Guidelines v2.0** exactly — see "Brand system" below
  for the confirmed-correct logo/icon/color/type values going forward.
- Work in two passes per that skill's process: a short token/plan pass
  (color, type, layout, principles), reviewed against the brief, before
  writing code.
- Build to the quality floor: responsive down to small phones, visible
  focus states, reasonable contrast, motion used sparingly and only where it
  clarifies a state change.

## Mobile app best practices (apply by default, not just when asked)

This is a phone-first tool used one-handed, often outdoors, often on a
mediocre connection. Bake these in without being asked each time:

- **Touch targets:** minimum ~44x44px tappable area on any button, chip, or
  drag handle. Don't shrink targets to fit a tight layout — adjust the
  layout instead.
- **iOS Safari compatibility:** never rely on native HTML5 drag-and-drop —
  use the Pointer Events API (already the pattern used for section
  reordering). Watch for Safari-specific issues with `100vh` (use `dvh` or a
  JS-measured fallback), sticky positioning, and double-tap zoom on rapid
  taps.
- **Safe areas:** account for notches/home indicators with
  `env(safe-area-inset-*)` on any fixed header, footer, or bottom sheet.
- **Thumb reach:** primary actions (Save, Add, confirm buttons) belong in
  the lower half of the screen where a thumb naturally rests; don't bury
  frequent actions in a top corner.
- **Offline / flaky network resilience:** the app already falls back to
  bundled JSON if the Sheet sync fails — preserve and extend this pattern
  for any new remote calls. Never let a failed fetch silently show stale
  data as if it were current; surface it (as the existing sync-failure
  banner does).
- **Performance:** avoid layout thrash — batch DOM reads/writes, avoid
  large synchronous loops on interaction (drag, scroll, filter). Images and
  video thumbnails should lazy-load.
- **Local storage safety:** wrap all `localStorage` access in try/catch
  (private browsing can throw). Existing keys: `ft2_build_draft_v1`,
  `ft2_drag_hint_seen_v1`, `ft2_coach_name_v1` (the signed-in coach's name,
  its own key so it survives independently of the big app-state blob).
- **Test at real mobile widths** (360–430px) before calling UI work done,
  not just at desktop width with dev tools shrunk.

## Delivery expectations

- Explain changes in plain language: what a coach will now see or be able
  to do differently. Skip implementation detail unless asked.
- Validate JS syntax before considering a change done (e.g. a quick
  `node --check` / `new Function(...)` pass on each `<script>` block) — this
  has reliably caught issues before delivery in the past.
- Commit messages should also be plain-English and describe the
  coach-facing change, not just the technical diff.
- When a change is visual, confirm nothing else shifted — screenshot
  comparisons against the prior state where practical.

## Brand system (logo, icons, color, type)

As of 2026-09 the app runs the **FT2 UI/UX Brand Guidelines v2.0** — a
complete design system (source docx + logo + icon SVGs kept in `brand/`
at the repo root, not referenced at runtime, just there for reference).
This replaced two prior ad-hoc passes in the same month (an original
claret/navy/gold system, then a short-lived "Palette 1 Midnight/Electric
Purple" pass) — if you see either of those hex families mentioned in old
context, they're stale.

**Logo**: the tiger-head mark (`LOGO_MARK` constant, defined right before
`ICONS` in the main `<script>` block) replaced the old plain-text "FT2"
in `.logo-badge`. Two render sites use it — `renderTopbar()` and the
"Who's Coaching?" gated pre-login path inline in `render()` — both need
updating together if the logo ever changes again. The favicon (`<link
rel="icon">` in `<head>`) is the same mark inlined as an SVG data URI.

**Icons**: `ICONS` (the big object of inline SVG strings, `<script>`
block) was rebuilt from `brand/icons/` — every plain UI-chrome icon
(nav, actions, content markers) was swapped 1:1 by key name. The six
practice-phase icons (`flame`/`bolt`/`swords`/`circleArrows`/`pitch`/
`trophy`) were deliberately **kept as the original plain line icons**,
not swapped for the new pack's self-colored gradient-circle versions —
those ship as bonus `ICONS.*Circle` entries (`warmupCircle`,
`duelsCircle`, etc.) for a future circular-badge treatment, unused today.
A real bug got fixed in the same pass: `ICONS.home` used to be defined
twice (a dead first definition, silently overwritten by a second) — only
one now exists.

**Color**: the accent and section colors live entirely as CSS custom
properties in `index.html`'s `:root` block (lines ~14-60) — every
section thumbnail, badge, button, focus ring, and star rating references
one of these variables, never a hardcoded hex, so a palette change is a
token edit in one place, not a find/replace across the file. Current
values:

- Neutrals follow the guide's core token table: `--bg-main`/
  `--bg-surface`/`--text-primary`/`--text-secondary`/`--border-color`
  are `#FFFFFF`/`#F8FAFC`/`#0F172A`/`#64748B`/`#E5E7EB` in light, `#0B0F1A`/
  `#111827`/`#FFFFFF`/`#94A3B8`/`#1F2937` in dark.
- `--accent-volt`/`--cone` (primary CTA) → `#F7FF00`, same hex as the
  logo's yellow field. `--warn` (destructive) → `#EF4444`.
- **Six phase colors are two-stop gradients**, not flat hexes: `--sec-
  warmup`/`--sec-athletic`/`--sec-duels`/`--sec-rondos`/`--sec-ssg`/
  `--sec-scrimmage` hold the gradient's flat first-stop hex (for text
  color / border-color, which can't gradient-fill the simple way);
  matching `--sec-*-bg` tokens hold the actual `linear-gradient(90deg,
  ...)` (for surface fills). `SECTION_STYLE` and `PHASE_GROUPS` both
  carry a `color` field (flat) and a `bg` field (gradient) per entry —
  use `.bg` for any new background fill, `.color` for text/borders. The
  90° angle matches the icon SVGs' own left-to-right gradient direction
  on purpose, so flat surfaces and icon art read as one system.
- `--turf` → `#14B8A6` (Teal) — the general interactive accent (focus
  rings, buttons, progress-bar-under-target fill, "added"/selected
  states, the coach avatar, star ratings, "See all" links, draft/
  continue banners). Deliberately **not** one of the six phase hues, so
  it never misreads as a specific phase. This absorbed everything the
  old `--claret` token used to cover once Warmup and Athletic stopped
  sharing one color (see below) — `--claret` no longer exists as a
  general-accent token.
- The progress bar (`.progress-fill`) uses the guide's literal 6-stop
  rainbow gradient across the whole session, not `--turf` — see the CSS
  rule for the exact stops.
- `.mac-tile` (Home's 3 action tiles) is flat neutral dark (`#111827`,
  the guide's "Secondary" button treatment) with a translucent-white
  icon circle — deliberately not a phase color or the CTA yellow, since
  none of the three tiles represent a specific phase or are "the one"
  dominant CTA on that screen.
- None of the phase/accent colors vary by light/dark theme — same hex
  either way, matching how the original claret/navy/gold system behaved.

**Typography**: Barlow Condensed (display/headings — exercise detail
title, phase numerals, page titles, "Who's Coaching?") + Inter (body,
unchanged). Anton was fully removed. Barlow Condensed needs an explicit
`font-weight:700` at each use site — unlike Anton, it doesn't ship a
single heavy default weight.

**Corners**: cards/buttons/inputs are rounded (12-16px cards, 10-12px
controls) per the brand guide's radius table. A prior "Nike sharp
corners" pass used to force everything to `border-radius:0` via a big
`!important` selector list — that block was removed; the pill/circle
exceptions (icon buttons, avatar, the bottom-nav soccer-ball button,
filter chips) are the only radius override left.

## Known gotchas (update this as you learn more)

This section is the project's running memory of what's broken before and
how it got fixed — when you hit and resolve something new, add it here
rather than letting it get rediscovered next session.

- A function that seeds a *fresh* live draft (`duplicateSessionToBuilder()`,
  `startNewSessionDiscardingDraft()`, etc.) should clear its own transient
  UI state (e.g. `state.pickingPhase`, used to highlight the "current
  phase" on Build) itself, not assume the caller already reset it —
  `requestDuplicateSession()` has two call paths (straight through when no
  draft is in progress, or via the guard modal's `confirmDuplicateSession()`
  when one is), and only one of them ran `resetBuilderDraft()` before this
  was fixed, so a stale phase highlight from a completely unrelated earlier
  session could silently leak into a brand-new duplicate. Fixed by having
  `duplicateSessionToBuilder()` clear `pickingPhase` itself, unconditionally,
  regardless of which path led to it — the lesson: when a screen has more
  than one way to reach the same "start fresh" outcome, put the reset
  inside the function that actually does the fresh-start, not in just one
  of its callers.
- The `node` available in this environment is ancient (v0.10, no nvm/newer
  version installed) and can't parse the modern JS this file uses at all
  (template literals, arrow functions, `const`/`let`) — `node --check` /
  `new Function(...)` on the `<script>` block fails on syntax it's never
  seen, not on real bugs, so it's not a usable validation step here despite
  being listed under Delivery expectations above. Validate instead by
  loading the file (or the scratch-preview copy, see below) in the
  browser pane and checking `read_console_messages` for a real
  `SyntaxError` — a clean console load is the real signal a script block
  parses.
- `index.html` regularly exceeds the Claude Browser tool's `file://`
  preview ceiling (roughly 500-600KB) once embedded base64 images are
  included, which makes it fail to render at all when previewed directly.
  Workaround: copy it to `ft2-videos/_scratch-preview.html` with every
  `data:image/png;base64,[A-Za-z0-9+/=]+` blob regex-replaced by a short
  placeholder string, preview that instead, and drive it via `state`/
  `render()`/direct function calls in the browser console rather than
  simulated clicks (unreliable against a `file://` page). Delete the
  scratch file and reset the viewport to `desktop` when done.
- Apps Script sync warnings in local/preview environments are expected —
  they don't indicate a broken backend. Confirm sync health by hitting the
  deployed `/exec` URL directly in a browser and checking for raw JSON.
- Redeploying the Apps Script as a *new* deployment (rather than updating
  the existing one) silently issues a new URL and orphans the old one — if
  sync breaks after a redeploy, check Deploy → Manage deployments first.
- GitHub's web upload strips hyphens from uploaded filenames — always
  verify actual filenames on GitHub rather than assuming from memory.
- CSS-wide changes are more reliable as scripted find/replace across the
  full stylesheet than as manual line-by-line edits, given the file's size.
- `index.html` now has a real design-token system in `:root` (spacing,
  type scale, radius, shadows, icon-button sizes, state opacity/transition)
  added during the 2026-09 visual-system modernization pass — use these
  tokens for any new component instead of inventing a new literal value.
- The old "Nike sharp corners" trick (a second `<style>` block that force-
  zeroed `border-radius` on a hand-picked list of class names) was
  **removed** in the 2026-09 brand-v2 pass — cards/buttons now round per
  their own CSS (`--radius-card`, `.btn`'s 12px, etc.), matching the
  brand guide's radius table. Only pills/circles (icon buttons, avatar,
  the bottom-nav ball button, filter chips) still get a radius override.
  If a new card-like component looks unexpectedly square, check it isn't
  missing its own radius rule — nothing force-zeroes it anymore.
- **Coach identity & shared sessions (added Sep 2026):** saved sessions
  are no longer per-browser-only. `state.coachName` gates the whole app
  behind a "Who's Coaching?" screen (`renderWhoIsCoaching()`) until set;
  every saved-session mutator (`completeSession`, `renameSavedSession`,
  `toggleSessionFavorite`, `setSessionRating`/`setSessionComment`,
  `add/removeExerciseFromSavedSession`, `toggleSessionVisibility`) both
  updates local state immediately AND calls `pushSessionToSheet(session)`
  in the background — check both when adding a new way to edit a saved
  session, not just the local mutation. A session has a `visibility`
  field (`'shared'` default, `'private'`) and the Sessions tab has a
  My Sessions / Community toggle (`state.sessionsViewMode`) filtering on
  it plus `createdBy`. A non-owner's session detail view is read-only —
  gated by a single `isOwner` check in `renderSessionDetail()`, not
  scattered per-control, so that's the one place to touch if the
  read-only rules ever need to change.
- **The `Sessions` tab lives in the same spreadsheet as `Exercises`**,
  auto-created by the Apps Script on first save (no manual sheet setup) —
  see `claude_FT2_AppsScript_Code.gs`'s `SESSIONS_HEADERS`. Each row's
  nested `phases` (with their own nested exercises) is stored as one
  JSON-stringified `phasesJson` column, not spread across columns.
- **Apps Script POST requests must not set an explicit `Content-Type`
  header** (e.g. `'application/json'`) from the client — that turns a
  simple `fetch` into a CORS preflight (`OPTIONS`) request, which Apps
  Script Web Apps don't handle, so the save silently fails. Let `fetch`
  default the body to `text/plain`; the server reads the raw text
  regardless (`JSON.parse(e.postData.contents)`) so this doesn't affect
  parsing on that end.
- **The live Apps Script endpoint occasionally 404s under a burst of
  rapid requests** (several calls within a second or two) and recovers on
  its own moments later — observed repeatedly while testing the session
  sync during initial development, not a sign of a broken deployment.
  This is exactly why every session mutator marks a `_syncPending` flag
  and retries on the next sync rather than treating one failed push as a
  fatal error — don't "fix" a single transient 404 by changing the
  deployment; confirm it's not transient (retry after a few seconds)
  before assuming something's actually broken.
- When testing session sync by hand against the live Sheet, clean up any
  test rows afterward (`{action:'delete', session:{id}}` per row) so
  scratch data doesn't linger in the coach's real spreadsheet.
- **The Exercises grid crashing after sitting on the page a while (2026-10)**: every exercise
  whose thumbnail comes from a video (no dedicated diagram image, so `mediaTagHtml()`'s
  still-frame path kicks in) used to get a real `<video src preload="metadata">` the instant the
  grid rendered — with 100+ exercises and ~30-40 of them video-backed, that's dozens of
  concurrently fetching/decoding `<video>` elements at once regardless of whether they were ever
  scrolled into view. Mobile Safari in particular caps how many video decoder sessions can be
  active at once and kills the page once that's exceeded — which lines up with a delayed crash
  ("after a minute or so"), not an instant one, since it takes a bit for all of them to finish
  fetching and decoding before the cap is hit. Fixed by deferring the real `src` behind
  `data-lazy-src` + a shared `IntersectionObserver` (`initLazyMedia()`, called at the end of
  every `render()`) so only cards actually near the viewport ever get a real video element —
  this is exactly the "video thumbnails should lazy-load" rule already called out under Mobile
  app best practices above, which this still-thumbnail path hadn't actually implemented. Any
  *new* still-thumbnail call site should keep going through `mediaTagHtml()` rather than hand-
  rolling its own `<video>` tag, or it'll silently bypass this lazy-loading and reintroduce the
  same crash as the exercise library grows.
- **Exercise-card thumbnails are pre-made pictures, not live video frames (2026-10).** Showing a
  video's first frame meant downloading and decoding part of a 5-15 MB video (all of them have the
  index at the end of the file, and the link goes through a github.com -> raw.githubusercontent.com
  redirect), which took 1-6 seconds per card. `mediaTagHtml()` now first shows `thumbs/<video file
  name>.jpg` (480px, ~8 KB, served from GitHub Pages) and only falls back to the lazy first-frame
  `<video>` if that picture 404s (`thumbFailed()`). **Every new exercise video needs a matching
  `thumbs/<same name>.jpg`** or it goes back to the slow path; Claude can generate them (draw
  frame 0.1s to a 480px canvas in the browser pane, save as JPEG ~0.78). Also: a `<video>` left at
  `preload="none"` never loads a frame -- flip to `metadata` before setting `src`.
- **Exercise IDs in the Sheet get renumbered by the coach, on purpose and repeatedly (2026-10).**
  Never treat an Exercise ID as permanent. Saved sessions store `{id, name}` per exercise and
  look it up through `resolveSavedExercise()` (id only if the name still agrees, else by
  normalized name, else a close-name id match, else "no longer in the library" -- never a blind
  `exById(entry.id)`). After every successful live sync `reconcileExerciseIds()` remaps this
  device's bookmarks and in-progress draft using an `id -> name` snapshot kept in localStorage
  (`ft2_exercise_index_v1`), and heals the signed-in coach's own saved sessions in place (pushing
  them back to the Sheet, one at a time). It only runs when both the exercise library and the
  sessions list are live. Known limit: renaming an exercise AND renumbering it before any device
  syncs in between can't be matched (nothing links old to new), and ambiguous duplicate names are
  skipped on purpose. Any new feature that stores exercise ids must go through these.
- **Custom Session is a rules-based recommendation engine, not AI (Engine V1, 2026-10).** Home > Custom Session
  is a 4-step workflow of its own: 1 What to work on (`quickStartCustom`: just the 8 repository Focus Areas, `FOCUS_AREAS`, one tap each) > 2 Session
  Setup (`customSessionSetup`; `cs*` state, read via `customSessionConfig()`) > 3 Generating
  (`customSessionGenerating`) > 4 Session Review (`customSessionReview` = the normal `renderReview(true)` over
  the live draft) > Save Session. It must never touch Start New Session's Setup/Build/Review. Generation loads
  the result into the draft via `applyGeneratedSessionToDraft()` (asking first if a different or since-edited
  draft is in progress -- `csDraftUntouched()` compares a fingerprint). The generated draft carries its own
  per-phase plan (`csPlannedByPhase`, read by `sectionPlannedMinutes()`), the generator's warnings
  (`csReviewNotes`, "Worth a look") and its explanation (`csReviewExplain`, "How FT2 built this session"); the
  notes and explanation show only while the draft is still as generated.
  **Engine** = one pure-logic block in `index.html` ("RECOMMENDATION ENGINE V1"). Config objects at its top hold
  every tunable: `RECOMMENDATION_WEIGHTS` (focusArea 30, technical 10, tactical 15, physical 5, cognitive 10,
  age 10, difficulty 5, sessionStyle 5, phase 5, location 3, variety 2), `REC_FOCUS_METADATA` (the 8
  controlled Focus Areas -> strong/supporting tags; a Step 1 choice IS one of these, no translation layer),
  `REC_STYLE_RULES`,
  `REC_PHASE_FIT`, `REC_AGE_POINTS`, `REC_SIMILARITY_PENALTIES`. Flow = `GEN_STAGES`: understand
  (`mapFocusAreaToMetadata`) > find candidates > score/rank (`scoreExerciseForObjective`, `rankExercisesForObjective`)
  > build (`assembleRecommendedSession`: `allocatePhaseMinutes`, `selectExercisesForPhase`, `chooseSessionPlan`,
  variety sweeps via `calculateSimilarity`) > finalize (`validateGeneratedSession`, `repairGeneratedSession`,
  `explainExerciseRecommendation`, `explainSessionRecommendation`); `generateCustomSession(cfg)` runs them all.
  Step 4 always lists each group in the regular workflow order (Activate: Warmup > Athletic; Develop: Duels >
  Rondos > SSGs; Play: Scrimmage) via `reviewGroupFlatOrder(group, true)`; reordering only works among exercises of the
  same section there. Step 4 rows have a Replace button and each group an "Add exercise" button (custom Review only): they open the
  normal Find Exercises picker with `pickReturnTo:'customReview'` / `replaceContext.returnTo:'customReview'`, so Back
  and finishing return to Step 4 (`returnScreenFor()`), never to Build.
  `runCustomGeneration()` runs them one at a time with repaints between, keeps Step 3 up at least 3s (`GEN_MIN_DISPLAY_MS`), never opens
  Step 4 before a valid session exists, and shows Try Again on failure. **Shuffle** (Step 4) re-runs the engine
  with the next shuffle seed (`cfg.shuffleSeed`, `REC_SHUFFLE_JITTER`): a small repeatable nudge to every
  exercise's rank so near-equal choices reorder -- same seed, same session; seed 0 (a fresh Generate) is the
  baseline; it asks first if the coach has edited the draft and keeps their session title. It only READS repository fields (Focus
  Areas, the four tag families + 0-5 scores, Section, Difficulty, Age Group, Duration, Location) -- never edit
  or invent exercise metadata; blank / "None" values count as missing. The Sheet spells "Spacial Awareness";
  tags are compared after normalizing that to "spatial". Deterministic (ties break on name) -- never add
  randomness. Age is a ranking signal (listed 10 / between listed ages 8 / blank 7 / one outside 4 / further
  0), not a filter; location incompatibility IS a hard filter.
  **Standing coach rules the engine enforces:** (1) an exercise only ever goes in the phase whose Sheet
  `Section` it carries -- ranking, selection, repair swaps and draft placement are all per-section (a swap
  that ignored this once put ~45% of sessions' exercises in the wrong phase); (2) 10-15 min of a session stay
  free for breaks (`REC_TIME_BUFFER`; 75 min -> 60-65 of activities), and a short session that can't fit every
  phase leaves the lowest-priority one out and says so; (3) the Activate part (Warmup + Athletic together) averages 25% of the planned activity time, within +/-5 minutes
  (`REC_ACTIVATE_SHARE`), built from exactly ONE Warmup exercise and at most TWO Athletic exercises
  (`REC_PHASE_LIMITS`). The Warmup may be 5 or 10 minutes: Warmup and
  Athletic share one Activate time budget (neither is held to its own slot). Option values in
  `selectExercisesForPhase` are PER MINUTE (score x minutes/5), not per exercise -- summing raw scores rewards many short
  exercises and made long ones (10-min warm-ups, 15-20 min games) almost never win; don't revert that. The engine's internal four groups (Activate / Develop / Apply / Scrimmage, `REC_PROGRESSION`) are never shown to coaches -- Apply is not a phase; coaches only ever see Activate > Develop > Play (SSGs sit in Develop), via each group's `label`. They map onto
  the six Sections as Warmup+Athletic / Duels+Rondos / SSGs / Scrimmage (`REC_PROGRESSION`); Review's own
  3-group display is unchanged. The bundled offline fallback data has no Focus Areas column, so offline the
  Focus Area component is 0 and ranking falls back to tags only. A future AI layer should sit in front (free
  text -> objective + Focus Area + context) and leave this engine as the source of truth.
- **Share a saved session (2026-10).** Saved Session Detail (owner only, not while editing) has a Share button.
  It gives the session a long random `shareToken` (never the session id, which contains a timestamp), pushes it to
  the Sessions tab, confirms the Apps Script can serve it back (`fetchSharedSession`), then opens the phone's share
  sheet (copy-link fallback, then a manual-copy sheet). The link is `<app url>?s=<token>`; on load `initSharedLink()`
  sends it to the read-only `sharedSession` screen, which works with no coach name (`inSharedPreview()` hides the
  nav) and NEVER writes to `savedSessions`, the draft or the Sheet. The Apps Script `?sheet=sessions&share=<token>`
  route (`readSharedSession`) returns only name/dates/length/location/focus/age/style and per-exercise
  `{id,name,duration}` -- never notes, rating, coach name or other sessions; `readSessions` blanks `shareToken` for
  everyone but the owner. Exercises are references: every tap goes through `resolveSavedExercise()` and opens the
  normal Exercise Detail (`fromSharedSession` -> "Back to Shared Session"); a missing one shows "No longer
  available" without breaking the others. Focus area / age group / session style are now stored on sessions saved
  from Custom Session (blank for others). **Needs the updated Apps Script redeployed as a New Version of the
  existing deployment**; until then Share says "Sharing isn't switched on yet". `SESSIONS_HEADERS` gained
  focusArea/ageGroup/sessionStyle/shareToken; `getSessionsSheet_()` appends missing headers itself. Hosting is static,
  so there are no real `/session/<id>` routes -- Universal/App Links are not set up.
- **Sessions page is a hub (2026-10).** `renderSessions()` = Continue Session (only with a real draft; resumes via
  `resumeDraftFromSessions()`: generated Custom drafts -> Step 4, else Build) > Recent Sessions (5 newest; the My Sessions
  / Community toggle filters ONLY this section) > Templates (My Templates, Create New Template). "View All" sets
  `state.sessionsViewAll` and shows the original full list (`renderSessionsAll()`, with the favorite/delete controls).
  No Start New Session button here -- that lives on Home. The practice-template library/editor still render inside
  `renderSettings()` (shared code; Settings no longer has a row for it -- templates are reached only from Sessions); opening them from Sessions sets
  `state.templatesOrigin='sessions'` so Back returns to Sessions and the Sessions tab stays highlighted. The bottom-nav
  Sessions/Settings taps reset these flags. A draft has no "modified" time stored, so the card doesn't show one.
- **Create / Edit Template screen (2026-10).** `renderTemplateEditor()` edits a copy (`state.templateDraft`); only
  `teSaveTemplate()` validates and writes it to `practiceTemplates` (and checks it really landed in localStorage
  before saying "Template saved"). Allocation rules live in the `te*` helpers: enabled sections always total exactly
  100%, each keeps at least `TE_MIN_PCT` (5), `+`/`-` move `TE_STEP` (5) and re-split the remainder over the other
  enabled sections (`teRedistribute`, largest-remainder, whole numbers); minutes use the same rounding (`teMinutes`) so
  they always add up to the session length. The + / - buttons are real 48x48 targets -- don't shrink them. Templates
  now also store `ageGroup`, per-section `description` and `minutes`. Section names are the app's own (Athletic, SSG),
  not the mockup's "Activate", since Activate means Warmup + Athletic everywhere else. Warmup stays first (no grip). Details are all toggle groups (no dropdowns): duration 60 / 75 / 90 only (`TE_DURATIONS`), Outdoor / Indoor, U8-U12 with U11 the default (`TE_DEFAULT_AGE`); the selected one is volt with a small dark outline.
- **Print / Export vs Share Session (2026-10).** Three separate actions, never merged: Save Session (library), Print / Export
  (PDF or image, always exactly ONE page of the chosen size in `PRINT_LAYOUTS`: Pocket 4.25x5.5in / Half Page 5.5x8.5in /
  Full Page 8.5x11in; `ftRenderPages()` draws on canvas and auto-fits -- full size first, then smaller type down to each layout's
  `minNote` floor, then progressively shorter notes (`FT_TRIM_LEVELS`) and diagrams -- so everything lands on the one page;
  the PDF is a hand-written container of the JPEG page image, `ftBuildPdf()`; page text comes from the exercise
  repository trimmed by `ftBrief()`, diagrams from the same-origin repo files / `thumbs/*.jpg` so the canvas stays
  exportable), and Share Session (ONE tap: the link is prepared in the background when a saved session opens -- `prefetchShareLink()`, cached in
  `state.shareReady` -- so the tap itself synchronously copies the "name / 75 min - U10 - Outdoor / View this session in FT2
  Coaches: link" message, flashes "Session Link Copied" and opens the phone's share sheet; browsers only allow clipboard +
  share straight from a tap, so nothing in that tap may wait on the network; if the link isn't ready yet a sheet gets it and
  asks for one more tap). The Print & Share section sits at the top of Saved Session Detail and (bottom, Save Session stays
  the footer CTA) on Session Review; layouts are Pocket / Half Page / Full Page (single page each); on Review an unsaved
  draft only gets the "Save your session first" sheet, never a file or link. A new layout is one more `PRINT_LAYOUTS` entry.
- **Start time (2026-10).** Sessions now carry a `startTime` ("HH:MM", 24h, '' = none): set on Session Setup and Custom Session
  Step 2 (`practiceStartTime` / `setupStartTime` / `csStartTime`, last used is remembered, default 5:00 PM), editable on Saved Session
  Detail in edit mode, stored in a new Sessions-tab `startTime` column (Apps Script keeps it as plain text -- Sheets turns "17:00" into
  a time cell otherwise -- and `startTimeText_()` reads either shape). The printed sheet's header (black square tiger logo on plain white,
  title, then date | time range | length | age | location with icons) and each phase bar's (no icons, just the name) "15 MIN (5:00 - 5:15 PM)" window come from it
  (`ftPrintModel`, phases laid end to end from the start time; the header range is start -> start + session length). No start
  **Print always uses the LIVE exercise library**: `createPrintFile()` waits on `ensureExercisesSynced()` (2 tries, 15 s each) and shows
  "Couldn't load the latest exercises" instead of drawing a session against the bundled copy (which lacks newer exercises and most diagrams).
  The sheet header uses the square black tiger-head logo (`LOGO_PRINT`, from tigerhead.svg: white tiger + FT2 on black), as tall as the two header text rows. Every
  exercise video needs a `thumbs/<name>.jpg` for its print diagram too (`ftImageUrl`).
  time = no clock times printed, nothing else changes. Needs the Apps Script redeployed as a new version.
  **Weekly schedule (`PRACTICE_SCHEDULE`)**: Mon 5:00-6:30 PM outdoor (90), Tue 6:00-7:00 PM indoor (60), Thu 5:00-6:15 PM outdoor (75).
  Picking one of those dates on Session Setup / Custom Session Step 2 pre-fills start time, length and location, except fields the
  coach already changed by hand (`setupTouched` / `csTouched`); other days keep the last-used values. Change the schedule there only.
- **Bottom sheets pull down to dismiss (2026-10).** `initSheetDrag()` (delegated on `#overlay`) lets any `.sheet` be dragged down by its
  grey grabber bar or the title strip under it; a long pull or quick flick "taps" the sheet's own `.sheet-backdrop`, so it closes through
  that sheet's normal close handler (a sheet that refuses, e.g. while a PDF is being made, springs back). New sheets only need the
  existing pattern: a `.sheet-backdrop` with an onclick immediately before the `.sheet`, with a `.sheet-handle` first inside it.
- **Yellow needs a grey edge (2026-10).** Every solid-yellow button/box carries a light-grey border (`.btn-primary` 1.5px #B8C2CF, #64748B in dark;
  also `.hm-start`, `#workflowFooter .btn-primary`) because yellow on white doesn't read on its own -- keep it on any new yellow control.
  The bottom workflow CTA (`#workflowFooter`) has equal 12px white space above and below the button. Custom Session Step 1 always opens with nothing selected.
- **Saved Session Detail top section (2026-10).** Header = Back + "Saved Session" pill, then Favorite + More (...) (no pencil, no visibility tag, no copy icon);
  big title; one metadata grid (date | "75 min session" TARGET | location | coach); a 2-stat dark card (exercises count + `totalMin` ACTUAL
  minutes -- target and actual are deliberately different things and never merged); then the Print PDF / Create Image and Share Session buttons
  side by side (`sessionDetailActionsHtml`, stack under 340px). The More menu (`sessionMoreSheetHtml`): Edit, Copy Session (= the existing
  "make a copy" duplicate flow), Make Private/Shared, Delete Session (existing confirm). Editing mode shows a check "Done" button and makes the
  target number editable inside the metadata. The old Practice date / Location / Added by / Start time cards under Rate this Session were removed (that info is in the header line); the start time is no longer editable on a saved session (set it on Session Setup / Custom Session Step 2; `setSavedSessionStartTime` is unused for now). Rate this Session now sits at the very bottom of the page (after the Training Profile); filled stars are solid (the star icon's inner <g fill="none"> must be overridden on the shape, not the svg). Everything else below the button row is unchanged.
- **Sticky Back pills + Build/Detail tweaks (2026-10).** `.nav-sticky-back` (Find Exercises, Build Session) pins the Back pill with 8px above and below; Find Exercises' pinned
  session box sits at top:44px = that wrapper's height (60px) minus 16 -- change both together. Build Session no longer has collapse arrows: a section's exercises
  always show once it has any, and "+ Add Exercise" sits at the far right (`state.collapsedPhases` is now unused). On Exercise Detail the bookmark lives in the top-right
  corner of the coloured card (`.dh-bm`), not beside "Add to Session".
- **"Session saved" confirmation (2026-10).** `completeSession()` (Save Session on Review / Custom Review) now lands on Home and opens `savedSheetHtml()`: "Session saved",
  where to find it (Sessions > My Sessions), and "Want to share it?" with the Print PDF / Create Image and Share Session buttons plus View Session / Done. New sessions are
  minted with a `shareToken` at save time and the share link is prefetched, so Share is one tap right away. The "Save your session first" path calls
  `completeSession({skipConfirm:true})` and goes straight to the saved session instead.
- **Sticky Back everywhere in the Custom flow + Add Exercise return (2026-10).** Every Back pill on Home -> Intent -> Session Setup -> Building -> Review (and the normal
  Review) now uses `navStickyBackHtml()` (same `.nav-sticky-back` wrapper as Find Exercises), so it docks while scrolling. `.section-pad:has(> .nav-sticky-back:first-child)`
  is `padding-top:1px` so the space above the pill reads equal to the space below. Editing a SAVED session -> "+ Add Exercise" opens the plain Exercises library with
  `editingSavedSessionId` set; that screen now shows "Back to Saved Session" (`backToSavedSessionFromPicker()`, returns in edit mode), and Exercise Detail opened from it goes back
  to that list (`backFromDetail`/`detailBackLabel` check `fromSavedSession && editingSavedSessionId` first). The "Session Link Copied" flash has a 2px white border, `top:27%`.
- **Print: narrower title column + closer header (2026-10).** `PRINT_LAYOUTS.c1f` is 0.18/0.18/0.17 (title column); the diagram column keeps its width so the notes column gets the freed space. A single long
  word can't wrap, so `ftMeasure` eases the title type down (min 84%) to fit it in the narrow column, and only widens the column (cap 25%) if that still isn't enough. Header text starts at
  `M + logoW + fMeta*0.9` (was `+ M*0.9 + fMeta*0.4`) so the title/details sit right beside the logo.

## QA & regression suite (`qa/`)

A developer-only test system lives in `qa/` (open `qa/index.html`; live at `.../ft2-videos/qa/`). It is NOT linked from the app and must never change the coach-facing UI.
305 tests (the 202 checklist IDs H/NS/RV/SS/EX/ED/CS/TM/SH/PR/P plus navigation, bottom-nav, data-integrity, generator, usability, consistency, responsive, error/offline, security and performance
audits), classified Automated / Hybrid / Manual. Each automated test runs the real `index.html` in a hidden iframe with fake storage, fake network (in-memory Apps Script mock), fake clipboard / share sheet,
so real coach data, the Google Sheet and real messages are never touched (only a read-only GET of the live exercise library for generator / data tests). See `qa/README.md`.
- **Smoke suite** (47 tests, ~30 s) = run after every code change before committing. **Full QA** (~2 min) = periodically / before a release; manual + hybrid items then need a person.
- **Testing budget for small tweaks (standing rule from the coach, 2026-10):** do NOT run the full suite or even the whole smoke suite for routine tweaks. Pick a tiny subset: the 3-8 tests tagged for the touched area
  (`QA.testsForAreas([...])`, or by ID) plus at most 2-3 core sanity checks (e.g. H-001, NS-023), aiming for ~30 s and never more than ~2 min total. Prefer the 390px scratch preview + direct DOM/state checks for the visual part.
  Run smoke / full QA only when the coach asks, before a release, or after a risky/cross-cutting change (and say so). Add a new test only when a change adds real new behaviour, and run just that test.
- When behaviour changes on purpose, update the affected test in the same commit (IDs stay stable; comparison between runs is keyed on them).
- Gotchas: the sandbox patches `appBaseUrl`/`initSharedLink`/`GEN_MIN_DISPLAY_MS` in memory only - if those lines are renamed, `QA.loadSource().patches` shrinks and share-link / generation-timing tests should be revisited.
  A hidden browser pane throttles timers (runs look slow) - keep the pane visible when running. **Baseline record:** `qa/BASELINE-2026-10-18.md` (+ `qa/baseline-2026-10-18.json` with per-test statuses) is the reference to compare later runs against. Baseline pass (2026-10): smoke 47/47; full 274 pass / 1 fail / 14 partial / 15 manual not tested. Fixed: PR-005 (a very full Pocket print overflowed because the narrowed title column left no room --
  `ftRenderPages` now tries the narrow column first and widens it by 0.03 only if nothing fits) and RS-001 (Custom Step 4 scrolled sideways at 320-360px -- `.phase-content{min-width:0}` + a <=370px row squeeze).
  Still open (Minor): wrong-shaped saved data blanks the app (P-009), plus the Partial notes (small tap targets, unlabelled icon buttons, no confirm when removing an exercise from a saved session, "Practice"/"Session" wording).
- **Row icons / first-phase cue / focus descriptors (2026-10).** Exercise-row Replace + Trash icons are 17px (Build rows, `.build-ex-actions` now `align-items:center`) / 18px (Review, Step 4, Saved Session edit rows) and share a centre line with the minutes.
  On a brand-new empty session Warmup carries ONLY the green outline (`.first-cue`: no "Start here" text, title stays ink; the green title still shows while actually picking into a phase). Focus-area descriptors are Title Case ("Possession • Passing • Support").
- **Saved Session reorder + pop-up button borders (2026-10).** Edit mode on a saved session shows a drag grip per exercise (2+ in a group): `savedDragCtl` (same engine as Review) -> `setSavedGroupOrder()` rewrites `s.phases` as runs of same-section
  exercises inside the display group (activate/develop/play or `extra-<n>`); one `pushSessionToSheet` on drop (`onDrop` hook in `makeDragReorderController`). Print/Share/Duplicate just walk `s.phases` in order. Pop-ups: every action
  button in `#overlay` (`.btn`, `.btn-edge`, `.btn-outline`, `.sd-act`, `.more-item`, `.balance-add-btn`, `.ios-alert-btn`, `.qp-customize-btn`) uses `border:1.5px solid var(--btn-edge)` (#B8C2CF, #64748B dark) = the "Print / Save PDF" border.
  The red Delete/Discard buttons no longer have a red border (they were already yellow). New QA tests: SS-023 (reorder), CN-009 (pop-up borders).
- **Saved Session "+ Add Exercise" is pre-filtered (2026-10):** `addExerciseToSavedSessionFlow(id, groupKey)` opens the library filtered to the group's first section (Activate -> Warmup, Develop -> Duels, Play -> Scrimmage; the section chips switch to the others). Print header text now starts `max(2.5, fMeta*0.45)`pt right of the logo.
- **Template name error + Save Changes on saved sessions (2026-10).** Save Template with no name -> `state.templateNameError`: toast + red inline "Add a title for your template." under the name field, page scrolls to top, field focused; clears when typing.
  Editing a saved session shows a `.sd-edit-note` and a bottom `Save Changes` CTA (`workflowFooterHtml`, owner only) -> `saveSavedSessionChanges()` (also the header check). GOTCHA: the saved-session title is CSS-uppercased, so read it with `textContent`, never `innerText`
  (innerText returned CAPS and silently renamed sessions to all caps; fixed in the title's onblur too). Tests: SS-024, TM-003 extended.
- **Template editor now mirrors Session Setup (2026-10).** The top is `setupRowHtml` rows (Template Name `.su-title-input`, Duration, Location, Age Group) with the standard black-selected `.su-seg cs-seg` buttons (the yellow `.te-seg` styling and the smaller page title are gone);
  Back is the sticky pill (`navStickyBackHtml`). Start New Session's Back pill is the same sticky wrapper, so space above = space below (9px / 8px).
- **Template editor percentages (2026-10) -- RULE CHANGE.** `TE_STEP` is 1. +/- and the slider (`teSetPct`) change ONLY that section (min 5%, max 100%); nothing is redistributed any more, so the total can be over/under 100% while editing.
  The structure header and a new bottom `.te-total-bar` show the total in red with "Over 100%" / "Under 100%", `Save Template` is `disabled` unless the total is exactly 100 (and `teSaveTemplate` still refuses with a toast), and `teMinutes` shows each
  section's raw share while the total isn't 100. Toggling a section on/off and adding/removing a custom section still re-balance to 100 (unchanged). `.te-page{margin-bottom:-30px}` makes the space under the last button equal the 14px above it.
  QA: TM-006/TM-008 rewritten for this rule; DI-011/012 settle to 100 (`QA.lib.tmplSettle`) before saving.
- **Saved Sessions organization (2026-10).** Sessions page = Continue (draft only) / Recent Sessions (5 most recently USED, `sortSessions(...,'used')`, mine only; Community keeps its old list) / Favorites (only if any) / My Sessions entry / Templates.
  "See All Sessions" opens the library (`renderSessionsAll`, mine mode): search (`#soSearch`, redraws only `#soList`), Sort sheet (Recently Used default, Recently Saved, Oldest, Session Date, Name A-Z; `state.sessionsSort` is remembered in the app snapshot) and a Filter sheet
  (age, focus, duration, location incl. Either, style, favorites; "Filter · N"). Rows are `soRowHtml` (title / date · min · place / N exercises · focus · age + 48px bookmark). Search/filter/sort are views -- `state.savedSessions` order never changes.
  Data model: `createdAt` (first saved), `updatedAt` (last EDIT: rename, length, add/remove/reorder exercises), `lastUsedAt` (opened by its owner, Copy Session on it, or edited), `practiceDate` = the session date, `favorited` = the bookmark,
  new `locationPref` ('either' is only known for Custom Sessions). `sessionUsedAt()` = lastUsedAt -> updatedAt -> createdAt (never invented). `markSessionUsed` saves quietly in the background (`pushSessionToSheet(s,{quiet:true})`: no "Not synced" flag).
  Copy Session still makes an unsaved DRAFT (saving it mints a new id / createdAt) and counts as "using" the original. `claude_FT2_AppsScript_Code.gs` gained `lastUsedAt` + `locationPref` columns and now stores the client's `updatedAt`
  (REDEPLOY as a new VERSION of the existing deployment to sync them across devices; until then the app keeps them locally and merges). Tests SS-025..SS-034.

- **SECURITY HARDENING (2026-10, supersedes the "no passwords" identity note above).** The server now establishes identity itself; the coach name sent by the app is never trusted.
  NO PASSWORDS (coach's decision): a coach joins ONCE with their name + the shared club access code (`join`); a name can be claimed only once. The Apps Script returns a 64-hex token (only its hash is stored, `Auth` tab; the `Coaches` tab holds just the name, salt/hash columns are unused),
  renewed every time it is used. A second phone: Settings > Add another phone (`pairStart`) shows a one-time 8-character code (10 min, one use); the new phone picks "Already joined on another phone?" and sends name + code (`pair`). Signing out asks first (`requestSignOut`) because the name stays claimed.
  Lost every phone: delete the coach's row in `Coaches` (and `Auth`), they join again. Guessing wrong club / phone codes is rate-limited (20 per 15 min, all callers together).
  The app keeps the token in `ft2_auth_v1` and sends it on every session request (`ft2Api()`: POST only; `?sheet=sessions` without `share=` now answers `auth_required`). Ownership is `ownerKey` (lower-cased name, set by the server);
  sessions saved before accounts belong to whoever first registers that name. **Private is the default** (`completeSession`, server default); a share link exists only while `visibility==='shared'` -- Make Private clears the token and the old link
  returns not_found; Share Session on a private session asks first (`shareConfirmSheetHtml`). Others only ever receive shared sessions with notes/rating/favourite/link blanked; the public exercise feed is whitelisted (`PUBLIC_EXERCISE_COLUMNS`:
  no Notes/Source). The server validates/limits everything (`LIMITS`, `validateSession_`), writes plain-text cells (no formula injection), rate-limits sign-in. The client escapes every shared text at output (`escHtml`) and rebuilds cloud sessions defensively (`normalizeCloudSession`).
  **STRICT CSP (P0 pass 2).** The `<meta>` policy has NO `'unsafe-inline'` / `'unsafe-eval'` for scripts: `script-src 'self' 'sha256-<hash of the app script>' cdnjs`. Buttons therefore carry their action as text in `data-onclick="fn('x')"` (also data-oninput/onchange/onkeydown/onblur/onfocus/onpointerdown/onpointerup/onmousedown and data-onerror/onload/...),
  run by the small eval-free interpreter at the top of the script (`installHandlerEngine`, `handlerParse`, `handlerRun`): it only calls the app's OWN functions with literal / event / this arguments, plus if / try / one assignment -- never write real `onclick=` in a template (it would be blocked and do nothing). Handler text must stay inside that tiny language (no arrows, no `state.x` expressions -- make a named function like `openSettingsTab()` instead).
  **EVERY EDIT TO THE APP SCRIPT CHANGES ITS HASH: run `python3 qa/update-csp-hash.py` after editing index.html** (a stale hash = blank page for everyone). A git pre-commit hook (`.git/hooks/pre-commit`, local only) and QA test SEC-023B check it. The QA sandbox re-hashes its patched copy so tests run under the same strict policy and fail on any blocked script (`QA.cspLog`).
  Inline `style=""` is still allowed (`style-src 'unsafe-inline'`; styles cannot run code). Share links are made by the SERVER (`newShareToken_`); the app never picks one. Another coach's private session id answers `not_found` (never `forbidden`).
  **Deploying:** push the new `claude_FT2_AppsScript_Code.gs` as a NEW VERSION of the existing deployment, run `setupClubCode('<code>')` once from the Apps Script editor, give friends the code; each coach creates an account (first claimer of a name owns its old sessions).
  An OLD client against the NEW server cannot sync (no token); a NEW client against the OLD server gets `unknown_action` and keeps working locally -- deploy the server first.
  **QA:** `qa/qa-server.js` runs the real `.gs` file on a pretend Sheet (`QA.newServer()`, `QA.ServerBackend`), so every test exercises the real server rules; `qa/qa-tests-6.js` = SEC-001..SEC-034 and `qa/qa-tests-8.js` = SEC-023B/035-045 (strict policy, handler engine, six hostile strings x six kinds of text on every screen) security regression tests (run them after ANY change to auth, sharing, escaping, the `.gs` file or the CSP).
  The QA sandbox copy of index.html adds `'unsafe-eval'` (the harness reads app state with eval) and its own script hash to the CSP in memory only. Known remaining gaps are listed in the hardening report: club code is one shared secret (anyone holding it can claim a name nobody has claimed yet), exercise feed readable without sign-in, shared-session view is link-based.

- **Favorites hub (2026-10).** The top-bar bookmark opens `renderFavorites()` (screen `favorites`): All / Sessions / Exercises / Templates, newest favorite first, ALL shows 4 per type + "See All", search appears at 8+ favorites.
  ONE doorway for every bookmark button: `isFavorite / setFavorite / toggleFavorite(type,id)` (types session | exercise | template). Storage stays where it was -- exercises `state.bookmarks`, templates `state.templateFavs`, sessions the session's own `favorited` (synced) --
  plus `state.favTimes` (when favorited; session times fall back to last-used). Never add a second favorites store. Exercise + template favorites live on this phone only and are kept PER COACH (`adoptFavoritesFor`, `favOwner`/`favStash`); sessions are per coach already.
  Opening items reuses the normal screens with `fromFavorites` (Exercise Detail, Saved Session) or `templatesOrigin:'favorites'` (template editor), so Back returns to Favorites; Back FROM Favorites uses `state.favBack` (a snapshot of the screen it was opened from). Items that have gone show a
  "No longer available" row (never deleted automatically -- a library still loading must not wipe favorites). `exCard(ex,{open})` / `soRowHtml(s,open)` take the opener name (note `list.map(soRowHtml)` passes an index, hence the typeof check). The old "bookmarked only" Exercise filter code is unused. Tests FAV-001..014.

- **Landscape phones (2026-10).** One CSS block (`@media (orientation:landscape) and (max-height:520px)`, right after `.detail-header.dh-dock`): full-width shell (notch-safe), slim top bar, bottom tabs with icon + label side by side, smaller Save/Next bar, and the sticky Back pill / Exercise Detail header scroll away instead of docking. Workflow screens go from ~109px to ~253px of scrolling area at 844x390. Test RS-007. Portrait / tablet / desktop are untouched.

- **Undo after removing an exercise from a saved session (2026-10).** `removeExerciseFromSavedSession` now remembers where the exercise was (`state.undoRemove`: block label/section + index + the entry) and shows `showUndoToast()` (6 s, an "Undo" button, `.toast-undo`); `undoRemoveExercise()` re-inserts it in place (recreating an emptied block) without touching later edits, then re-syncs. Only the latest removal is undoable; any ordinary `showToast` ends the offer. Test SS-035; US-003 no longer Partial.

- **Keyboard + screen-reader support (2026-10, audit A-01/A-02).** `installA11y()` (top of the script, after the handler engine): a MutationObserver gives every `[data-onclick]` item that is not a real button/link `role="button" tabindex="0"` (skip with `data-a11y-skip`, e.g. `.ex-card`, whose name + bookmark + Add are the tab stops), and Enter/Space act as a tap. `renderOverlay()` ends with `a11yDialogs()`: every `.sheet` / `.ios-alert` gets role dialog/alertdialog + aria-modal + its `<h3>` as name (sheets without an h3 need an `aria-label`), #content/#topbar/#bottomDock go `inert` while one is open, focus moves in, Tab wraps, Esc "taps" the backdrop (same path as tapping outside), focus returns to the opener, and a redraw keeps the coach's place. New pop-ups just need the usual backdrop-then-`.sheet` pattern with an `<h3>`. Icon buttons need an `aria-label`. Tests AC-001..003.
  GOTCHA: a QA dashboard tab left open through a full run gets slow (PF-001/PF-003 then report ~2 s); reload the dashboard and re-run before suspecting the app.

- **Session titles keep the case the coach typed (2026-10).** The title is shown as typed on Build (`.session-name-input`, shrinks in steps via `sessionNameFitClass` so a long title stays visible), Session Review (the same big editable `.session-name-input` as Build -- no more small `.eyebrow-asis` line), Saved Session + shared page (`h1.session-title`) and the printed sheet header (no `toUpperCase`). Anything new that shows the session title as a heading should do the same (no `text-transform:uppercase`). Other labels (step eyebrows, section names, exercise names on Detail) stay capitals. Tests SS-036, NS-025.

- **Session Review header = Build header (2026-11).** Both Review screens (New Session and Custom Step 4 share `renderReview`) open with the Build-style big editable title (pencil) and the same date line "DATE · 75 MIN · OUTDOOR · N EXERCISES" with a pencil that drops down Practice Duration + Location (`bpDetailsPanelHtml(locKey)`, shared with Build; same `state.buildDetailsExpanded` flag). The old "n exercises · place" line and the **Shuffle button + hint are gone from Step 4** (`csShuffle` / `doCsShuffle` and the shuffle seed stay in the code and engine but nothing in the UI calls them). On Step 4 the setters `setTargetDuration` / `commitCustomDuration` / `setPracticeLocation` also update `state.csReviewCfg` through `csReviewSync()` (that copy is what is saved as the session's location preference) and a new length clears `csPlannedByPhase`; Step 4's header under the date line keeps only Focus + age/style. Tests RV-015, RV-016, CS-015, CS-017, CS-018.
  The exercise count now lives on the plan lines, not the date line: Build's progress label reads "<n> / <target> MINS PLANNED · <n> EXERCISES" (`.bp-progress-count`), Review's reads "<n> mins planned · <n> exercises" (`.rv-plan-count`). Review's phase cards are flat (`.phase-strip.rv-flat`): no vertical connector line under the circles, the circle sits top-left with the section name beside it, and the exercise rows run full width from the left edge (the same flat layout is used on the Saved Session page and the shared page: all three strips carry `.rv-flat`, and no screen draws `.phase-connector` any more). Tests RV-017, NS-014, RV-001, RV-002, RV-013, RV-016.

- **Build section lines + Review plan bar (2026-10).** Under each section name on Build (and on custom sections) the line is "<sum of picked minutes> min · <n> exercises" ("0 exercises" when empty) -- no actual/target numbers. Session Review's old "Time Breakdown" dropdown is gone; `.rv-plan` shows "<planned> min planned" (left), "<target> min session" (right), one long bar (`.progress-fill`, red when over) and a note (still to plan / over / right on time), then "<n> exercises · location". Review's Activate / Develop / Play (and custom section) cards also read "<minutes> min · <n> exercises" (their thin bar still compares with the suggested split). The Saved Session page's own Time Breakdown panel is unchanged. Tests NS-026, RV-013, RV-014, RV-002.

- **Notes (2026-11).** The coach's own short, session-specific notes (label is exactly "Notes" everywhere -- never "Coach Note" / "Session Focus"): one for the session (`state.sessionNotes` -> saved `session.notes`) and one per exercise
  (draft `state.exNotes[exerciseId]` -> saved `session.phases[].exercises[].notes`). They live ONLY with the session, never on the library exercise, so the same exercise in a new session starts empty (reset points: `resetBuilderDraft`, `completeSession`,
  `startFromSetup`, remove / replace an exercise; `draftExNotesInUse()` prunes on every draft save). A Duplicate copies them on purpose (it is a copy of that whole session). One shared builder, `noteBlockHtml(scope,a,b,canEdit,kind)`, draws every Notes area
  (scopes `ds` draft session, `de` draft exercise, `ss` saved session, `se` saved exercise). **The Notes area is a real, always-present `<textarea class="nt-field">` whose placeholder is "+ Add Notes"** (dashed box when empty, so a tap lands the cursor in it and brings up the phone keyboard -- never swap it for a button that opens an editor: iOS only raises the keyboard from a direct tap on the field). The session box and every exercise box look the same. Tapping runs `noteFocus` (remembers `state.noteEdit` = the single open box and shows Save / Cancel by adding `.is-active`, NO redraw so the keyboard stays up); typing runs `noteInput` + `noteAutosize`; Save commits (`noteSave`), Cancel redraws from the stored note, and the box is also committed when another box is tapped or the screen is left (`nav`). Exercise boxes sit INSIDE the `.phase-ex-item` row under the title (`.pei-main > .pei-top` holds title + time + trash, then the box) so the box's left edge lines up with the title and the drag-reorder, which moves whole rows, still carries it -- don't put a note beside the row. The title, the time pill, the swap icon and the trash share ONE centre line: each control is a 21px-high box (the title's first-line height) with its icon centred, the touch area growing outward through `::before`, and spacing is an even 8px gap (no inline margins on the swap button). Saved sessions show Notes read-only and only the owner's Edit mode adds / edits them. Print: session Notes under the header, exercise Notes
  as the last "Notes:" paragraph of the text column, never trimmed (only FT2 text is trimmed to fit). PRIVACY: Notes are the owner's only, like the post-session comment -- the server returns them to the owner and strips them (session + every exercise) from other coaches' copies of a
  shared session; `readSharedSession` rebuilds exercises from id/name/duration so a share link can never carry them; the Share message has no exercise text. There is NO "make notes shareable" switch on purpose (the current model has none). Sessions table gained a `notes` column (auto-added; limit 500
  characters server-side, 300 in the box). An older Apps Script has no Notes column: `keepLocalNotes()` stops a sync wiping this phone's notes when the reply has no `notes` key. **Needs the updated Apps Script redeployed as a new version.** Tests NT-001..014, NT-S01..03 (`qa/qa-tests-9.js`).

- **Editable exercise time (2026-11).** On Session Review the time pill on each exercise ("8 min", `.peidur-btn`) opens the "Set Exercise Time" bottom sheet (`timeSheetHtml`, `openTimeSheet` / `timeSheetUp` / `timeSheetDown` / `timeSheetSet` / `timeSheetType` / `applyTimeSheet`): - / + move 1 minute (1 to `EX_TIME_MAX` = 120), presets 5 / 8 / 10 / 12 / 15 are shortcuts only, the middle number can be typed (digits, whole minutes), Cancel / tapping outside / Esc discard (the app's normal sheet behaviour), Update Time applies.
  ONE SOURCE OF TRUTH: the draft stores only exercise ids, so the time the coach sets lives in `state.exDurations[exerciseId]` (set like `exNotes`: cleared by `resetBuilderDraft` / `completeSession` / `startFromSetup` / remove / replace, pruned by `draftExDurationsInUse()` on every draft save, kept by Duplicate) and EVERY draft total reads `exDur(id)` (override, else the library time via `exLibDur`): `currentTotalMinutes`, `computeGroupMinutes`, Build rows + section lines, Review rows + cards + plan bar, the balance / training-profile items, `sectionRemainingMinutes`, and the saved snapshot (`completeSession` writes `duration: exDur(id)`, so a saved exercise's `duration` IS the session time). **Never read `ex.duration` directly for an exercise that is in the draft.** The library exercise is never changed. A changed time also counts as editing a generated session (`csDraftSignature`).
  Wording: **Target** = the session length the coach wants, **Planned** = the sum of the exercise times. No screen says "Actual" (keep it that way unless the app one day records what really happened): Review "<n> mins planned · <m> exercises" + "<t> min target" + note "N min under target / On target / N min over target"; Saved Session header "<t> min target" and the stat "Planned time", "<n> min planned"; shared page "Planned" / "Target". Tests TT-001..009.

- **Desktop / tablet layout (2026-11).** One CSS block ("BIGGER SCREENS", right after the landscape-phone block) -- phones are untouched. 600-899px wide and at least 521px tall: the same one-column app in a 640px column. **900px+ wide and 521px+ tall = desktop layout**: `#shell` becomes a grid (top bar across the top, `.bottomnav` turned into a 232px left-hand menu, `#content` the main area, `#workflowFooter` (Save / Next) docked UNDER the content instead of floating over it; `#overlay` and `#bottomDock` use `display:contents`), content is centred at 860px (980 Home, 1240 Exercises / Favorites) via `#content > *` and `#content[data-screen=...]` (`render()` / `renderSoft()` set `data-screen`), `.ex-grid` is an auto-fill grid, the coloured `.detail-header` becomes a rounded card lined up with the text below, and every `.sheet` is a centred dialog (fades in; the grabber is hidden; a MOUSE drag never moves a sheet -- `initSheetDrag` ignores `pointerType==='mouse'`; Esc / outside click / Cancel close it). A phone held sideways (short) keeps the landscape block, never the desktop menu. The existing look of phones must not change: any new rule for desktop goes inside those media queries. Tests DK-001..006 (they boot the sandbox at 1280 x 800 / 700 / 844x390); NOTE the hidden test frame never runs requestAnimationFrame, so a test that measures an open sheet adds `is-open` itself.

- **Initials badge (2026-11).** The round badge top right (`.avatar` in `renderTopbar`) and the Settings account card show `coachInitials(state.coachName)`: first letter of the first and last name ("Sam Rivera" = SR), one letter for a single name, a leading "Coach" ignored, a person icon if nobody is signed in. It used to be a fixed "TA". Test HM-020.

- **Review exercise rows (2026-11).** Rows on Session Review carry `.rv-row` (Saved Session / shared page rows keep the older compact row): a 120px square picture at the left (`object-fit:contain` so the WHOLE set-up diagram shows, dark letterbox; 84px under 370px wide), the title big (19px bold), then ONE line under it with the time button (32px high, 44px+ touch area through `::before`), swap and trash, then the Notes box whose "+ Add Notes" placeholder is deliberately small (13px; 12px in rows) while typed text stays 16px (below 16px iPhones zoom the page on focus). Layout is a 2-row grid on `.pei-top`. Tests RV-018, NT-010, TT-008, RS-001.
- **Drag-to-reorder fixes (2026-11).** `makeDragReorderController` (Build, Review, Custom Step 4, Saved Session edit): a finger that moves more than 8px on a grip now STARTS the drag (`startDrag`) instead of cancelling it -- the grip has
  `touch-action:none` and never scrolls the page, so the old "hold still 320ms first or nothing happens" rule only made quick drags silently fail (the template editor's grip got the same change). While a row is held near the top / bottom the page scrolls under it
  (`autoScroll`, requestAnimationFrame, only after the finger has travelled 16px that way) so a row can travel further than one screen. `config.canSwap` stops a row from visibly trading places when the data would refuse it (Custom Step 4 across sections used to swap on screen, then snap back on drop).
  `pointercancel` ends a drag like `pointerup` (no row left lifted). The grip's touch area is ~38px wide through `::before`. GOTCHA: a hidden Browser pane never runs requestAnimationFrame -- to check auto-scroll there, stand in `requestAnimationFrame` with a 16ms `setTimeout` in the page first. Test SS-037.

- **Usage analytics, Pass 1 (2026-11) -- recording + administrator reports, NO dashboard screen yet.** Full reference: `ANALYTICS.md` (every event and when it fires, the definitions, the API and reply shapes). The app records what a signed-in coach does through ONE doorway, `track(type, {id, session, meta})` ("USAGE ANALYTICS" block, just before `signedIn()`): events wait in `anQueue` (also in `ft2_an_queue_v1`) and go up in small batches (`anFlush`, action `logEvent`, own `fetch` -- deliberately NOT `ft2Api`, so an analytics hiccup can never sign a coach out or redraw). Everything is wrapped so analytics can never break a workflow; nothing is sent for "this phone only" coaches. Views are tracked in the `openDetail*` openers (never in `nav` / `renderDetail`: Back-from-Favorites re-navigates to Detail and must not count), additions / removals in `addToPhase` / `removeFromPhase` (+ the saved-session versions). NEVER put notes, search text, session titles or template names in an event; the server only accepts the detail keys in `META_KEYS_`.
  Server (`claude_FT2_AppsScript_Code.gs`, "USAGE ANALYTICS"): tabs `AnalyticsEvents` (append-only, plain text, server UTC timestamps), `Admins` (column A = coach names allowed to see reports) and `CoachActivity` (last active per coach) are created automatically. **Saving / updating / sharing / un-sharing / deleting a session is recorded by the SERVER itself** inside `upsertSession_` / `deleteSession_` (`serverEvent_`) -- the app cannot send those types -- and "in saved sessions" numbers are always read from the `Sessions` tab, so views / additions / saved-use stay three separate measures. Reports (`getAdminOverview`, `getAdminCoachActivity`, `getAdminExerciseAnalytics`, `getAdminSessionAnalytics`, `getAdminFeatureAnalytics`, `getAdminActivityFeed`; plus `getAdminStatus` for any coach) each call `requireAdmin_` first; a private session's title is never returned. Periods are calendar days in the spreadsheet's time zone. A new event type = add it to `CLIENT_EVENTS_` (and `FEATURE_OF_` / `FEATURES_` if it is a feature) and to `ANALYTICS.md`.
  **Deploy the Apps Script first (new VERSION of the existing deployment), run `setupAnalytics` once, type the admin's coach name in `Admins!A2`.** A new app against the old server gets `unknown_action` once per launch and stops asking. Tests AN-S01..12 / AN-C01..08 (`qa/qa-tests-10.js`); `qa/qa-server.js` gained `srv.makeAdmin()`, `srv.events()` and a 1,000-row grid like a real tab (write below it without `ensureRows_` and the test fails, as the real Sheet would). GOTCHA: closing a sandbox fires `pagehide`, which flushes the waiting events -- check the server tab, not the queue, after a reopen. Known pre-existing false alarm: SEC-014's source scan trips on saved-session exercise Notes (`e.notes`), unrelated to analytics.

- **Admin Dashboard, Pass 2 (2026-11) -- Settings > Admin Dashboard, administrators only.** Reference: `ANALYTICS.md` section 7. Code: the "ADMIN DASHBOARD" block in `index.html` (`renderAdmin`, everything `ad...`, screen key `admin`; Settings stays lit in the bottom menu, there is deliberately no Admin tab). Things that are easy to get wrong: (1) `ad.status` is only a drawing hint -- the Settings row appears after the server answers `getAdminStatus` (asked lazily the first time Settings is drawn, once per sign-in), and every report is still refused by the server for anyone not in the `Admins` tab; a `forbidden` reply wipes `ad.cache`. Never add a client-side admin flag or store reports in localStorage (they live in `ad.cache`, memory only, 5 minutes, dropped on sign-out / Refresh). (2) No mock or fallback numbers: `adBlock()` draws loading / error + Try again / the report, and a reply in the wrong shape counts as an error (`adO` throws) rather than being drawn as zeros. (3) Charts are hand-built HTML/SVG (`adTimeChart`, `adHBars`) with one mark colour `--ad-mark`; no chart library (the CSP would block one anyway). (4) Search boxes redraw only their list (`#adCoachList`, `#adExList`) so the phone keyboard stays up; other redraws go through `adRender()`. (5) Coach-typed text (names, exercise names, shared session titles) always goes through `escHtml`; private session titles never arrive from the server. (6) Server additions made for Pass 2: the `getAdminCoachProfile` report, `trackingSince` on every report (tells "zero" from "not recorded yet"), feed pages keep same-instant events together -- the backend must be redeployed as a NEW VERSION for these (an older server still serves the six original sections; the coach page then shows a reduced view). Tests: `qa/qa-tests-11.js` (AD-S01..02, AD-C01..11); `world(env)` seeds a club with known history so every number is checked against real server output.

- **Workflow progress dots (2026-11, "Option C"; simplified 2026-11-16).** Setup / Build / Review (and Custom Session's Intent / Setup / Generate / Review) circles between the Back link and the page title. Code: "WORKFLOW PROGRESS DOTS" in `index.html` -- `wfContext()` alone decides where they show and which step is current (Find Exercises and Exercise Detail take the step they were opened from: Build, or Review for a replacement from Review), `wfStepsHtml(steps, current)` draws them, and `navPageTitleHtml()` adds them automatically and then drops its "STEP n OF n" label (Build Session draws its own title, so it calls `wfProgressHtml()` itself). The coach's rules: **the dots are display-only** (no buttons -- an earlier version made finished steps tappable; the coach removed that), **the Back link is the only way back** (one step to the screen just left), **the yellow Next button is the way forward**. No "STEP 2 OF 3" label and no "In Progress" tag on these screens. The Back pill is a full 44px tall with 14px text and a 16px arrow (enlarged 2026-11-16: the coach found the 34px pill too small to hit; 40px on Session Setup on short phones), and its touch area reaches a few px further via `::before`. Three bars pin directly under the 57px Back bar and must move with it if its height ever changes: Build's time summary (`top:57px`), Find Exercises' session box (inline `top:54px`) and Exercise Detail's coloured header (`.dh-dock`, `top:62px` = 1px under that page's own 63px Back bar, which has more padding). Tests: `qa/qa-tests-12.js` (WF-001..006).

- **Usability pass on Home / Session Setup / Build Session (2026-11-16).** Home order: greeting, Start New Session, Continue Session (draft only), Custom Session (the one working Quick Start), Recent Sessions, Featured Exercise, Club Feed, then a plain-text "Coming Soon" note (`.hm-soon-note`, never a card or button). Setup: no subtitle under the title (removed at the coach's request), Start from Scratch is the main card, "Choose a Template" is a quiet link (`.su-alt`) until one is chosen. Build: an empty phase reads "No <Phase> exercises yet" and keeps the same compact "+ Add Exercise" pill on the right as a filled phase (`.pcard-add-pill`; the full-width "+ Add <Phase> Exercise" button was tried and reverted at the coach's request the same day -- don't bring it back); the time summary reads "<n> of <len> min allocated" + remaining / over / "Right on time" and is sticky under the Back bar (`top:57px`; `top:0` on a sideways phone, where the Back bar isn't sticky); rows are the compact cards described below (no description line since 2026-11-16) with a time button that opens the same Set Exercise Time sheet as Review; the trash calls `removeFromBuild()`, which offers Undo (`undoRemoveExercise` handles `kind:'draft'`, restoring position, time and notes). The picker shows "Adding to: <Phase>" / "Replacing in: <Phase>" and "Replacing: <exercise>". Tests: `qa/qa-tests-13.js` (UX-001..006).

- **Start New Session with a draft (2026-11-16).** Two steps, and only the second can discard: `draftSheetHtml()` (bottom sheet: "Current draft", the real draft's title / date / length / exercise count, a save badge from `draftSaveStatus()` -- "Draft saved" / "Saving…" / "Not saved on this phone", driven by `appStatePending` / `appStateStoreOk` set in `scheduleSaveAppStateToStorage` / `saveAppStateToStorage` -- then Resume Session (yellow), Start New Session, Cancel), and `discardDraftDialogHtml()` (light `.ft-alert`: "Discard your current draft?", the draft's title, red "Discard & Start New" -> `confirmDiscardDraftAndStart()`, which ignores a second tap; "Keep Existing Session" / tapping outside -> back to the sheet). State: `confirmNewSessionOpen` (sheet) + `confirmDiscardDraftOpen` (dialog shown instead). Tests: UX-007..009 in `qa/qa-tests-13.js`. Note: the hidden QA iframe does not run the sheet's slide-up animation, so size checks add `is-open` by hand.

- **Session Setup's required Session Name (2026-11-16).** A new session starts unnamed (`initSetupDraft()` sets `setupName = ''` -- no `defaultSessionName()` on the Setup path any more); `#setupNameInput` is a labelled field ("SESSION NAME *", hint "e.g. Tuesday Team Training"). Next looks unavailable (`.is-disabled`, `aria-disabled`) until a non-blank name exists but stays tappable, and `startFromSetup()` refuses a blank / spaces-only name with "Please enter a name for your session." and puts the cursor back. `setSetupName()` never redraws (keyboard stays up); it updates the Next button and error line in place. Auto-focus only for a genuinely new session: `state.setupAutofocus` is set by `requestBuildNewSession()` (no draft) and `startNewSessionDiscardingDraft()`, cleared by `editPracticeSetup()`, and consumed once at the END of `render()` -- after `renderOverlay()`, otherwise a closing pop-up hands focus back to where it was. Phones only open the keyboard when focus happens inside the tap, which this does (render runs synchronously in the click). QA: `QA.setupNext(sb)` types a name if needed and taps Next -- use it instead of clicking "Next: Build Session" directly. Tests UX-010..012.

- **"+ New Exercise" is switched off for now (2026-11-16, coach's request).** `NEW_EXERCISE_ENABLED = false` makes `newExerciseTileHtml()` draw nothing, so the tile at the end of the Exercises grid is gone and nothing in the app can start a coach-made exercise. The code behind it (`createNewExercise`, the draft / save / discard flow, `localExercises`) is left in place unused, and exercises a coach already made stay in their library. Set the flag to `true` to bring it back. Test EX-013 checks the tile is absent.

- **Section time bars are plain green (2026-11-16, coach's request).** The thin bar under each section (`phaseProgressBarHtml`, `.phase-progress-row`) fills with `--turf` instead of the rainbow gradient, which the coach found distracting; it still turns red when over the suggested time. The session-level bars (Build's time summary, Review's plan bar, Find Exercises' session box) keep the rainbow.

- **Scroll shadow under the pinned top area (2026-11-16, coach's request).** `updateStickyEdge()` (just before `initLazyMedia`, which calls it on every redraw; also on `#content`'s scroll) gives the LOWEST strip that is currently pinned -- Back bar, Build's time summary, Find Exercises' session box, Exercise Detail's coloured header -- the class `.stuck-edge` (hairline + soft downward shadow) only while the page is scrolled under it; at rest there is no shadow. A new pinned strip must be added to `STICKY_EDGE_SEL` or it gets no shadow (and the strip above it keeps one). Test UX-013.

- **Compact exercise cards on Build Session (2026-11-16, "Option 3").** `buildExRowHtml()` draws each exercise in a phase as one white card: [grip] [84px square picture (72px under 370px wide, 60px under 340px, 96px from 600px)] [title 18px bold that wraps and is never cut off / optional one-line subtitle / time badge] [Swap over Delete, each a 44x44 button with a 22px icon, teal and grey]. The subtitle comes from `buildExSubtitle(ex)`: the exercise's Format tags ("2v2, 3v3"), else its Category, else nothing -- never invented text. **No description on the card** (the coach removed it; it lives on Exercise Detail, opened by tapping anywhere on the card except the three controls, which all `stopPropagation`). The time badge is still the button that opens Set Exercise Time, and the grip still reorders. Review / Saved Session rows are separate markup (`.phase-ex-item`) and were not changed. Test UX-005.

## Where things live

- **The deliverable is the live app itself** — `index.html`, hosted on
  GitHub Pages at `strykerturbo.github.io/ft2-videos`. That's what Tisan
  actually uses; local edits aren't "done" until pushed there.
- **The Google Sheet is a data source, not a deliverable** — it feeds the
  app via the Apps Script Web App; don't treat Sheets/Docs as where
  finished work lands for this project.
- `claude_FT2_AppsScript_Code.gs` — Apps Script backend source, kept in
  sync with what's actually deployed.
- `FT2_Project_Context.md` — full session history and background
  (searchable reference, not standing rules — this file is the rules).
- No `tools/`, `workflows/`, or `.env` in this repo currently — this is a
  single static app, not a multi-tool automation pipeline. If that
  changes (e.g. a recurring script earns a permanent home), introduce
  that structure deliberately rather than assuming it exists.
