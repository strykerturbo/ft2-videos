/* FT2 QA inventory, part 5: Usability, Consistency, Responsive, Error / Offline, Security / Privacy, Performance audits. */
(function(){
'use strict';
const QA = window.QA, L = QA.lib, C = QA.C, T = QA.T;
const {assert, eq} = QA;
const tests = [];
const add = (...a) => tests.push(T(...a));

/* ---------- visit every screen and sheet of the app with sample data, running a check on each ---------- */
Object.assign(L, {
  async eachScreen(env, fn, o){
    const sb = await L.withSaved(env, 2, Object.assign({live: true}, o || {})); const sid = sb.S.savedSessions[0].id; const ex = sb.exercises();
    const clear = () => { ['printSheet', 'shareSheet', 'sessionMoreId', 'savedSheet', 'saveFirstSheet', 'confirmDeleteSessionId', 'confirmNewSessionOpen', 'balanceSheetOpen', 'quickPickOpen', 'pendingQuickAdd', 'confirmDiscardTemplateOpen', 'confirmDuplicateSessionId'].forEach(k => { sb.S[k] = (k === 'balanceSheetOpen' || k === 'quickPickOpen' || k === 'confirmDiscardTemplateOpen' || k === 'confirmNewSessionOpen') ? false : null; }); sb.S.editingSessionDetail = false; sb.S.editingSavedSessionId = null; sb.S.fromSavedSession = false; sb.S.pickingPhase = null; sb.S.sectionFilter = null; sb.S.sessionsViewAll = false; sb.S.viewingTemplatesList = false; sb.S.editingTemplateId = null; sb.S.templateDraft = null; };
    const draft = () => { sb.fn('resetBuilderDraft'); sb.addExercises(sb.firstIdsPerPhase(2)); };
    const states = [
      ['Home', () => sb.fn('nav', 'home')],
      ['Session Setup', () => { sb.fn('initSetupDraft'); sb.fn('nav', 'practiceSetup'); }],
      ['Build Session', () => { draft(); sb.fn('nav', 'build'); }],
      ['Session Review', () => { draft(); sb.fn('nav', 'review'); }],
      ['Find Exercises', () => { draft(); sb.fn('pickForPhase', 'duels'); }],
      ['Exercise Library', () => sb.fn('nav', 'exercises')],
      ['Exercise Detail', () => sb.fn('openDetail', ex[2].id)],
      ['Sessions', () => sb.fn('nav', 'sessions')],
      ['Sessions - View All', () => sb.fn('nav', 'sessions', {sessionsViewAll: true})],
      ['Saved Session', () => sb.fn('openSessionDetail', sid)],
      ['Saved Session (editing)', () => { sb.fn('openSessionDetail', sid); sb.S.editingSessionDetail = true; sb.fn('render'); }],
      ['Settings', () => sb.fn('nav', 'settings')],
      ['My Templates', () => sb.fn('openMyTemplatesFromSessions')],
      ['Template editor', () => sb.fn('createTemplateFromSessions')],
      ['Custom Step 1', () => { sb.S.csFocusAreaId = null; sb.fn('nav', 'quickStartCustom'); }],
      ['Custom Step 2', () => { sb.S.csFocusAreaId = 'keep_the_ball'; sb.fn('nav', 'customSessionSetup'); }],
      ['Custom Step 4', () => { sb.fn('resetBuilderDraft'); sb.fn('applyGeneratedSessionToDraft', sb.generate({focusArea: 'keep_the_ball', title: 'Keep the Ball Session', duration: 75, location: 'outdoor', ageGroup: 'U10', sessionStyle: 'balanced'})); sb.fn('nav', 'customSessionReview'); }],
      ['Print sheet', () => { sb.fn('openSessionDetail', sid); sb.fn('openPrintSheet', sid); }],
      ['Share sheet', () => { sb.fn('openSessionDetail', sid); sb.S.shareSheet = {sessionId: sid, status: 'ready', url: 'u', message: 'm', title: 't', errorText: ''}; sb.S.shareReady[sid] = {sessionId: sid, url: 'u', message: 'm', title: 't'}; sb.fn('renderOverlay'); }],
      ['Saved sheet', () => { sb.S.savedSheet = {sessionId: sid, renamedFrom: ''}; sb.fn('nav', 'home'); }],
      ['More menu', () => { sb.fn('openSessionDetail', sid); sb.fn('openSessionMore', sid); }],
      ['Save-first sheet', () => { draft(); sb.fn('nav', 'review'); sb.fn('requireSaveFirst', 'print'); }],
    ];
    const results = [];
    for(const [name, setup] of states){ clear(); try{ setup(); }catch(e){ results.push({name, error: 'could not open: ' + e.message}); continue; } await sb.sleep(15); results.push({name, value: await fn(name, sb)}); }
    clear(); sb.fn('nav', 'home');
    const broken = results.filter(r => r.error); if(broken.length){ sb.destroy(); throw new QA.Fail('Could not open: ' + broken.map(r => `${r.name} (${r.error})`).join('; ')); }
    return {sb, results};
  },
  visible(el){ const r = el.getBoundingClientRect(); const cs = el.ownerDocument.defaultView.getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; },
  rgb(str){ const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(str || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; },
  lum(c){ const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); },
  effectiveBg(el){ const w = el.ownerDocument.defaultView; let n = el; while(n && n.nodeType === 1){ const c = L.rgb(w.getComputedStyle(n).backgroundColor); if(c && c[3] > 0.5) return c; n = n.parentElement; } return [255, 255, 255, 1]; },
  contrast(el){ const w = el.ownerDocument.defaultView; const fg = L.rgb(w.getComputedStyle(el).color), bg = L.effectiveBg(el); if(!fg) return 21; const a = L.lum(fg) + 0.05, b = L.lum(bg) + 0.05; return Math.max(a, b) / Math.min(a, b); },
  textEls(sb, root){ const out = []; const walker = sb.doc.createTreeWalker(sb.q(root || '#shell'), NodeFilter.SHOW_TEXT); let n; while((n = walker.nextNode())){ if(!n.nodeValue.trim()) continue; const el = n.parentElement; if(el && !['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName) && L.visible(el)) out.push(el); } return [...new Set(out)]; },
});
const brief = (arr, n) => arr.slice(0, n || 5).join('; ') + (arr.length > (n || 5) ? ` ... (+${arr.length - (n || 5)} more)` : '');

/* ================================================================ USABILITY AUDIT (US-001 .. US-010) */
add('US-001', C.use, 'All screens', 'Touch targets: primary buttons are at least 44px tall; other tappable controls at least 32px (checked on every screen at phone width).', {
  type: 'Hybrid', severity: 'Minor', tags: ['usability', 'visual'], timeout: 90000, steps: ['Automated: measure every button.', 'Human: try tapping the small ones with a thumb.'], exp: 'No primary control under 44px; few controls under 32px.',
  async run(env){
    const {results, sb} = await L.eachScreen(env, (name, sb) => { const hardBad = [], small = []; sb.clickables('#shell, #overlay').forEach(el => { if(!L.visible(el)) return; const r = el.getBoundingClientRect(); const label = sb.norm(el.textContent).slice(0, 20) || el.className.slice(0, 20); const primary = el.matches('.btn, .nav-back-link, .navitem, .hm-start'); if(primary && r.height < 40) hardBad.push(`${label} ${Math.round(r.height)}px`); else if(Math.min(r.width, r.height) < 28 && !el.matches('label, .star-btn, .su-seg-btn, [type=checkbox], input')) small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`); }); return {hardBad, small}; }); sb.destroy();
    const hard = results.filter(r => r.value && r.value.hardBad.length).map(r => `${r.name}: ${brief(r.value.hardBad, 3)}`); assert(!hard.length, 'Primary controls under 40px - ' + hard.join(' | '));
    const small = results.filter(r => r.value && r.value.small.length).map(r => `${r.name}: ${brief(r.value.small, 2)}`); if(small.length) QA.partial(`Small tap targets (under 28px) on ${small.length} screens - ${brief(small, 4)}`);
  }});
add('US-002', C.use, 'All screens', 'Icon-only buttons have a spoken name (aria-label or title), so screen readers can use them.', {
  severity: 'Minor', tags: ['usability', 'accessibility'], timeout: 90000, steps: ['Check every button with no visible text.'], exp: 'Each has a label.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => sb.qa('button, a[href], [role="button"]', sb.q('#shell')).concat(sb.qa('button', sb.q('#overlay'))).filter(el => L.visible(el) && !el.textContent.trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.querySelector('img[alt]')).map(el => el.className.slice(0, 24) || el.tagName)); sb.destroy(); const bad = results.filter(r => r.value && r.value.length).map(r => `${r.name}: ${brief([...new Set(r.value)], 3)}`); if(bad.length) QA.partial(`Unlabelled icon buttons on ${bad.length} screens - ${brief(bad, 4)}`); }});
add('US-003', C.use, 'Destructive actions', 'Deleting a session, discarding a draft, deleting or abandoning a template all ask first. (Removing one exercise from a saved session is immediate - noted if so.)', {
  severity: 'Critical', tags: ['usability', 'saved', 'templates'], steps: ['Try each destructive action.'], exp: 'A confirmation before data is lost.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const n = sb.S.savedSessions.length;
    sb.fn('requestDeleteSession', s.id); eq(sb.S.savedSessions.length, n, 'Delete session happened without asking'); eq(sb.S.confirmDeleteSessionId, s.id, 'Delete confirmation'); sb.fn('cancelDeleteSession');
    sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('requestDiscardSession'); assert(sb.S.confirmDiscardOpen !== false && sb.fn('currentTotalMinutes').count === 6, 'Discarding the draft happened without asking'); sb.fn('cancelDiscardSession');
    const t = sb.S.practiceTemplates[0]; sb.fn('requestDeleteTemplate', t.id); assert(sb.S.practiceTemplates.includes(t), 'Template deleted without asking'); sb.fn('cancelDeleteTemplate');
    sb.fn('openTemplateEditor', t.id); sb.fn('teSetLocation', t.location === 'indoor' ? 'outdoor' : 'indoor'); sb.fn('closeTemplateEditor'); eq(sb.S.confirmDiscardTemplateOpen, true, 'Abandoning template edits');
    const before = s.exCount; sb.fn('removeExerciseFromSavedSession', s.id, s.phases[0].exercises[0].id, s.phases[0].exercises[0].name); if(s.exCount === before - 1) QA.partial('Removing an exercise from a saved session happens immediately with only a toast - there is no confirmation or undo.');
  }});
add('US-004', C.use, 'Empty states', 'Every list explains itself when empty (recent sessions, sessions, community, bookmarks, search with no results, empty build/review).', {
  severity: 'Minor', tags: ['usability'], steps: ['Open each list with no data.'], exp: 'A friendly message, never a blank area.',
  async run(env){
    const sb = await env.boot(); const miss = []; const chk = (name, t) => { if(!sb.has(t, '#content')) miss.push(name); };
    sb.fn('nav', 'home'); chk('Home recent', 'No saved sessions'); sb.fn('nav', 'sessions'); eq(sb.q('#content').children.length > 0, true, 'Sessions renders'); sb.fn('setSessionsViewMode', 'community'); eq(sb.text('#content').length > 40, true, 'Community renders'); sb.fn('setSessionsViewMode', 'mine');
    sb.fn('nav', 'review'); chk('Review empty', 'No exercises'); sb.fn('nav', 'exercises'); sb.S.search = 'zzzzqq'; sb.fn('renderSoft'); if(sb.qa('#content .ex-name').length === 0 && sb.text('#content').length < 60) miss.push('Search empty'); sb.S.search = '';
    assert(!miss.length, 'No empty-state message for: ' + miss.join(', '));
  }});
add('US-005', C.use, 'All screens', 'Text size: nothing is smaller than 10px and very little is under 11px.', {
  type: 'Hybrid', severity: 'Minor', tags: ['usability', 'visual'], timeout: 90000, steps: ['Automated: measure all text.', 'Human: read the smallest text on a phone.'], exp: 'Legible.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => { const tiny = []; L.textEls(sb).forEach(el => { const f = parseFloat(sb.win.getComputedStyle(el).fontSize); if(f < 11) tiny.push(`${el.textContent.trim().slice(0, 18)} ${f}px`); }); return tiny; }); sb.destroy(); const under85 = results.flatMap(r => (r.value || []).filter(t => parseFloat(t.split(' ').pop()) < 8.5).map(t => `${r.name}: ${t}`)); assert(!under85.length, 'Text under 8.5px - ' + brief(under85, 4)); const small = results.filter(r => r.value && r.value.length); if(small.length) QA.partial(`Text smaller than 11px (mostly small uppercase labels) on ${small.length} screens, e.g. ${small[0].name}: ${small[0].value[0]}, ${small[0].value[1] || ''}`); }});
add('US-006', C.use, 'Workflow screens', 'The main button (Next / Save) stays on screen and never hides the last item of the page.', {
  severity: 'Major', tags: ['usability', 'visual', 'build', 'review'], timeout: 60000, steps: ['Scroll to the bottom of Setup, Build and Review.'], exp: 'Button visible; last content clears it.',
  async run(env){
    const sb = await L.startBuild(env, {height: 700}); sb.addExercises(sb.firstIdsPerPhase(2)); const bad = [];
    for(const n of ['practiceSetup', 'build', 'review']){ sb.fn('nav', n); const f = sb.q('#workflowFooter button'); if(!f){ bad.push(n + ': no button'); continue; } const fr = f.getBoundingClientRect(); const vh = sb.win.innerHeight; if(fr.bottom > vh + 1 || fr.top < 0) bad.push(`${n}: button off screen`); const c = sb.q('#content'); c.scrollTop = c.scrollHeight; await sb.sleep(10); const leaves = [...c.querySelectorAll('*')].filter(e => !e.children.length && e.textContent.trim() && L.visible(e)); const last = leaves[leaves.length - 1]; const lr = last.getBoundingClientRect(); if(lr.bottom > fr.top + 2) bad.push(`${n}: last item hidden behind the button by ${Math.round(lr.bottom - fr.top)}px`); }
    assert(!bad.length, bad.join('; '));
  }});
add('US-007', C.use, 'Forms', 'Every text / date / time field is labelled or has placeholder text.', {
  severity: 'Minor', tags: ['usability', 'accessibility'], timeout: 90000, steps: ['Inspect each input.'], exp: 'No anonymous inputs.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => sb.qa('input:not([type=hidden]), textarea, select', sb.doc).filter(el => L.visible(el) || el.type === 'time' || el.type === 'date').filter(el => !el.getAttribute('aria-label') && !el.placeholder && !(el.id && sb.q(`label[for="${el.id}"]`)) && !el.closest('label')).map(el => el.className.slice(0, 24) || el.type)); sb.destroy(); const bad = results.filter(r => r.value && r.value.length).map(r => `${r.name}: ${brief(r.value, 2)}`); if(bad.length) QA.partial('Unlabelled fields - ' + brief(bad, 4)); }});
add('US-008', C.use, 'All screens', 'No screen shows programmer text: "undefined", "NaN", "null", "[object Object]".', {
  severity: 'Major', tags: ['usability', 'data'], timeout: 90000, steps: ['Read every screen and sheet.'], exp: 'None found.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => { const t = sb.text('#shell') + ' ' + sb.text('#overlay'); return (t.match(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/g) || []); }); sb.destroy(); const bad = results.filter(r => r.value && r.value.length).map(r => `${r.name}: ${[...new Set(r.value)].join(',')}`); assert(!bad.length, bad.join(' | ')); }});
add('US-009', C.use, 'All screens', 'One-handed use on a phone: key actions are within thumb reach and nothing needs a precise tap.', {
  type: 'Manual', severity: 'Minor', tags: ['usability'], steps: ['Run a whole session build holding the phone in one hand.'], exp: 'Comfortable throughout.', run: null});
add('US-010', C.use, 'Whole app', 'A coach who has never seen the app can build and save a session without help.', {
  type: 'Manual', severity: 'Major', tags: ['usability'], steps: ['Hand the phone to a new coach; ask them to create and save a session and share it.'], exp: 'They succeed unaided, in a few minutes.', run: null});

/* ================================================================ CONSISTENCY AUDIT (CN-001 .. CN-008) */
add('CN-001', C.cons, 'Back buttons', 'Every workflow screen uses the same Back pill (same size, shape and weight).', {
  severity: 'Minor', tags: ['consistency', 'nav'], timeout: 90000, steps: ['Compare the Back pill on every screen.'], exp: 'One style.',
  async run(env){ const styles = {}; const {results, sb} = await L.eachScreen(env, (name, sb) => { const b = sb.q('#content .nav-back-link'); if(!b) return null; const cs = sb.win.getComputedStyle(b); return [cs.borderRadius, cs.fontWeight, cs.fontSize, Math.round(b.getBoundingClientRect().height)].join('|'); }); sb.destroy(); const have = results.filter(r => r.value); have.forEach(r => { (styles[r.value] = styles[r.value] || []).push(r.name); }); const keys = Object.keys(styles); assert(have.length >= 8, 'Too few screens with a Back pill: ' + have.length); assert(keys.length === 1, 'Back pills differ: ' + keys.map(k => `[${k}] on ${brief(styles[k], 3)}`).join(' vs ')); }});
add('CN-002', C.cons, 'Forward buttons', 'Forward buttons always read "Next: <screen>" (Save Session on the last step, Save Changes when editing a saved session).', {
  severity: 'Minor', tags: ['consistency', 'nav'], timeout: 90000, steps: ['Read the bottom button on each workflow screen.'], exp: 'Consistent wording.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => sb.text('#workflowFooter')); sb.destroy(); const bad = results.filter(r => r.value && !/^(Next: [A-Z][\w ]+|Save Session|Save Changes)$/.test(r.value.trim())).map(r => `${r.name}: "${r.value}"`); assert(!bad.length, bad.join(' | ')); }});
add('CN-003', C.cons, 'Page titles', 'Page titles are the screen names (Session Setup, Build Session, Session Review, Find Exercises, Exercise Detail ...).', {
  severity: 'Minor', tags: ['consistency'], timeout: 90000, steps: ['Read each page title.'], exp: 'As listed.',
  async run(env){ const want = {'Session Setup': 'Session Setup', 'Build Session': 'Build Session', 'Session Review': 'Session Review', 'Find Exercises': 'Find Exercises', 'Exercise Detail': 'Exercise Detail', 'Custom Step 2': 'Session Setup', 'Custom Step 4': 'Session Review'}; const {results, sb} = await L.eachScreen(env, (name, sb) => { const t = sb.q('#content .nav-page-title'); return t ? t.textContent.trim().replace(/\s+/g, ' ') : null; }); sb.destroy(); const bad = results.filter(r => want[r.name] && r.value !== want[r.name]).map(r => `${r.name}: "${r.value}"`); assert(!bad.length, bad.join(' | ')); }});
add('CN-004', C.cons, 'Buttons', 'All yellow primary buttons share one style (border, corners).', {
  severity: 'Polish', tags: ['consistency', 'visual'], timeout: 90000, steps: ['Compare every yellow button.'], exp: 'Same border and corner radius.',
  async run(env){ const seen = {}; const {results, sb} = await L.eachScreen(env, (name, sb) => { sb.qa('.btn-primary', sb.doc).filter(L.visible).forEach(b => { const cs = sb.win.getComputedStyle(b); const k = [cs.borderTopWidth, cs.borderTopColor, cs.borderRadius].join('|'); (seen[k] = seen[k] || new Set()).add(name); }); return null; }); sb.destroy(); const keys = Object.keys(seen); if(keys.length > 1) QA.partial('Yellow buttons are not all styled alike: ' + keys.map(k => `[border ${k.replace(/\|/g, ', ')}] on ${brief([...seen[k]], 3)}`).join(' vs ')); }});
add('CN-009', C.cons, 'Pop-ups', 'Every button in every pop-up (sheets, menus, confirmations, alerts) has the same light-grey border as "Print / Save PDF", in light and dark mode.', {
  severity: 'Minor', tags: ['consistency', 'visual'], timeout: 90000, steps: ['Open every pop-up and compare the button borders.'], exp: 'One border: 1.5px, same grey (a darker grey in dark mode).',
  async run(env){
    const sb = await L.withSaved(env, 1, {live: true}); const S = sb.S, s = S.savedSessions[0]; sb.addExercises(sb.firstIdsPerPhase(1));
    const reset = () => { ['savedSheet', 'sessionMoreId', 'saveFirstSheet', 'shareSheet', 'printSheet', 'shareLinkModal', 'confirmShuffleOpen', 'confirmGenerateOpen', 'confirmDuplicateSessionId', 'confirmDiscardExerciseOpen', 'pendingQuickAdd', 'confirmDeleteSessionId', 'confirmDeleteTemplateId', 'filtersOpen', 'balanceSheetOpen', 'quickPickOpen', 'confirmDiscardOpen', 'confirmDiscardTemplateOpen', 'templateSectionModal', 'confirmNewSessionOpen', 'tagPickerFor', 'templateDraft', 'templatePickerOpen'].forEach(k => { S[k] = typeof S[k] === 'boolean' ? false : null; }); };
    const states = {
      savedSheet: () => { S.savedSheet = {sessionId: s.id, renamedFrom: ''}; }, more: () => { S.sessionMoreId = s.id; }, saveFirst: () => { S.saveFirstSheet = 'print'; },
      shareReady: () => { S.shareSheet = {sessionId: s.id, status: 'ready', url: 'u', message: 'm', title: 't', errorText: ''}; }, shareError: () => { S.shareSheet = {sessionId: s.id, status: 'error', url: '', message: '', title: '', errorText: 'x'}; },
      printOptions: () => sb.fn('openPrintSheet', s.id), printReady: () => { sb.fn('openPrintSheet', s.id); S.printSheet.step = 'ready'; S.printSheet.fileName = 'x.pdf'; }, printError: () => { sb.fn('openPrintSheet', s.id); S.printSheet.step = 'error'; },
      shareLink: () => { S.shareLinkModal = {url: 'http://x', title: 't'}; }, confirmNew: () => { S.confirmNewSessionOpen = true; }, shuffle: () => { S.confirmShuffleOpen = true; }, generate: () => { S.confirmGenerateOpen = true; }, duplicate: () => { S.confirmDuplicateSessionId = s.id; },
      discardEx: () => { S.confirmDiscardExerciseOpen = true; }, pendingAdd: () => { S.pendingQuickAdd = {id: sb.exercises()[0].id, targetKey: 'warmup'}; }, delSession: () => { S.confirmDeleteSessionId = s.id; }, delTemplate: () => { S.confirmDeleteTemplateId = S.practiceTemplates[0].id; },
      discardDraft: () => { S.confirmDiscardOpen = true; }, filters: () => { S.filtersOpen = true; }, balance: () => { sb.fn('nav', 'review'); sb.fn('openBalanceSheet'); }, quickPick: () => { sb.fn('pickForPhase', 'warmup'); sb.fn('openQuickPick'); },
      sectionModal: () => { sb.fn('createTemplateFromSessions'); sb.fn('teOpenSectionModal'); }, discardTemplate: () => { sb.fn('createTemplateFromSessions'); sb.fn('teSetName', 'x'); sb.fn('teSetLocation', 'indoor'); sb.fn('closeTemplateEditor'); },
    };
    const sigs = {}; const isAction = b => /(^|\s)(btn|ios-alert-btn|sd-act|more-item|balance-add-btn)(\s|$)/.test(b.className) && sb.norm(b.textContent);
    for(const theme of ['light', 'dark']){ sb.doc.documentElement.setAttribute('data-theme', theme); for(const [name, fn] of Object.entries(states)){ reset(); S.screen = 'home'; fn(); sb.fn('render'); sb.fn('renderOverlay'); sb.qa('#overlay button').filter(isAction).forEach(b => { const cs = sb.win.getComputedStyle(b); const sig = `${theme}: ${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`; (sigs[sig] = sigs[sig] || new Set()).add(name + ' / ' + sb.norm(b.textContent).slice(0, 14)); }); } }
    const keys = Object.keys(sigs); const perTheme = t => keys.filter(k => k.startsWith(t + ':'));
    ['light', 'dark'].forEach(t => assert(perTheme(t).length === 1, `${t} mode has ${perTheme(t).length} different button borders: ` + perTheme(t).map(k => `[${k}] e.g. ${[...sigs[k]].slice(0, 3).join(', ')}`).join(' vs ')));
    return `Light: ${perTheme('light')[0].slice(7)}; dark: ${perTheme('dark')[0].slice(6)} (${Object.values(sigs).reduce((a, v) => a + v.size, 0)} buttons in ${Object.keys(states).length} pop-ups).`;
  }});
add('CN-005', C.cons, 'Sheets', 'All pop-up sheets share one structure: backdrop, pull handle and a title.', {
  severity: 'Minor', tags: ['consistency'], timeout: 90000, steps: ['Open each sheet.'], exp: 'Handle + backdrop + title on each.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => { if(!/sheet|menu/i.test(name)) return null; const sh = sb.q('#overlay .sheet'); if(!sh) return 'no sheet'; const miss = []; if(!sb.q('#overlay .sheet-backdrop')) miss.push('backdrop'); if(!sh.querySelector('.sheet-handle')) miss.push('handle'); if(!sh.querySelector('h3, .pe-state-title, .more-list')) miss.push('title'); return miss.join('+'); }); sb.destroy(); const bad = results.filter(r => r.value).map(r => `${r.name}: missing ${r.value}`); assert(!bad.length, bad.join(' | ')); }});
add('CN-006', C.cons, 'Wording', 'The same word is used for the same thing: "Session" (not a mix of "Practice" and "Session") in text coaches read.', {
  severity: 'Polish', tags: ['consistency', 'usability'], timeout: 90000, steps: ['Search every screen for the word Practice.'], exp: 'None, or deliberately kept.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => (sb.text('#shell').replace(/Practice (date|Setup)/gi, '$1') + ' ' + sb.text('#overlay')).match(/[^.]{0,20}\bpractice\b[^.]{0,20}/gi) || []); sb.destroy(); const bad = results.filter(r => r.value && r.value.length).map(r => `${r.name}: "${r.value[0].trim()}"`); if(bad.length) QA.partial(`The word "Practice" still appears alongside "Session" on ${bad.length} screens - ${brief(bad, 4)}`); }});
add('CN-007', C.cons, 'Colours', 'Each phase keeps the same colour and icon everywhere (Build, Review, Saved Session, Find Exercises, print).', {
  type: 'Manual', severity: 'Polish', tags: ['consistency', 'visual'], steps: ['Compare phase colours on each screen.'], exp: 'Warmup/Athletic/Duels/Rondos/SSG/Scrimmage always look the same.', run: null});
add('CN-008', C.cons, 'Dates and times', 'Times read as "5:00 PM" everywhere (never 24-hour like 17:00) and dates in one short style.', {
  severity: 'Polish', tags: ['consistency'], timeout: 90000, steps: ['Read times on each screen.'], exp: '12-hour times.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => (sb.text('#content') + ' ' + sb.text('#overlay')).match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b(?!\s?(?:AM|PM))/g) || []); sb.destroy(); const bad = results.filter(r => r.value && r.value.length).map(r => `${r.name}: ${r.value[0]}`); assert(!bad.length, '24-hour times shown - ' + brief(bad, 4)); }});

/* ================================================================ RESPONSIVE / MOBILE (RS-001 .. RS-006) */
add('RS-001', C.vis, 'All screens', 'No sideways scrolling at 320, 360, 390, 430 and 768 px wide.', {
  severity: 'Major', tags: ['responsive', 'visual'], timeout: 120000, steps: ['Open each screen at each width.'], exp: 'Content fits the width.',
  async run(env){
    const bad = [];
    for(const w of [320, 360, 390, 430, 768]){ const {results, sb} = await L.eachScreen(env, (name, sb) => { const c = sb.q('#content'); const over = c.scrollWidth - c.clientWidth; const doc = sb.doc.documentElement.scrollWidth - sb.win.innerWidth; return Math.max(over, doc); }, {width: w}); sb.destroy(); results.forEach(r => { if(r.value > 1) bad.push(`${w}px ${r.name} +${r.value}px`); }); }
    assert(!bad.length, 'Sideways overflow - ' + brief(bad, 6));
  }});
add('RS-002', C.vis, 'Small phones', 'On a short screen (360 x 640) the main button is reachable and content is not cut off.', {
  severity: 'Major', tags: ['responsive', 'visual'], timeout: 60000, steps: ['Open Build and Review on a small phone.'], exp: 'Button on screen; content scrolls.',
  async run(env){ const sb = await L.startBuild(env, {width: 360, height: 640}); sb.addExercises(sb.firstIdsPerPhase(2)); ['build', 'review'].forEach(n => { sb.fn('nav', n); const f = sb.q('#workflowFooter button').getBoundingClientRect(); assert(f.bottom <= 641 && f.top > 300, `${n}: button at ${Math.round(f.top)}-${Math.round(f.bottom)}`); }); }});
add('RS-003', C.vis, 'Dark and light mode', 'Text has enough contrast against its background in both light and dark mode (3:1 minimum for any text, checked on every screen).', {
  type: 'Hybrid', severity: 'Minor', tags: ['responsive', 'visual'], timeout: 120000, steps: ['Automated: measure text contrast in both themes.', 'Human: look at both themes.'], exp: 'No hard-to-read text.',
  async run(env){
    const msgs = [];
    for(const theme of ['light', 'dark']){ const {results, sb} = await L.eachScreen(env, (name, sb) => { sb.doc.documentElement.setAttribute('data-theme', theme); const low = []; L.textEls(sb).forEach(el => { const c = L.contrast(el); if(c < 3) low.push(`"${el.textContent.trim().slice(0, 18)}" ${c.toFixed(1)}:1`); }); return low; }); sb.destroy(); const bad = results.filter(r => r.value && r.value.length); if(bad.length) msgs.push(`${theme}: ${bad.length} screens, e.g. ${bad[0].name} ${bad[0].value[0]}`); }
    if(msgs.length) QA.partial('Low-contrast text - ' + msgs.join(' | '));
  }});
add('RS-004', C.vis, 'Home Screen app', 'Added to the Home Screen: nothing hides under the notch or the home bar; opens to Home.', {
  type: 'Manual', severity: 'Minor', tags: ['responsive', 'visual'], steps: ['Add to Home Screen on an iPhone, open it.'], exp: 'Top bar and bottom bar clear of the notch / home indicator.', run: null});
add('RS-005', C.vis, 'Landscape', 'Rotate the phone sideways: key screens still usable.', {
  type: 'Manual', severity: 'Polish', tags: ['responsive', 'visual'], steps: ['Rotate on Build, Review and a detail page.'], exp: 'Readable, buttons reachable.', run: null});
add('RS-006', C.vis, 'Real devices', 'Look on at least one small iPhone, one large iPhone and an Android phone.', {
  type: 'Manual', severity: 'Minor', tags: ['responsive', 'visual'], steps: ['Open the app on each device.'], exp: 'Same experience; no clipped text.', run: null});

/* ================================================================ ERROR HANDLING / OFFLINE (ER-001 .. ER-010) */
add('ER-001', C.err, 'Offline', 'With no connection the app still opens and works using the saved copy of the library, and says so.', {
  severity: 'Critical', tags: ['errors', 'offline', 'sync'], steps: ['Open the app offline.'], exp: 'Home with a "couldn\'t reach your live sheet" notice; building works.',
  async run(env){ const sb = await env.boot({fetchMode: 'offline'}); await sb.until(() => sb.S.dataSource === 'offline', 5000); assert(sb.has("Couldn't reach", '#content') || sb.has('Couldn’t reach', '#content'), 'No offline notice'); sb.click('Start New Session'); sb.click('Next: Build Session'); sb.addExercises(sb.firstIdsPerPhase(1)); sb.click('Next: Session Review'); sb.click('Save Session'); eq(sb.S.savedSessions.length, 1, 'Could not save offline'); }});
add('ER-002', C.err, 'Offline', 'A session saved offline is kept, marked "Not synced yet", and syncs automatically once the connection returns.', {
  severity: 'Critical', tags: ['errors', 'offline', 'sync', 'save'], timeout: 40000, steps: ['Save offline, reconnect.'], exp: 'Pending flag cleared; server has it.',
  async run(env){ const sb = await env.boot({fetchMode: 'offline'}); sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('completeSession', {skipConfirm: true}); await sb.sleep(50); const s = sb.S.savedSessions[0]; eq(s._syncPending, true, 'Pending while offline'); sb.ctx.fetchMode = 'mock'; sb.fn('retryPendingSessionPushes'); await sb.until(() => s._syncPending === false, 5000, 'sync'); assert(sb.ctx.backend.sessions.has(s.id), 'Server never received it'); }});
add('ER-003', C.err, 'Sync', 'If the sheet answers with nonsense or an error the app keeps its current data and does not crash.', {
  severity: 'Major', tags: ['errors', 'sync'], steps: ['Make the server return garbage.'], exp: 'Library unchanged.',
  async run(env){ const sb = await env.boot({fetchMode: 'raw', fetchHandler: async () => new Response('<html>Not JSON</html>', {status: 200})}); await sb.sleep(300); assert(sb.exercises().length >= 50, 'Library emptied'); eq(sb.S.dataSource, 'offline', 'Data source'); eq(sb.errors.length, 0, 'Script errors'); }});
add('ER-004', C.err, 'Offline', 'Deleting a session offline still removes it from the phone.', {
  severity: 'Major', tags: ['errors', 'offline', 'saved'], steps: ['Go offline, delete.'], exp: 'Gone locally, no error.',
  async run(env){ const sb = await L.withSaved(env, 1); sb.ctx.fetchMode = 'offline'; const id = sb.S.savedSessions[0].id; sb.fn('requestDeleteSession', id); sb.fn('confirmDeleteSessionNow'); await sb.sleep(30); eq(sb.S.savedSessions.length, 0, 'Sessions'); eq(sb.errors.length, 0, 'Script errors'); }});
add('ER-005', C.err, 'Sharing', 'If the share link cannot be prepared (offline) the coach sees a clear message and Try Again, and it works once back online.', {
  severity: 'Major', tags: ['errors', 'share', 'offline'], timeout: 40000, steps: ['Tap Share offline, then reconnect and Try Again.'], exp: 'Error then success.',
  async run(env){ const sb = await L.withSaved(env, 1); const id = sb.S.savedSessions[0].id; await sb.sleep(30); sb.ctx.backend.down = true; sb.fn('openSessionDetail', id); sb.S.shareReady = {}; await sb.fn('shareSavedSession', id); await sb.until(() => sb.S.shareSheet && sb.S.shareSheet.status === 'error', 5000, 'error state'); assert(sb.has('Try Again', '#overlay'), 'No Try Again'); sb.ctx.backend.down = false; sb.click('Try Again', '#overlay'); await sb.until(() => sb.S.shareSheet && sb.S.shareSheet.status === 'ready', 5000, 'ready'); }});
add('ER-006', C.err, 'Library changes', 'A saved session whose exercise was removed from the sheet still opens and shows the exercise by name.', {
  severity: 'Major', tags: ['errors', 'saved', 'data'], steps: ['Remove an exercise from the library, open a session using it.'], exp: 'No crash; name still shown.',
  async run(env){ const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const e = s.phases[0].exercises[0]; const idx = sb.exercises().findIndex(x => x.id === e.id); sb.exercises().splice(idx, 1); sb.fn('openSessionDetail', s.id); assert(sb.has(e.name, '#content'), 'Exercise name missing'); eq(sb.errors.length, 0, 'Script errors'); sb.clickSel('#content .phase-ex-item'); assert(['detail', 'sessionDetail'].includes(sb.screen), 'Tapping it broke navigation'); }});
add('ER-007', C.data, 'Library changes', 'If the coach renumbers exercise IDs in the sheet, saved sessions still find their exercises by name.', {
  severity: 'Critical', tags: ['errors', 'data', 'saved'], steps: ['Change an exercise id, open a saved session.'], exp: 'Resolved by name.',
  async run(env){ const sb = await L.withSaved(env, 1); const e = sb.exercises()[5]; const snapshot = {id: 'EX90001', name: e.name, duration: 10}; const r = sb.fn('resolveSavedExercise', snapshot); assert(r && r.id === e.id, 'Not found by name'); const bad = {id: e.id, name: 'Totally Different Name Here'}; const r2 = sb.fn('resolveSavedExercise', bad); assert(!r2 || r2.id === e.id, 'Resolved to the wrong exercise'); }});
add('ER-008', C.err, 'Save', 'Tapping Save twice quickly saves once.', {
  severity: 'Major', tags: ['errors', 'save'], steps: ['Double-tap Save Session.'], exp: 'One session.',
  async run(env){ const sb = await L.toReview(env); sb.fn('completeSession'); sb.fn('completeSession'); eq(sb.S.savedSessions.length, 1, 'Saved sessions after a double tap'); }});
add('ER-009', C.err, 'Names', 'Very long, blank, emoji and special-character session names are handled (trimmed, wrapped, never break the page).', {
  severity: 'Minor', tags: ['errors', 'save'], steps: ['Save sessions with awkward names.'], exp: 'Saved safely; shown intact.',
  async run(env){ const sb = await env.boot(); const names = ['', '   ', 'A'.repeat(200), 'Café ⚽️ Rondos 🔥', 'Tab\tand\nnewline', '"quotes" & <b>tags</b>']; names.forEach(n => { sb.fn('resetBuilderDraft'); sb.S.sessionName = n; sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('completeSession', {skipConfirm: true}); }); eq(sb.S.savedSessions.length, names.length, 'Saved'); sb.fn('nav', 'sessions'); sb.fn('nav', 'sessions', {sessionsViewAll: true}); sb.S.savedSessions.forEach(s => { sb.fn('openSessionDetail', s.id); }); eq(sb.errors.length, 0, 'Script errors'); const ns = sb.S.savedSessions.map(s => s.name); eq(new Set(ns).size, ns.length, 'Names unique'); }});
add('ER-010', C.err, 'Phone behaviour', 'Switching away from the app and back (or the phone reclaiming it) never loses work.', {
  severity: 'Critical', tags: ['errors', 'persistence'], steps: ['Build, switch apps, come back.'], exp: 'Same draft.',
  async run(env){ const sb = await L.startBuild(env); sb.addExercises(sb.firstIdsPerPhase(1)); sb.win.dispatchEvent(new sb.win.Event('pagehide')); const snap = sb.storedSnapshot(); assert(snap && snap.phaseData && snap.phaseData.warmup.length === 1, 'Pagehide did not save the draft'); sb.e("Object.defineProperty(document,'visibilityState',{configurable:true,get(){return 'hidden'}})"); sb.doc.dispatchEvent(new sb.win.Event('visibilitychange')); assert(sb.storedSnapshot().phaseData.athletic.length === 1, 'visibilitychange did not save'); }});

/* ================================================================ SECURITY / PRIVACY / PERFORMANCE (SP-001 .. SP-010, PF-001 .. PF-008) */
add('SP-001', C.sec, 'Injection', 'Typed text (session names, comments, exercise text) containing HTML or scripts is shown as plain text, never run.', {
  smoke: false, severity: 'Critical', tags: ['security'], steps: ['Save a session named <img onerror=...>.'], exp: 'Shown as text; nothing executes.',
  async run(env){ const sb = await L.withSaved(env, 1); sb.win.__xss = 0; const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2<\/script>'; const s = sb.S.savedSessions[0]; sb.fn('renameSavedSession', s.id, evil); s.comment = evil; sb.fn('openSessionDetail', s.id); sb.fn('nav', 'sessions'); sb.fn('nav', 'sessions', {sessionsViewAll: true}); sb.fn('nav', 'home'); const ex = sb.exercises()[0]; const old = ex.setup; ex.setup = evil; sb.fn('openDetail', ex.id); ex.setup = old; await sb.sleep(80); eq(sb.win.__xss, 0, 'Injected script ran'); assert(!sb.q('#shell img[src="x"]'), 'Injected image tag exists in the page'); }});
add('SP-002', C.sec, 'Privacy', 'Private sessions are never listed to other coaches (Community view).', {
  severity: 'Critical', tags: ['security', 'saved', 'privacy'], steps: ['Another coach marks a session Private; open Community.'], exp: 'It is not shown.',
  async run(env){ const sb = await L.withSaved(env, 2); const [a, b] = sb.S.savedSessions; a.createdBy = 'Other Coach'; a.visibility = 'private'; a.name = 'Secret Plan'; b.createdBy = 'Other Coach'; b.visibility = 'shared'; b.name = 'Public Plan'; sb.fn('nav', 'sessions'); sb.fn('setSessionsViewMode', 'community'); sb.fn('nav', 'sessions', {sessionsViewAll: true}); const t = sb.text('#content'); assert(!t.includes('Secret Plan'), "Another coach's private session is visible"); assert(t.includes('Public Plan'), 'Shared session missing from Community'); }});
add('SP-003', C.sec, 'Sharing', 'Share tokens are 24 random characters from a 62-symbol alphabet, never repeat (2,000 made) and never contain the coach\'s name.', {
  severity: 'Critical', tags: ['security', 'share'], steps: ['Create many tokens.'], exp: 'Unique, well-spread, anonymous.',
  async run(env){ const sb = await env.boot({coach: 'Tisan Ahmad'}); const set = new Set(); for(let i = 0; i < 2000; i++){ const t = sb.fn('newShareToken'); assert(/^[A-Za-z0-9]{24}$/.test(t), 'Bad token ' + t); assert(!/tisan|ahmad/i.test(t), 'Token contains the coach name'); set.add(t); } eq(set.size, 2000, 'Distinct tokens'); const chars = new Set([...set].join('')); assert(chars.size >= 55, 'Alphabet too narrow: ' + chars.size); }});
add('SP-004', C.sec, 'Privacy', 'The share link contains only the app address and the token - no name, email or session text.', {
  severity: 'Major', tags: ['security', 'share', 'privacy'], steps: ['Read a share link.'], exp: 'index.html?s=<token> only.',
  async run(env){ const sb = await L.withSaved(env, 1, {coach: 'Tisan Ahmad'}); const s = sb.S.savedSessions[0]; const url = sb.fn('shareUrlFor', s.shareToken); const u = new URL(url); eq([...u.searchParams.keys()].join(), 's', 'Query keys'); assert(!/tisan|ahmad|@/i.test(url) && !url.includes(encodeURIComponent(s.name)), 'Link contains personal data: ' + url); }});
add('SP-005', C.sec, 'Privacy', 'During a normal session build, save and share the app only talks to its own Google Apps Script / Sheet address.', {
  severity: 'Critical', tags: ['security', 'privacy', 'sync'], timeout: 40000, steps: ['Watch network calls.'], exp: 'No other hosts.',
  async run(env){ const {sb} = await L.withShareReady(env); sb.click('Share Session', '#content'); await sb.sleep(40); const hosts = new Set(sb.ctx.fetchLog.map(f => new URL(f.url, 'https://x/').host)); const allowed = ['script.google.com', 'docs.google.com']; const bad = [...hosts].filter(h => !allowed.includes(h)); assert(!bad.length, 'Unexpected hosts contacted: ' + bad.join(', ')); const posts = sb.ctx.fetchLog.filter(f => f.method === 'POST'); assert(posts.length > 0 && posts.every(p => /requestingCoach/.test(p.body)), 'A write did not identify the coach for the server-side ownership check'); return `Hosts contacted: ${[...hosts].join(', ')}`; }});
add('SP-006', C.sec, 'Privacy', 'Nothing is sent about a session until it is saved, and the Print / Share buttons on an unsaved draft send nothing.', {
  severity: 'Major', tags: ['security', 'privacy'], steps: ['Build a draft, tap Print and Share.'], exp: 'No server writes.',
  async run(env){ const sb = await L.toReview(env); sb.ctx.fetchLog.length = 0; sb.click('Print PDF'); sb.fn('closeSaveFirstSheet'); sb.click('Share Session', '#content'); sb.fn('closeSaveFirstSheet'); assert(sb.ctx.fetchLog.filter(f => f.method === 'POST').length === 0, 'A draft was sent to the server'); eq(sb.ctx.shareLog.length + sb.ctx.clipboard.length, 0, 'Something was shared'); }});
add('SP-007', C.sec, 'Secrets', 'The app file contains no passwords, API keys or tokens.', {
  severity: 'Critical', tags: ['security'], steps: ['Scan index.html.'], exp: 'None found.',
  async run(env){ const src = (await QA.loadSource()).text; const pats = [[/AIza[0-9A-Za-z_-]{35}/, 'Google API key'], [/sk-[A-Za-z0-9]{20,}/, 'secret key'], [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'], [/(password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"]{6,}['"]/i, 'credential-looking value'], [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token']]; const hits = pats.filter(([re]) => re.test(src)).map(p => p[1]); assert(!hits.length, 'Possible secrets in index.html: ' + hits.join(', ')); }});
add('SP-008', C.sec, 'Storage', 'The phone stores only what the app needs: coach name, app state, theme, exercise index - nothing sensitive.', {
  severity: 'Minor', tags: ['security', 'privacy', 'persistence'], steps: ['List the stored keys.'], exp: 'Only the known keys.',
  async run(env){ const sb = await L.withSaved(env, 1); sb.flushState(); sb.fn('toggleTheme'); const keys = [...sb.ctx.store.keys()]; const known = ['ft2_coach_name_v1', 'ft2-app-state-v1', 'ft2-theme', 'ft2_exercise_index_v1']; const extra = keys.filter(k => !known.includes(k)); assert(!extra.length, 'Unexpected stored keys: ' + extra.join(', ')); const raw = sb.ctx.store.get('ft2-app-state-v1'); assert(!/@\w+\.\w+/.test(raw), 'An email address appears in stored data'); }});
add('SP-009', C.sec, 'Links', 'Links that open other sites open in a new tab with rel="noopener".', {
  severity: 'Minor', tags: ['security'], timeout: 90000, steps: ['Inspect every external link.'], exp: 'target=_blank + noopener.',
  async run(env){ const {results, sb} = await L.eachScreen(env, (name, sb) => sb.qa('a[href^="http"]', sb.doc).filter(a => { try{ return new URL(a.href).host !== new URL(QA.ROOT_URL).host; }catch(e){ return false; } }).filter(a => !(a.target === '_blank' && /noopener/.test(a.rel))).map(a => a.href.slice(0, 40))); sb.destroy(); const bad = results.filter(r => r.value && r.value.length); assert(!bad.length, 'External links without noopener: ' + bad.map(b => `${b.name}: ${b.value[0]}`).join('; ')); }});
add('SP-010', C.sec, 'QA tool', 'Safety of this QA tool: the sandbox never writes to the coach\'s real browser storage, never contacts the sheet for writing, and never sends a real message.', {
  severity: 'Critical', tags: ['security', 'qa'], timeout: 40000, steps: ['Run a full save / share / delete flow in the sandbox and compare the real storage before and after.'], exp: 'Real storage unchanged; all writes went to the in-memory mock.',
  async run(env){ const before = JSON.stringify(Object.keys(localStorage).filter(k => k !== QA.RESULTS_KEY).sort().map(k => [k, localStorage.getItem(k)])); const {sb, s} = await L.withShareReady(env); sb.click('Share Session', '#content'); await sb.sleep(30); sb.fn('requestDeleteSession', s.id); sb.fn('confirmDeleteSessionNow'); sb.flushState(); await sb.sleep(50); const after = JSON.stringify(Object.keys(localStorage).filter(k => k !== QA.RESULTS_KEY).sort().map(k => [k, localStorage.getItem(k)])); eq(after, before, 'Real browser storage changed while testing'); assert(sb.isolated, 'Sandbox isolation flag'); assert(sb.ctx.fetchLog.every(f => f.method === 'GET' || f.method === 'POST'), ''); assert(sb.ctx.clipboard.length > 0, 'Clipboard stand-in was not used (real clipboard may have been touched)'); }});

add('PF-001', C.sec, 'Performance', 'The app starts quickly: opens and shows Home in under 1.5 seconds (software only, no network).', {
  severity: 'Minor', tags: ['performance'], steps: ['Time a cold start.'], exp: '< 1.5s.',
  async run(env){ const times = []; for(let i = 0; i < 3; i++){ const t0 = performance.now(); const sb = await QA.boot({fetchMode: 'offline'}); times.push(Math.round(performance.now() - t0)); sb.destroy(); } const best = Math.min(...times); const msg = `Start-up ${times.join(' / ')} ms.`; if(best > 3000) throw new QA.Fail(msg); if(best > 1500) QA.partial(msg); return msg; }});
add('PF-002', C.sec, 'Performance', 'The generator is fast: a session in under 50 ms on average.', {
  severity: 'Minor', tags: ['performance', 'generator'], timeout: 60000, steps: ['Time 200 generations.'], exp: '< 50 ms each.',
  async run(env){ const sb = await env.boot({live: true}); const f = sb.e('FOCUS_AREAS'); const t0 = performance.now(); for(let i = 0; i < 200; i++) sb.generate({focusArea: f[i % 8].id, duration: [60, 75, 90][i % 3], location: 'either', ageGroup: 'U10', sessionStyle: 'balanced', shuffleSeed: i}); const avg = (performance.now() - t0) / 200; const msg = `${avg.toFixed(1)} ms per session.`; if(avg > 150) throw new QA.Fail(msg); if(avg > 50) QA.partial(msg); return msg; }});
add('PF-003', C.sec, 'Performance', 'The full exercise library draws in under 500 ms.', {
  severity: 'Minor', tags: ['performance', 'library'], steps: ['Time the library render.'], exp: '< 500 ms.',
  async run(env){ const sb = await env.boot({live: true}); const t0 = performance.now(); sb.fn('nav', 'exercises'); const ms = Math.round(performance.now() - t0); const msg = `${ms} ms for ${sb.qa('#content .ex-card').length} cards.`; if(ms > 1500) throw new QA.Fail(msg); if(ms > 500) QA.partial(msg); return msg; }});
add('PF-004', C.sec, 'Performance', 'With 200 saved sessions the Sessions screens and saving state stay quick and the stored data stays under 2 MB.', {
  severity: 'Minor', tags: ['performance', 'persistence'], timeout: 60000, steps: ['Create 200 sessions.'], exp: 'Sessions < 500ms; snapshot < 2MB.',
  async run(env){ const sb = await env.boot(); const base = sb.firstIdsPerPhase(2); for(let i = 0; i < 200; i++){ sb.fn('resetBuilderDraft'); sb.S.sessionName = 'Bulk ' + i; sb.addExercises(base); sb.S.phaseData.warmup = base.warmup.slice(); sb.fn('completeSession', {skipConfirm: true}); } const t0 = performance.now(); sb.fn('nav', 'sessions'); sb.fn('nav', 'sessions', {sessionsViewAll: true}); const ms = Math.round(performance.now() - t0); const t1 = performance.now(); sb.flushState(); const sv = Math.round(performance.now() - t1); const size = (sb.ctx.store.get('ft2-app-state-v1') || '').length; const msg = `200 sessions: screens ${ms} ms, save ${sv} ms, stored ${(size / 1024).toFixed(0)} KB.`; if(ms > 2000 || size > 2e6) throw new QA.Fail(msg); if(ms > 500 || size > 1e6) QA.partial(msg); return msg; }});
add('PF-005', C.sec, 'Performance', 'Making a print takes under 3 seconds per layout.', {
  severity: 'Minor', tags: ['performance', 'print'], timeout: 90000, steps: ['Time each layout.'], exp: '< 3 s.',
  async run(env){ const sb = await env.boot({live: true}); sb.fn('resetBuilderDraft'); sb.addExercises(sb.firstIdsPerPhase(2)); sb.fn('completeSession', {skipConfirm: true}); const s = sb.S.savedSessions[0]; const ts = []; for(const k of ['pocket', 'half', 'full']){ const t0 = performance.now(); await sb.fn('ftRenderPages', s, k); ts.push(Math.round(performance.now() - t0)); } const msg = `pocket/half/full: ${ts.join(' / ')} ms (images may be cached after the first).`; if(Math.max(...ts) > 8000) throw new QA.Fail(msg); if(Math.max(...ts) > 3000) QA.partial(msg); return msg; }});
add('PF-006', C.sec, 'Performance', 'The app file stays a sensible size (under 1.5 MB).', {
  severity: 'Polish', tags: ['performance'], steps: ['Measure index.html.'], exp: '< 1.5 MB.',
  async run(env){ const src = await QA.loadSource(); const mb = src.bytes / 1048576; const msg = `index.html is ${mb.toFixed(2)} MB.`; if(mb > 3) throw new QA.Fail(msg); if(mb > 1.5) QA.partial(msg); return msg; }});
add('PF-007', C.sec, 'Performance', 'Moving around 100 times does not leak page elements (the page stays about the same size).', {
  severity: 'Minor', tags: ['performance'], timeout: 60000, steps: ['Open the main screens repeatedly.'], exp: 'Node count stable.',
  async run(env){ const sb = await L.withSaved(env, 2); const id = sb.S.savedSessions[0].id; const count = () => sb.doc.getElementsByTagName('*').length; const cycle = () => { ['home', 'exercises', 'sessions', 'settings'].forEach(n => sb.fn('nav', n)); sb.fn('openSessionDetail', id); sb.fn('nav', 'home'); }; for(let i = 0; i < 5; i++) cycle(); const a = count(); for(let i = 0; i < 20; i++) cycle(); const b = count(); assert(b <= a * 1.1 + 20, `Page grew from ${a} to ${b} elements`); return `Elements ${a} -> ${b} after 100 more screen changes.`; }});
add('PF-008', C.sec, 'Performance', 'Typing in the search box does not redraw the whole page on every key (it waits for a pause).', {
  severity: 'Polish', tags: ['performance', 'library'], steps: ['Type quickly.'], exp: 'Debounced.',
  async run(env){ const sb = await env.boot(); sb.fn('openSearch'); let renders = 0; const orig = sb.win.renderSoft; sb.win.renderSoft = function(){ renders++; return orig.apply(this, arguments); }; 'abcdefgh'.split('').forEach((c, i) => sb.fn('onSearch', 'abcdefgh'.slice(0, i + 1))); await sb.sleep(400); assert(renders <= 2, `Redrew ${renders} times for 8 keystrokes`); }});

QA.register(tests);
})();
