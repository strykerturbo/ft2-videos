/**
 * FT2 Coaches - backend (Google Apps Script web app) - SECURITY-HARDENED VERSION (Oct 2026).
 *
 * What it does:
 *   1. Serves the exercise library to the app (public, read-only, CLIENT-SAFE columns only).
 *   2. Stores every coach's saved sessions in a "Sessions" tab, behind REAL per-coach sign-in.
 *   3. Serves a read-only "shared session" page for a share link (only for sessions the coach chose to share).
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
  nameMax: 120, commentMax: 2000, labelMax: 60, exNameMax: 200, idMax: 64,
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
  'lastUsedAt', 'locationPref', 'ownerKey'   // ownerKey = the coach account that owns the row (set by the server, never taken from the app)
];
const TEXT_COLUMNS_ = ['id', 'name', 'createdBy', 'templateId', 'comment', 'visibility', 'phasesJson', 'focusArea', 'ageGroup', 'sessionStyle', 'shareToken', 'location', 'locationPref', 'ownerKey', 'practiceDate', 'startTime'];

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
  } else {            // everyone else gets the plan only: no notes, rating, favourite flag or share link
    out.rating = 0; out.comment = ''; out.favorited = false; out.shareToken = '';
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
    return { ok: true };
  }
  return { ok: true };   // already gone
}

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
