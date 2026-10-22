/* FT2 QA inventory, part 8: P0 SECURITY pass 2 - the strict Content-Security-Policy (no inline scripts), the safe handler engine, and the
   hostile-text matrix (5 attack strings x 6 kinds of text, across every screen). */
(function(){
'use strict';
const QA = window.QA, L = QA.lib, C = QA.C, T = QA.T;
const {assert, eq} = QA;
const tests = [];
const add = (...a) => tests.push(T(...a));
const sec = (id, desc, o) => add(id, C.sec, o.screen || 'Security', desc, Object.assign({severity: 'Critical', tags: ['security'], timeout: 90000}, o));

const PAYLOADS = [
  `<script>window.__x.push('p1')</script>`,
  `<img src=x onerror=window.__x.push('p2')>`,
  `"><img src=x onerror=window.__x.push('p3')>`,
  `<svg onload=window.__x.push('p4')>`,
  `javascript:window.__x.push('p5')`,
  `');window.__x.push('p6');//`,
];
/* what "nothing ran and nothing was injected" means on the current screen */
function injected(sb){
  const bad = [];
  if(sb.win.__x.length) bad.push('code ran: ' + [...new Set(sb.win.__x)].join(','));
  if(sb.qa('#shell script, #overlay script, #shell iframe, #overlay iframe, #shell object, #overlay embed').length) bad.push('a script / frame element was injected');
  const root = sb.q('#shell'), ov = sb.q('#overlay');
  [root, ov].forEach(r => { if(!r) return; r.querySelectorAll('*').forEach(el => { for(const a of el.attributes){ if(/^on/i.test(a.name)) bad.push('real event attribute ' + a.name); if(/^data-on/.test(a.name) && /__x/.test(a.value.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, ''))) bad.push('handler attribute carries the payload: ' + a.value.slice(0, 50)); if(/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) bad.push('javascript: URL in ' + a.name); } }); });
  return bad;
}
const seenText = (sb, needle) => (sb.text('#content') + ' ' + sb.text('#overlay') + ' ' + sb.text('#topbar')).includes(needle);

/* ------- the strict policy ------- */
sec('SEC-023B', 'The page policy has NO inline-script or eval allowance: scripts only from the page itself (by hash) and cdnjs, no plugins, frames, workers, base or form hijack; the hash matches the real script; styles and the network are limited to what the app uses.', {
  tags: ['security'], steps: ['Read the policy, hash the script.'], exp: 'Strict policy, current hash.', timeout: 30000,
  async run(){ const src = (await QA.loadSource()).text; const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(src); assert(m, 'No policy'); const csp = m[1]; const dir = n => (new RegExp('(?:^|;)\\s*' + n + '\\s+([^;]*)').exec(csp) || [])[1] || '';
    const script = dir('script-src'); assert(!/unsafe-inline|unsafe-eval|unsafe-hashes|\*|data:|blob:|https?:\s|http:/.test(script.replace('https://cdnjs.cloudflare.com', '')), 'script-src is not strict: ' + script); assert(/'self'/.test(script) && /'sha256-[A-Za-z0-9+/=]{43}='/.test(script), 'script-src should be self + one hash: ' + script);
    ['object-src', 'frame-src', 'worker-src'].forEach(d => eq(dir(d), "'none'", d)); eq(dir('base-uri'), "'self'", 'base-uri'); eq(dir('form-action'), "'self'", 'form-action'); assert(/'self'/.test(dir('default-src')) && !/\*/.test(dir('default-src')), 'default-src');
    assert(!/unsafe-eval/.test(csp), 'unsafe-eval'); const conn = dir('connect-src'); assert(/script\.google\.com/.test(conn) && !/(^|\s)(\*|https:|http:)(\s|$)/.test(conn), 'connect-src: ' + conn); assert(!/(^|\s)(\*|http:)(\s|$)/.test(dir('style-src')) && !/(^|\s)(\*|http:)(\s|$)/.test(dir('font-src')), 'style/font sources too open');
    const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)]; eq(scripts.length, 1, 'Inline <script> blocks'); const dig = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scripts[0][1]))); const want = 'sha256-' + btoa(String.fromCharCode(...dig)); assert(script.includes("'" + want + "'"), 'The policy hash is STALE (run: python3 qa/update-csp-hash.py). Script hash is ' + want);
    return 'script-src: ' + script + ' | style-src still allows inline styles (the app styles with style="" attributes; styles cannot run code)'; }});
sec('SEC-035', 'No inline event handlers or inline scripts are left in the app: no onclick= / onerror= style attributes, no javascript: links, no eval / Function / document.write / string timers, and exactly one inline script.', {
  tags: ['security'], steps: ['Scan the source.'], exp: 'None found.', timeout: 30000,
  async run(){ const src = (await QA.loadSource()).text; const attrs = [...src.matchAll(/(?<![-\w.])on(?:click|blur|change|error|focus|input|keydown|keyup|load\w*|mousedown|mouseup|mouseover|pointer\w+|touch\w+|submit|scroll|dblclick|contextmenu|drag\w*|drop)\s*=/g)].filter(m => !/Written so that/.test(src.slice(Math.max(0, m.index - 60), m.index + 40)));
    assert(!attrs.length, 'Inline handler attributes remain: ' + attrs.slice(0, 3).map(m => src.slice(m.index, m.index + 40)).join(' | ')); assert(!/javascript:/i.test(src.replace(/javascript:window/g, '')) || !/href=["']javascript:/i.test(src), 'A javascript: link'); const code = src.slice(src.indexOf('<script>', src.indexOf('papaparse')), src.lastIndexOf('</script>'));
    assert(!/[^.\w]eval\(|new Function\(|document\.write\(|setTimeout\(\s*['"`]|setInterval\(\s*['"`]/.test(code), 'eval / Function / document.write / string timers in the app'); assert(!/\.innerHTML\s*=\s*[^;]*\b(location|document\.URL|document\.referrer)/.test(code), 'innerHTML fed from the address'); }});

/* ------- the handler engine ------- */
sec('SEC-036', 'The safe handler engine runs only the app\'s own functions: legitimate handlers work (calls, objects, if / try, event, this.value, stopPropagation), and hostile handler text - alert, eval, fetch, location, innerHTML, constructor tricks, string timers - does nothing.', {
  tags: ['security'], steps: ['Click elements carrying good and hostile data-onclick text.'], exp: 'Only app functions run.',
  async run(env){ const sb = await env.boot(); const w = sb.win; w.__x = []; w.qaProbe = function(){ w.__x.push('probe:' + [].slice.call(arguments).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join('/')); }; const host = sb.doc.createElement('div'); sb.doc.body.appendChild(host);
    const click = (code, inner) => { host.innerHTML = `<div data-onclick="qaProbe('outer')"><button id="b" data-onclick="${code.replace(/"/g, '&quot;')}">go</button></div>`; w.__x.length = 0; sb.doc.getElementById('b').click(); return w.__x.slice(); };
    QA.deepEq(click("qaProbe('a', 1, true, null, -2)"), ['probe:a/1/true/null/-2', 'probe:outer'], 'Plain call, then the outer handler (bubbling)'); QA.deepEq(click("qaProbe('x', {fromBuild:false, n:3, s:'it\\'s'}, ['a',2])"), ['probe:x/{"fromBuild":false,"n":3,"s":"it\'s"}/["a",2]', 'probe:outer'], 'Object + array arguments');
    QA.deepEq(click("event.stopPropagation(); qaProbe('only')"), ['probe:only'], 'stopPropagation keeps the outer handler from running'); QA.deepEq(click("if(event.key==='Enter'){qaProbe('no')} qaProbe('yes')"), ['probe:yes', 'probe:outer'], 'if / sequence'); QA.deepEq(click("try{this.showPicker()}catch(e){} qaProbe('after')"), ['probe:after', 'probe:outer'], 'try / catch'); QA.deepEq(click("qaProbe(this.id, this.textContent)"), ['probe:b/go', 'probe:outer'], 'this');
    const hostile = ["alert(1)", "eval('window.__x.push(1)')", "fetch('https://evil.example')", "window.__x.push('w')", "document.write('<b>x</b>')", "this.innerHTML='<img src=x onerror=window.__x.push(7)>'", "qaProbe.constructor('window.__x.push(8)')()", "setTimeout('window.__x.push(9)',0)", "this.ownerDocument.defaultView.eval('1')", "location.href='javascript:window.__x.push(1)'", "document.body.innerHTML=''", "document.cookie", "Function('window.__x.push(3)')()", "qaProbe('a');alert(2)", "this.setAttribute('onclick','x')", "__proto__.polluted=1", "this.constructor.constructor('window.__x.push(4)')()"];
    for(const h of hostile){ const out = click(h); assert(!out.some(x => !/^probe:(a|outer)/.test(x)), 'Hostile handler ran: ' + h + ' -> ' + out.join(',')); } assert(host.querySelectorAll('img').length === 0, 'A hostile handler injected markup'); eq(Object.prototype.polluted, undefined, 'Prototype pollution'); host.remove(); }});
sec('SEC-037', 'Every button in the app still has a working action under the strict policy: across all screens and sheets each handler parses and calls a function that exists, and the policy never reports a blocked script.', {
  tags: ['security', 'nav'], steps: ['Open every screen, check every data-on* attribute.'], exp: 'All resolvable.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => { const bad = []; sb.qa('#shell *, #overlay *').forEach(el => { [...el.attributes].filter(a => /^data-on/.test(a.name)).forEach(a => { try{ const ast = sb.win.handlerParse(a.value); const walk = n => { if(!n || typeof n !== 'object') return; if(n.t === 'call' && n.f.t === 'id' && !sb.win.handlerAppFunction(n.f.n)) bad.push(a.name + '="' + a.value.slice(0, 60) + '" -> ' + n.f.n + ' is not an app function'); Object.values(n).forEach(v => Array.isArray(v) ? v.forEach(walk) : walk(v)); }; ast.forEach(walk); }catch(e){ bad.push(a.name + '="' + a.value.slice(0, 60) + '" does not parse: ' + e.message); } }); }); return bad; });
    const all = results.flatMap(r => (r.value || []).map(v => r.name + ': ' + v)); assert(!all.length, all.length + ' handler(s) broken, e.g. ' + all.slice(0, 3).join(' || ')); eq(results.filter(r => r.error).length, 0, 'Screens that did not open'); return 'Checked handlers on ' + results.length + ' screens'; }});
sec('SEC-038', 'Real clicking still works end to end under the strict policy (bottom tabs, a card, a sheet, a text field, a drag grip) and the policy is never violated.', {
  tags: ['security', 'nav'], steps: ['Tap through a few things.'], exp: 'Everything responds.',
  async run(env){ const sb = await L.withSaved(env, 1); sb.click('Exercises', '#bottomnav'); eq(sb.S.screen, 'exercises', 'Tab'); const id = sb.exercises()[0].id; sb.clickSel('.ex-card .ex-name'); eq(sb.S.screen, 'detail', 'Card'); sb.click('Back to Exercises', '#content'); eq(sb.S.screen, 'exercises', 'Back'); sb.type('#searchInput', 'zzzzzz'); await sb.sleep(260); eq(sb.S.search, 'zzzzzz', 'Typing in a field'); sb.click('Sessions', '#bottomnav'); eq(sb.S.screen, 'sessions', 'Sessions tab'); sb.fn('openSessionDetail', sb.S.savedSessions[0].id); sb.click('Share Session', '#content'); assert(sb.S.shareConfirmId || sb.S.shareSheet, 'Share did not respond'); eq(QA.cspLog.length, 0, 'Policy violations: ' + QA.cspLog.join(' ; ')); }});

/* ------- XSS-001 .. XSS-006: 6 attack strings in each kind of text, on every screen ------- */
const KINDS = [
  ['SEC-040', 'session titles (your own and another coach\'s shared one)', async sb => { sb.S.savedSessions.forEach((s, i) => { s.name = KIND_P.p; }); const o = sb.fn('normalizeCloudSession', {id: 'SESS_X9', name: KIND_P.p, createdBy: 'Bob Coach', createdAt: Date.now(), totalMin: 5, exCount: 1, targetDuration: 60, visibility: 'shared', phases: [{label: 'Warmup', section: 'Warmup', exercises: [{id: 'EX001', name: 'Juggling', duration: 5}]}]}); sb.S.savedSessions.push(o); sb.S.savedSessions[0].favorited = true; sb.S.sessionName = KIND_P.p; sb.S.setupName = KIND_P.p; sb.S.csTitle = KIND_P.p; }],
  ['SEC-041', 'exercise names and all imported exercise text (setup, description, coaching points, variations, tags), plus names inside saved sessions', async sb => { sb.exercises().forEach(ex => { ex.name = KIND_P.p; ex.setup = KIND_P.p; ex.description = KIND_P.p; ex.coachingPoints = KIND_P.p; ex.variations = KIND_P.p; ['formatTags', 'engagementTags', 'technicalTags', 'tacticalTags', 'physicalTags', 'cognitiveTags'].forEach(k => { ex[k] = [KIND_P.p]; }); ex.focusAreas = [KIND_P.p]; }); sb.S.savedSessions.forEach(s => s.phases.forEach(p => p.exercises.forEach(e => { e.name = KIND_P.p; }))); sb.fn('toggleBookmark', {stopPropagation(){}}, sb.exercises()[1].id); }],
  ['SEC-042', 'session notes', async sb => { sb.S.savedSessions.forEach(s => { s.comment = KIND_P.p; s.rating = 3; }); }],
  ['SEC-043', 'coach names (yours, and another coach\'s on a shared session)', async sb => { sb.S.coachName = KIND_P.p; sb.S.savedSessions.forEach(s => { s.createdBy = KIND_P.p; }); const o = sb.fn('normalizeCloudSession', {id: 'SESS_X8', name: 'Shared plan', createdBy: KIND_P.p, createdAt: Date.now(), totalMin: 5, exCount: 0, targetDuration: 60, visibility: 'shared', phases: []}); sb.S.savedSessions.push(o); }],
  ['SEC-044', 'template names, descriptions and custom section names', async sb => { sb.S.practiceTemplates.forEach(t => { t.name = KIND_P.p; t.sections.forEach(sec => { sec.label = KIND_P.p; sec.description = KIND_P.p; }); }); sb.S.templateFavs.add(sb.S.practiceTemplates[0].id); sb.S.activeTemplateId = sb.S.practiceTemplates[0].id; sb.S.setupSelectedTemplateId = sb.S.practiceTemplates[0].id; }],
  ['SEC-045', 'custom section names inside a session (Build, Review, Saved Session, Print)', async sb => { sb.S.extraSections.push({key: 'extra1', label: KIND_P.p, exercises: sb.firstIdsPerPhase(1).warmup || []}); sb.S.savedSessions.forEach(s => s.phases.push({label: KIND_P.p, section: null, exercises: [{id: 'EX001', name: 'Juggling', duration: 5}]})); }],
];
const KIND_P = {p: ''};
KINDS.forEach(([id, label, prep]) => {
  sec(id, 'Hostile text in ' + label + ': six attack strings (script tag, img onerror, quote-break, svg onload, javascript: link, JS-string break-out) show only as text on every screen and sheet; nothing runs.', {
    tags: ['security', 'xss'], screen: 'XSS', steps: ['Put each attack string in the field, open every screen, tap what is tappable.'], exp: 'Inert text; nothing runs.', timeout: 120000,
    async run(env){ const report = [];
      // pass 1 (all six strings): render every screen and sheet, look for anything injected or run. pass 2 (two strings): ALSO tap the first few buttons on each screen, so a break-out string in an id / handler is exercised.
      for(const [p, tap] of PAYLOADS.map((p, i) => [p, i === 2 || i === 5 ? 2 : 1])){ for(let pass = 1; pass <= tap; pass++){ KIND_P.p = p;
        const {results, sb} = await L.eachScreen(env, async (name, sb) => { sb.win.__x = sb.win.__x || []; const bad = injected(sb); const shown = seenText(sb, p.slice(0, 12)); if(pass === 2 && !bad.length){ sb.qa('#content [data-onclick]').slice(0, 6).forEach(el => { try{ el.click(); }catch(e){} }); bad.push(...injected(sb)); } return {bad, text: shown}; }, {prep: async sb => { sb.win.__x = []; await prep(sb); sb.fn('render'); }});
        const issues = results.filter(r => r.value && r.value.bad.length).map(r => r.name + ': ' + r.value.bad[0]); if(issues.length) report.push(JSON.stringify(p).slice(0, 30) + ' -> ' + issues.slice(0, 2).join(' | '));
        if(pass === 1 && (p === PAYLOADS[0] || p === PAYLOADS[4])) assert(results.some(r => r.value && r.value.text), 'The hostile text is not shown on any screen (the test is not exercising it): ' + p.slice(0, 20)); } }
      assert(!report.length, 'INJECTION: ' + report.slice(0, 3).join(' ;; ')); eq(QA.cspLog.filter(v => /^script-src/.test(v)).length, 0, 'The policy blocked scripts while rendering'); }});
});

add('RS-007', C.vis, 'Responsive', 'Phone held sideways (844x390): the app uses the full width and leaves a usable scrolling area on every screen - at least 220px (it was about 109px on workflow screens), nothing scrolls sideways, and buttons stay tappable.', {
  severity: 'Major', tags: ['responsive', 'visual'], steps: ['Open every screen at 844x390.'], exp: 'Full width, >=220px of scrolling area.', timeout: 60000,
  async run(env){ const rows = []; for(const [w, h] of [[844, 390], [740, 360]]){ const {results, sb} = await L.eachScreen(env, (name, sb) => { const c = sb.q('#content'), shell = sb.q('#shell'); const bars = ['#topbar', '#bottomDock'].map(q => { const e = sb.q(q); return e ? e.getBoundingClientRect().height : 0; }); return {name, scroll: Math.round(c.clientHeight - bars[1]), shellW: Math.round(shell.getBoundingClientRect().width), vw: sb.win.innerWidth, over: Math.max(c.scrollWidth - c.clientWidth, sb.doc.documentElement.scrollWidth - sb.win.innerWidth), bars}; }, {width: w, height: h}); results.forEach(r => { assert(r.value, 'Screen did not open: ' + r.name); rows.push({w, ...r.value}); }); sb.destroy(); }
    const thin = rows.filter(r => r.scroll < 220).map(r => `${r.name}@${r.w}: ${r.scroll}px`); assert(!thin.length, 'Too little scrolling area: ' + thin.slice(0, 4).join(', ')); const narrow = rows.filter(r => r.shellW < r.vw - 1); assert(!narrow.length, 'Not full width: ' + narrow.slice(0, 3).map(r => r.name + '@' + r.w + ' ' + r.shellW + 'px').join(', ')); const over = rows.filter(r => r.over > 0); assert(!over.length, 'Sideways scroll: ' + over.slice(0, 3).map(r => r.name + '@' + r.w + ' +' + r.over).join(', ')); return 'Smallest scrolling area: ' + Math.min(...rows.map(r => r.scroll)) + 'px'; }});

QA.register(tests);
})();
