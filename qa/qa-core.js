/* FT2 QA & Regression framework -- core (sandbox, runner, results store, comparison).
   Developer/admin tool. NOT part of the coach-facing app: nothing in index.html loads or links to this folder.

   How it keeps real data safe: every automated test boots its OWN copy of the app (index.html fetched fresh, patched in memory only)
   inside a hidden same-origin iframe whose localStorage, fetch, clipboard and share-sheet are replaced by in-memory stand-ins.
   The app inside the sandbox can't read or write the real coach's browser storage, can't reach the Google Sheet / Apps Script, and
   can't send anything anywhere. Results are kept under their own key (ft2-qa-v1), never an app key. */
(function(){
'use strict';
const QA = window.QA = {};

/* ---------------------------------------------------------------- constants */
QA.RESULTS_KEY = 'ft2-qa-v1';
QA.APP_URL = new URL('../index.html', location.href).href;
QA.ROOT_URL = new URL('../', location.href).href;
QA.STATUSES = ['Not Tested', 'Pass', 'Fail', 'Partial', 'Fixed / Needs Retest'];
QA.SEVERITIES = ['Critical', 'Major', 'Minor', 'Polish'];
QA.CATEGORIES = [
  'Core Functionality', 'Data & State / Persistence', 'Navigation & Workflow', 'Generator / Recommendation Engine',
  'Usability', 'Consistency', 'Visual / Responsive', 'Integration', 'Error Handling / Offline', 'Security / Privacy / Performance',
];
QA.TYPES = ['Automated', 'Manual', 'Hybrid'];
const COACH_KEY = 'ft2_coach_name_v1';
const APP_STATE_KEY = 'ft2-app-state-v1';
const AUTH_KEY = 'ft2_auth_v1';
QA.KEYS = {COACH_KEY, APP_STATE_KEY, AUTH_KEY};

/* ---------------------------------------------------------------- tiny helpers */
const sleep = ms => new Promise(r => setTimeout(r, ms));
QA.sleep = sleep;
QA.now = () => new Date().toISOString();
QA.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class QAFail extends Error { constructor(msg, kind){ super(msg); this.qaKind = kind || 'fail'; } }
QA.Fail = QAFail;
QA.fail = msg => { throw new QAFail(msg); };
QA.partial = msg => { throw new QAFail(msg, 'partial'); };
QA.assert = (cond, msg) => { if(!cond) throw new QAFail(msg || 'Assertion failed'); };
QA.eq = (a, b, msg) => { if(a !== b) throw new QAFail(`${msg || 'Values differ'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
QA.deepEq = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); if(x !== y) throw new QAFail(`${msg || 'Values differ'}: expected ${y}, got ${x}`); };

/* ---------------------------------------------------------------- the app source (fetched fresh, patched in memory) */
let sourceCache = null;
async function hashText(text){
  try{
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
  }catch(e){
    let h = 2166136261; for(let i = 0; i < text.length; i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
}
QA.loadSource = async function(force){
  if(sourceCache && !force) return sourceCache;
  const res = await fetch(QA.APP_URL, {cache: 'no-store'});
  if(!res.ok) throw new Error('Could not load index.html (' + res.status + ')');
  const text = await res.text();
  const patches = [];
  let patched = text;
  // The share link is built from the page address; inside the sandbox that address is faked (see boot) so the real format can be tested.
  const p1 = 'function appBaseUrl(){ return window.location.href.split(/[?#]/)[0]; }';
  const p2 = "new URLSearchParams(window.location.search).get('s')";
  if(patched.includes(p1)){ patched = patched.replace(p1, 'function appBaseUrl(){ return (window.__QA_LOC ? window.__QA_LOC.href : window.location.href).split(/[?#]/)[0]; }'); patches.push('appBaseUrl'); }
  if(patched.includes(p2)){ patched = patched.replace(p2, "new URLSearchParams(window.__QA_LOC ? window.__QA_LOC.search : window.location.search).get('s')"); patches.push('initSharedLink'); }
  // The 3-second "Building Your Session" screen is shortened in the sandbox (unless a test asks for the real timing).
  const p3 = 'const GEN_MIN_DISPLAY_MS = 3000;';
  if(patched.includes(p3)){ patched = patched.replace(p3, 'const GEN_MIN_DISPLAY_MS = (window.__QA_FASTGEN ? 150 : 3000);'); patches.push('genWait'); }
  // The shipped Content-Security-Policy allows exactly ONE inline script (the app, by its hash) and forbids eval(). The sandbox copy has patches
  // (above) so its script text differs: its hash is recomputed so the SAME strict policy is enforced in every test, plus 'unsafe-eval' for the
  // harness only (it reads the app's internal state with eval). The real, unmodified policy text is checked by the security tests (they read src.text).
  const sm = /<script>([\s\S]*?)<\/script>/.exec(patched);
  if(sm){
    const dig = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sm[1])));
    const b64 = btoa(String.fromCharCode(...dig));
    const hm = /'sha256-[A-Za-z0-9+\/=]+'/;
    if(hm.test(patched)){ patched = patched.replace(hm, "'sha256-" + b64 + "' 'unsafe-eval'"); patches.push('csp-for-harness'); }
  }
  sourceCache = {
    text, patched, patches,
    hash: await hashText(text),
    lastModified: res.headers.get('last-modified') || '',
    bytes: text.length,
    loadedAt: QA.now(),
  };
  return sourceCache;
};

/* Build identity shown on every run: content hash of index.html (changes whenever the app changes), its Last-Modified header, and --
   best effort, needs internet -- the newest commit on GitHub. */
QA.buildInfo = async function(){
  const src = await QA.loadSource();
  const info = {hash: src.hash, lastModified: src.lastModified, commit: '', commitDate: '', host: location.host || 'local file'};
  try{
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch('https://api.github.com/repos/strykerturbo/ft2-videos/commits/main', {signal: ctl.signal, headers: {Accept: 'application/vnd.github+json'}});
    clearTimeout(t);
    if(r.ok){ const j = await r.json(); info.commit = String(j.sha || '').slice(0, 7); info.commitDate = (j.commit && j.commit.committer && j.commit.committer.date) || ''; }
  }catch(e){ /* offline / rate limited -- the content hash is still a reliable build id */ }
  return info;
};

/* ---------------------------------------------------------------- in-memory mock of the Apps Script backend */
class MockBackend {
  constructor(){ this.sessions = new Map(); this.log = []; this.failNext = 0; this.down = false; this.sharingOff = false; }
  json(obj, status){ return new Response(JSON.stringify(obj), {status: status || 200, headers: {'Content-Type': 'application/json'}}); }
  async handle(url, opts){
    opts = opts || {};
    this.log.push({url: String(url), method: opts.method || 'GET', body: opts.body || null});
    if(this.down) throw new TypeError('Failed to fetch');
    if(this.failNext > 0){ this.failNext--; throw new TypeError('Failed to fetch'); }
    const u = new URL(url, 'https://qa.invalid/');
    if(opts.method === 'POST'){
      let body = {}; try{ body = JSON.parse(opts.body); }catch(e){}
      if(body.action === 'upsert' && body.session){ this.sessions.set(String(body.session.id), JSON.parse(JSON.stringify(body.session))); return this.json({ok: true}); }
      if(body.action === 'delete' && body.session){ this.sessions.delete(String(body.session.id)); return this.json({ok: true}); }
      return this.json({ok: false, error: 'unknown action'});
    }
    const share = u.searchParams.get('share');
    if(share){
      if(this.sharingOff) return this.json([...this.sessions.values()]);        // an Apps Script that predates sharing answers with the whole list
      const s = [...this.sessions.values()].find(x => x.shareToken === share);
      return s ? this.json(s) : this.json({error: 'not found'});
    }
    if(u.searchParams.get('sheet') === 'sessions') return this.json([...this.sessions.values()]);
    // Read-only pass-through of the two library lookups, only when a test asked for the live library (nothing is ever written).
    if(this.live && String(url).startsWith('https://script.google.com/macros/s/') && (!u.search || u.search === '?sheet=validvalues')){
      const text = await QA.liveGet(String(url));
      return new Response(text, {status: 200, headers: {'Content-Type': 'application/json'}});
    }
    return this.json({error: 'qa mock has no exercise sheet'}, 500);              // exercise sync fails -> the app keeps its bundled library
  }
}
QA.MockBackend = MockBackend;
/* One read-only GET per address per page load (the live Google Sheet via the app's own Apps Script link), cached. */
QA.liveCache = {};
QA.liveGet = async function(url){
  if(QA.liveFailedAt && Date.now() - QA.liveFailedAt < 60000) throw new Error('live library unreachable (recently failed)');   // don't make every test wait again
  if(!QA.liveCache[url]){
    QA.liveCache[url] = (async () => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
      try{ const r = await fetch(url, {cache: 'no-store', signal: ctl.signal}); if(!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
      finally{ clearTimeout(t); }
    })();
  }
  try{ return await QA.liveCache[url]; }catch(e){ delete QA.liveCache[url]; QA.liveFailedAt = Date.now(); throw e; }
};

/* ---------------------------------------------------------------- the sandbox */
let sandboxSeq = 0;
class Sandbox {
  constructor(frame, ctx, win){
    this.frame = frame; this.ctx = ctx; this.win = win; this.doc = win.document; this.id = ++sandboxSeq;
    this.errors = ctx.errors; this.warnings = ctx.warnings;
  }
  /* --- reading the app */
  e(code){ return this.win.eval(code); }                       // run code in the app's own global scope (sees top-level const/let too)
  get S(){ return this.win.eval('state'); }
  get screen(){ return this.S.screen; }
  fn(name, ...args){
    const f = this.win[name]; if(typeof f !== 'function') throw new QAFail(`The app has no function "${name}" (was it renamed?)`);
    return f.apply(this.win, args);
  }
  has(name){ return typeof this.win[name] === 'function'; }
  q(sel, root){ return (root || this.doc).querySelector(sel); }
  qa(sel, root){ return [...(root || this.doc).querySelectorAll(sel)]; }
  text(scope){ const el = this.q(scope || '#content'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  html(scope){ const el = this.q(scope || '#content'); return el ? el.innerHTML : ''; }
  /* --- driving the app like a coach */
  norm(s){ return String(s || '').replace(/\s+/g, '').toLowerCase(); }   // whitespace-free so "+ Add Exercise" matches however the page spaces it
  has(text, scope){ return this.norm(this.text(scope || '#shell')).includes(this.norm(text)); }
  clickables(scope){
    const root = scope ? this.q(scope) : this.doc;
    if(!root) return [];
    return this.qa('button, a, [data-onclick], [role="button"], .navitem, label', root).filter(el => !el.disabled);
  }
  findClickable(text, scope, opts){
    const want = this.norm(text), exact = opts && opts.exact;
    const list = this.clickables(scope || '#shell, #overlay');
    const hit = list.filter(el => { const t = this.norm(el.textContent) || this.norm(el.getAttribute('aria-label')) || this.norm(el.getAttribute('title')); return exact ? t === want : t.includes(want); });
    // prefer the tightest match (shortest text) so "Save" doesn't grab "Save Session and share"
    hit.sort((a, b) => this.norm(a.textContent).length - this.norm(b.textContent).length);
    return hit[0] || null;
  }
  click(text, scope, opts){
    const el = this.findClickable(text, scope, opts);
    if(!el) throw new QAFail(`Could not find a button/link reading "${text}" on screen "${this.screen}"`);
    el.click(); return el;
  }
  canClick(text, scope, opts){ return !!this.findClickable(text, scope, opts); }
  clickSel(sel){ const el = this.q(sel); if(!el) throw new QAFail(`Could not find "${sel}" on screen "${this.screen}"`); el.click(); return el; }
  type(sel, value){
    const el = typeof sel === 'string' ? this.q(sel) : sel; if(!el) throw new QAFail(`Could not find the field "${sel}"`);
    el.value = value; el.dispatchEvent(new this.win.Event('input', {bubbles: true})); el.dispatchEvent(new this.win.Event('change', {bubbles: true}));
    el.dispatchEvent(new this.win.Event('blur', {bubbles: false})); return el;
  }
  async sleep(ms){ await sleep(ms); }
  async until(fn, timeout, label){
    const t0 = performance.now(); timeout = timeout || 4000;
    for(;;){
      let v; try{ v = fn(); }catch(e){ v = false; }
      if(v) return v;
      if(performance.now() - t0 > timeout) throw new QAFail('Timed out waiting for ' + (label || 'the app to settle'));
      await sleep(25);
    }
  }
  /* --- app state helpers used by many tests */
  flushState(){ this.fn('saveAppStateToStorage'); }
  storedSnapshot(){ try{ return JSON.parse(this.ctx.store.get(APP_STATE_KEY) || 'null'); }catch(e){ return null; } }
  overlayText(){ return this.text('#overlay'); }
  navLabelActive(){ const el = this.q('#bottomnav .navitem.active .navitem-label'); return el ? el.textContent.trim() : null; }
  visibleNavLabels(){ return this.qa('#bottomnav .navitem .navitem-label').map(e => e.textContent.trim()); }
  exercises(){ return this.e('EXERCISES'); }
  exerciseBySection(section, n){ return this.exercises().filter(e => e.section === section).slice(0, n || 1); }
  /* Put exercises into the draft the way "Add" does, without touching the screen. */
  addExercises(map){        // map: {warmup:[ids], athletic:[ids], ...}
    const S = this.S;
    Object.keys(map).forEach(k => { map[k].forEach(id => { if(!S.phaseData[k].includes(id)) S.phaseData[k].push(id); }); });
    this.fn('render');
  }
  firstIdsPerPhase(n){
    const out = {}; const phases = this.e('PHASES');
    phases.forEach(p => { out[p.key] = this.exercises().filter(e => e.section === p.section && e.name).slice(0, n || 1).map(e => e.id); });
    return out;
  }
  /* Save a small draft as a real saved session by calling the app's own save path. Returns the saved session. */
  saveDraftSession(opts){
    opts = opts || {};
    const S = this.S;
    if(!this.fn('currentTotalMinutes').count) this.addExercises(this.firstIdsPerPhase(1));
    if(opts.name) S.sessionName = opts.name;
    this.fn('completeSession', {skipConfirm: opts.skipConfirm !== false});
    return S.savedSessions[S.savedSessions.length - 1];
  }
  /* A freshly generated Custom Session draft (what Steps 1-4 produce), without walking the screens. */
  generate(cfg){ return this.fn('generateCustomSession', cfg); }
  destroy(){
    try{ this.frame.remove(); }catch(e){}
    QA.sandboxes.delete(this);
  }
  async reboot(opts){
    const store = this.ctx.store, backend = this.ctx.backend;
    this.destroy();
    return QA.boot(Object.assign({store, backend}, opts || {}));
  }
}
QA.Sandbox = Sandbox;
QA.cspLog = [];               // every Content-Security-Policy violation seen inside a sandbox during the current test
QA.sandboxes = new Set();      // every sandbox still alive; a test that opens several (e.g. "close and reopen the app") never leaks them

/* Boot a fresh, isolated copy of the app. Options:
   coach        name stored as "who's coaching" (null = leave it unset so the app shows its who-are-you screen)
   query        a fake address query, e.g. "?s=TOKEN", to test opening a shared link
   fetchMode    'offline' (every network call fails), 'mock' (an in-memory Apps Script), 'raw' (calls the custom ctx.fetchHandler)
   store        a Map to reuse as storage (to simulate closing and reopening the app)
   seed         {key: value} pre-loaded into storage (strings are stored as-is; objects are JSON-encoded)
   width/height viewport of the sandbox, default phone 390 x 844 */
QA.boot = async function(opts){
  opts = Object.assign({coach: 'QA Coach', query: '', fetchMode: 'mock', width: 390, height: 844}, opts || {});
  const src = await QA.loadSource();
  const store = opts.store || new Map();
  const backend = opts.backend || await QA.makeBackend();      // the REAL Apps Script code running on a pretend Sheet (qa-server.js)
  if(opts.live) backend.live = true;
  if(opts.coach) store.set(COACH_KEY, opts.coach);
  if(opts.coach && opts.auth !== false){          // a coach who has already signed in on this pretend server: the app holds the server's token
    const known = backend.tokens[opts.coach] ? {name: opts.coach, token: backend.tokens[opts.coach]} : backend.signIn(opts.coach);
    store.set(AUTH_KEY, JSON.stringify({coach: known.name, token: known.token}));
  }
  if(opts.seed) Object.keys(opts.seed).forEach(k => store.set(k, typeof opts.seed[k] === 'string' ? opts.seed[k] : JSON.stringify(opts.seed[k])));
  const ctx = {
    store, backend, errors: [], warnings: [], shareLog: [], clipboard: [], fetchLog: [], printLog: [], openLog: [], downloads: [],
    shareAbort: !!opts.shareAbort, standalone: opts.standalone == null ? null : !!opts.standalone, canShare: opts.canShare !== false,
    fetchMode: opts.fetchMode, fetchHandler: opts.fetchHandler || null,
    clipboardWorks: opts.clipboardWorks !== false, shareExists: opts.shareExists !== false,
  };
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true'); frame.setAttribute('tabindex', '-1'); frame.title = 'FT2 QA sandbox';
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${opts.width}px;height:${opts.height}px;border:0;visibility:hidden;`;
  frame.__qaCtx = ctx;
  const loc = {href: QA.ROOT_URL + 'index.html' + (opts.query || ''), search: opts.query || ''};
  const bootScript = `
(function(){
  var ctx = window.frameElement.__qaCtx;
  window.__QA_LOC = ${JSON.stringify(loc)};
  window.__QA_FASTGEN = ${opts.fastGen === false ? 'false' : 'true'};
  var mk = function(map){ return {
    getItem:function(k){ return map.has(k) ? map.get(k) : null; }, setItem:function(k,v){ map.set(String(k), String(v)); },
    removeItem:function(k){ map.delete(k); }, clear:function(){ map.clear(); }, key:function(i){ return Array.from(map.keys())[i] == null ? null : Array.from(map.keys())[i]; },
    get length(){ return map.size; } }; };
  var ls = mk(ctx.store), ss = mk(new Map());
  try{ Object.defineProperty(window, 'localStorage', {configurable:true, get:function(){ return ls; }}); }catch(e){ ctx.errors.push('could not isolate localStorage: ' + e.message); }
  try{ Object.defineProperty(window, 'sessionStorage', {configurable:true, get:function(){ return ss; }}); }catch(e){}
  window.fetch = function(url, o){
    ctx.fetchLog.push({url:String(url), method:(o&&o.method)||'GET', body:(o&&o.body)||null});
    if(ctx.fetchMode === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
    if(ctx.fetchMode === 'raw' && ctx.fetchHandler) return Promise.resolve().then(function(){ return ctx.fetchHandler(url, o); });
    return ctx.backend.handle(url, o);
  };
  try{
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{ writeText:function(t){ if(!ctx.clipboardWorks) return Promise.reject(new Error('denied')); ctx.clipboard.push(String(t)); return Promise.resolve(); } }});
  }catch(e){}
  try{
    if(ctx.shareExists) Object.defineProperty(navigator, 'share', {configurable:true, value:function(d){ ctx.shareLog.push(d); if(ctx.shareAbort){ var e = new Error('Share canceled'); e.name = 'AbortError'; return Promise.reject(e); } return Promise.resolve(); }});
    else Object.defineProperty(navigator, 'share', {configurable:true, value:undefined});
  }catch(e){}
  if(ctx.standalone != null){ try{ Object.defineProperty(navigator, 'standalone', {configurable:true, value:ctx.standalone}); }catch(e){} }
  try{ Object.defineProperty(navigator, 'canShare', {configurable:true, value:function(){ return ctx.canShare !== false; }}); }catch(e){}
  window.open = function(u){ ctx.openLog.push(String(u)); return null; };
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){ if(this.hasAttribute('download')){ ctx.downloads.push(this.download); return; } return origClick.apply(this, arguments); };
  window.addEventListener('error', function(ev){ ctx.errors.push((ev.message || 'error') + (ev.filename ? ' @' + String(ev.filename).split('/').pop() + ':' + ev.lineno : '')); });
  window.addEventListener('unhandledrejection', function(ev){ ctx.errors.push('unhandled promise rejection: ' + (ev.reason && ev.reason.message || ev.reason)); });
  var ow = console.warn; console.warn = function(){ ctx.warnings.push(Array.prototype.join.call(arguments, ' ')); };
  document.addEventListener('securitypolicyviolation', function(ev){ window.parent.QA.cspLog.push(ev.violatedDirective + ' | ' + (ev.blockedURI || '') + ' | ' + String(ev.sample || '').slice(0, 80)); });
})();`;
  let html = src.patched.replace(/<head[^>]*>/i, m => `${m}<base href="${QA.ROOT_URL}"><script>${bootScript}<\/script>`);
  // the harness's own boot script is the only other inline script allowed in the sandbox copy of the policy (by hash)
  const bh = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bootScript)))));
  html = html.replace("'unsafe-eval'", "'unsafe-eval' 'sha256-" + bh + "'");
  document.body.appendChild(frame);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The app did not finish loading inside the QA sandbox (15s).')), 15000);
    frame.addEventListener('load', () => { clearTimeout(t); resolve(); }, {once: true});
    frame.srcdoc = html;
  });
  const win = frame.contentWindow;
  if(!win || !win.document) throw new Error('Sandbox window unavailable');
  const sb = new Sandbox(frame, ctx, win);
  // sanity: the app booted and our isolation is in place
  if(typeof win.render !== 'function') throw new Error('The app script did not run in the sandbox (syntax error?). Errors: ' + ctx.errors.join(' | '));
  QA.sandboxes.add(sb);
  sb.isolated = (function(){ try{ win.localStorage.setItem('__qa_probe', '1'); const ok = store.get('__qa_probe') === '1'; win.localStorage.removeItem('__qa_probe'); return ok; }catch(e){ return false; } })();
  if(!sb.isolated){ sb.destroy(); throw new Error('Sandbox isolation failed -- refusing to run tests against real browser storage.'); }
  sb.libraryLive = false;
  if(opts.live){
    // the app's own sync ends as 'live' or (failed) 'offline'; either way stop waiting
    try{ await sb.until(() => win.eval('state.dataSource') !== 'unknown', 20000, 'the exercise library sync'); sb.libraryLive = win.eval('state.dataSource') === 'live'; }catch(e){ sb.libraryLive = false; }
  }
  QA.libraryStatus = sb.libraryLive ? 'live' : (opts.live ? 'bundled (live library unreachable)' : 'bundled');
  if(opts.live) (QA.libSeen = QA.libSeen || new Set()).add(QA.libraryStatus);
  await sleep(30);
  return sb;
};

/* ---------------------------------------------------------------- results store (QA's own storage key only) */
const emptyStore = () => ({version: 1, manual: {}, auto: {}, notes: {}, severity: {}, runs: [], lastRunId: null});
QA.store = emptyStore();
QA.loadStore = function(){
  try{ const raw = localStorage.getItem(QA.RESULTS_KEY); if(raw){ const s = JSON.parse(raw); QA.store = Object.assign(emptyStore(), s); } }catch(e){ QA.store = emptyStore(); }
  return QA.store;
};
QA.saveStore = function(){
  try{
    QA.store.runs = QA.store.runs.slice(-30);
    localStorage.setItem(QA.RESULTS_KEY, JSON.stringify(QA.store));
  }catch(e){ QA.storeError = String(e && e.message || e); }
};
QA.resetResults = function(opts){
  const keepNotes = opts && opts.keepNotes;
  const notes = keepNotes ? QA.store.notes : {};
  QA.store = emptyStore(); QA.store.notes = notes; QA.saveStore();
};
QA.exportResults = function(){ return JSON.stringify({exportedAt: QA.now(), store: QA.store}, null, 2); };

/* ---------------------------------------------------------------- inventory access */
QA.TESTS = [];
QA.byId = {};
QA.register = function(tests){
  tests.forEach(t => { if(QA.byId[t.id]) throw new Error('Duplicate test id ' + t.id); QA.byId[t.id] = t; QA.TESTS.push(t); });
};
QA.severityOf = id => (QA.store.severity[id]) || (QA.byId[id] && QA.byId[id].severity) || 'Minor';

/* The latest known result for a test: whichever of its last automated run / last human mark is newer. */
QA.resultOf = function(id){
  const a = QA.store.auto[id], m = QA.store.manual[id];
  let r = null;
  if(a && m) r = (a.ts >= m.ts) ? a : m; else r = a || m || null;
  if(!r) return {status: 'Not Tested', actual: '', ts: '', notes: QA.store.notes[id] || '', build: '', source: ''};
  return Object.assign({notes: QA.store.notes[id] || ''}, r);
};
QA.statusOf = id => QA.resultOf(id).status;
/* Hybrid and manual tests count as "waiting for a human" until someone confirms them. */
QA.awaitingHuman = function(id){
  const t = QA.byId[id]; if(!t || t.type === 'Automated') return false;
  const r = QA.resultOf(id);
  if(r.source === 'manual') return r.status === 'Not Tested' || r.status === 'Fixed / Needs Retest';
  return r.status === 'Not Tested' || r.status === 'Fixed / Needs Retest' || r.status === 'Partial';
};
QA.markManual = function(id, status, notes, build){
  if(!QA.byId[id]) return;
  QA.store.manual[id] = {status, actual: notes || '', ts: QA.now(), build: build || '', source: 'manual'};
  if(notes !== undefined) QA.store.notes[id] = notes;
  QA.saveStore();
};
QA.setNote = function(id, text){ QA.store.notes[id] = text; QA.saveStore(); };
QA.setSeverity = function(id, sev){ if(sev) QA.store.severity[id] = sev; else delete QA.store.severity[id]; QA.saveStore(); };

/* ---------------------------------------------------------------- running tests */
const STATUS_CODE = {'Not Tested': 'N', 'Pass': 'P', 'Fail': 'F', 'Partial': 'A', 'Fixed / Needs Retest': 'X'};
QA.statusMapNow = function(){ const m = {}; QA.TESTS.forEach(t => { m[t.id] = STATUS_CODE[QA.statusOf(t.id)]; }); return m; };

async function runOne(t, ctx){
  const t0 = performance.now();
  const rec = {id: t.id, status: 'Pass', actual: '', details: '', ms: 0, ts: QA.now(), build: ctx.build, source: 'auto'};
  if(!t.run){ rec.status = 'Not Tested'; rec.actual = 'No automated check.'; return rec; }
  let sb = null; QA.cspLog.length = 0;
  const env = {
    boot: async o => { sb = await QA.boot(o); return sb; },
    note: s => { rec.actual = rec.actual ? rec.actual + ' ' + s : s; },
  };
  try{
    const out = await Promise.race([
      Promise.resolve().then(() => t.run(env, QA)),
      new Promise((_, rej) => setTimeout(() => rej(new QAFail('Timed out after ' + Math.round((t.timeout || 25000) / 1000) + 's')), t.timeout || 25000)),
    ]);
    if(typeof out === 'string') rec.actual = out;
    else if(out && typeof out === 'object'){ if(out.actual) rec.actual = out.actual; if(out.status) rec.status = out.status; if(out.details) rec.details = out.details; }
    if(!rec.actual) rec.actual = 'Behaved as expected.';
    // the strict policy blocked a script / inline handler the app tried to run: a real bug, whatever the test was checking
    const blocked = QA.cspLog.filter(v => /^script-src/.test(v));
    if(rec.status === 'Pass' && blocked.length && !t.allowCsp){ rec.status = 'Fail'; rec.actual = 'The Content-Security-Policy blocked script the app tried to run: ' + blocked.slice(0, 2).join(' ; '); }
    // an uncaught page error inside the sandbox during a passing test is worth surfacing, but is not a failure by itself
    if(rec.status === 'Pass' && sb && sb.errors.length && !t.allowErrors){
      rec.status = 'Partial'; rec.actual += ' | The app logged ' + sb.errors.length + ' script error(s) while running: ' + sb.errors.slice(0, 2).join(' ; ');
    }
  }catch(err){
    if(err instanceof QAFail && err.qaKind === 'partial'){ rec.status = 'Partial'; rec.actual = err.message; }
    else { rec.status = 'Fail'; rec.actual = (err && err.message) || String(err); rec.details = (err && err.stack) ? String(err.stack).split('\n').slice(0, 4).join('\n') : ''; }
  }finally{
    if(sb){ rec.sandboxErrors = sb.errors.slice(0, 5); }
    [...QA.sandboxes].forEach(x => x.destroy());
  }
  // Hybrid tests: the automated part can fail the test or pass it "so far"; a person still has to confirm the human-judgement part.
  if(t.type === 'Hybrid' && rec.status === 'Pass'){ rec.status = 'Partial'; rec.actual += ' (automated checks passed -- a person still needs to confirm the visual / judgement part)'; rec.awaitingHuman = true; }
  rec.ms = Math.round(performance.now() - t0);
  return rec;
}

QA.running = false; QA.cancelRequested = false;
/* Expensive shared work (e.g. the generator sweep) is computed once per run and reused by every test that needs it. */
QA.memoStore = {};
QA.memo = async (key, fn) => { if(!(key in QA.memoStore)) QA.memoStore[key] = fn(); return QA.memoStore[key]; };
QA.cancelRun = () => { QA.cancelRequested = true; };

/* Run a set of test ids. opts: {kind, label, onProgress(done,total,rec,test), onStart(total)} Returns the run record. */
QA.run = async function(ids, opts){
  opts = opts || {};
  if(QA.running) throw new Error('A run is already in progress');
  QA.running = true; QA.cancelRequested = false; QA.memoStore = {}; QA.libSeen = new Set();
  const build = await QA.buildInfo();
  const buildLabel = build.commit ? build.commit + ' · ' + build.hash : build.hash;
  const runnable = ids.filter(id => QA.byId[id] && QA.byId[id].run);
  const run = {
    id: 'R' + Date.now().toString(36), kind: opts.kind || 'custom', label: opts.label || '', startedAt: QA.now(), endedAt: null,
    build, ids: ids.slice(), scheduledAutomated: runnable.length, results: {}, testIds: QA.TESTS.map(t => t.id), cancelled: false,
  };
  if(opts.onStart) opts.onStart(runnable.length, run);
  let done = 0;
  try{
    for(const id of runnable){
      if(QA.cancelRequested){ run.cancelled = true; break; }
      const t = QA.byId[id];
      const rec = await runOne(t, {build: buildLabel});
      QA.store.auto[id] = rec;
      run.results[id] = {status: rec.status, actual: rec.actual, ms: rec.ms};
      done++;
      if(opts.onProgress) opts.onProgress(done, runnable.length, rec, t);
      if(done % 5 === 0) await sleep(0);
    }
  } finally {
    run.endedAt = QA.now(); run.library = [...(QA.libSeen || [])].join(' / ');
    run.statusMap = QA.statusMapNow();
    run.manualSnapshot = {};
    QA.TESTS.forEach(t => { if(t.type !== 'Automated'){ run.manualSnapshot[t.id] = STATUS_CODE[QA.statusOf(t.id)]; } });
    QA.store.runs.push(run); QA.store.lastRunId = run.id; QA.saveStore();
    QA.running = false;
  }
  return run;
};

/* ---------------------------------------------------------------- summaries */
QA.isFailing = st => st === 'Fail';
QA.summary = function(ids){
  ids = ids || QA.TESTS.map(t => t.id);
  const s = {total: ids.length, Pass: 0, Fail: 0, Partial: 0, 'Not Tested': 0, 'Fixed / Needs Retest': 0, critical: 0, major: 0, minor: 0, polish: 0, automatedPass: 0, automatedFail: 0, manualDone: 0, manualFail: 0, manualPending: 0, automatedTotal: 0, byCategory: {}};
  QA.CATEGORIES.forEach(c => { s.byCategory[c] = {total: 0, pass: 0, fail: 0, partial: 0, untested: 0, retest: 0}; });
  ids.forEach(id => {
    const t = QA.byId[id]; if(!t) return;
    const st = QA.statusOf(id); s[st]++;
    const sev = QA.severityOf(id);
    const c = s.byCategory[t.category] || (s.byCategory[t.category] = {total: 0, pass: 0, fail: 0, partial: 0, untested: 0, retest: 0});
    c.total++;
    if(st === 'Pass') c.pass++; else if(st === 'Fail') c.fail++; else if(st === 'Partial') c.partial++; else if(st === 'Fixed / Needs Retest') c.retest++; else c.untested++;
    if(st === 'Fail'){ if(sev === 'Critical') s.critical++; else if(sev === 'Major') s.major++; else if(sev === 'Minor') s.minor++; else s.polish++; }
    if(st === 'Partial' && sev === 'Polish') s.polish++;
    if(t.type === 'Automated'){ s.automatedTotal++; if(st === 'Pass') s.automatedPass++; if(st === 'Fail') s.automatedFail++; }
    else {
      if(QA.awaitingHuman(id)) s.manualPending++;
      else if(st === 'Pass') s.manualDone++;
      if(st === 'Fail') s.manualFail++;
    }
  });
  s.passPct = s.total ? Math.round(s.Pass / s.total * 100) : 0;
  // PASS: nothing Critical/Major is failing and nothing is waiting on a person. FAIL: a Critical/Major failure. PARTIAL: otherwise.
  const unresolvedHard = ids.some(id => { const st = QA.statusOf(id), sev = QA.severityOf(id); return (st === 'Fail') && (sev === 'Critical' || sev === 'Major'); });
  const incomplete = ids.some(id => { const st = QA.statusOf(id); if(st === 'Not Tested' || st === 'Fixed / Needs Retest') return true; return QA.awaitingHuman(id); });
  s.overall = unresolvedHard ? 'FAIL' : (incomplete ? 'PARTIAL' : 'PASS');
  return s;
};

/* Compare the newest run with the one before it (using the full status snapshot taken at the end of each). */
QA.compare = function(newerIdx, olderIdx){
  const runs = QA.store.runs;
  const cur = runs[newerIdx == null ? runs.length - 1 : newerIdx], prev = runs[olderIdx == null ? (newerIdx == null ? runs.length - 2 : newerIdx - 1) : olderIdx];
  if(!cur || !prev) return null;
  const out = {cur, prev, newFailures: [], fixed: [], unchangedFailures: [], newTests: [], changedOther: []};
  const prevIds = new Set(prev.testIds || Object.keys(prev.statusMap || {}));
  Object.keys(cur.statusMap || {}).forEach(id => {
    if(!prevIds.has(id)){ out.newTests.push(id); return; }
    const a = (prev.statusMap || {})[id], b = cur.statusMap[id];
    if(b === 'F' && a !== 'F'){ if(a === 'P') out.newFailures.push(id); else out.changedOther.push(id); }
    else if(b === 'P' && a === 'F') out.fixed.push(id);
    else if(b === 'F' && a === 'F') out.unchangedFailures.push(id);
  });
  return out;
};

/* Which tests matter for a given area of the app. Tests carry a `tags` list; a few area names expand to several tags. */
QA.AREAS = {
  'Home screen': ['home'], 'Start New Session / Session Setup': ['setup'], 'Build Session': ['build'], 'Session Review / Saving': ['review', 'save'],
  'Saved Sessions': ['saved'], 'Exercise Library & Detail': ['library', 'detail'], 'Custom Session / Generator': ['custom', 'generator'],
  'Templates': ['templates'], 'Sharing': ['share'], 'Print / Export': ['print'], 'Saving data / reopening the app': ['persistence'],
  'Navigation & bottom bar': ['nav', 'bottomnav'], 'Exercise data / Google Sheet sync': ['data', 'sync'], 'Look & feel / phone layout': ['visual', 'responsive'],
};
QA.testsForAreas = function(areas){
  const tags = new Set(); areas.forEach(a => (QA.AREAS[a] || []).forEach(t => tags.add(t)));
  return QA.TESTS.filter(t => (t.tags || []).some(x => tags.has(x))).map(t => t.id);
};
QA.smokeIds = () => QA.TESTS.filter(t => t.smoke).map(t => t.id);

QA.loadStore();
})();
