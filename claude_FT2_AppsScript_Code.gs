/**
 * FT2 Coaches - backend (Google Apps Script web app) - SECURITY-HARDENED VERSION (Oct 2026).
 *
 * What it does:
 *   1. Serves the exercise library to the app (public, read-only, CLIENT-SAFE columns only).
 *   2. Stores every coach's saved sessions in a "Sessions" tab, behind REAL per-coach sign-in.
 *   3. Serves a read-only "shared session" page for a share link (only for sessions the coach chose to share).
 *   4. Records how the app is used (the "AnalyticsEvents" tab) and answers usage reports for ADMINISTRATORS only
 *      (coaches listed in the "Admins" tab). See USAGE ANALYTICS near the end of this file.
 *
 * WHO IS THE COACH?  The server decides - never the app. No passwords: coaches only ever type the club access code.
 *   - A coach joins once with their NAME and the CLUB ACCESS CODE (a Script Property you set once - see SETUP below), so strangers who
 *     find the URL cannot create accounts. A name can be claimed only ONCE; the server then gives that phone a long random sign-in
 *     token (it stores only the token's hash) and the app sends it with every request. A coach NAME sent in a request decides nothing.
 *   - Tokens renew every time they are used, so a coach who keeps using the app stays signed in.
 *   - A second phone: the coach taps Settings > Add another phone on the first phone, gets a one-time 8-character code (works once,
 *     10 minutes) and types name + that code on the new phone. Nobody else can take over a claimed name with the club code alone.
 *   - Lost every phone / signed out on the only phone: delete that coach's row in the "Coaches" tab, they join again with the same name.
 *   - Too many wrong club codes / phone codes (20 in 15 minutes, all callers together) pause joining for 15 minutes.
 *
 * WHAT CAN A COACH DO?
 *   - read / edit / delete / create ONLY their own sessions;
 *   - read OTHER coaches' sessions only if those are marked Shared (Community) - and without those coaches' notes, rating, favourite
 *     flag or share link;
 *   - open a share link only while its session is Shared (making a session Private switches its link off immediately).
 *
 * SETUP (one time, and again after pasting new code):
 *   1. Open the Google Sheet -> Extensions -> Apps Script. Paste this whole file over the old code and save.
 *   2. Choose a CLUB ACCESS CODE (a phrase you will share with your coaching friends). Type it between the quotes of
 *      NEW_CLUB_CODE just below, pick the function "setupClubCode" in the toolbar and press Run (authorize if asked).
 *      Then DELETE the phrase from NEW_CLUB_CODE again (it is now stored as a Script Property) and save.
 *   3. Deploy -> Manage deployments -> pencil -> Version: "New version" -> Deploy. (Keeps the same /exec URL.)
 *   4. Existing coaches: the first time each one opens the app it asks for their name + the club code. The first person to claim a
 *      name owns it and its old sessions, so claim yours first. To reset a coach (lost phone), delete their row in the "Coaches" tab
 *      (and any of their rows in "Auth"); they join again with the same name.
 *   5. USAGE ANALYTICS (Nov 2026): after deploying, pick the function "setupAnalytics" in the toolbar and press Run once. It creates the
 *      "AnalyticsEvents", "Admins" and "CoachActivity" tabs. Then type your own coach name (as you joined) in cell A2 of "Admins" -
 *      that makes you an administrator. Run "analyticsSelfCheck" any time to see a plain summary in the execution log.
 *   Keep the Sheet itself PRIVATE. Execute as: Me. Who has access: Anyone (the script enforces who sees what).
 */

const SHEET_TAB_NAME = 'Exercises';
const SESSIONS_TAB_NAME = 'Sessions';
const COACHES_TAB_NAME = 'Coaches';
const AUTH_TAB_NAME = 'Auth';
const NEW_CLUB_CODE = '';   // <- type your club access code here, run setupClubCode once, then blank it again

const API_VERSION = 2;
const LIMITS = {
  maxBodyChars: 200000,       // whole request
  coachNameMin: 2, coachNameMax: 40,
  nameMax: 120, commentMax: 2000, noteMax: 500, labelMax: 60, exNameMax: 200, idMax: 64,
  phasesMax: 14, exercisesMax: 80,
  sessionsPerCoach: 1000,
  tokensPerCoach: 6, tokenTtlDays: 365,       // a token is renewed every time it is used, so a coach who keeps using the app never signs out
  failLimit: 20, failWindowSec: 900,           // wrong club codes / wrong phone codes allowed per 15 minutes (all callers together)
  pairCodeSec: 600,                            // an "add another phone" code works once, for 10 minutes
};
const SECTIONS_ = ['Warmup', 'Athletic', 'Duels', 'Rondos', 'SSGs', 'Scrimmage'];
const FOCUS_IDS_ = ['keep_the_ball', 'play_forward', 'create_and_score', 'beat_players', 'defend_together', 'win_it_back', 'transition_quickly', 'master_the_ball'];
const STYLES_ = ['technical', 'balanced', 'game_based'];

// The exercise columns the app actually uses. Everything else in the sheet (Notes, Source, Source Image, anything you add later)
// stays private unless it is added to this list on purpose.
const PUBLIC_EXERCISE_COLUMNS = [
  'Exercise ID', 'Exercise Name', 'Section', 'Category', 'Difficulty', 'Age Group', 'Duration (min)', 'Focus Areas',
  'Setup', 'Description', 'Coaching Points', 'Variations', 'Diagram URL', 'Video URL',
  'Format Tags', 'Engagement Tags', 'Technical Tags', 'Technical Score', 'Tactical Tags', 'Tactical Score',
  'Physical Tags', 'Physical Score', 'Cognitive Tags', 'Cognitive Score', 'Location'
];

/* ------------------------------------------------------------------------------------------------------------------ */
/* Entry points                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.sheet === 'sessions') {
    // The ONLY public sessions request: one session by its long random share token, trimmed to the plan itself.
    if (p.share) return jsonResponse(readSharedSession(p.share));
    // The old "list everything for ?coach=<name>" request is gone: listing needs a signed-in coach (POST action "list").
    return jsonResponse({ error: 'auth_required' });
  }
  if (p.sheet === 'validvalues') return jsonResponse({ error: 'not_available' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAB_NAME);
  if (!sheet) return jsonResponse({ error: 'Tab "' + SHEET_TAB_NAME + '" not found. Check SHEET_TAB_NAME in the script.' });
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('Exercise ID');
  const nameCol = headers.indexOf('Exercise Name');
  const keep = headers.map(h => PUBLIC_EXERCISE_COLUMNS.indexOf(String(h)) !== -1);
  const rows = values.slice(1)
    .filter(row => {
      const id = idCol > -1 ? String(row[idCol] || '').trim() : '';
      const name = nameCol > -1 ? String(row[nameCol] || '').trim() : '';
      return id !== '' || name !== '';
    })
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { if (keep[i]) obj[h] = row[i]; });   // client-safe columns only
      return obj;
    });
  return jsonResponse(rows);
}

function doPost(e) {
  let lock = null;
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > LIMITS.maxBodyChars) return jsonResponse({ ok: false, error: 'too_large' });
    let body;
    try { body = JSON.parse(raw); } catch (err) { return jsonResponse({ ok: false, error: 'bad_request' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonResponse({ ok: false, error: 'bad_request' });

    lock = LockService.getScriptLock();
    lock.waitLock(10000);   // two friends' saves can't corrupt each other
    const action = String(body.action || '');
    if (action === 'join') return jsonResponse(joinClub_(body));          // new coach: name + club access code
    if (action === 'pair') return jsonResponse(pairPhone_(body));         // same coach, another phone: name + one-time phone code
    // Everything below needs a valid sign-in token. The coach is looked up from the token - nothing the caller says about WHO they are is used.
    const coach = authenticate_(body.token);
    if (!coach) return jsonResponse({ ok: false, error: 'auth' });
    if (action === 'logout') { revokeToken_(body.token); return jsonResponse({ ok: true }); }
    if (action === 'pairStart') return jsonResponse(startPairing_(coach));
    if (action === 'list') return jsonResponse({ ok: true, v: API_VERSION, name: coach.name, sessions: readSessions_(coach) });
    if (action === 'upsert') return jsonResponse(upsertSession_(body.session, coach));
    if (action === 'delete') return jsonResponse(deleteSession_(body.id, coach));
    // Usage analytics. logEvent records what THIS coach did; the getAdmin... reports answer only for a coach listed in the "Admins" tab.
    if (action === 'logEvent') return jsonResponse(logEvents_(body, coach));
    if (action === 'getAdminStatus') return jsonResponse({ ok: true, v: API_VERSION, admin: isAdmin_(coach) });
    if (Object.prototype.hasOwnProperty.call(ADMIN_REPORTS_, action)) {
      getTab_(ADMINS_TAB_NAME, ADMIN_HEADERS);                     // make sure the tab exists while the lock is still held
      try { lock.releaseLock(); } catch (x) {} lock = null;        // a report only reads, so it must not hold up other coaches' saves
      return jsonResponse(ADMIN_REPORTS_[action](body, coach));    // every report checks the Admins list itself, first thing
    }
    return jsonResponse({ ok: false, error: 'unknown_action' });
  } catch (err) {
    if (err && err.ft2) return jsonResponse({ ok: false, error: err.code, message: err.message });
    return jsonResponse({ ok: false, error: 'server_error' });   // never echo internals
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (x) {} }
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(code, message) { const e = new Error(message || code); e.ft2 = true; e.code = code; throw e; }

/* ------------------------------------------------------------------------------------------------------------------ */
/* Small helpers                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

function hex_(bytes) { return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function sha256_(text) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)); }
function randomHex_(n) { let s = ''; while (s.length < n) s += Utilities.getUuid().replace(/-/g, ''); return s.slice(0, n); }
function sameText_(a, b) {   // compares without stopping at the first difference
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
function coachKey_(name) { return String(name || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function validCoachName_(name) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (name.length < LIMITS.coachNameMin || name.length > LIMITS.coachNameMax) return '';
  if (!/^[A-Za-z0-9À-ɏ][A-Za-z0-9À-ɏ .'\-]*$/.test(name)) return '';   // letters / digits / space . ' - (cannot start with = + - @)
  return name;
}
function cleanText_(v, max, label) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') fail_('invalid', label + ' must be text');
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n');
  if (s.length > max) fail_('invalid', label + ' is too long');
  return s;
}
function clampTime_(v, now, dflt) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !isFinite(n)) return dflt;
  return Math.max(1577836800000, Math.min(n, now));
}
function newShareToken_() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const r = randomHex_(48);     // 24 random bytes
  let out = '';
  for (let i = 0; i < 24; i++) out += alphabet.charAt(parseInt(r.substr(i * 2, 2), 16) % alphabet.length);
  return out;
}
function numIn_(v, min, max, label, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  if (!isFinite(n) || n < min || n > max) fail_('invalid', label + ' is out of range');
  return n;
}
// Cells that hold coach-typed text are forced to PLAIN TEXT so a value like  =IMPORTDATA(...)  can never run as a spreadsheet formula.
function setPlainText_(sheet, row, firstCol, count) {
  sheet.getRange(row, firstCol, 1, count).setNumberFormat('@');
}

function getTab_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headers); return sheet; }
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  headers.forEach(h => { if (existing.indexOf(h) === -1) { existing.push(h); sheet.getRange(1, existing.length).setValue(h); } });
  return sheet;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Accounts and sign-in                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

const COACH_HEADERS = ['key', 'name', 'salt', 'hash', 'createdAt'];
const AUTH_HEADERS = ['tokenHash', 'coachKey', 'createdAt', 'expiresAt'];

// Run this once from the editor (see SETUP step 2).
function setupClubCode() {
  const code = String(NEW_CLUB_CODE || '').trim();
  if (code.length < 6) throw new Error('Type a club access code of at least 6 characters into NEW_CLUB_CODE first.');
  PropertiesService.getScriptProperties().setProperty('CLUB_CODE_HASH', sha256_('ft2-club:' + code));
  getTab_(COACHES_TAB_NAME, COACH_HEADERS); getTab_(AUTH_TAB_NAME, AUTH_HEADERS);
  Logger.log('Club access code saved. Now blank NEW_CLUB_CODE in the script and save.');
}

function findCoach_(key) {
  const sheet = getTab_(COACHES_TAB_NAME, COACH_HEADERS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === key) return { row: i + 1, key: String(values[i][0]), name: String(values[i][1]), salt: String(values[i][2]), hash: String(values[i][3]) };
  }
  return null;
}

// Counts wrong guesses of a secret (club code / phone code) for ALL callers together, so the secrets cannot be guessed by trial and error.
function tooManyFails_(bucket) {
  return Number(CacheService.getScriptCache().get('fail:' + bucket) || 0) >= LIMITS.failLimit;
}
function noteFail_(bucket) {
  const cache = CacheService.getScriptCache();
  cache.put('fail:' + bucket, String(Number(cache.get('fail:' + bucket) || 0) + 1), LIMITS.failWindowSec);
}

// A new coach joins with their name and the club access code. A name can be claimed ONCE: the phone that claims it holds its token,
// and nobody else can sign in as that name (they would need a phone code from that coach's Settings, or you delete the row in "Coaches").
function joinClub_(body) {
  const stored = PropertiesService.getScriptProperties().getProperty('CLUB_CODE_HASH');
  if (!stored) return { ok: false, error: 'setup_required' };
  if (tooManyFails_('club')) return { ok: false, error: 'rate_limited' };
  if (!sameText_(sha256_('ft2-club:' + String(body.clubCode || '').trim()), stored)) { noteFail_('club'); return { ok: false, error: 'bad_club_code' }; }
  const name = validCoachName_(body.name);
  if (!name) return { ok: false, error: 'invalid', message: 'Use 2-40 letters, numbers, spaces, . \' or -' };
  const key = coachKey_(name);
  if (findCoach_(key)) return { ok: false, error: 'name_taken' };
  const sheet = getTab_(COACHES_TAB_NAME, COACH_HEADERS);
  const row = sheet.getLastRow() + 1;
  setPlainText_(sheet, row, 1, COACH_HEADERS.length);
  sheet.getRange(row, 1, 1, COACH_HEADERS.length).setValues([[key, name, '', '', String(Date.now())]]);   // salt / hash columns are unused now (no passwords)
  return { ok: true, v: API_VERSION, name: name, token: issueToken_(key) };
}

// A signed-in coach asks for a one-time code to put on a second phone (shown in Settings > Add another phone).
function startPairing_(coach) {
  const cache = CacheService.getScriptCache();
  const old = cache.get('paircur:' + coach.key);
  if (old) cache.remove('pair:' + old);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I to misread
  let code = '';
  const r = randomHex_(16);
  for (let i = 0; i < 8; i++) code += alphabet.charAt(parseInt(r.substr(i * 2, 2), 16) % alphabet.length);
  const h = sha256_('pc:' + code);
  cache.put('pair:' + h, coach.key, LIMITS.pairCodeSec);
  cache.put('paircur:' + coach.key, h, LIMITS.pairCodeSec);
  return { ok: true, code: code, seconds: LIMITS.pairCodeSec };
}

function pairPhone_(body) {
  if (tooManyFails_('pair')) return { ok: false, error: 'rate_limited' };
  const key = coachKey_(body.name);
  const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cache = CacheService.getScriptCache();
  const h = sha256_('pc:' + code);
  const owner = code.length === 8 ? cache.get('pair:' + h) : null;
  const coach = owner && sameText_(owner, key) ? findCoach_(key) : null;
  if (!coach) { noteFail_('pair'); return { ok: false, error: 'bad_phone_code' }; }
  cache.remove('pair:' + h); cache.remove('paircur:' + coach.key);   // one use only
  return { ok: true, v: API_VERSION, name: coach.name, token: issueToken_(coach.key) };
}

function issueToken_(coachKey) {
  const sheet = getTab_(AUTH_TAB_NAME, AUTH_HEADERS);
  const now = Date.now();
  const values = sheet.getDataRange().getValues();
  // forget expired tokens, and keep a coach's newest few
  const mine = [];
  for (let i = values.length - 1; i >= 1; i--) {
    if (Number(values[i][3]) < now) { sheet.deleteRow(i + 1); continue; }
    if (String(values[i][1]) === coachKey) mine.push(i + 1);
  }
  if (mine.length >= LIMITS.tokensPerCoach) mine.slice(LIMITS.tokensPerCoach - 1).forEach(r => sheet.deleteRow(r));   // rows are listed newest-last, so drop the oldest below
  const token = randomHex_(64);
  const row = sheet.getLastRow() + 1;
  setPlainText_(sheet, row, 1, AUTH_HEADERS.length);
  sheet.getRange(row, 1, 1, AUTH_HEADERS.length).setValues([[sha256_('tok:' + token), coachKey, String(now), String(now + LIMITS.tokenTtlDays * 86400000)]]);
  return token;
}

function authenticate_(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = sha256_('tok:' + token);
  const sheet = getTab_(AUTH_TAB_NAME, AUTH_HEADERS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (!sameText_(String(values[i][0]), hash)) continue;
    const expires = Number(values[i][3]);
    if (expires < Date.now()) return null;
    const coach = findCoach_(String(values[i][1]));
    if (coach && expires - Date.now() < LIMITS.tokenTtlDays * 43200000) {   // less than half the lifetime left: renew it
      sheet.getRange(i + 1, 4).setValue(String(Date.now() + LIMITS.tokenTtlDays * 86400000));
    }
    return coach ? { key: coach.key, name: coach.name } : null;
  }
  return null;
}

function revokeToken_(token) {
  const hash = sha256_('tok:' + String(token || ''));
  const sheet = getTab_(AUTH_TAB_NAME, AUTH_HEADERS);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) if (String(values[i][0]) === hash) sheet.deleteRow(i + 1);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Saved sessions                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const SESSIONS_HEADERS = [
  'id', 'name', 'createdBy', 'createdAt', 'totalMin', 'exCount', 'targetDuration',
  'practiceDate', 'location', 'templateId', 'rating', 'comment', 'favorited',
  'visibility', 'phasesJson', 'updatedAt',
  'focusArea', 'ageGroup', 'sessionStyle', 'shareToken', 'startTime',
  'lastUsedAt', 'locationPref', 'ownerKey',  // ownerKey = the coach account that owns the row (set by the server, never taken from the app)
  'notes'                                    // the coach's session-level Notes: private to the owner (the per-exercise Notes live inside phasesJson)
];
const TEXT_COLUMNS_ = ['id', 'name', 'createdBy', 'templateId', 'comment', 'visibility', 'phasesJson', 'focusArea', 'ageGroup', 'sessionStyle', 'shareToken', 'location', 'locationPref', 'ownerKey', 'practiceDate', 'startTime', 'notes'];

function startTimeText_(v) {
  if (v instanceof Date) {
    const pad = n => (n < 10 ? '0' : '') + n;
    return pad(v.getHours()) + ':' + pad(v.getMinutes());
  }
  return v === undefined || v === null ? '' : String(v);
}
function dateText_(v) {
  if (v instanceof Date) {
    const pad = n => (n < 10 ? '0' : '') + n;
    return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
  }
  return v === undefined || v === null ? '' : String(v);
}
function getSessionsSheet_() { return getTab_(SESSIONS_TAB_NAME, SESSIONS_HEADERS); }

function rowObject_(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}
function ownerKeyOf_(obj) { return String(obj.ownerKey || '') || coachKey_(obj.createdBy); }   // old rows (no ownerKey yet) belong to the name they were saved under
function parsePhases_(obj) { try { const p = JSON.parse(obj.phasesJson || '[]'); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
function isTrue_(v) { return v === true || v === 'true' || v === 'TRUE'; }

function sessionForClient_(obj, viewer) {
  const mine = ownerKeyOf_(obj) === viewer.key;
  const out = {
    id: String(obj.id), name: String(obj.name || ''), createdBy: String(obj.createdBy || ''),
    createdAt: Number(obj.createdAt) || 0, updatedAt: Number(obj.updatedAt) || 0, lastUsedAt: Number(obj.lastUsedAt) || 0,
    totalMin: Number(obj.totalMin) || 0, exCount: Number(obj.exCount) || 0, targetDuration: Number(obj.targetDuration) || 0,
    practiceDate: dateText_(obj.practiceDate), startTime: startTimeText_(obj.startTime),
    location: obj.location === 'indoor' ? 'indoor' : 'outdoor', locationPref: String(obj.locationPref || ''),
    templateId: obj.templateId ? String(obj.templateId) : null,
    focusArea: String(obj.focusArea || ''), ageGroup: String(obj.ageGroup || ''), sessionStyle: String(obj.sessionStyle || ''),
    visibility: obj.visibility === 'shared' ? 'shared' : 'private',
    phases: parsePhases_(obj),
  };
  if (mine) {         // the owner's own private extras
    out.rating = Number(obj.rating) || 0; out.comment = String(obj.comment || ''); out.favorited = isTrue_(obj.favorited); out.shareToken = String(obj.shareToken || '');
    out.notes = String(obj.notes || '');
  } else {            // everyone else gets the plan only: no notes, rating, favourite flag or share link
    out.rating = 0; out.comment = ''; out.favorited = false; out.shareToken = '';
    out.notes = '';   // the session Notes, and the Notes on each exercise (kept inside the phases), are the coach's own: removed here
    out.phases = out.phases.map(p => Object.assign({}, p, { exercises: ((p && Array.isArray(p.exercises)) ? p.exercises : []).map(e => { const c = Object.assign({}, e); delete c.notes; return c; }) }));
  }
  return out;
}

function readSessions_(coach) {
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const obj = rowObject_(headers, values[i]);
    if (String(obj.id || '').trim() === '') continue;
    const mine = ownerKeyOf_(obj) === coach.key;
    if (!mine && obj.visibility !== 'shared') continue;     // someone else's private session is never sent
    out.push(sessionForClient_(obj, coach));
  }
  return out;
}

// The public, read-only lookup behind a share link. Only a SHARED session, found by its long random token, trimmed to the plan.
// Notes (session and exercise) are the coach's own and are never part of what a link shows: each exercise is rebuilt below from id, name and length only.
function readSharedSession(token) {
  token = String(token || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { error: 'not_found' };
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { error: 'not_found' };
  const headers = values[0];
  const tokenCol = headers.indexOf('shareToken');
  if (tokenCol === -1) return { error: 'not_found' };
  for (let i = 1; i < values.length; i++) {
    if (!sameText_(String(values[i][tokenCol]), token)) continue;
    const row = rowObject_(headers, values[i]);
    if (row.visibility !== 'shared') return { error: 'not_found' };   // Private = the link is off
    const phases = parsePhases_(row);
    return {
      name: row.name || 'Untitled Session',
      totalMin: Number(row.totalMin) || 0, exCount: Number(row.exCount) || 0, targetDuration: Number(row.targetDuration) || 0,
      practiceDate: dateText_(row.practiceDate), startTime: startTimeText_(row.startTime),
      location: row.location === 'indoor' ? 'indoor' : 'outdoor',
      focusArea: row.focusArea || '', ageGroup: row.ageGroup || '', sessionStyle: row.sessionStyle || '',
      phases: phases.map(p => ({
        label: String((p && p.label) || ''), section: (p && p.section) || null,
        exercises: ((p && Array.isArray(p.exercises)) ? p.exercises : []).map(e => ({ id: String((e && e.id) || ''), name: String((e && e.name) || ''), duration: Number(e && e.duration) || 0 }))
      }))
    };
  }
  return { error: 'not_found' };
}

// Checks and cleans a session sent by the app. Anything not listed here is dropped; anything out of range is rejected.
function validateSession_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail_('invalid', 'Missing session');
  const id = String(raw.id || '');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) fail_('invalid', 'Bad session id');
  const name = cleanText_(raw.name, LIMITS.nameMax, 'Title').trim();
  if (!name) fail_('invalid', 'A session needs a title');
  if (!Array.isArray(raw.phases)) fail_('invalid', 'Missing phases');
  if (raw.phases.length > LIMITS.phasesMax) fail_('invalid', 'Too many sections');
  let exTotal = 0;
  const phases = raw.phases.map(p => {
    if (!p || typeof p !== 'object') fail_('invalid', 'Bad section');
    if (!Array.isArray(p.exercises)) fail_('invalid', 'Bad section');
    const section = (p.section === null || p.section === undefined || p.section === '') ? null : String(p.section);
    if (section !== null && SECTIONS_.indexOf(section) === -1) fail_('invalid', 'Unknown section');
    exTotal += p.exercises.length;
    if (exTotal > LIMITS.exercisesMax) fail_('invalid', 'Too many exercises');
    return {
      label: cleanText_(p.label, LIMITS.labelMax, 'Section name'), section: section,
      exercises: p.exercises.map(e => {
        if (!e || typeof e !== 'object') fail_('invalid', 'Bad exercise');
        const eid = String(e.id === undefined || e.id === null ? '' : e.id);
        if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(eid)) fail_('invalid', 'Bad exercise id');
        const ex = { id: eid, name: cleanText_(e.name, LIMITS.exNameMax, 'Exercise name'), duration: numIn_(e.duration, 0, 240, 'Exercise length', 10) };
        const exNote = cleanText_(e.notes, LIMITS.noteMax, 'Notes').trim();         // this session's Notes for this exercise (never the library exercise)
        if (exNote) ex.notes = exNote;
        ['technicalScore', 'tacticalScore', 'physicalScore', 'cognitiveScore'].forEach(k => { const n = e[k] === null || e[k] === undefined ? null : numIn_(e[k], 0, 5, k, null); if (n !== null) ex[k] = n; });
        return ex;
      })
    };
  });
  const loc = raw.location === 'indoor' ? 'indoor' : 'outdoor';
  const pref = raw.locationPref ? String(raw.locationPref) : '';
  if (['', 'indoor', 'outdoor', 'either'].indexOf(pref) === -1) fail_('invalid', 'Bad location');
  const focus = raw.focusArea ? String(raw.focusArea) : '';
  if (focus && FOCUS_IDS_.indexOf(focus) === -1) fail_('invalid', 'Unknown focus area');
  const age = raw.ageGroup ? String(raw.ageGroup) : '';
  if (age && !/^U\d{1,2}$/.test(age)) fail_('invalid', 'Bad age group');
  const style = raw.sessionStyle ? String(raw.sessionStyle) : '';
  if (style && STYLES_.indexOf(style) === -1) fail_('invalid', 'Unknown session style');
  const date = raw.practiceDate ? String(raw.practiceDate) : '';
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail_('invalid', 'Bad date');
  const start = raw.startTime ? String(raw.startTime) : '';
  if (start && !/^\d{1,2}:\d{2}$/.test(start)) fail_('invalid', 'Bad start time');
  const tmpl = raw.templateId ? String(raw.templateId) : '';
  if (tmpl && !/^[A-Za-z0-9_-]{1,64}$/.test(tmpl)) fail_('invalid', 'Bad template id');
  const now = Date.now();
  return {
    id: id, name: name,
    createdAt: clampTime_(raw.createdAt, now, now),        // the app's clock is only a hint: never in the future, never older than 2020
    updatedAt: clampTime_(raw.updatedAt, now, now),
    lastUsedAt: clampTime_(raw.lastUsedAt, now, 0),
    totalMin: numIn_(raw.totalMin, 0, 1000, 'Total minutes', 0), exCount: numIn_(raw.exCount, 0, LIMITS.exercisesMax, 'Exercise count', 0),
    targetDuration: numIn_(raw.targetDuration, 1, 300, 'Length', 60),
    practiceDate: date, startTime: start, location: loc, locationPref: pref, templateId: tmpl,
    rating: Math.round(numIn_(raw.rating, 0, 5, 'Rating', 0)), comment: cleanText_(raw.comment, LIMITS.commentMax, 'Notes'),
    favorited: raw.favorited === true || raw.favorited === 'true',
    notes: cleanText_(raw.notes, LIMITS.noteMax, 'Notes').trim(),
    visibility: raw.visibility === 'shared' ? 'shared' : 'private',
    focusArea: focus, ageGroup: age, sessionStyle: style,
    shareToken: '',            // never taken from the app: the SERVER creates a share link (see upsertSession_)
    phases: phases
  };
}

function upsertSession_(rawSession, coach) {
  const s = validateSession_(rawSession);
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id'), tokenCol = headers.indexOf('shareToken');
  let rowIndex = -1, existing = null, owned = 0;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === s.id) { rowIndex = i + 1; existing = rowObject_(headers, values[i]); }
    if (ownerKeyOf_(rowObject_(headers, values[i])) === coach.key) owned++;
  }
  if (existing) {
    if (ownerKeyOf_(existing) !== coach.key) {                                                // decided by the account behind the token
      // Someone else's PRIVATE session must look exactly like one that does not exist (no hint that the id is real).
      fail_(String(existing.visibility) === 'shared' ? 'forbidden' : 'not_found', 'Not available');
    }
    s.createdAt = Number(existing.createdAt) || s.createdAt;                                  // fixed when first saved
  } else if (owned >= LIMITS.sessionsPerCoach) {
    fail_('invalid', 'Too many saved sessions');
  }
  // A share link exists only while the session is Shared, and the SERVER makes it: a Private session has none, a session that is
  // already Shared keeps its link, and every new Share (including sharing again after Private) gets a brand-new random link - an old
  // revoked link is never brought back, whatever the app sends.
  if (s.visibility !== 'shared') {
    s.shareToken = '';
  } else if (existing && String(existing.visibility) === 'shared' && /^[A-Za-z0-9]{24}$/.test(String(existing.shareToken || ''))) {
    s.shareToken = String(existing.shareToken);
  } else {
    const used = {};
    for (let i = 1; i < values.length; i++) used[String(values[i][tokenCol])] = true;
    do { s.shareToken = newShareToken_(); } while (used[s.shareToken]);
  }
  const record = Object.assign({}, s, { createdBy: coach.name, ownerKey: coach.key, phasesJson: JSON.stringify(s.phases) });
  const row = SESSIONS_HEADERS.map(h => (record[h] !== undefined && record[h] !== null ? record[h] : ''));
  const destRow = rowIndex === -1 ? sheet.getLastRow() + 1 : rowIndex;
  // Plain-text cells FIRST (so "=..." / "+..." / "-..." / "@..." typed by a coach is stored as text, never as a formula), then the values.
  const textCols = TEXT_COLUMNS_.map(h => SESSIONS_HEADERS.indexOf(h) + 1).filter(c => c > 0);
  textCols.forEach(c => sheet.getRange(destRow, c).setNumberFormat('@'));
  sheet.getRange(destRow, 1, 1, row.length).setValues([row]);
  // Usage analytics: the save is now in the Sessions tab, so it is recorded here by the server (never reported by the app).
  const wasShared = !!existing && String(existing.visibility) === 'shared', isShared = s.visibility === 'shared';
  if (!existing) serverEvent_(coach, 'session_saved', s.id, sessionEventMeta_(s));
  else if (planSignature_(parsePhases_(existing), existing.name, existing.targetDuration) !== planSignature_(s.phases, s.name, s.targetDuration)) serverEvent_(coach, 'session_updated', s.id, sessionEventMeta_(s));
  if (isShared && !wasShared) serverEvent_(coach, 'session_shared', s.id, {});
  if (!isShared && wasShared) serverEvent_(coach, 'session_unshared', s.id, {});
  return { ok: true, session: sessionForClient_(rowObject_(SESSIONS_HEADERS, row), coach) };
}

function deleteSession_(id, coach) {
  id = String(id || '');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) fail_('invalid', 'Bad session id');
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) !== id) continue;
    const row = rowObject_(headers, values[i]);
    if (ownerKeyOf_(row) !== coach.key) fail_(String(row.visibility) === 'shared' ? 'forbidden' : 'not_found', 'Not available');
    sheet.deleteRow(i + 1);
    serverEvent_(coach, 'session_deleted', id, {});
    return { ok: true };
  }
  return { ok: true };   // already gone
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* USAGE ANALYTICS (Nov 2026)                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */
/*
 * WHAT IS RECORDED: one row per thing a signed-in coach did, in the "AnalyticsEvents" tab (created automatically, only ever added to):
 *     eventId | timestamp | coachKey | eventType | entityType | entityId | sessionId | metadata
 *   - timestamp is the SERVER's clock, written as UTC text like 2026-11-14T18:05:22.123Z. The app may say "this happened N
 *     milliseconds ago" (events are sent in small batches, and can wait while a phone is offline); the server subtracts that from its
 *     own clock and never accepts more than 48 hours.
 *   - coachKey is the coach behind the sign-in token. Nothing the app says about WHO did it is used.
 *   - eventType must be on the list below. entityType is exercise / session / template / feature.
 *   - metadata is a small JSON object with allow-listed keys only (see META_KEYS_).
 *   - Every cell is plain text, so nothing typed by a coach can run as a spreadsheet formula.
 *   NEVER recorded: sign-in tokens, the club code, session notes, exercise notes, search text, session titles.
 *
 * TWO KINDS OF EVENT:
 *   - reported by the APP (CLIENT_EVENTS_): opening an exercise, adding one to a session, using Quick Pick, and so on. Product analytics, not an audit trail.
 *   - recorded by the SERVER ITSELF (SERVER_EVENTS_) at the moment it confirms a change in the Sessions tab: session_saved,
 *     session_updated, session_deleted, session_shared, session_unshared. The app cannot send these, so a failed save is never counted.
 *
 * WHO CAN SEE THE REPORTS: only a signed-in coach whose name is listed in the "Admins" tab (column A, one name per row, spelled the
 *   way they joined - capitals do not matter). Add only names that have ALREADY joined (they appear in the "Coaches" tab). Every report
 *   checks that list again, on the server, from the sign-in token. Remove a row to remove the access.
 *
 * DEFINITIONS (the same in every report):
 *   - Period: "7d" / "30d" / "90d" = today and the 6 / 29 / 89 days before it; "all" = everything. Days start at midnight in the
 *     SPREADSHEET's time zone (File > Settings), and the reply says which zone and which dates were used.
 *   - Active coach: did at least one meaningful thing in the period - any event except merely opening the app - or saved / edited a session.
 *   - Last active: the latest such moment, kept per coach in the small "CoachActivity" tab (so the whole event history is not re-read).
 *   - Exercise VIEWS: times an exercise's detail page was opened. Exercise ADDITIONS: times a coach added one to a session.
 *     In SAVED SESSIONS: read from the Sessions tab itself - how many saved sessions (first saved in the period, still existing)
 *     contain it, counted once per session however often that session was saved again, and by how many different coaches.
 *   - Sessions saved = saved sessions that exist in the Sessions tab, first saved in the period. Save actions = how many times a brand-new
 *     session was confirmed saved (still counts one that was deleted later). Session updates = later changes to a saved plan.
 *   - Feature adoption % = coaches who used the feature in the period / active coaches in the period.
 *   - Exercises are matched by NAME (ids in the Exercises tab get renumbered), falling back to the id when there is no name.
 */
const EVENTS_TAB_NAME = 'AnalyticsEvents';
const ADMINS_TAB_NAME = 'Admins';
const ACTIVITY_TAB_NAME = 'CoachActivity';
const EVENT_HEADERS = ['eventId', 'timestamp', 'coachKey', 'eventType', 'entityType', 'entityId', 'sessionId', 'metadata'];
const ADMIN_HEADERS = ['coachName', 'addedAt', 'note'];
const ACTIVITY_HEADERS = ['coachKey', 'lastActiveAt', 'lastSeenAt'];
const ANALYTICS = {
  batchMax: 25,                 // events in one request
  metaMaxChars: 500, metaMaxKeys: 8, metaTextMax: 120,
  maxAgeMs: 48 * 3600000,       // how far back the app may date an event that waited to be sent
  perHour: 600,                 // events one coach may log per hour
  dedupeTail: 1000, dedupeCacheSec: 21600,
  feedDefault: 50, feedMax: 200, listDefault: 100, listMax: 500, coachesMax: 300, recentPerCoach: 5, profileTop: 8, profileRecent: 15,
  cacheSec: 300, cacheMaxChars: 90000,
  tzFallback: 'America/New_York'
};
// What the APP may report -> the kind of thing the event is about.
const CLIENT_EVENTS_ = {
  app_opened: 'feature', app_session_started: 'feature',
  exercise_viewed: 'exercise', exercise_added: 'exercise', exercise_removed: 'exercise', exercise_replaced: 'exercise',
  exercise_favorited: 'exercise', exercise_unfavorited: 'exercise', exercise_search_performed: 'feature',
  session_started: 'session', session_copied: 'session',
  custom_session_started: 'feature', custom_session_completed: 'feature', custom_session_failed: 'feature',
  quick_pick_used: 'feature', balance_session_used: 'feature',
  template_created: 'template', template_used: 'template',
  favorite_opened: 'feature', print_export_used: 'feature'
};
// What only the SERVER records, when it has confirmed the change in the Sessions tab.
const SERVER_EVENTS_ = { session_saved: 'session', session_updated: 'session', session_deleted: 'session', session_shared: 'session', session_unshared: 'session' };
// Opening the app is not "using" it: these never make a coach Active and never move Last Active.
const PASSIVE_EVENTS_ = { app_opened: true, app_session_started: true };
// For feature events the server fills in which feature it was (the app's own value is ignored).
const FEATURE_OF_ = {
  app_opened: 'app', app_session_started: 'app', exercise_search_performed: 'search',
  custom_session_started: 'custom_session', custom_session_completed: 'custom_session', custom_session_failed: 'custom_session',
  quick_pick_used: 'quick_pick', balance_session_used: 'balance_session', favorite_opened: 'favorites', print_export_used: 'print_export'
};
// The only detail names an event may carry. Anything else (a "query", a "note", a "title" ...) is refused.
const META_KEYS_ = ['name', 'source', 'section', 'method', 'context', 'format', 'layout', 'focus', 'age', 'style', 'location', 'target', 'minutes', 'count', 'stage', 'from', 'template', 'generated', 'tab'];
// The features the Feature Usage report lists. "events" are what counts as a use; "also" are shown beside it but do not count as uses.
const FEATURES_ = [
  { key: 'custom_session', label: 'Custom Session Generator', events: ['custom_session_completed'], also: ['custom_session_started', 'custom_session_failed'] },
  { key: 'quick_pick', label: 'Quick Pick', events: ['quick_pick_used'], also: [] },
  { key: 'balance_session', label: 'Balance My Session', events: ['balance_session_used'], also: [] },
  { key: 'templates', label: 'Templates', events: ['template_used'], also: ['template_created'] },
  { key: 'favorites', label: 'Favorites', events: ['favorite_opened'], also: ['exercise_favorited', 'exercise_unfavorited'] },
  { key: 'search', label: 'Exercise Search', events: ['exercise_search_performed'], also: [] },
  { key: 'print_export', label: 'Print / Export', events: ['print_export_used'], also: [] },
  { key: 'share', label: 'Share Session', events: ['session_shared'], also: ['session_unshared'] },
  { key: 'copy_session', label: 'Copy Session', events: ['session_copied'], also: [] }
];
const PERIODS_ = { '7d': 7, '30d': 30, '90d': 90, 'all': 0 };

/* ---- recording ---- */

function isoTime_(ms) { return new Date(ms).toISOString(); }
function timeMs_(v) {                              // a timestamp cell back to milliseconds (text, or a date if someone re-formatted the column)
  if (v instanceof Date) return v.getTime();
  const n = Date.parse(String(v || ''));
  return isFinite(n) ? n : 0;
}

// Checks one event from the app. Returns {row:{...}} or {error:'...'} - a bad event is refused on its own, it never fails the others.
function validateEvent_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'bad_event' };
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || /^srv-/.test(id)) return { error: 'bad_event_id' };
  const type = typeof raw.type === 'string' ? raw.type : '';
  if (!Object.prototype.hasOwnProperty.call(CLIENT_EVENTS_, type)) return { error: 'unknown_event_type' };
  const entityType = CLIENT_EVENTS_[type];
  let entityId = raw.entityId === undefined || raw.entityId === null ? '' : String(raw.entityId);
  if (entityType === 'feature') entityId = FEATURE_OF_[type];
  else if (entityId !== '' && !/^[A-Za-z0-9_.\-]{1,64}$/.test(entityId)) return { error: 'bad_entity_id' };
  if (entityType === 'exercise' && entityId === '') return { error: 'bad_entity_id' };
  const sessionId = raw.sessionId === undefined || raw.sessionId === null ? '' : String(raw.sessionId);
  if (sessionId !== '' && !/^[A-Za-z0-9_-]{6,64}$/.test(sessionId)) return { error: 'bad_session_id' };
  const meta = {};
  if (raw.meta !== undefined && raw.meta !== null) {
    if (typeof raw.meta !== 'object' || Array.isArray(raw.meta)) return { error: 'bad_metadata' };
    const keys = Object.keys(raw.meta);
    if (keys.length > ANALYTICS.metaMaxKeys) return { error: 'metadata_too_large' };
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], v = raw.meta[k];
      if (META_KEYS_.indexOf(k) === -1) return { error: 'bad_metadata' };
      if (typeof v === 'string') {
        if (v.length > ANALYTICS.metaTextMax) return { error: 'metadata_too_large' };
        meta[k] = v.replace(/[\u0000-\u001F\u007F]/g, ' ');
      } else if (typeof v === 'number') {
        if (!isFinite(v)) return { error: 'bad_metadata' };
        meta[k] = v;
      } else if (typeof v === 'boolean') meta[k] = v;
      else return { error: 'bad_metadata' };
    }
  }
  const metaJson = JSON.stringify(meta);
  if (metaJson.length > ANALYTICS.metaMaxChars) return { error: 'metadata_too_large' };
  let age = Number(raw.age);
  if (!isFinite(age) || age < 0) age = 0;
  return { row: { id: id, type: type, entityType: entityType, entityId: entityId, sessionId: sessionId, metaJson: metaJson, age: Math.min(age, ANALYTICS.maxAgeMs) } };
}

// A tab starts with 1,000 rows; writing below the last one needs the rows to exist first.
function ensureRows_(sheet, lastNeeded) {
  const max = sheet.getMaxRows();
  if (lastNeeded > max) sheet.insertRowsAfter(max, Math.max(lastNeeded - max, 500));
}
function appendEventRows_(rows) {
  if (!rows.length) return;
  const sheet = getTab_(EVENTS_TAB_NAME, EVENT_HEADERS);
  const first = sheet.getLastRow() + 1;
  ensureRows_(sheet, first + rows.length - 1);
  const range = sheet.getRange(first, 1, rows.length, EVENT_HEADERS.length);
  range.setNumberFormat('@');          // plain text first, then the values
  range.setValues(rows);
}

// Keeps one row per coach in "CoachActivity": when they last DID something, and when the app was last seen at all.
function noteCoachActivity_(coachKey, activeMs, seenMs) {
  const sheet = getTab_(ACTIVITY_TAB_NAME, ACTIVITY_HEADERS);
  const last = sheet.getLastRow();
  const values = last > 1 ? sheet.getRange(2, 1, last - 1, ACTIVITY_HEADERS.length).getValues() : [];
  let row = -1, active = 0, seen = 0;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === coachKey) { row = i + 2; active = timeMs_(values[i][1]); seen = timeMs_(values[i][2]); break; }
  }
  const newActive = Math.max(active, activeMs || 0), newSeen = Math.max(seen, seenMs || 0, activeMs || 0);
  if (row !== -1 && newActive === active && newSeen === seen) return;
  if (row === -1) row = last + 1;
  ensureRows_(sheet, row);
  const range = sheet.getRange(row, 1, 1, ACTIVITY_HEADERS.length);
  range.setNumberFormat('@');
  range.setValues([[coachKey, newActive ? isoTime_(newActive) : '', newSeen ? isoTime_(newSeen) : '']]);
}

// action "logEvent": {events:[{id, type, entityId, sessionId, meta, age}]} (or one {event:{...}}). Recorded for the coach behind the token.
function logEvents_(body, coach) {
  const list = Array.isArray(body.events) ? body.events : (body.event !== undefined && body.event !== null ? [body.event] : null);
  if (!list || !list.length) fail_('invalid', 'No events');
  if (list.length > ANALYTICS.batchMax) fail_('invalid', 'Too many events in one request');
  const cache = CacheService.getScriptCache();
  const rateKey = 'evn:' + sha256_(coach.key).slice(0, 24);
  const used = Number(cache.get(rateKey) || 0);
  if (used + list.length > ANALYTICS.perHour) return { ok: false, error: 'rate_limited' };

  const rejected = [], good = [];
  list.forEach((raw, i) => {
    const r = validateEvent_(raw);
    if (r.error) rejected.push({ index: i, id: raw && typeof raw.id === 'string' ? raw.id.slice(0, 64) : '', error: r.error });
    else good.push(r.row);
  });
  // The same event must never be stored twice (the app re-sends a batch when it did not hear back): look in this request, in the
  // short-term memory of recently stored ids, and in the newest rows of the tab.
  const sheet = getTab_(EVENTS_TAB_NAME, EVENT_HEADERS);
  const known = {};
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const n = Math.min(lastRow - 1, ANALYTICS.dedupeTail);
    sheet.getRange(lastRow - n + 1, 1, n, 1).getValues().forEach(r => { known[String(r[0])] = true; });
  }
  const recent = good.length ? (cache.getAll(good.map(g => 'ev:' + g.id)) || {}) : {};
  const now = Date.now(), rows = [], remember = {};
  let duplicates = 0, activeMs = 0, seenMs = 0;
  good.forEach(g => {
    if (known[g.id] || recent['ev:' + g.id]) { duplicates++; return; }
    known[g.id] = true; remember['ev:' + g.id] = '1';
    const when = now - g.age;
    rows.push([g.id, isoTime_(when), coach.key, g.type, g.entityType, g.entityId, g.sessionId, g.metaJson]);
    if (PASSIVE_EVENTS_[g.type]) seenMs = Math.max(seenMs, when); else activeMs = Math.max(activeMs, when);
  });
  if (rows.length) {
    appendEventRows_(rows);
    cache.putAll(remember, ANALYTICS.dedupeCacheSec);
    cache.put(rateKey, String(used + rows.length), 3600);
    noteCoachActivity_(coach.key, activeMs, seenMs);
  }
  const out = { ok: rejected.length === 0, accepted: rows.length, duplicates: duplicates, rejected: rejected };
  if (rejected.length) out.error = 'invalid';
  return out;
}

// An event the server writes itself. It must never get in the way of the save / delete it describes.
function serverEvent_(coach, type, sessionId, meta) {
  try {
    const now = Date.now();
    appendEventRows_([['srv-' + randomHex_(24), isoTime_(now), coach.key, type, SERVER_EVENTS_[type], String(sessionId), String(sessionId), JSON.stringify(meta || {})]]);
    noteCoachActivity_(coach.key, now, now);
  } catch (e) { /* analytics only */ }
}
function sessionEventMeta_(s) {
  let count = 0;
  s.phases.forEach(p => { count += p.exercises.length; });
  const m = { count: count, minutes: s.totalMin, target: s.targetDuration, location: s.location };
  if (s.focusArea) m.focus = s.focusArea;
  if (s.ageGroup) m.age = s.ageGroup;
  if (s.sessionStyle) m.style = s.sessionStyle;
  if (s.templateId) m.template = true;
  return m;
}
// The PLAN of a session (title, length, which exercises, their order and minutes). Notes, rating, favourite and "last used" are not part of it,
// so changing those is not counted as updating the session.
function planSignature_(phases, name, target) {
  return String(name || '') + '|' + (Number(target) || 0) + '|' + (Array.isArray(phases) ? phases : []).map(p =>
    String((p && p.section) || '') + '/' + String((p && p.label) || '') + ':' + ((p && Array.isArray(p.exercises)) ? p.exercises : []).map(e => String((e && e.id) || '') + '~' + (Number(e && e.duration) || 0)).join(',')).join(';');
}

/* ---- administrators ---- */

function isAdmin_(coach) {
  if (!coach || !coach.key) return false;
  const sheet = getTab_(ADMINS_TAB_NAME, ADMIN_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const names = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < names.length; i++) {
    const k = coachKey_(names[i][0]);
    if (k && sameText_(k, coach.key)) return true;
  }
  return false;
}
function requireAdmin_(coach) { if (!isAdmin_(coach)) fail_('forbidden', 'Administrators only'); }

// Run once from the editor after pasting this version: creates the three analytics tabs so you can add yourself to "Admins".
function setupAnalytics() {
  getTab_(EVENTS_TAB_NAME, EVENT_HEADERS); getTab_(ADMINS_TAB_NAME, ADMIN_HEADERS); getTab_(ACTIVITY_TAB_NAME, ACTIVITY_HEADERS);
  Logger.log('Analytics tabs are ready. Open the "Admins" tab and type your coach name (as you joined) in cell A2.');
}
// Run from the editor any time: prints a plain summary of what has been recorded (execution log). Nothing is changed.
function analyticsSelfCheck() {
  const ctx = adminContext_({ period: '30d' });
  const d = analyticsData_(ctx);
  const admins = getTab_(ADMINS_TAB_NAME, ADMIN_HEADERS);
  const adminNames = admins.getLastRow() > 1 ? admins.getRange(2, 1, admins.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim()).filter(String) : [];
  const joined = {};
  d.coaches.forEach(c => { joined[c.key] = true; });
  const o = overviewData_(ctx, d);
  Logger.log('Administrators: ' + (adminNames.length ? adminNames.map(n => n + (joined[coachKey_(n)] ? '' : ' (NOT JOINED YET - check the spelling)')).join(', ') : 'none yet - add a name in the Admins tab'));
  Logger.log('Time zone: ' + ctx.tz + '. Last 30 days = ' + ctx.range.from + ' to ' + ctx.range.to);
  Logger.log('Events recorded in that time: ' + d.events.length);
  Logger.log('Coaches: ' + o.totals.totalCoaches + ' joined, ' + o.totals.activeCoaches + ' active');
  Logger.log('Sessions saved: ' + o.totals.sessionsSaved + ' | exercise views: ' + o.totals.exerciseViews + ' | exercises added: ' + o.totals.exercisesAdded + ' | exercises in saved sessions: ' + o.totals.exercisesInSavedSessions);
  Logger.log('Most used features: ' + (o.topFeatures.length ? o.topFeatures.map(f => f.label + ' (' + f.uses + ')').join(', ') : 'none yet'));
}

/* ---- reading: shared building blocks ---- */

function timeZone_() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || ANALYTICS.tzFallback; } catch (e) { return ANALYTICS.tzFallback; }
}
function shiftDay_(ymd, days) {
  const p = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
}
function weekStart_(ymd) {                 // the Monday of that day's week
  const p = String(ymd).split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return shiftDay_(ymd, -((dow + 6) % 7));
}
// Everything a report needs to know about "when": the period asked for, the time zone, and which calendar day a moment falls on.
function adminContext_(body) {
  const period = body.period === undefined || body.period === null || body.period === '' ? '30d' : String(body.period);
  if (!Object.prototype.hasOwnProperty.call(PERIODS_, period)) fail_('invalid', 'Unknown period');
  const tz = timeZone_(), memo = {}, now = Date.now();
  const dayOf = ms => { const k = Math.floor(ms / 900000); return memo[k] || (memo[k] = Utilities.formatDate(new Date(ms), tz, 'yyyy-MM-dd')); };
  const to = dayOf(now), days = PERIODS_[period];
  const range = { period: period, from: days ? shiftDay_(to, -(days - 1)) : null, to: to };
  return { now: now, tz: tz, dayOf: dayOf, range: range, inRange: ms => ms > 0 && (!range.from || dayOf(ms) >= range.from) };
}
// When usage recording began: the time of the very first row in AnalyticsEvents (null = nothing has ever been recorded).
// Lets the dashboard tell "nobody used this" apart from "this was not being recorded yet".
function trackingSince_() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENTS_TAB_NAME);
    if (!sheet || sheet.getLastRow() < 2) return null;
    const ms = timeMs_(sheet.getRange(2, 2, 1, 1).getValues()[0][0]);
    return ms ? isoTime_(ms) : null;
  } catch (e) { return null; }
}
function adminReply_(ctx, data) {
  return Object.assign({ ok: true, v: API_VERSION, generatedAt: isoTime_(ctx.now), timezone: ctx.tz, range: ctx.range, trackingSince: trackingSince_() }, data);
}
// A report is remembered for a few minutes, and re-made as soon as anything new has been recorded (the row counts are part of its key).
function adminCached_(name, ctx, params, build) {
  let key = '';
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rows = [EVENTS_TAB_NAME, SESSIONS_TAB_NAME, COACHES_TAB_NAME, ACTIVITY_TAB_NAME].map(n => { const sh = ss.getSheetByName(n); return sh ? sh.getLastRow() : 0; });
    key = 'an:' + sha256_([name, ctx.range.period, ctx.range.to, JSON.stringify(params || []), rows.join(',')].join('|')).slice(0, 40);
    const hit = CacheService.getScriptCache().get(key);
    if (hit) return JSON.parse(hit);
  } catch (e) { key = ''; }
  const out = adminReply_(ctx, build());
  try { const text = JSON.stringify(out); if (key && text.length <= ANALYTICS.cacheMaxChars) CacheService.getScriptCache().put(key, text, ANALYTICS.cacheSec); } catch (e) {}
  return out;
}

function exerciseKey_(name, id) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (n) return 'n:' + n;
  id = String(id === undefined || id === null ? '' : id);
  return id ? 'i:' + id : '';
}
function loadLibrary_() {       // the Exercises tab: today's id, name and section for each exercise
  const lib = { byKey: {}, byId: {}, count: 0 };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAB_NAME);
  if (!sheet || sheet.getLastRow() < 2) return lib;
  const values = sheet.getDataRange().getValues(), h = values[0].map(String);
  const idCol = h.indexOf('Exercise ID'), nameCol = h.indexOf('Exercise Name'), secCol = h.indexOf('Section');
  for (let i = 1; i < values.length; i++) {
    const id = idCol > -1 ? String(values[i][idCol] || '').trim() : '', name = nameCol > -1 ? String(values[i][nameCol] || '').trim() : '';
    if (!name) continue;
    const e = { id: id, name: name, section: secCol > -1 ? String(values[i][secCol] || '') : '' };
    lib.byKey[exerciseKey_(name, id)] = e; if (id) lib.byId[id] = e; lib.count++;
  }
  return lib;
}
function loadCoachRecords_() {
  const sheet = getTab_(COACHES_TAB_NAME, COACH_HEADERS);
  const values = sheet.getDataRange().getValues(), out = [];
  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || ''); if (!key) continue;
    out.push({ key: key, name: String(values[i][1] || key), joinedAt: Number(values[i][4]) || 0 });
  }
  return out;
}
function loadActivity_() {
  const sheet = getTab_(ACTIVITY_TAB_NAME, ACTIVITY_HEADERS), out = {};
  const last = sheet.getLastRow();
  if (last < 2) return out;
  sheet.getRange(2, 1, last - 1, ACTIVITY_HEADERS.length).getValues().forEach(r => { out[String(r[0])] = { active: timeMs_(r[1]), seen: timeMs_(r[2]) }; });
  return out;
}
// The saved sessions as they stand in the Sessions tab - the authority on what was saved, by whom, and what is in it.
// Titles and notes are deliberately not carried into reports, except the title of a session its owner has Shared.
function loadSessionRecords_() {
  const sheet = getSessionsSheet_();
  const values = sheet.getDataRange().getValues(), out = [];
  if (values.length < 2) return out;
  const headers = values[0];
  for (let i = 1; i < values.length; i++) {
    const o = rowObject_(headers, values[i]);
    const id = String(o.id || '').trim(); if (!id) continue;
    const seen = {}, exercises = [];
    let slots = 0;
    parsePhases_(o).forEach(p => ((p && Array.isArray(p.exercises)) ? p.exercises : []).forEach(e => {
      slots++;
      const k = exerciseKey_(e && e.name, e && e.id);
      if (!k || seen[k]) return;
      seen[k] = true;
      exercises.push({ key: k, id: String((e && e.id) || ''), name: String((e && e.name) || '') });
    }));
    const shared = o.visibility === 'shared';
    out.push({
      id: id, owner: ownerKeyOf_(o), ownerName: String(o.createdBy || ''), sharedName: shared ? String(o.name || '') : '', shared: shared,
      createdAt: Number(o.createdAt) || 0, updatedAt: Number(o.updatedAt) || 0,
      totalMin: Number(o.totalMin) || 0, target: Number(o.targetDuration) || 0, location: o.location === 'indoor' ? 'indoor' : 'outdoor',
      focus: String(o.focusArea || ''), age: String(o.ageGroup || ''), style: String(o.sessionStyle || ''), template: String(o.templateId || '') !== '',
      exercises: exercises, slots: slots
    });
  }
  return out;
}
// The events of the period. Rows are written in (nearly) time order, so only the timestamp column is scanned to find where the
// period starts, and only the rows from there on are read in full.
function loadEvents_(ctx) {
  const sheet = getTab_(EVENTS_TAB_NAME, EVENT_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  let first = 2;
  if (ctx.range.from) {
    // 4 days of slack: 2 for an event that waited to be sent, the rest for any time zone. The exact day test below does the real filtering.
    const cutoff = shiftDay_(ctx.range.from, -4) + 'T00:00:00.000Z';
    const stamps = sheet.getRange(2, 2, last - 1, 1).getValues();
    let i = 0;
    const textOf = v => (v instanceof Date ? v.toISOString() : String(v));
    while (i < stamps.length && !(textOf(stamps[i][0]) >= cutoff)) i++;
    if (i >= stamps.length) return [];
    first = i + 2;
  }
  const out = [];
  sheet.getRange(first, 1, last - first + 1, EVENT_HEADERS.length).getValues().forEach(r => {
    const ts = timeMs_(r[1]);
    if (!ts || !ctx.inRange(ts)) return;
    let meta = {};
    try { const m = JSON.parse(String(r[7] || '{}')); if (m && typeof m === 'object' && !Array.isArray(m)) meta = m; } catch (e) {}
    out.push({ id: String(r[0]), ts: ts, day: ctx.dayOf(ts), coach: String(r[2]), type: String(r[3]), entityType: String(r[4]), entityId: String(r[5]), sessionId: String(r[6]), meta: meta });
  });
  return out;
}
function analyticsData_(ctx) {
  const d = { coaches: loadCoachRecords_(), sessions: loadSessionRecords_(), events: loadEvents_(ctx), activity: loadActivity_() };
  d.coachName = {};
  d.sessions.forEach(s => { if (s.ownerName && !d.coachName[s.owner]) d.coachName[s.owner] = s.ownerName; });
  d.coaches.forEach(c => { d.coachName[c.key] = c.name; });
  d.periodSessions = d.sessions.filter(s => ctx.inRange(s.createdAt));
  // ONE definition of "active", used by every report.
  d.active = {};
  d.events.forEach(e => { if (!PASSIVE_EVENTS_[e.type]) d.active[e.coach] = true; });
  d.sessions.forEach(s => { if (ctx.inRange(s.createdAt) || ctx.inRange(s.updatedAt)) d.active[s.owner] = true; });
  d.activeCount = Object.keys(d.active).length;
  return d;
}
function countBy_(list, keyOf) { const m = {}; list.forEach(x => { const k = keyOf(x); if (k !== null && k !== undefined) m[k] = (m[k] || 0) + 1; }); return m; }
function pct_(part, whole) { return whole > 0 ? Math.round(part * 1000 / whole) / 10 : 0; }
function avg_(list, valueOf) { return list.length ? Math.round(list.reduce((a, x) => a + valueOf(x), 0) * 10 / list.length) / 10 : 0; }
function featureRows_(d) {
  const byType = {};
  d.events.forEach(e => { const t = byType[e.type] || (byType[e.type] = { n: 0, who: {} }); t.n++; t.who[e.coach] = true; });
  return FEATURES_.map(f => {
    const who = {}, eventCounts = {};
    let uses = 0;
    f.events.forEach(t => { const x = byType[t]; eventCounts[t] = x ? x.n : 0; if (x) { uses += x.n; Object.keys(x.who).forEach(k => { who[k] = true; }); } });
    f.also.forEach(t => { eventCounts[t] = byType[t] ? byType[t].n : 0; });
    const coaches = Object.keys(who).length;
    return { feature: f.key, label: f.label, uses: uses, coaches: coaches, adoptionPct: pct_(coaches, d.activeCount), eventCounts: eventCounts };
  });
}
function limit_(v, dflt, max) {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  if (!isFinite(n) || n < 1 || Math.floor(n) !== n) fail_('invalid', 'Bad limit');
  return Math.min(n, max);
}

/* ---- the reports (each one checks the Admins list itself, before anything else) ---- */

// Activity over time: one entry per day, or per week (starting Monday) when the period is longer than about three months.
// Used for the whole club (overview) and for one coach (profile) - the same rules either way.
function trend_(ctx, events, ps) {
  const firstDay = ctx.range.from || events.concat(ps.map(s => ({ day: ctx.dayOf(s.createdAt) }))).reduce((a, e) => (e.day < a ? e.day : a), ctx.range.to);
  const start = firstDay < shiftDay_(ctx.range.to, -364) ? shiftDay_(ctx.range.to, -364) : firstDay;
  const weekly = start < shiftDay_(ctx.range.to, -92);
  const bucketOf = day => (weekly ? weekStart_(day) : day);
  const buckets = {}, order = [];
  for (let day = bucketOf(start); day <= ctx.range.to; day = shiftDay_(day, weekly ? 7 : 1)) { buckets[day] = { date: day, activeCoaches: 0, actions: 0, sessionsSaved: 0, exerciseViews: 0, exercisesAdded: 0, who: {} }; order.push(day); }
  events.forEach(e => {
    const b = buckets[bucketOf(e.day)]; if (!b || PASSIVE_EVENTS_[e.type]) return;
    b.actions++; b.who[e.coach] = true;
    if (e.type === 'exercise_viewed') b.exerciseViews++;
    if (e.type === 'exercise_added') b.exercisesAdded++;
  });
  ps.forEach(s => { const b = buckets[bucketOf(ctx.dayOf(s.createdAt))]; if (b) { b.sessionsSaved++; b.who[s.owner] = true; } });
  return { bucket: weekly ? 'week' : 'day', trend: order.map(k => { const b = buckets[k]; b.activeCoaches = Object.keys(b.who).length; delete b.who; return b; }) };
}
function overviewData_(ctx, d) {
  const n = countBy_(d.events, e => e.type);
  const ps = d.periodSessions;
  const usedKeys = {};
  let slots = 0;
  ps.forEach(s => { slots += s.slots; s.exercises.forEach(x => { usedKeys[x.key] = true; }); });
  const tr = trend_(ctx, d.events, ps);
  return {
    totals: {
      totalCoaches: d.coaches.length,
      activeCoaches: d.activeCount,
      newCoaches: d.coaches.filter(c => ctx.inRange(c.joinedAt)).length,
      sessionsSaved: ps.length,                               // saved sessions that exist, first saved in the period
      saveActions: n.session_saved || 0,                      // new saves confirmed by the server in the period (includes ones deleted since)
      sessionUpdates: n.session_updated || 0,
      sessionsDeleted: n.session_deleted || 0,
      sessionsStarted: n.session_started || 0,
      sessionsShared: ps.filter(s => s.shared).length,        // of those saved sessions, how many are Shared right now
      shareActions: n.session_shared || 0,
      unshareActions: n.session_unshared || 0,
      exerciseViews: n.exercise_viewed || 0,
      exercisesAdded: n.exercise_added || 0,
      exercisesRemoved: n.exercise_removed || 0,
      exercisesInSavedSessions: slots,                        // exercise places in those saved sessions
      uniqueExercisesUsed: Object.keys(usedKeys).length
    },
    topFeatures: featureRows_(d).filter(f => f.uses > 0).sort((a, b) => b.uses - a.uses || b.coaches - a.coaches).slice(0, 5),
    trendBucket: tr.bucket,
    trend: tr.trend
  };
}
function getAdminOverview_(body, coach) {
  requireAdmin_(coach);
  const ctx = adminContext_(body);
  return adminCached_('overview', ctx, [], () => overviewData_(ctx, analyticsData_(ctx)));
}

// What an event was about, safe to show an administrator: an exercise's name, or a session's title ONLY if its owner has Shared it.
function entityNamer_(d) {
  const lib = loadLibrary_(), sessions = {};
  d.sessions.forEach(s => { sessions[s.id] = s; });
  return function (e) {
    if (e.entityType === 'exercise') {
      const inLib = lib.byId[e.entityId];
      return { name: String(e.meta.name || (inLib ? inLib.name : '')), private: false };
    }
    if (e.entityType === 'session') {
      const s = sessions[e.sessionId || e.entityId];
      return s ? { name: s.sharedName, private: !s.shared } : { name: '', private: false };
    }
    if (e.entityType === 'feature') { const f = FEATURES_.filter(x => x.key === e.entityId)[0]; return { name: f ? f.label : '', private: false }; }
    return { name: '', private: false };
  };
}
function feedItem_(e, d, nameOf) {
  const n = nameOf(e);
  return { eventId: e.id, timestamp: isoTime_(e.ts), coachKey: e.coach, coachName: d.coachName[e.coach] || e.coach, eventType: e.type, entityType: e.entityType, entityId: e.entityId, entityName: n.name, entityPrivate: n.private, sessionId: e.sessionId };
}

function getAdminCoachActivity_(body, coach) {
  requireAdmin_(coach);
  const ctx = adminContext_(body);
  return adminCached_('coaches', ctx, [], () => {
    const d = analyticsData_(ctx), nameOf = entityNamer_(d);
    const rows = {};
    const row = key => rows[key] || (rows[key] = { coachKey: key, name: d.coachName[key] || key, joinedAt: null, lastActiveAt: null, lastSeenAt: null, active: !!d.active[key],
      sessionsSaved: 0, sessionsSavedAllTime: 0, sessionsShared: 0, exercisesAdded: 0, exerciseViews: 0, actions: 0, recentActivity: [], _active: 0, _seen: 0 });
    d.coaches.forEach(c => { row(c.key).joinedAt = c.joinedAt ? isoTime_(c.joinedAt) : null; });
    d.sessions.forEach(s => {
      const r = row(s.owner);
      r.sessionsSavedAllTime++;
      r._active = Math.max(r._active, s.createdAt, s.updatedAt);         // saving / editing a session counts, also for history from before analytics
      if (ctx.inRange(s.createdAt)) { r.sessionsSaved++; if (s.shared) r.sessionsShared++; }
    });
    Object.keys(d.activity).forEach(k => { const r = row(k); r._active = Math.max(r._active, d.activity[k].active); r._seen = Math.max(r._seen, d.activity[k].seen); });
    const recent = {};
    d.events.forEach(e => {
      const r = row(e.coach);
      if (PASSIVE_EVENTS_[e.type]) return;
      r.actions++;
      r._active = Math.max(r._active, e.ts);          // belt and braces: the events themselves also prove activity
      if (e.type === 'exercise_added') r.exercisesAdded++;
      if (e.type === 'exercise_viewed') r.exerciseViews++;
      (recent[e.coach] || (recent[e.coach] = [])).push(e);
    });
    const list = Object.keys(rows).map(k => {
      const r = rows[k];
      r.lastActiveAt = r._active ? isoTime_(r._active) : null;
      r.lastSeenAt = Math.max(r._seen, r._active) ? isoTime_(Math.max(r._seen, r._active)) : null;
      r.recentActivity = (recent[k] || []).sort((a, b) => b.ts - a.ts).slice(0, ANALYTICS.recentPerCoach).map(e => { const it = feedItem_(e, d, nameOf); return { timestamp: it.timestamp, eventType: it.eventType, entityType: it.entityType, entityName: it.entityName, entityPrivate: it.entityPrivate }; });
      const sortKey = r._active; delete r._active; delete r._seen;
      return { r: r, t: sortKey };
    }).sort((a, b) => b.t - a.t || (a.r.name < b.r.name ? -1 : 1)).map(x => x.r);
    return { totalCoaches: d.coaches.length, activeCoaches: d.activeCount, truncated: list.length > ANALYTICS.coachesMax, coaches: list.slice(0, ANALYTICS.coachesMax) };
  });
}

function getAdminExerciseAnalytics_(body, coach) {
  requireAdmin_(coach);
  const ctx = adminContext_(body);
  const limit = limit_(body.limit, ANALYTICS.listDefault, ANALYTICS.listMax);
  const sort = body.sort === undefined || body.sort === null || body.sort === '' ? 'views' : String(body.sort);
  if (['views', 'additions', 'savedSessions', 'coachesUsed', 'name'].indexOf(sort) === -1) fail_('invalid', 'Unknown sort');
  const includeUnused = body.includeUnused === true;
  return adminCached_('exercises', ctx, [limit, sort, includeUnused], () => {
    const d = analyticsData_(ctx), lib = loadLibrary_(), rows = {};
    const row = (key, id, name) => {
      const r = rows[key] || (rows[key] = { exerciseId: '', name: '', section: '', inLibrary: false, views: 0, viewers: 0, additions: 0, removals: 0, savedSessions: 0, coachesUsed: 0, _viewers: {}, _coaches: {} });
      if (!r.name && name) r.name = name;
      if (!r.exerciseId && id) r.exerciseId = id;
      return r;
    };
    d.events.forEach(e => {
      if (e.entityType !== 'exercise') return;
      const inLib = lib.byId[e.entityId];
      const name = String(e.meta.name || (inLib ? inLib.name : ''));
      const r = row(exerciseKey_(name, e.entityId), e.entityId, name);
      if (e.type === 'exercise_viewed') { r.views++; r._viewers[e.coach] = true; }
      else if (e.type === 'exercise_added') r.additions++;
      else if (e.type === 'exercise_removed') r.removals++;
    });
    d.periodSessions.forEach(s => s.exercises.forEach(x => { const r = row(x.key, x.id, x.name); r.savedSessions++; r._coaches[s.owner] = true; }));   // once per session
    if (includeUnused) Object.keys(lib.byKey).forEach(k => row(k, lib.byKey[k].id, lib.byKey[k].name));
    const totals = { views: 0, additions: 0, removals: 0, savedSessionInclusions: 0 };
    const list = Object.keys(rows).map(k => {
      const r = rows[k], now = lib.byKey[k];
      if (now) { r.inLibrary = true; r.exerciseId = now.id || r.exerciseId; r.name = now.name; r.section = now.section; }     // today's id and spelling
      r.viewers = Object.keys(r._viewers).length; r.coachesUsed = Object.keys(r._coaches).length;
      delete r._viewers; delete r._coaches;
      totals.views += r.views; totals.additions += r.additions; totals.removals += r.removals; totals.savedSessionInclusions += r.savedSessions;
      return r;
    });
    list.sort((a, b) => (sort === 'name' ? 0 : b[sort] - a[sort]) || b.views - a.views || b.savedSessions - a.savedSessions || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
    return { totals: totals, libraryCount: lib.count, exerciseCount: list.length, truncated: list.length > limit, exercises: list.slice(0, limit) };
  });
}

function getAdminSessionAnalytics_(body, coach) {
  requireAdmin_(coach);
  const ctx = adminContext_(body);
  return adminCached_('sessions', ctx, [], () => {
    const d = analyticsData_(ctx), ps = d.periodSessions, n = countBy_(d.events, e => e.type);
    const dist = valueOf => { const m = countBy_(ps, valueOf); return Object.keys(m).map(k => ({ value: k, count: m[k], pct: pct_(m[k], ps.length) })).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1)); };
    return {
      sessionsSaved: ps.length, saveActions: n.session_saved || 0, sessionUpdates: n.session_updated || 0, sessionsDeleted: n.session_deleted || 0,
      sessionsStarted: n.session_started || 0, sessionsCopied: n.session_copied || 0,
      sessionsShared: ps.filter(s => s.shared).length, shareActions: n.session_shared || 0, unshareActions: n.session_unshared || 0,
      coachesWhoSaved: Object.keys(countBy_(ps, s => s.owner)).length,
      averageExerciseCount: avg_(ps, s => s.slots),
      averagePlannedMinutes: avg_(ps, s => s.totalMin),          // the sum of the exercise times
      averageTargetMinutes: avg_(ps, s => s.target),             // the session length the coach chose
      distributions: {                                           // "" = not set (only a Custom Session knows its focus, age group and style)
        focusArea: dist(s => s.focus), ageGroup: dist(s => s.age), sessionStyle: dist(s => s.style), location: dist(s => s.location),
        targetMinutes: dist(s => String(s.target || '')), builtWith: dist(s => (s.focus ? 'custom_session' : (s.template ? 'template' : 'from_scratch')))
      }
    };
  });
}

function getAdminFeatureAnalytics_(body, coach) {
  requireAdmin_(coach);
  const ctx = adminContext_(body);
  return adminCached_('features', ctx, [], () => {
    const d = analyticsData_(ctx);
    return { activeCoaches: d.activeCount, features: featureRows_(d).sort((a, b) => b.uses - a.uses || b.coaches - a.coaches) };
  });
}

function getAdminActivityFeed_(body, coach) {
  requireAdmin_(coach);
  const ctx = adminContext_(body);
  const limit = limit_(body.limit, ANALYTICS.feedDefault, ANALYTICS.feedMax);
  const who = body.coach === undefined || body.coach === null || body.coach === '' ? '' : coachKey_(cleanText_(body.coach, LIMITS.coachNameMax, 'Coach'));
  let types = body.eventType === undefined || body.eventType === null || body.eventType === '' ? [] : (Array.isArray(body.eventType) ? body.eventType : [body.eventType]);
  if (types.length > 30) fail_('invalid', 'Too many event types');
  types = types.map(String);
  types.forEach(t => { if (!Object.prototype.hasOwnProperty.call(CLIENT_EVENTS_, t) && !Object.prototype.hasOwnProperty.call(SERVER_EVENTS_, t)) fail_('invalid', 'Unknown event type'); });
  let before = 0;
  if (body.before !== undefined && body.before !== null && body.before !== '') {
    before = typeof body.before === 'string' && body.before.length <= 40 ? Date.parse(body.before) : NaN;
    if (!isFinite(before)) fail_('invalid', 'Bad "before" time');
  }
  const includeOpens = body.includeAppOpens === true;
  const d = analyticsData_(ctx), nameOf = entityNamer_(d);
  const hits = d.events.filter(e => (!who || e.coach === who) && (types.length ? types.indexOf(e.type) !== -1 : (includeOpens || !PASSIVE_EVENTS_[e.type])) && (!before || e.ts < before)).sort((a, b) => b.ts - a.ts);
  // Events recorded in the same instant stay on one page (the next page starts strictly before the last time shown, so none can be skipped).
  let end = Math.min(limit, hits.length);
  while (end < hits.length && hits[end].ts === hits[end - 1].ts) end++;
  const page = hits.slice(0, end);
  return adminReply_(ctx, {
    items: page.map(e => feedItem_(e, d, nameOf)),
    hasMore: hits.length > page.length,
    nextBefore: hits.length > page.length ? isoTime_(page[page.length - 1].ts) : null,       // pass back as "before" for the next page
    filters: { coach: who, eventType: types, includeAppOpens: includeOpens },
    eventTypes: Object.keys(CLIENT_EVENTS_).concat(Object.keys(SERVER_EVENTS_)).sort(),
    coaches: d.coaches.map(c => ({ coachKey: c.key, name: c.name })).sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1))
  });
}

// One coach in detail (the Coaches section's profile page). Same definitions as the other reports, narrowed to that coach.
// Never includes notes, comments, ratings or the titles of private sessions.
function getAdminCoachProfile_(body, coach) {
  requireAdmin_(coach);
  const ctx = adminContext_(body);
  const who = coachKey_(cleanText_(body.coach, LIMITS.coachNameMax, 'Coach'));
  if (!who) fail_('invalid', 'Which coach?');
  return adminCached_('profile', ctx, [who], () => {
    const d = analyticsData_(ctx), nameOf = entityNamer_(d), lib = loadLibrary_();
    const rec = d.coaches.filter(c => c.key === who)[0];
    const mine = d.sessions.filter(s => s.owner === who);
    if (!rec && !mine.length) fail_('invalid', 'Unknown coach');
    const events = d.events.filter(e => e.coach === who), ps = mine.filter(s => ctx.inRange(s.createdAt));
    const acts = events.filter(e => !PASSIVE_EVENTS_[e.type]);
    const n = countBy_(events, e => e.type);
    let lastActive = 0, lastSeen = 0;
    mine.forEach(s => { lastActive = Math.max(lastActive, s.createdAt, s.updatedAt); });
    if (d.activity[who]) { lastActive = Math.max(lastActive, d.activity[who].active); lastSeen = d.activity[who].seen; }
    acts.forEach(e => { lastActive = Math.max(lastActive, e.ts); });
    lastSeen = Math.max(lastSeen, lastActive);
    // exercises: three separate rankings, never mixed
    const top = (type) => {
      const m = {};
      events.forEach(e => {
        if (e.type !== type || e.entityType !== 'exercise') return;
        const inLib = lib.byId[e.entityId], name = String(e.meta.name || (inLib ? inLib.name : ''));
        const k = exerciseKey_(name, e.entityId); if (!k) return;
        const r = m[k] || (m[k] = { name: name, section: '', count: 0 });
        r.count++;
      });
      return rank(m);
    };
    const rank = m => Object.keys(m).map(k => { const r = m[k], now = lib.byKey[k]; if (now) { r.name = now.name; r.section = now.section; } return r; })
      .sort((a, b) => b.count - a.count || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1)).slice(0, ANALYTICS.profileTop);
    const used = {};
    ps.forEach(s => s.exercises.forEach(x => { const r = used[x.key] || (used[x.key] = { name: x.name, section: '', count: 0 }); r.count++; }));   // once per saved session
    const tr = trend_(ctx, events, ps);
    return {
      coach: {
        coachKey: who, name: d.coachName[who] || who, joinedAt: rec && rec.joinedAt ? isoTime_(rec.joinedAt) : null,
        lastActiveAt: lastActive ? isoTime_(lastActive) : null, lastSeenAt: lastSeen ? isoTime_(lastSeen) : null, active: !!d.active[who],
        sessionsSaved: ps.length, sessionsSavedAllTime: mine.length, sessionsShared: ps.filter(s => s.shared).length,
        exercisesAdded: n.exercise_added || 0, exerciseViews: n.exercise_viewed || 0, actions: acts.length
      },
      trendBucket: tr.bucket,
      trend: tr.trend.map(b => ({ date: b.date, actions: b.actions, sessionsSaved: b.sessionsSaved, exerciseViews: b.exerciseViews, exercisesAdded: b.exercisesAdded })),
      topViewed: top('exercise_viewed'), topAdded: top('exercise_added'), topInSavedSessions: rank(used),
      features: featureRows_({ events: events, activeCount: 1 }).filter(f => f.uses > 0).sort((a, b) => b.uses - a.uses).map(f => ({ feature: f.feature, label: f.label, uses: f.uses })),
      recentActivity: acts.sort((a, b) => b.ts - a.ts).slice(0, ANALYTICS.profileRecent).map(e => { const it = feedItem_(e, d, nameOf); return { eventId: it.eventId, timestamp: it.timestamp, eventType: it.eventType, entityType: it.entityType, entityName: it.entityName, entityPrivate: it.entityPrivate }; })
    };
  });
}

const ADMIN_REPORTS_ = {
  getAdminOverview: getAdminOverview_,
  getAdminCoachActivity: getAdminCoachActivity_,
  getAdminExerciseAnalytics: getAdminExerciseAnalytics_,
  getAdminSessionAnalytics: getAdminSessionAnalytics_,
  getAdminFeatureAnalytics: getAdminFeatureAnalytics_,
  getAdminActivityFeed: getAdminActivityFeed_,
  getAdminCoachProfile: getAdminCoachProfile_
};

/**
 * ABOUT SECURITY (Oct 2026): this version replaces the old name-based trust.
 *  - Identity comes from a server-issued token tied to a coach name that can be claimed only once (no passwords).
 *  - Joining needs the club access code, so only people you give it to can join; wrong guesses are rate-limited.
 *  - Every read / edit / delete of a session is decided from that identity. Other coaches' private sessions, notes, ratings and share
 *    links are never sent. A share link works only while its session is Shared.
 *  - Coach-typed text is stored in plain-text cells so it cannot run as a spreadsheet formula; incoming data is size- and shape-checked.
 *  - The exercise feed returns only the columns the app uses (PUBLIC_EXERCISE_COLUMNS). It is still readable without signing in, because
 *    people opening a share link need it - keep anything private out of those columns.
 * Remaining limits: the web app is "Anyone can call it", the club code is a shared secret (rotate it by running setupClubCode again),
 * and anyone who knows the club code could claim a coach name that nobody has claimed yet (so claim yours early). A coach who loses every phone is reset by deleting their row in the Coaches tab.
 */
