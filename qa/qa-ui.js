/* FT2 QA dashboard behaviour. */
(function(){
'use strict';
const QA = window.QA, esc = QA.esc;
const $ = s => document.querySelector(s);
const chipClass = st => st === 'Pass' ? 'Pass' : st === 'Fail' ? 'Fail' : st === 'Partial' ? 'Partial' : st === 'Fixed / Needs Retest' ? 'Fixed' : 'NotTested';
const fmtTime = iso => { if(!iso) return 'never'; const d = new Date(iso); return d.toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}); };
const buildLabel = b => b ? (b.commit ? `${b.commit} · ${b.hash}` : b.hash) : '';
const view = {filters: {status: '', severity: '', category: '', type: '', last: '', failure: '', smoke: '', q: ''}, open: new Set(), lastRunView: null, buildInfo: null, scope: 'all'};
let toastTimer = null;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.remove('hide'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hide'), 2600); }

/* ---------------------------------------------------------------- header / build */
async function loadBuild(){
  try{ view.buildInfo = await QA.buildInfo(); }catch(e){ view.buildInfo = {hash: 'unknown', lastModified: '', commit: ''}; }
  const b = view.buildInfo;
  $('#build').innerHTML = `<span>index.html build ${esc(b.hash)}</span>` + (b.commit ? `<span>latest commit ${esc(b.commit)}</span>` : '<span>commit: not reachable (offline)</span>') + (b.lastModified ? `<span>file modified ${esc(b.lastModified)}</span>` : '') + `<span>${esc(b.host)}</span>`;
}

/* ---------------------------------------------------------------- status banner, tiles, categories */
function scopeBanner(label, ids, sub){
  const s = QA.summary(ids);
  return `<div class="sb ${s.overall}"><div class="small" style="margin:0 0 2px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${esc(label)}</div><div class="big">${s.overall}</div><small>${esc(sub(s))}</small></div>`;
}
function renderTop(){
  const all = QA.TESTS.map(t => t.id), smoke = QA.smokeIds();
  $('#banner').innerHTML = scopeBanner('Smoke suite', smoke, s => `${s.Pass} of ${s.total} passed · ${s.Fail} failed · ${s.manualPending + s['Not Tested']} not yet run or awaiting a person`)
    + scopeBanner('Full QA', all, s => `${s.Pass} of ${s.total} passed (${s.passPct}%) · ${s.Fail} failed · ${s.manualPending} waiting for a person`);
  const s = QA.summary(all);
  const tile = (n, label, cls, alert) => `<div class="tile ${cls || ''} ${alert && n ? 'alert' : ''} ${n ? '' : 'zero'}"><b>${n}</b><span>${label}</span></div>`;
  $('#tiles').innerHTML = tile(s.total, 'Total tests') + tile(s.Pass, 'Passed', 'pass') + tile(s.Fail, 'Failed', 'fail') + tile(s.Partial, 'Partial', 'part') + tile(s['Not Tested'], 'Not tested')
    + tile(s['Fixed / Needs Retest'], 'Fixed / needs retest', 'fixed') + tile(s.critical, 'Critical failures', 'fail', true) + tile(s.major, 'Major failures', 'fail', true) + tile(s.minor, 'Minor failures', 'fail') + tile(s.polish, 'Polish issues', 'part') + `<div class="tile pass"><b>${s.passPct}%</b><span>Overall pass rate</span></div>`;
  const cats = QA.CATEGORIES.map(c => { const k = s.byCategory[c] || {total: 0, pass: 0, fail: 0, partial: 0, untested: 0, retest: 0}; const w = n => k.total ? (n / k.total * 100).toFixed(1) : 0; return `<button class="cat" data-act="filtercat" data-cat="${esc(c)}"><div class="nm">${esc(c)}</div><div class="ct">${k.pass} / ${k.total} <small>passed${k.fail ? ` · <span style="color:var(--fail)">${k.fail} failed</span>` : ''}${k.partial ? ` · ${k.partial} partial` : ''}${k.untested ? ` · ${k.untested} not tested` : ''}</small></div><div class="bar"><i class="p" style="width:${w(k.pass)}%"></i><i class="a" style="width:${w(k.partial)}%"></i><i class="x" style="width:${w(k.retest)}%"></i><i class="f" style="width:${w(k.fail)}%"></i></div></button>`; }).join('');
  $('#cats').innerHTML = cats;
}

/* ---------------------------------------------------------------- regression comparison */
function idLinks(ids){ return ids.length ? ids.map(id => `<a data-act="open" data-id="${esc(id)}">${esc(id)}</a>`).join('') : '<span class="small">none</span>'; }
function renderCompare(){
  const runs = QA.store.runs; const el = $('#comparePanel');
  if(runs.length < 2){ el.className = 'card small'; el.innerHTML = 'Run the smoke or full suite at least twice to see what changed between runs.' + (runs.length ? `<br>Latest run: ${esc(runs[runs.length - 1].kind)} at ${esc(fmtTime(runs[runs.length - 1].startedAt))}.` : ''); return; }
  const c = QA.compare(); el.className = 'card';
  el.innerHTML = `<div class="small" style="margin-bottom:10px">Comparing <b>${esc(c.cur.kind)}</b> run (${esc(fmtTime(c.cur.startedAt))}, build ${esc(buildLabel(c.cur.build))}) with the <b>${esc(c.prev.kind)}</b> run before it (${esc(fmtTime(c.prev.startedAt))}, build ${esc(buildLabel(c.prev.build))}).${c.cur.build && c.prev.build && c.cur.build.hash === c.prev.build.hash ? ' <b>The app file did not change between them.</b>' : ''}</div>
  <div class="cmp">
    <div class="box ${c.newFailures.length ? 'bad' : ''}"><h3>New failures (${c.newFailures.length})</h3><div class="small">Passed before, fail now</div>${idLinks(c.newFailures)}</div>
    <div class="box ${c.fixed.length ? 'good' : ''}"><h3>Fixed tests (${c.fixed.length})</h3><div class="small">Failed before, pass now</div>${idLinks(c.fixed)}</div>
    <div class="box"><h3>Unchanged failures (${c.unchangedFailures.length})</h3><div class="small">Failing in both</div>${idLinks(c.unchangedFailures)}</div>
    <div class="box"><h3>New tests (${c.newTests.length})</h3><div class="small">Added since the previous run</div>${idLinks(c.newTests)}</div>
  </div>`;
}

/* ---------------------------------------------------------------- generator QA panel */
function renderGen(){
  const gn = QA.TESTS.filter(t => t.id.startsWith('GN-')); const s = QA.summary(gn.map(t => t.id)); const sweep = QA.memoStore.genSweep;
  let table = '<p class="small">Click <b>Run Generator QA</b> to try all 1,080 combinations (8 focus areas × 5 ages × 3 lengths × 3 places × 3 styles) and see results per focus area.</p>';
  const sw = window.__genSweepData;
  if(sw){
    const byF = {}; sw.rows.forEach(r => { const k = byF[r.f] = byF[r.f] || {n: 0, ok: 0, empty: 0, dup: 0, loc: 0, mins: 0, ageOk: 0, items: 0, issues: 0}; k.n++; if(r.ok) k.ok++; if(r.ok && !r.ids.length) k.empty++; if(r.dup) k.dup++; if(r.locBad.length) k.loc++; k.mins += r.total; r.items.forEach(i => { k.items++; if(i.age === 'listed' || i.age === 'withinRange' || i.age === 'unspecified') k.ageOk++; }); if(r.issues.length) k.issues++; });
    table = `<div class="small" style="margin-bottom:8px">${sw.rows.length} combinations generated in ${sw.ms} ms using the ${sw.libraryLive ? 'LIVE' : 'bundled'} exercise library (${sw.n} exercises).</div><div style="overflow:auto"><table><tr><th>Focus area</th><th class="n">Sessions</th><th class="n">Errors / empty</th><th class="n">Repeats</th><th class="n">Wrong place</th><th class="n">Avg minutes</th><th class="n">Age-suited</th><th class="n">With a note</th></tr>`
      + Object.keys(byF).map(f => { const k = byF[f]; return `<tr><td>${esc(f.replace(/_/g, ' '))}</td><td class="n">${k.n}</td><td class="n" style="color:${(k.n - k.ok + k.empty) ? 'var(--fail)' : 'var(--pass)'}">${k.n - k.ok} / ${k.empty}</td><td class="n" style="color:${k.dup ? 'var(--fail)' : 'inherit'}">${k.dup}</td><td class="n" style="color:${k.loc ? 'var(--fail)' : 'inherit'}">${k.loc}</td><td class="n">${(k.mins / k.n).toFixed(0)}</td><td class="n">${k.items ? (k.ageOk / k.items * 100).toFixed(0) : 0}%</td><td class="n">${(k.issues / k.n * 100).toFixed(0)}%</td></tr>`; }).join('') + '</table></div>';
  }
  $('#genPanel').innerHTML = `<div class="toolbar" style="margin-bottom:10px"><button class="btn dark" data-act="gen">Run Generator QA</button><span class="small">${s.Pass} of ${s.total} generator checks passed${s.Fail ? ` · <b style="color:var(--fail)">${s.Fail} failed</b>` : ''}${s.Partial ? ` · ${s.Partial} partial` : ''}. Pipeline checked: objective → metadata → ranking → phases → assembly → coach editing.</span></div>${table}`
    + `<div class="list" style="margin-top:12px">${gn.map(t => rowHtml(t, true)).join('')}</div>`;
}

/* ---------------------------------------------------------------- manual checklist */
function renderManual(){
  const pending = QA.TESTS.filter(t => QA.awaitingHuman(t.id));
  if(!pending.length){ $('#manualBox').innerHTML = '<span class="small">Nothing is waiting for a person.</span>'; return; }
  const sevOrder = {Critical: 0, Major: 1, Minor: 2, Polish: 3};
  pending.sort((a, b) => sevOrder[QA.severityOf(a.id)] - sevOrder[QA.severityOf(b.id)] || a.id.localeCompare(b.id));
  $('#manualBox').innerHTML = `<div class="small" style="margin-bottom:8px">${pending.length} checks need a person's eyes. Open one, try it, then mark it. (Only the first 12 are shown here - use the filters below for the rest.)</div><div class="list">${pending.slice(0, 12).map(t => rowHtml(t, false)).join('')}</div>`;
}

/* ---------------------------------------------------------------- the test list */
function matchesFilters(t){
  const f = view.filters, r = QA.resultOf(t.id), last = QA.store.runs[QA.store.runs.length - 1];
  if(f.status && r.status !== f.status) return false;
  if(f.severity && QA.severityOf(t.id) !== f.severity) return false;
  if(f.category && t.category !== f.category) return false;
  if(f.type && t.type !== f.type) return false;
  if(f.failure === 'failing' && !(r.status === 'Fail' || r.status === 'Partial')) return false;
  if(f.smoke && !t.smoke) return false;
  if(f.last === 'in' && !(last && last.results[t.id])) return false;
  if(f.last === 'out' && last && last.results[t.id]) return false;
  if(f.q){ const q = f.q.toLowerCase(); if(!(t.id + ' ' + t.desc + ' ' + t.screen + ' ' + t.category).toLowerCase().includes(q)) return false; }
  return true;
}
function rowHtml(t, inGen){
  const r = QA.resultOf(t.id), open = view.open.has(t.id), sev = QA.severityOf(t.id), id = esc(t.id);
  const waiting = QA.awaitingHuman(t.id);
  const head = `<div class="id">${id}</div><div class="d"><b>${esc(t.desc)}</b><small>${esc(t.screen)} · ${esc(t.category)}${t.smoke ? ' · <b>smoke</b>' : ''}${r.ts ? ' · tested ' + esc(fmtTime(r.ts)) : ''}</small></div><div class="rt"><span class="type ${t.type}">${t.type}</span><span class="sev ${sev}">${sev}</span><span class="chip ${chipClass(r.status)}">${esc(r.status)}${waiting && r.status === 'Partial' ? ' · needs person' : ''}</span></div>`;
  const body = open ? `<div class="detail">
      <div><h4>Preconditions</h4><p>${esc(t.pre)}</p></div>
      <div><h4>Test steps</h4><ol>${(t.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
      <div><h4>Expected result</h4><p>${esc(t.exp)}</p></div>
      <div><h4>Actual result</h4><div class="actual">${esc(r.actual || (r.status === 'Not Tested' ? 'Not tested yet.' : ''))}</div></div>
      <div><h4>Details</h4><p class="small">Status: ${esc(r.status)} · Severity: ${sev}<br>Type: ${t.type}${t.run ? '' : ' (no automated check possible)'}<br>Last tested: ${esc(r.ts ? fmtTime(r.ts) : 'never')}${r.build ? `<br>Build: ${esc(r.build)}` : ''}${r.ms ? `<br>Took: ${r.ms} ms` : ''}${r.source ? `<br>Source: ${r.source === 'manual' ? 'marked by a person' : 'automated run'}` : ''}</p></div>
      <div><h4>Notes</h4><textarea data-note="${id}" placeholder="Anything worth remembering…">${esc(QA.store.notes[t.id] || '')}</textarea></div>
      <div class="full"><div class="marks">
        ${t.run ? `<button class="btn small dark" data-act="runone" data-id="${id}">Run this test</button>` : ''}
        <button class="btn small pass" data-act="mark" data-id="${id}" data-st="Pass">Mark Pass</button>
        <button class="btn small fail" data-act="mark" data-id="${id}" data-st="Fail">Mark Fail</button>
        <button class="btn small part" data-act="mark" data-id="${id}" data-st="Partial">Mark Partial</button>
        <button class="btn small fixed" data-act="mark" data-id="${id}" data-st="Fixed / Needs Retest">Fixed / needs retest</button>
        <button class="btn small" data-act="mark" data-id="${id}" data-st="Not Tested">Reset</button>
        <select data-sev="${id}" aria-label="Severity">${QA.SEVERITIES.map(s => `<option ${s === sev ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>${t.type === 'Automated' ? '<div class="small" style="margin-top:6px">Automated tests are normally judged by the program; marking one by hand overrides it until the next run.</div>' : ''}</div>
    </div>` : '';
  return `<details class="row" data-row="${id}" ${open ? 'open' : ''}><summary>${head}</summary>${body}</details>`;
}
function renderFilters(){
  const f = view.filters; const opt = (arr, cur, all) => `<option value="">${all}</option>` + arr.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
  $('#filters').innerHTML = `<input type="search" id="fq" placeholder="Search ID or words…" value="${esc(f.q)}" style="min-width:170px">
    <select data-f="status">${opt(QA.STATUSES, f.status, 'Any status')}</select><select data-f="severity">${opt(QA.SEVERITIES, f.severity, 'Any severity')}</select>
    <select data-f="category">${opt(QA.CATEGORIES, f.category, 'Any category')}</select><select data-f="type">${opt(QA.TYPES, f.type, 'Automated / manual / hybrid')}</select>
    <select data-f="last"><option value="">Any run</option><option value="in" ${f.last === 'in' ? 'selected' : ''}>In the last run</option><option value="out" ${f.last === 'out' ? 'selected' : ''}>Not in the last run</option></select>
    <select data-f="failure"><option value="">All results</option><option value="failing" ${f.failure === 'failing' ? 'selected' : ''}>Failures &amp; partials only</option></select>
    <select data-f="smoke"><option value="">All tests</option><option value="1" ${f.smoke ? 'selected' : ''}>Smoke tests only</option></select>
    <button class="btn small" data-act="clearfilters">Clear filters</button>`;
}
function renderList(){
  const shown = QA.TESTS.filter(matchesFilters); $('#countLine').textContent = `Showing ${shown.length} of ${QA.TESTS.length} tests`;
  $('#list').innerHTML = shown.length ? shown.map(t => rowHtml(t, false)).join('') : '<div style="padding:16px" class="small">No tests match these filters.</div>';
}

function renderAll(){ renderTop(); renderCompare(); renderGen(); renderManual(); renderFilters(); renderList(); }

/* ---------------------------------------------------------------- running */
function setBusy(b){ document.querySelectorAll('[data-act]').forEach(el => { const a = el.dataset.act; if(['smoke', 'full', 'category', 'failed', 'areas', 'gen', 'reset', 'runone'].includes(a)) el.disabled = b; }); $('#cancelBtn').disabled = !b; }
function showRun(title){ $('#s-run').classList.remove('hide'); $('#runTitle').textContent = title; }
async function doRun(kind, label, ids){
  if(QA.running) return;
  ids = ids.filter(id => QA.byId[id]);
  const auto = ids.filter(id => QA.byId[id].run);
  if(!auto.length){ toast('Nothing automated to run there - those checks need a person.'); showRun(label); $('#runPanel').innerHTML = reportHtml({kind, label, ids, results: {}, startedAt: QA.now(), cancelled: false}, ids); return; }
  setBusy(true); showRun(label + ' - running');
  const log = []; const panel = $('#runPanel');
  const draw = (done, total, extra) => { panel.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px"><b>${done} of ${total} tests</b><span class="small">${esc(extra || '')}</span></div><div class="progress"><i style="width:${total ? done / total * 100 : 0}%"></i></div><div class="runlog" id="runlog">${log.join('<br>')}</div>`; const rl = $('#runlog'); if(rl) rl.scrollTop = rl.scrollHeight; };
  draw(0, auto.length, 'starting…');
  let run;
  try{
    run = await QA.run(ids, {kind, label, onProgress: (done, total, rec, t) => { log.push(`<span class="${rec.status === 'Pass' ? 'p' : rec.status === 'Fail' ? 'f' : 'a'}">${rec.status === 'Pass' ? '✓' : rec.status === 'Fail' ? '✗' : '◐'} ${esc(t.id)}</span> ${esc(t.desc.slice(0, 70))}${rec.status === 'Pass' ? '' : ' - ' + esc(rec.actual.slice(0, 120))}`); draw(done, total, `${t.id} (${rec.ms} ms)`); }});
  }catch(err){ panel.innerHTML = `<b style="color:var(--fail)">The run could not start:</b> ${esc(err.message)}`; setBusy(false); return; }
  setBusy(false); view.lastRunView = run.id; showRun(label + (run.cancelled ? ' - stopped early' : ' - finished'));
  panel.innerHTML = reportHtml(run, ids); renderAll(); panel.scrollIntoView({behavior: 'smooth', block: 'start'});
}
function reportHtml(run, ids){
  const s = QA.summary(ids); const failing = ids.filter(id => QA.statusOf(id) === 'Fail'); const partial = ids.filter(id => QA.statusOf(id) === 'Partial');
  const sevOrder = {Critical: 0, Major: 1, Minor: 2, Polish: 3}; failing.sort((a, b) => sevOrder[QA.severityOf(a)] - sevOrder[QA.severityOf(b)]);
  const ranIds = Object.keys(run.results || {}); const pass = ranIds.filter(id => run.results[id].status === 'Pass').length, fail = ranIds.filter(id => run.results[id].status === 'Fail').length, par = ranIds.filter(id => run.results[id].status === 'Partial').length;
  const manualTotal = ids.filter(id => QA.byId[id].type !== 'Automated').length;
  const lines = id => `<div style="padding:5px 0;border-top:1px solid var(--line2)"><a data-act="open" data-id="${esc(id)}" style="font:700 13px var(--mono);text-decoration:underline;cursor:pointer">${esc(id)}</a> <span class="sev ${QA.severityOf(id)}">${QA.severityOf(id)}</span> <span style="font-weight:600">${esc(QA.byId[id].desc.slice(0, 110))}</span><div class="actual" style="margin-top:3px">${esc((QA.resultOf(id).actual || '').slice(0, 400))}</div></div>`;
  return `<div class="status-banner" style="margin-bottom:12px"><div class="sb ${s.overall}" style="flex:0 1 220px"><div class="big">${s.overall}</div><small>for the ${ids.length} tests in this run</small></div>
    <div style="flex:1 1 320px"><div class="small">${esc(run.label || run.kind)} · ${esc(fmtTime(run.startedAt))}${run.build ? ' · build ' + esc(buildLabel(run.build)) : ''}${run.library ? ' · exercise library: ' + esc(run.library) : ''}${run.cancelled ? ' · <b>stopped early</b>' : ''}</div>
      <table style="margin-top:4px"><tr><td>Automated tests passed</td><td class="n"><b style="color:var(--pass)">${pass}</b> of ${ranIds.length}</td></tr><tr><td>Automated tests failed</td><td class="n"><b style="color:${fail ? 'var(--fail)' : 'inherit'}">${fail}</b>${par ? ` (+${par} partial)` : ''}</td></tr>
      <tr><td>Manual / hybrid checks completed</td><td class="n">${s.manualDone} of ${manualTotal}</td></tr><tr><td>Manual checks failed</td><td class="n">${s.manualFail}</td></tr>
      <tr><td>Critical failures</td><td class="n"><b style="color:${s.critical ? 'var(--crit)' : 'inherit'}">${s.critical}</b></td></tr><tr><td>Major failures</td><td class="n"><b style="color:${s.major ? 'var(--crit)' : 'inherit'}">${s.major}</b></td></tr></table></div></div>
    ${failing.length ? `<h2 style="color:var(--fail)">Failures (${failing.length}) - click an ID to open it</h2>${failing.map(lines).join('')}` : '<div class="small" style="color:var(--pass);font-weight:700">No failures.</div>'}
    ${partial.length ? `<h2 style="margin-top:14px">Partial / warnings (${partial.length})</h2>${partial.slice(0, 25).map(lines).join('')}${partial.length > 25 ? `<div class="small">… and ${partial.length - 25} more (filter the list below)</div>` : ''}` : ''}
    ${s.manualPending ? `<p class="small" style="margin-top:12px"><b>${s.manualPending}</b> manual / hybrid checks in this scope are still waiting for a person (see "Needs a person" below). Overall stays PARTIAL until they are done.</p>` : ''}`;
}

/* ---------------------------------------------------------------- events */
function openTest(id){
  view.filters = {status: '', severity: '', category: '', type: '', last: '', failure: '', smoke: '', q: id};
  view.open.add(id); renderFilters(); renderList();
  const row = document.querySelector(`[data-row="${id}"]`); if(row){ row.scrollIntoView({behavior: 'smooth', block: 'center'}); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 2200); }
}
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if(!el) return; const act = el.dataset.act;
  if(act === 'smoke') return doRun('smoke', 'Smoke tests', QA.smokeIds());
  if(act === 'full') return doRun('full', 'Full QA', QA.TESTS.map(t => t.id));
  if(act === 'category'){ const c = $('#catSel').value; return doRun('category', 'Category: ' + c, QA.TESTS.filter(t => t.category === c).map(t => t.id)); }
  if(act === 'failed'){ const ids = QA.TESTS.filter(t => ['Fail', 'Partial', 'Fixed / Needs Retest'].includes(QA.statusOf(t.id))).map(t => t.id); if(!ids.length) return toast('Nothing has failed - nothing to re-run.'); return doRun('failed', 'Failed tests', ids); }
  if(act === 'areas'){ const sel = [...document.querySelectorAll('#areas input:checked')].map(i => i.value); if(!sel.length) return toast('Tick at least one area first.'); const ids = QA.testsForAreas(sel); return doRun('areas', 'Tests for: ' + sel.join(', '), ids); }
  if(act === 'gen') return doRun('generator', 'Generator QA', QA.TESTS.filter(t => t.id.startsWith('GN-')).map(t => t.id)).then(async () => { try{ window.__genSweepData = await QA.memo('genSweep', () => QA.genSweep()); renderGen(); }catch(err){} });
  if(act === 'cancel'){ QA.cancelRun(); return toast('Stopping after the current test…'); }
  if(act === 'reset'){ if(confirm('Clear ALL test results, notes and run history stored in this browser? (The app and your real data are not affected.)')){ QA.resetResults(); window.__genSweepData = null; $('#s-run').classList.add('hide'); renderAll(); toast('Results cleared.'); } return; }
  if(act === 'viewlast'){ const r = QA.store.runs[QA.store.runs.length - 1]; if(!r) return toast('No runs yet.'); showRun(`Last run - ${r.label || r.kind}`); $('#runPanel').innerHTML = reportHtml(r, r.ids); $('#s-run').scrollIntoView({behavior: 'smooth'}); return; }
  if(act === 'compare'){ renderCompare(); $('#s-compare').scrollIntoView({behavior: 'smooth'}); if(QA.store.runs.length < 2) toast('Needs two runs to compare.'); return; }
  if(act === 'export'){ const blob = new Blob([QA.exportResults()], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ft2-qa-results.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); return; }
  if(act === 'theme'){ const r = document.documentElement; const dark = r.dataset.theme === 'dark' || (!r.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); r.dataset.theme = dark ? 'light' : 'dark'; return; }
  if(act === 'filtercat'){ view.filters.category = view.filters.category === el.dataset.cat ? '' : el.dataset.cat; renderFilters(); renderList(); $('#s-tests').scrollIntoView({behavior: 'smooth'}); return; }
  if(act === 'clearfilters'){ view.filters = {status: '', severity: '', category: '', type: '', last: '', failure: '', smoke: '', q: ''}; renderFilters(); renderList(); return; }
  if(act === 'open') return openTest(el.dataset.id);
  if(act === 'mark'){ e.preventDefault(); const id = el.dataset.id; const note = (document.querySelector(`[data-note="${id}"]`) || {}).value; QA.markManual(id, el.dataset.st, note, buildLabel(view.buildInfo)); view.open.add(id); renderAll(); return; }
  if(act === 'runone'){ e.preventDefault(); const id = el.dataset.id; view.open.add(id); return doRun('single', 'Single test ' + id, [id]); }
});
document.addEventListener('change', e => {
  const f = e.target.dataset && e.target.dataset.f; if(f){ view.filters[f] = e.target.value; renderList(); return; }
  if(e.target.dataset.sev){ QA.setSeverity(e.target.dataset.sev, e.target.value === QA.byId[e.target.dataset.sev].severity ? '' : e.target.value); renderAll(); return; }
  if(e.target.matches('#areas input')){ const sel = [...document.querySelectorAll('#areas input:checked')].map(i => i.value); $('#areaCount').textContent = sel.length ? `${QA.testsForAreas(sel).length} tests` : ''; }
});
document.addEventListener('input', e => { if(e.target.id === 'fq'){ view.filters.q = e.target.value; renderList(); } });
document.addEventListener('focusout', e => { const id = e.target.dataset && e.target.dataset.note; if(id) QA.setNote(id, e.target.value); });
document.addEventListener('toggle', e => { const row = e.target.dataset && e.target.dataset.row; if(row){ if(e.target.open) view.open.add(row); else view.open.delete(row); if(e.target.open && !e.target.querySelector('.detail')){ const t = QA.byId[row]; const tmp = document.createElement('div'); tmp.innerHTML = rowHtml(t, false); const d = tmp.querySelector('.detail'); if(d) e.target.appendChild(d); } } }, true);

/* ---------------------------------------------------------------- start */
$('#catSel').innerHTML = QA.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
$('#areas').innerHTML = Object.keys(QA.AREAS).map(a => `<label><input type="checkbox" value="${esc(a)}"> ${esc(a)}</label>`).join('');
renderAll(); loadBuild();
})();
