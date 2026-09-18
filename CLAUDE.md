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
