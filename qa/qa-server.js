/* FT2 QA: runs the REAL Apps Script file (claude_FT2_AppsScript_Code.gs) inside the browser against a pretend Google Sheet.
   So the QA tests for sign-in, ownership, share links, formula safety and limits exercise the actual server code, not a copy of it.
   What is pretend: SpreadsheetApp / Utilities / CacheService / LockService / PropertiesService / ContentService (Google's own classes).
   The one Sheets behaviour that is modelled by assumption is documented Sheets behaviour: a string starting "=" written into a cell that is NOT
   plain-text formatted becomes a formula; in a plain-text ("@") cell it stays text. */
(function(){
'use strict';
const QA = window.QA;

/* ---- synchronous SHA-256 (Apps Script's Utilities.computeDigest is synchronous) ---- */
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256Bytes(msg){
  const bytes = new TextEncoder().encode(msg), l = bytes.length, bitLen = l * 8;
  const total = ((l + 9 + 63) >> 6) << 6, buf = new Uint8Array(total); buf.set(bytes); buf[l] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 4, bitLen >>> 0); dv.setUint32(total - 8, Math.floor(bitLen / 4294967296));
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for(let o = 0; o < total; o += 64){
    for(let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for(let i = 16; i < 64; i++){ const s0 = rotr(W[i-15], 7) ^ rotr(W[i-15], 18) ^ (W[i-15] >>> 3), s1 = rotr(W[i-2], 17) ^ rotr(W[i-2], 19) ^ (W[i-2] >>> 10); W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for(let i = 0; i < 64; i++){
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const out = []; H.forEach(v => { out.push((v >> 24) << 24 >> 24, (v >> 16) << 24 >> 24, (v >> 8) << 24 >> 24, v << 24 >> 24); });   // signed bytes, like Apps Script
  return out;
}
QA.sha256Hex = msg => sha256Bytes(msg).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');

/* ---- a pretend spreadsheet ---- */
class FakeSheet {
  constructor(name){ this.name = name; this.cells = new Map(); this.fmt = new Map(); this.maxRow = 0; this.maxCol = 0; }
  _k(r, c){ return r + ',' + c; }
  _touch(r, c){ if(r > this.maxRow) this.maxRow = r; if(c > this.maxCol) this.maxCol = c; }
  _put(r, c, v){
    const text = this.fmt.get(this._k(r, c)) === '@';
    let cell;
    if(text){ cell = {v: typeof v === 'string' ? v : (typeof v === 'boolean' ? String(v).toUpperCase() : (v === null || v === undefined ? '' : String(v))), formula: false}; }
    else if(typeof v === 'string' && /^=/.test(v)) cell = {v: v, formula: true};
    else cell = {v: v === undefined ? '' : v, formula: false};
    this.cells.set(this._k(r, c), cell); this._touch(r, c);
  }
  appendRow(arr){ const r = this.getLastRow() + 1; arr.forEach((v, i) => this._put(r, i + 1, v)); }
  getLastRow(){ return this.maxRow; }
  getLastColumn(){ return this.maxCol; }
  getDataRange(){ return this.getRange(1, 1, Math.max(this.maxRow, 1), Math.max(this.maxCol, 1)); }
  getRange(r, c, nr, nc){
    const sh = this; nr = nr || 1; nc = nc || 1;
    return {
      getValues(){ const out = []; for(let i = 0; i < nr; i++){ const row = []; for(let j = 0; j < nc; j++){ const cell = sh.cells.get(sh._k(r + i, c + j)); row.push(cell ? (cell.formula ? '#FORMULA:' + cell.v : cell.v) : ''); } out.push(row); } return out; },
      setValues(vals){ vals.forEach((row, i) => row.forEach((v, j) => sh._put(r + i, c + j, v))); return this; },
      setValue(v){ sh._put(r, c, v); return this; },
      setNumberFormat(f){ for(let i = 0; i < nr; i++) for(let j = 0; j < nc; j++) sh.fmt.set(sh._k(r + i, c + j), f); sh._touch(r + nr - 1, c + nc - 1); return this; },
    };
  }
  deleteRow(r){
    const nc = new Map(), nf = new Map();
    this.cells.forEach((v, k) => { const [rr, cc] = k.split(',').map(Number); if(rr === r) return; nc.set((rr > r ? rr - 1 : rr) + ',' + cc, v); });
    this.fmt.forEach((v, k) => { const [rr, cc] = k.split(',').map(Number); if(rr === r) return; nf.set((rr > r ? rr - 1 : rr) + ',' + cc, v); });
    this.cells = nc; this.fmt = nf; this.maxRow = Math.max(0, this.maxRow - 1);
  }
}
function makeEnv(){
  const sheets = new Map(), props = new Map(), cache = new Map();
  const ss = { getSheetByName: n => sheets.get(n) || null, insertSheet: n => { const s = new FakeSheet(n); sheets.set(n, s); return s; } };
  return {
    sheets, props, cache, advanceTime: ms => cache.forEach(e => { e.exp -= ms; }),
    globals: {
      SpreadsheetApp: { getActiveSpreadsheet: () => ss },
      Utilities: { DigestAlgorithm: {SHA_256: 'SHA_256'}, Charset: {UTF_8: 'UTF_8'}, computeDigest: (alg, text) => sha256Bytes(String(text)), getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })) },
      ContentService: { MimeType: {JSON: 'JSON'}, createTextOutput: s => ({ _s: s, setMimeType(){ return this; }, getContent(){ return this._s; } }) },
      LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, String(v)); } }) },
      CacheService: { getScriptCache: () => ({
        get: k => { const e = cache.get(k); if(!e) return null; if(e.exp < Date.now()){ cache.delete(k); return null; } return e.v; },
        put: (k, v, sec) => { cache.set(k, {v: String(v), exp: Date.now() + (sec || 600) * 1000}); },
        remove: k => { cache.delete(k); } }) },
      Logger: { log(){} },
    },
  };
}
QA.serverSource = null;
QA.loadServerSource = async () => { if(!QA.serverSource){ const r = await fetch(new URL('../claude_FT2_AppsScript_Code.gs', location.href).href, {cache: 'no-store'}); if(!r.ok) throw new Error('Could not load the Apps Script file'); QA.serverSource = await r.text(); } return QA.serverSource; };

/* One pretend Google account: its own Sheet, properties and cache, running the real script. */
class QAServer {
  constructor(src, o){
    o = o || {};
    this.env = makeEnv(); this.club = o.club || 'QA-club-code';
    const names = Object.keys(this.env.globals);
    this.api = new Function(...names, src + '\n;return {doGet, doPost, readSharedSession, setupClubCode, issueToken_, coachKey_, LIMITS, PUBLIC_EXERCISE_COLUMNS};')(...names.map(n => this.env.globals[n]));
    if(o.clubCode !== false) this.env.props.set('CLUB_CODE_HASH', QA.sha256Hex('ft2-club:' + this.club));
    this.log = [];
  }
  /* raw calls, as the web app receives them */
  get(params){ const out = this.api.doGet({parameter: params || {}}); return JSON.parse(out.getContent()); }
  post(body, rawText){ const out = this.api.doPost({postData: {contents: rawText !== undefined ? rawText : JSON.stringify(body)}}); return JSON.parse(out.getContent()); }
  /* conveniences */
  join(name, club){ return this.post({action: 'join', name, clubCode: club === undefined ? this.club : club}); }
  pair(name, code){ return this.post({action: 'pair', name, code}); }
  /* a signed-in coach: joins if new; if the name is already claimed, hands out a token the way a phone code would; returns {name, token} */
  coach(name){ let r = this.join(name); if(!r.ok && r.error === 'name_taken'){ const key = this.api.coachKey_(name); const row = this.sheet('Coaches').getDataRange().getValues().find(x => String(x[0]) === key); r = {ok: true, name: row ? String(row[1]) : name, token: this.api.issueToken_(key)}; } if(!r.ok) throw new Error('QA could not sign ' + name + ' in: ' + JSON.stringify(r)); return {name: r.name, token: r.token}; }
  sheet(name){ return this.env.sheets.get(name) || null; }
  addExercises(headers, rows){ const sh = this.env.globals.SpreadsheetApp.getActiveSpreadsheet().insertSheet('Exercises'); sh.appendRow(headers); rows.forEach(r => sh.appendRow(r)); }
  /* what is physically in the Sessions tab, as objects */
  rows(){ const sh = this.sheet('Sessions'); if(!sh || sh.getLastRow() < 2) return []; const v = sh.getDataRange().getValues(); return v.slice(1).map(r => { const o = {}; v[0].forEach((h, i) => { o[h] = r[i]; }); try{ o.phases = JSON.parse(o.phasesJson || '[]'); }catch(e){ o.phases = []; } return o; }); }
}
QA.newServer = async o => new QAServer(await QA.loadServerSource(), o);
QA.QAServer = QAServer;

/* ---- the backend the sandboxed app talks to: the real server code behind fetch() ---- */
class ServerBackend {
  constructor(server){ this.server = server; this.log = []; this.failNext = 0; this.down = false; this.sharingOff = false; this.live = false; this.tokens = {}; }
  json(obj, status){ return new Response(JSON.stringify(obj), {status: status || 200, headers: {'Content-Type': 'application/json'}}); }
  /* a coach already signed in on this pretend server; returns the token the app should hold */
  signIn(name){ const c = this.server.coach(name); this.tokens[c.name] = c.token; return c; }
  async handle(url, opts){
    opts = opts || {};
    this.log.push({url: String(url), method: opts.method || 'GET', body: opts.body || null});
    if(this.down) throw new TypeError('Failed to fetch');
    if(this.failNext > 0){ this.failNext--; throw new TypeError('Failed to fetch'); }
    const u = new URL(url, 'https://qa.invalid/');
    if(opts.method === 'POST'){
      let out; try{ out = this.server.api.doPost({postData: {contents: opts.body}}); }catch(e){ return this.json({ok: false, error: 'server_error'}); }
      return new Response(out.getContent(), {status: 200, headers: {'Content-Type': 'application/json'}});
    }
    const params = Object.fromEntries(u.searchParams.entries());
    if(params.share && this.sharingOff) return this.json([]);           // an old script that ignores ?share=
    if(params.sheet === 'sessions'){ const out = this.server.api.doGet({parameter: params}); return new Response(out.getContent(), {status: 200, headers: {'Content-Type': 'application/json'}}); }
    // Read-only pass-through of the two library lookups, only when a test asked for the live library (nothing is ever written).
    if(this.live && String(url).startsWith('https://script.google.com/macros/s/') && (!u.search || u.search === '?sheet=validvalues')){
      const text = await QA.liveGet(String(url));
      return new Response(text, {status: 200, headers: {'Content-Type': 'application/json'}});
    }
    return this.json({error: 'qa mock has no exercise sheet'}, 500);
  }
  /* what tests used to read off the old mock: id -> session, from the real Sessions tab */
  get sessions(){
    const rows = this.server.rows(); const m = new Map(); rows.forEach(r => m.set(String(r.id), r));
    return m;
  }
}
QA.ServerBackend = ServerBackend;
QA.makeBackend = async o => new ServerBackend(await QA.newServer(o));
})();
