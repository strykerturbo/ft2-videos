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
- **Data:** live sync from a Google Sheet via an Apps Script Web App
  (`claude_FT2_AppsScript_Code.gs`), one-way (Sheet → app), with a bundled
  JSON fallback if sync fails
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
  explicitly requested: Nike-inspired monochrome, amber accent, pill
  buttons, bold/condensed type, dark exercise cards with colored section
  tags, gold (`#D9A54A`) reserved for the scrimmage section (corrected from
  an earlier, never-implemented blue spec -- gold is what's actually live
  and is the confirmed-correct color going forward).
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
  `ft2_drag_hint_seen_v1`.
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

## Known gotchas (update this as you learn more)

This section is the project's running memory of what's broken before and
how it got fixed — when you hit and resolve something new, add it here
rather than letting it get rediscovered next session.

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
  zeroed `border-radius` on a hand-picked list of class names) is still in
  place, but that list is now deliberately exhaustive for every card/chip
  in the app — it used to silently miss several cards (they rendered
  rounded by accident), which is fixed. If you add a new card-like
  component, add it to that denylist (or give it `--radius-pill` if it's
  actually a pill/chip) rather than assuming the site-wide `--radius-card`
  token alone will square it off.

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
