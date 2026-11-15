# FT2 Coaches — Usage Analytics (Pass 1: recording + administrator reports)

Pass 1 records how coaches use the app and lets **administrators** ask the server for reports.
There is no dashboard screen yet — that is Pass 2, built on the reports described here.

Code: `claude_FT2_AppsScript_Code.gs` ("USAGE ANALYTICS" section) and `index.html` ("USAGE ANALYTICS" block, `track()`).
Tests: `qa/qa-tests-10.js` (AN-S01..12 server, AN-C01..08 app).

## 1. What is stored (Google Sheet tabs, all created automatically)

| Tab | What it holds |
|---|---|
| `AnalyticsEvents` | One row per event, only ever added to. Columns below. |
| `Admins` | Column A `coachName`: the coaches allowed to see reports. `addedAt` and `note` are free for your own use. |
| `CoachActivity` | One row per coach: `coachKey`, `lastActiveAt`, `lastSeenAt`. Kept up to date by the server so "last active" never needs the whole event history. |

`AnalyticsEvents` columns:

| Column | Meaning |
|---|---|
| `eventId` | Unique id. Made by the app (`e…`) or by the server (`srv-…`). A repeated id is never stored twice. |
| `timestamp` | The **server's** clock, UTC text, always `2026-11-14T18:05:22.123Z`. The app may only say "this happened N ms ago" (events wait in a small batch, or while offline); the server subtracts that from its own clock, at most 48 hours. |
| `coachKey` | The coach behind the sign-in token (lower-cased name). Never taken from the request. |
| `eventType` | One of the types in section 2. |
| `entityType` | `exercise`, `session`, `template` or `feature`. |
| `entityId` | Exercise id / session id / template id / feature key. |
| `sessionId` | The saved session involved, when there is one. |
| `metadata` | Small JSON object. Only these keys are accepted: `name source section method context format layout focus age style location target minutes count stage from template generated tab`. |

Every cell is plain text (no formula can run). **Never stored:** sign-in tokens, the club code, session notes, exercise notes,
the post-session comment, search text, session titles, template names.

## 2. Events and exactly when they fire

Recorded only for a coach signed in to the shared server. "This phone only" coaches and people opening a share link send nothing.

### Reported by the app

| Event | Fires when | Details kept |
|---|---|---|
| `app_opened` | The app starts on a signed-in phone, or the coach comes back to it after 30+ minutes away. | `source`: launch / return |
| `app_session_started` | Once per launch, when the server confirms the sign-in (first successful sessions sync), or right after joining / adding a phone. | `method` |
| `exercise_viewed` | An exercise's detail page is opened (from the library, Home, Build, Review, a saved session, Favorites, a shared session). Not on re-draws, not when coming Back to it, not when the app reopens on it; a double tap is one view. | `name`, `section`, `source` |
| `exercise_added` | The coach adds an exercise to the draft session or to a saved session (and it was not already there). Undo of a removal counts as an add. Exercises placed by Custom Session or Copy Session are **not** additions. | `name`, `section`, `source` (library / detail / quick_pick / balance / undo), `context` (draft / saved_session); `sessionId` for a saved session |
| `exercise_removed` | The coach removes an exercise that was in the draft or in a saved session. | `name`, `context` |
| `exercise_replaced` | Replace swaps one exercise for a different one. Not counted as an add or a remove. | `name`, `from` (old id) |
| `exercise_favorited` / `exercise_unfavorited` | The bookmark on an exercise really changes. | `name`, `section` |
| `exercise_search_performed` | The coach types at least 2 characters in the exercise search and pauses (1.2 s). Once per search, until the box is emptied. The words are never recorded. | — |
| `session_started` | A new draft begins: Session Setup → Build with an empty draft (`setup`), first exercise added straight from the library (`library_add`), Copy Session (`copy`), a finished Custom Session (`custom`). Not a save. | `method`, `template` |
| `session_copied` | Copy Session on a saved session. | source session id |
| `custom_session_started` | Home → Custom Session is opened. | — |
| `custom_session_completed` | The generator finishes and Step 4 opens. | `focus`, `age`, `style`, `target`, `location`, `count` |
| `custom_session_failed` | Generation stops with an error (the "Try Again" state). | `focus`, `stage` |
| `quick_pick_used` | The Quick Pick sheet is opened. | `section` |
| `balance_session_used` | The Balance My Session sheet is opened. | — |
| `template_created` | A brand-new template is saved (editing an existing one is not "created"). | `target`, `location`, `age` |
| `template_used` | A template is applied to a session (Session Setup, or "Load a template" on Build). | template id |
| `favorite_opened` | The Favorites page is opened. | — |
| `print_export_used` | A print / export file (PDF or image) has been made. | `format`, `layout`; `sessionId` |

Not instrumented: `practice_started` / `practice_completed` — the app has no practice / run mode.

### Recorded by the server itself (the app cannot send these)

| Event | Fires when |
|---|---|
| `session_saved` | A session is written to the `Sessions` tab for the first time. Details: `count`, `minutes`, `target`, `location`, and `focus` / `age` / `style` / `template` when set. |
| `session_updated` | A saved session's **plan** changes (title, length, exercises, order, exercise minutes). Rating, notes, favourite and "last used" are not updates. |
| `session_shared` / `session_unshared` | Its visibility changes to Shared / back to Private. |
| `session_deleted` | Its row is deleted by its owner. |

A save that fails, is refused, or never reaches the server produces no event.

## 3. Definitions used by every report

- **Period** — `7d`, `30d`, `90d` = today plus the 6 / 29 / 89 days before it; `all` = everything. Days start at midnight in the **spreadsheet's time zone** (File → Settings). Every reply states `timezone` and `range`.
- **Active coach** — did at least one meaningful thing in the period: any event except `app_opened` / `app_session_started`, or saved / edited a session. Reading reports does not count.
- **Last active** — the latest such moment (from `CoachActivity`, and from saved-session times for history before analytics existed). **Last seen** also counts opening the app.
- **Exercise views** — `exercise_viewed` events. **Exercise additions** — `exercise_added` events. **In saved sessions** — read from the `Sessions` tab: saved sessions first saved in the period (and still existing) that contain the exercise, counted once per session however often it is re-saved, plus how many different coaches own them. These are three separate numbers (e.g. 20 / 8 / 6).
- **Sessions saved** — saved sessions that exist in the `Sessions` tab, first saved in the period. **Save actions** — `session_saved` events (still counts a session deleted later). **Session updates** — `session_updated` events.
- **Feature adoption %** — coaches who used the feature in the period ÷ active coaches in the period.
- Exercises are matched by **name** (ids get renumbered in the Sheet), falling back to the id.

## 4. Administrators

A coach is an administrator when their name is in column A of the `Admins` tab (capitals / extra spaces don't matter).
Decided on the server from the sign-in token on every report; nothing the app sends can grant it. Remove the row to remove the access.
Only add names that have **already joined** (they appear in the `Coaches` tab).

## 5. The API (all are POST to the Apps Script URL, body = JSON, no Content-Type header, `token` = the coach's sign-in token)

Errors always look like `{ok:false, error:"auth" | "forbidden" | "invalid" | "rate_limited" | "too_large" | "server_error", message?}`.
`forbidden` = signed in but not an administrator.

### `logEvent` (any signed-in coach)
Request: `{action:"logEvent", token, events:[{id, type, entityId?, sessionId?, meta?, age?}]}` (1–25 events; `age` = ms since it happened).
Reply: `{ok, accepted, duplicates, rejected:[{index, id, error}], error?:"invalid"}` — good events are stored even if others in the batch are refused.
Limits: 25 events per request, 600 per coach per hour, details ≤ 8 keys / 120 characters each / 500 characters in all.

### `getAdminStatus` (any signed-in coach)
Reply: `{ok:true, v, admin:true|false}` — lets the app decide whether to show an Admin entry (the reports still check for themselves).

### The six reports (administrators only)
Common request field: `period` (`7d` | `30d` | `90d` | `all`, default `30d`).
Common reply fields: `ok, v, generatedAt, timezone, range:{period, from, to}`.

| Action | Extra request fields | Reply |
|---|---|---|
| `getAdminOverview` | — | `totals:{totalCoaches, activeCoaches, newCoaches, sessionsSaved, saveActions, sessionUpdates, sessionsDeleted, sessionsStarted, sessionsShared, shareActions, unshareActions, exerciseViews, exercisesAdded, exercisesRemoved, exercisesInSavedSessions, uniqueExercisesUsed}`, `topFeatures:[feature rows, max 5]`, `trendBucket:"day"|"week"`, `trend:[{date, activeCoaches, actions, sessionsSaved, exerciseViews, exercisesAdded}]` |
| `getAdminCoachActivity` | — | `totalCoaches, activeCoaches, truncated, coaches:[{coachKey, name, joinedAt, lastActiveAt, lastSeenAt, active, sessionsSaved, sessionsSavedAllTime, sessionsShared, exercisesAdded, exerciseViews, actions, recentActivity:[{timestamp, eventType, entityType, entityName, entityPrivate}] (5 newest)}]` — most recently active first, max 300 |
| `getAdminExerciseAnalytics` | `limit` (default 100, max 500), `sort` (`views` \| `additions` \| `savedSessions` \| `coachesUsed` \| `name`), `includeUnused` (true = also list library exercises nobody touched) | `totals:{views, additions, removals, savedSessionInclusions}, libraryCount, exerciseCount, truncated, exercises:[{exerciseId, name, section, inLibrary, views, viewers, additions, removals, savedSessions, coachesUsed}]` |
| `getAdminSessionAnalytics` | — | `sessionsSaved, saveActions, sessionUpdates, sessionsDeleted, sessionsStarted, sessionsCopied, sessionsShared, shareActions, unshareActions, coachesWhoSaved, averageExerciseCount, averagePlannedMinutes, averageTargetMinutes, distributions:{focusArea, ageGroup, sessionStyle, location, targetMinutes, builtWith}` — each distribution is `[{value, count, pct}]`; `""` = not set (only a Custom Session knows its focus / age / style) |
| `getAdminFeatureAnalytics` | — | `activeCoaches, features:[{feature, label, uses, coaches, adoptionPct, eventCounts}]` — all 9 features, most used first |
| `getAdminActivityFeed` | `coach` (name or key), `eventType` (one or a list), `limit` (default 50, max 200), `before` (the previous reply's `nextBefore`), `includeAppOpens` | `items:[{eventId, timestamp, coachKey, coachName, eventType, entityType, entityId, entityName, entityPrivate, sessionId}], hasMore, nextBefore, filters, eventTypes:[…], coaches:[{coachKey, name}]` — newest first |

Privacy in replies: a session's title is returned only if its owner has Shared it (`entityPrivate:true` and an empty name otherwise).
No reply contains notes, comments, ratings, share links or tokens. `timestamp`s are UTC text; times shown to people should be converted on screen.

Reports are remembered for up to 5 minutes and re-made as soon as a new event, session or coach is recorded.

## 6. Known limits (Pass 1)

- Counts start when this version is deployed. Older history shows only what the `Sessions` and `Coaches` tabs already hold (saved sessions, who saved them, when).
- A session saved while a coach is offline or not signed in is counted when (and only if) it reaches the server.
- Custom Session / Copy Session exercises are not "additions" (they show up under saved sessions once saved).
- "Sessions shared" on the overview means *shared right now*; `shareActions` counts the act of sharing.
- A duplicate event re-sent more than 6 hours later **and** more than 1,000 rows later would be stored again (the app drops events after 48 hours and normally re-sends within a minute).
- `exercise_viewed` etc. carry the exercise name the app saw; an exercise renamed in the Sheet shows as a new row from then on.
- Templates live on each coach's phone only (never on the server), so template events carry a template id but can never show a template name.
- Google Sheets is the store: fine for a club of this size. If `AnalyticsEvents` ever grows past a few hundred thousand rows, archive old rows to another tab or move to a database — the API above would not change.
