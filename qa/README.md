# FT2 QA & Regression suite

Developer tool - **not part of the coach-facing app** (nothing in `index.html` links to it).
Open `qa/index.html` (live: `https://strykerturbo.github.io/ft2-videos/qa/`, or locally with `python3 -m http.server` from the repo root).

## How it stays safe
Every automated test boots its own hidden copy of `index.html` (fetched fresh, patched in memory only) inside an iframe whose
`localStorage`, `fetch`, clipboard, share sheet, `window.open` and downloads are replaced by in-memory stand-ins.
The sandboxed app cannot touch the coach's real data, the Google Sheet / Apps Script (writes go to an in-memory mock) or send a real message.
The only real network call is a **read-only GET** of the live exercise library (and Valid Values tab) when a test asks for `live: true`
(generator and data-integrity tests), cached once per page load. Results are stored under their own key `ft2-qa-v1`.

## Files
- `qa-core.js`   sandbox, mock backend, results store, runner, summaries, run-to-run comparison
- `qa-tests-1.js` Home, Normal Session, Session Review, Saved Session
- `qa-tests-2.js` Exercise Library, Exercise Detail, Custom Session
- `qa-tests-3.js` Templates, Sharing, Print / Export, Persistence
- `qa-tests-4.js` Navigation matrix, Bottom-nav matrix, Data integrity, Generator QA (1,080-combination sweep)
- `qa-tests-5.js` Usability, Consistency, Responsive, Error / Offline, Security / Privacy, Performance
- `qa-ui.js`, `index.html`  the dashboard

## Adding / changing a test
Each test is `add(id, category, screen, description, {pre, steps, exp, type, severity, smoke, tags, run(env)})`.
`type` is `Automated`, `Hybrid` (program checks what it can, a person confirms) or `Manual` (`run: null`).
Do not pretend a visual / coaching-quality test is automated. `tags` decide which tests "Run tests for these areas" picks.
Keep IDs stable - run-to-run comparison is keyed on them.
