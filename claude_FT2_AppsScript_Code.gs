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
  // the ORIGINAL exercise-feed behavior, completely unchanged. ?coach=<name> identifies who's
  // asking (the same free-text name the app's "Who's Coaching?" screen collects) so a private
  // session only ever gets sent back to the coach who owns it -- see readSessions() below.
  if (e && e.parameter && e.parameter.sheet === 'sessions') {
    const requestingCoach = (e.parameter.coach || '').toString();
    return jsonResponse(readSessions(requestingCoach));
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
//
// requestingCoach is the acting coach's name (again, the same free-text name from "Who's
// Coaching?") -- separate from session.createdBy in the payload, which is just whatever the
// session object already says and proves nothing on its own. upsertSession()/deleteSessionRow()
// check this against who the row is ACTUALLY stored as belonging to before allowing an edit or
// delete of an existing row. This is still name-based, not a real login -- see "A NOTE ON
// SECURITY" near the bottom -- but it closes the "anyone can rename/delete anyone's session with
// zero information" gap the old version had.
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // up to 10s -- avoids two friends' saves corrupting each other if they land at the same moment
  try {
    const body = JSON.parse(e.postData.contents);
    const requestingCoach = (body.requestingCoach || '').toString();
    if (body.action === 'upsert') {
      upsertSession(body.session, requestingCoach);
      return jsonResponse({ ok: true });
    }
    if (body.action === 'delete') {
      deleteSessionRow(body.session && body.session.id, requestingCoach);
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

function readSessions(requestingCoach) {
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return []; // header row only, nothing saved yet
  const headers = values[0];
  const idCol = headers.indexOf('id');
  const createdByCol = headers.indexOf('createdBy');
  const visibilityCol = headers.indexOf('visibility');
  return values.slice(1)
    .filter(row => String(row[idCol] || '').trim() !== '') // skip any blank/ghost rows, same principle as the Exercises tab above
    .filter(row => {
      // A private session only ever goes back to the coach who saved it -- everyone else's sync
      // simply never receives it, instead of downloading every private row and hiding it only in
      // that device's own UI (which is what the client used to have to do on its own).
      if (row[visibilityCol] !== 'private') return true;
      return String(row[createdByCol]) === String(requestingCoach);
    })
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
      // practiceDate is written as a plain "YYYY-MM-DD" string, but that shape is exactly what
      // Sheets' own input parser auto-detects as a real date and silently converts the cell to --
      // so it can come back here as a JS Date object instead of the string the client sent. Left
      // alone, JSON.stringify() turns that Date into a full ISO timestamp ("...T00:00:00.000Z"),
      // which index.html's formatPracticeDateShort() can't parse and silently blanks out (this is
      // exactly what caused Practice Date to show blank on the Session Detail screen). Converting
      // back to YYYY-MM-DD here using the Date's own local fields (not toISOString(), which can
      // shift the day for a coach west of UTC) heals both older rows already written this way and
      // any that slip through despite the plain-text write in upsertSession() below.
      if (obj.practiceDate instanceof Date) {
        const d = obj.practiceDate;
        const pad = n => String(n).padStart(2, '0');
        obj.practiceDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
      return obj;
    });
}

function upsertSession(session, requestingCoach) {
  if (!session || !session.id) throw new Error('Missing session.id');
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const createdByCol = headers.indexOf('createdBy');
  let rowIndex = -1; // 1-based sheet row of an existing match, if any
  let existingCreatedBy = null;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(session.id)) {
      rowIndex = i + 1;
      existingCreatedBy = values[i][createdByCol];
      break;
    }
  }
  if (rowIndex === -1) {
    // Creating a brand-new row -- only allowed to create it as yourself, so a coach can't push a
    // new session that immediately claims to belong to someone else.
    if (String(session.createdBy) !== String(requestingCoach)) {
      throw new Error('Cannot save a session as another coach');
    }
  } else if (String(existingCreatedBy) !== String(requestingCoach)) {
    // Editing a row that already belongs to someone else (rename, rate, add/remove exercise,
    // flip visibility, etc.) -- the previous version allowed this unconditionally.
    throw new Error('Not authorized to edit this session');
  }
  const row = SESSIONS_HEADERS.map(h => {
    if (h === 'phasesJson') return JSON.stringify(session.phases || []);
    if (h === 'updatedAt') return Date.now();
    return session[h] !== undefined && session[h] !== null ? session[h] : '';
  });
  const destRow = rowIndex === -1 ? sheet.getLastRow() + 1 : rowIndex;
  // Force the practiceDate cell to Plain Text *before* writing the row -- otherwise Sheets sees
  // the "YYYY-MM-DD" string and auto-converts the cell to a real date, which is what corrupts it
  // on the next read (see the practiceDate handling in readSessions() above). Setting the format
  // has to happen before setValues(); doing it after only changes the display, not the type
  // Sheets already committed the cell to.
  const practiceDateCol = SESSIONS_HEADERS.indexOf('practiceDate');
  if (practiceDateCol !== -1) {
    sheet.getRange(destRow, practiceDateCol + 1).setNumberFormat('@');
  }
  if (rowIndex === -1) {
    sheet.getRange(destRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  }
}

function deleteSessionRow(id, requestingCoach) {
  if (!id) return;
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const createdByCol = headers.indexOf('createdBy');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      if (String(values[i][createdByCol]) !== String(requestingCoach)) {
        throw new Error('Not authorized to delete this session');
      }
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

/**
 * A NOTE ON SECURITY: this deployment (Execute as Me / Who has access: Anyone) means anyone who
 * has your /exec URL can call doGet/doPost -- there's no login check. Sep 2026 update: reads and
 * writes are now checked against the plain-text coach name the app already collects ("Who's
 * Coaching?") -- a private session is only ever sent back to the coach who owns it, and an
 * edit/delete of an existing session is only allowed when the requesting name matches who it's
 * actually stored as belonging to. That closes "any request can silently rename/delete/read
 * anyone's session with zero information," which the previous version allowed outright.
 *
 * It is still NOT real authentication: nothing here cryptographically proves who's making a
 * request, so a request that deliberately types someone else's exact coach name is still able to
 * act as them (the same way it could type that name into the app's own "Who's Coaching?" screen).
 * That remains an acceptable trade-off for a handful of trusted friends who have the app link, not
 * something to grow past a small trusted group without adding real per-user authentication
 * (e.g. a per-coach secret/token, or real Google-account-based login) and server-side access
 * rules built on top of it.
 */
