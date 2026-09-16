/**
 * FT2 — private read-only exercise feed, PLUS a shared saved-session store, for the Coaches App.
 *
 * SETUP:
 * 1. Open your Google Sheet (FT2_Full_Exercise_Repository_Updated) — keep it PRIVATE, don't
 *    change any sharing settings on the sheet itself.
 * 2. Extensions menu → Apps Script. This opens a script editor already bound to this sheet.
 * 3. Delete any starter code in Code.gs and paste this whole file in its place.
 * 4. Change SHEET_TAB_NAME below if your exercise data isn't on a tab literally named "Exercises".
 *    You do NOT need to create the Sessions tab yourself -- the script creates it automatically
 *    (with the right header row) the first time anyone saves a practice.
 * 5. Click Deploy → New deployment → gear icon next to "Select type" → Web app.
 *      - Description: anything, e.g. "FT2 read feed"
 *      - Execute as: Me (your account)
 *      - Who has access: Anyone
 *        (this makes the SCRIPT's URL reachable by anyone who has it — the sheet itself
 *         stays private the whole time; the script is the only thing exposed. Note this now
 *         also accepts writes for saved sessions, not just reads -- see "A NOTE ON SECURITY"
 *         near the bottom of this file before treating this as anything beyond a handful of
 *         trusted friends.)
 * 6. Click Deploy. Authorize it when Google prompts you (first time only) — watch for the
 *    authorization popup; if a browser blocks it silently, the deployment can look finished
 *    without actually going live, and the /exec URL will 404.
 * 7. Copy the Web app URL it gives you — it already ends in /exec (that's the whole URL, don't
 *    append another "/exec" to it anywhere). To sanity-check the saved-sessions feature after
 *    deploying, paste this into a browser address bar: <that URL>?sheet=sessions -- e.g. if your
 *    URL is https://script.google.com/macros/s/XXXX/exec, test
 *    https://script.google.com/macros/s/XXXX/exec?sheet=sessions -- it should return [] the first
 *    time (the Sessions tab is created empty on first use).
 * 8. Paste that URL into the app's app.js as APPS_SCRIPT_URL, replacing the empty string.
 *
 * IMPORTANT — updating existing code: Apps Script does NOT auto-update a live deployment when
 * you just save the script. After pasting new code in, go to Deploy → Manage deployments → click
 * the pencil/edit icon on the existing "Web app" deployment → set Version to "New version" → Deploy.
 * This keeps the same /exec URL (so you don't have to change APPS_SCRIPT_URL in the app) while
 * actually shipping the new code. Creating a brand new deployment instead issues a DIFFERENT
 * /exec URL and silently orphans the old one.
 *
 * KNOWN CAVEAT (Aug 2026): the hosted Artifact copy of the app has a strict content security
 * policy that blocks fetch() to any external host except Google Fonts — so this endpoint gets
 * silently skipped there and the app falls back to bundled data, even with a working deployment.
 * The live sync only actually runs on a self-hosted copy (GitHub Pages, Netlify, etc.).
 *
 * ROW FILTERING (added Aug 29, 2026): sheet.getDataRange() can include "ghost" rows — rows that
 * once had content or formatting but are now blank, plus any stray non-exercise rows (notes,
 * spacers) that get pasted in by accident. Previously every row after the header was returned
 * as-is, so these ghost/stray rows silently inflated the exercise count in the app (e.g. showing
 * 109 exercises when only 100 are real). doGet() now skips any row whose "Exercise ID" AND
 * "Exercise Name" are both blank, which is a safe filter — a genuine exercise always has at least
 * one of those two filled in, and a truly blank/ghost row has neither.
 *
 * SAVED SESSIONS (added Sep 2026): a second tab, "Sessions", now stores every coach's saved
 * practices so they sync across devices and can be shared with the friend group instead of living
 * only in one browser's local storage. See the SAVED SESSIONS section near the bottom of this file.
 */

const SHEET_TAB_NAME = 'Exercises';

function doGet(e) {
  // Saved-session reads are routed to a separate handler; everything else below this check is
  // the ORIGINAL exercise-feed behavior, completely unchanged.
  if (e && e.parameter && e.parameter.sheet === 'sessions') {
    return jsonResponse(readSessions());
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAB_NAME);
  if (!sheet) {
    return jsonResponse({ error: 'Tab "' + SHEET_TAB_NAME + '" not found. Check SHEET_TAB_NAME in the script.' });
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('Exercise ID');
  const nameCol = headers.indexOf('Exercise Name');

  const rows = values.slice(1)
    .filter(row => {
      // Skip ghost/blank/stray rows: a real exercise always has an ID or a Name.
      const id = idCol > -1 ? String(row[idCol] || '').trim() : '';
      const name = nameCol > -1 ? String(row[nameCol] || '').trim() : '';
      return id !== '' || name !== '';
    })
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => { obj[header] = row[i]; });
      return obj;
    });

  return jsonResponse(rows);
}

// Handles every WRITE the app makes: saving a new practice, renaming one, rating/commenting,
// adding or discarding an exercise, flipping Shared/Private, or deleting a practice entirely.
// The client always sends the *whole* current session object and this always replaces the whole
// row -- one action ("upsert") covers every kind of edit, since there's no benefit to modeling
// granular per-field updates for a dataset this small.
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // up to 10s -- avoids two friends' saves corrupting each other if they land at the same moment
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'upsert') {
      upsertSession(body.session);
      return jsonResponse({ ok: true });
    }
    if (body.action === 'delete') {
      deleteSessionRow(body.session && body.session.id);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ ok: false, error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * MULTI-SELECT TAG DROPDOWNS — use the native Sheets feature, not a script (corrected Aug 28, 2026)
 *
 * An earlier version of this file added an onEdit() workaround here to fake multi-select via a
 * single-select dropdown. That was wrong — Google Sheets DOES support this natively: set a tag
 * column's Data Validation to "Dropdown (from a range)" with "Chip" display style, then check
 * "Allow multiple selections" in the validation rule panel. No script needed for this at all.
 *
 * One thing that DOES matter for the app: the native multi-select writes its picks into the cell
 * comma-separated (e.g. "Passing, Receiving"), not semicolon-separated like earlier manual entries
 * in this sheet. The app's splitTags() function (in app.js) has been updated to accept both
 * delimiters, so this doesn't require reformatting anything already in the sheet — just make sure
 * you're running the updated app files (Aug 28, 2026 or later).
 *
 * Do NOT also install a custom onEdit() trigger alongside the native multi-select feature — the
 * two would fight over the same cell edits (the native feature already manages the comma-joined
 * list itself; a script reacting to the same edit could double-append or corrupt it).
 */

/**
 * ============ SAVED SESSIONS (added Sep 2026) ============
 *
 * A "Sessions" tab in this same spreadsheet, auto-created (with the header row below) the first
 * time anyone saves a practice -- no manual spreadsheet setup needed beyond pasting this script.
 *
 * Each saved practice's nested phases/exercises data is stored as ONE JSON-stringified column
 * (phasesJson) rather than spread across many columns -- the standard, pragmatic way to fit a
 * nested object into a flat spreadsheet row without inventing a multi-table schema for a dataset
 * this small. Every other column is a plain, human-readable value if you ever want to glance at
 * the tab directly (you generally shouldn't need to edit it by hand).
 */
const SESSIONS_TAB_NAME = 'Sessions';
const SESSIONS_HEADERS = [
  'id', 'name', 'createdBy', 'createdAt', 'totalMin', 'exCount', 'targetDuration',
  'practiceDate', 'location', 'templateId', 'rating', 'comment', 'favorited',
  'visibility', 'phasesJson', 'updatedAt'
];

function getSessionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SESSIONS_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SESSIONS_TAB_NAME);
    sheet.appendRow(SESSIONS_HEADERS);
  }
  return sheet;
}

function readSessions() {
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return []; // header row only, nothing saved yet
  const headers = values[0];
  const idCol = headers.indexOf('id');
  return values.slice(1)
    .filter(row => String(row[idCol] || '').trim() !== '') // skip any blank/ghost rows, same principle as the Exercises tab above
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      try {
        obj.phases = JSON.parse(obj.phasesJson || '[]');
      } catch (err) {
        obj.phases = [];
      }
      delete obj.phasesJson;
      obj.favorited = (obj.favorited === true || obj.favorited === 'true' || obj.favorited === 'TRUE');
      return obj;
    });
}

function upsertSession(session) {
  if (!session || !session.id) throw new Error('Missing session.id');
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1; // 1-based sheet row of an existing match, if any
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(session.id)) { rowIndex = i + 1; break; }
  }
  const row = SESSIONS_HEADERS.map(h => {
    if (h === 'phasesJson') return JSON.stringify(session.phases || []);
    if (h === 'updatedAt') return Date.now();
    return session[h] !== undefined && session[h] !== null ? session[h] : '';
  });
  if (rowIndex === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  }
}

function deleteSessionRow(id) {
  if (!id) return;
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

/**
 * A NOTE ON SECURITY: this deployment (Execute as Me / Who has access: Anyone) means anyone who
 * has your /exec URL can call doPost and write or delete session rows -- there's no login check.
 * That's an acceptable trade-off for a handful of trusted friends who have the app link, the same
 * "obscurity, not real security" model the exercise-feed URL already relied on. It is NOT
 * something to grow past a small trusted group without adding real per-user authentication and
 * server-side access rules.
 */
