/* FT2 QA inventory, part 3: Templates, Sharing, Print / Export, Persistence. */
(function(){
'use strict';
const QA = window.QA, L = QA.lib, C = QA.C, T = QA.T;
const {assert, eq} = QA;
const tests = [];
const add = (...a) => tests.push(T(...a));

Object.assign(L, {
  /* A saved session whose share link is ready (token pushed to the mock server). */
  async withShareReady(env, o){
    const sb = await L.withSaved(env, 1, o); const s = sb.S.savedSessions[0]; await sb.sleep(30);
    sb.fn('openSessionDetail', s.id); await sb.until(() => sb.S.shareReady[s.id], 5000, 'the share link to be prepared');
    return {sb, s};
  },
  async recipient(env, sb, token, o){ return env.boot(Object.assign({backend: sb.ctx.backend, coach: null, query: '?s=' + token, fetchMode: 'mock'}, o || {})); },
  tmplDraft(sb){ sb.fn('createTemplateFromSessions'); return sb.S.templateDraft; },
  prng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
});

/* ================================================================ TEMPLATES (TM-001 .. TM-018) */
add('TM-001', C.nav, 'Sessions > Templates', 'Templates live under Sessions (My Templates and Create New Template), and Settings no longer has a Templates row.', {
  severity: 'Major', tags: ['templates', 'nav'], steps: ['Open Sessions, look at Templates.', 'Open Settings.'], exp: 'Sessions shows My Templates + Create New Template; Settings has no templates row.',
  async run(env){ const sb = await env.boot(); sb.click('Sessions', '#bottomnav'); ['My Templates', 'Create New Template'].forEach(w => assert(sb.has(w, '#content'), 'Sessions is missing ' + w)); sb.click('Settings', '#bottomnav'); assert(!/Practice Templates|My Templates/.test(sb.text('#content')), 'Settings still shows a Templates row'); }});
add('TM-002', C.core, 'Template editor', 'Create New Template opens with the standard defaults: 75 min, Outdoor, U11, all six sections totalling 100%.', {
  severity: 'Major', tags: ['templates'], steps: ['Sessions > Create New Template.'], exp: 'Defaults as stated; Save disabled until named.',
  async run(env){ const sb = await env.boot(); sb.click('Sessions', '#bottomnav'); sb.click('Create New Template'); eq(sb.screen, 'settings', 'Editor screen (it renders inside the settings view)'); const d = sb.S.templateDraft; eq(d.duration, 75, 'Duration'); eq(d.location, 'outdoor', 'Location'); eq(d.ageGroup, 'U11', 'Age'); eq(d.sections.length, 6, 'Sections'); eq(sb.fn('teTotalPct', d), 100, 'Total %'); }});
add('TM-003', C.core, 'Template editor', 'A template cannot be saved without a name.', {
  severity: 'Major', tags: ['templates'], steps: ['Tap Save with no name.'], exp: '"Name your template first"; nothing saved.',
  async run(env){ const sb = await env.boot(); const n = sb.S.practiceTemplates.length; L.tmplDraft(sb); sb.fn('teSaveTemplate'); eq(sb.S.practiceTemplates.length, n, 'Templates after unnamed save'); assert(/Name your template/.test(sb.S.toast || ''), 'No message: ' + sb.S.toast); }});
add('TM-004', C.core, 'Template editor', 'Template length choices are exactly 60, 75 and 90.', {
  severity: 'Minor', tags: ['templates'], steps: ['Look at the length toggles.'], exp: '60 / 75 / 90 only.',
  async run(env){ const sb = await env.boot(); QA.deepEq(sb.e('TE_DURATIONS'), [60, 75, 90], 'TE_DURATIONS'); const d = L.tmplDraft(sb); sb.fn('teSetDuration', 90); eq(sb.S.templateDraft.duration, 90, 'Duration after choosing 90'); }});
add('TM-005', C.core, 'Template editor', 'Location toggles between Outdoor and Indoor and the age group can be set U8-U12.', {
  severity: 'Minor', tags: ['templates'], steps: ['Change location and age.'], exp: 'Both stored on the draft.',
  async run(env){ const sb = await env.boot(); L.tmplDraft(sb); sb.fn('teSetLocation', 'indoor'); sb.fn('teSetAge', 'U8'); eq(sb.S.templateDraft.location, 'indoor', 'Location'); eq(sb.S.templateDraft.ageGroup, 'U8', 'Age'); }});
add('TM-006', C.core, 'Template editor', 'Section percentages always add up to 100% however the coach adjusts them (random +/- / switch / remove stress test).', {
  severity: 'Critical', tags: ['templates', 'math'], steps: ['Tap + and - on sections, switch sections on and off, many times.'], exp: 'Total is 100% after every single action.',
  async run(env){
    const sb = await env.boot(); L.tmplDraft(sb); const rnd = L.prng(7); let n = 0;
    for(let i = 0; i < 600; i++){
      const d = sb.S.templateDraft, secs = d.sections, k = secs[Math.floor(rnd() * secs.length)].key, r = rnd();
      if(r < 0.45) sb.fn('teAdjust', k, 1); else if(r < 0.8) sb.fn('teAdjust', k, -1); else if(r < 0.95) sb.fn('teToggle', k); else sb.fn('teSetPct', k, Math.round(rnd() * 100));
      eq(sb.fn('teTotalPct', sb.S.templateDraft), 100, `Total % after action ${i + 1}`); n++;
    }
    return `${n} random actions, always 100%.`;
  }});
add('TM-007', C.core, 'Template editor', 'Every switched-on section keeps at least 5%.', {
  severity: 'Major', tags: ['templates', 'math'], steps: ['Push a section down repeatedly.'], exp: 'It stops at 5%.',
  async run(env){ const sb = await env.boot(); L.tmplDraft(sb); const rnd = L.prng(11); for(let i = 0; i < 300; i++){ const secs = sb.S.templateDraft.sections; sb.fn(rnd() < 0.5 ? 'teAdjust' : 'teToggle', secs[Math.floor(rnd() * secs.length)].key, -1); sb.fn('teSetPct', secs[0].key, Math.round(rnd() * 100)); sb.fn('teEnabled', sb.S.templateDraft).forEach(x => assert(x.pct >= 5, `${x.label} fell to ${x.pct}%`)); } }});
add('TM-008', C.core, 'Template editor', 'Section minutes always add up exactly to the session length (60 / 75 / 90).', {
  severity: 'Critical', tags: ['templates', 'math'], steps: ['Change percentages and the length.'], exp: 'Minutes across sections = length.',
  async run(env){ const sb = await env.boot(); L.tmplDraft(sb); const rnd = L.prng(3); for(let i = 0; i < 300; i++){ sb.fn('teSetDuration', [60, 75, 90][i % 3]); const secs = sb.S.templateDraft.sections; sb.fn('teAdjust', secs[Math.floor(rnd() * secs.length)].key, rnd() < 0.5 ? 1 : -1); const d = sb.S.templateDraft; eq(Object.values(sb.fn('teMinutes', d)).reduce((a, b) => a + b, 0), d.duration, 'Minutes at step ' + i); } }});
add('TM-009', C.core, 'Template editor', 'A section can be switched off (its time goes to the others) but the last one cannot.', {
  severity: 'Major', tags: ['templates'], steps: ['Switch sections off one by one.'], exp: 'At least one stays on.',
  async run(env){ const sb = await env.boot(); L.tmplDraft(sb); const keys = sb.S.templateDraft.sections.map(s => s.key); keys.forEach(k => sb.fn('teToggle', k)); eq(sb.fn('teEnabled', sb.S.templateDraft).length, 1, 'Sections left on'); eq(sb.fn('teTotalPct', sb.S.templateDraft), 100, 'Total'); }});
add('TM-010', C.core, 'Template editor', 'A custom section needs a unique name and a valid percentage.', {
  severity: 'Minor', tags: ['templates'], steps: ['Add a section with a blank name, a duplicate name, then 99%.'], exp: 'Each is refused with a clear message; a good one is added and totals stay 100%.',
  async run(env){
    const sb = await env.boot(); L.tmplDraft(sb); sb.fn('teOpenSectionModal'); sb.fn('teSaveSectionModal'); assert(sb.S.templateSectionModal.error, 'Blank name accepted');
    sb.fn('teSectionModalField', 'name', 'Warmup'); sb.fn('teSaveSectionModal'); assert(/already exists/.test(sb.S.templateSectionModal.error), 'Duplicate accepted');
    sb.fn('teSectionModalField', 'name', 'Cooldown'); sb.fn('teSectionModalField', 'pct', '99'); sb.fn('teSaveSectionModal'); assert(sb.S.templateSectionModal && sb.S.templateSectionModal.error, '99% accepted');
    sb.fn('teSectionModalField', 'pct', '10'); sb.fn('teSaveSectionModal'); eq(sb.S.templateSectionModal, null, 'Modal closed'); eq(sb.S.templateDraft.sections.length, 7, 'Sections'); eq(sb.fn('teTotalPct', sb.S.templateDraft), 100, 'Total');
  }});
add('TM-011', C.core, 'Template editor', 'A custom section can be removed and the totals re-balance to 100%.', {
  severity: 'Minor', tags: ['templates'], steps: ['Remove the custom section.'], exp: 'Gone; 100%.',
  async run(env){ const sb = await env.boot(); L.tmplDraft(sb); sb.fn('teOpenSectionModal'); sb.fn('teSectionModalField', 'name', 'Extra'); sb.fn('teSaveSectionModal'); const k = sb.S.templateDraft.sections.find(s => !s.standard).key; sb.fn('teRemoveCustom', k); eq(sb.S.templateDraft.sections.length, 6, 'Sections'); eq(sb.fn('teTotalPct', sb.S.templateDraft), 100, 'Total'); }});
add('TM-012', C.data, 'Template editor', 'Saving a template adds it to My Templates and it survives reopening the app.', {
  severity: 'Critical', tags: ['templates', 'persistence'], steps: ['Name it, Save, reopen the app.'], exp: 'Listed before and after.',
  async run(env){ const sb = await env.boot(); const n = sb.S.practiceTemplates.length; L.tmplDraft(sb); sb.fn('teSetName', 'QA Template'); sb.fn('teSaveTemplate'); eq(sb.S.practiceTemplates.length, n + 1, 'After save'); const sb2 = await L.reopen(sb); assert(sb2.S.practiceTemplates.some(t => t.name === 'QA Template'), 'Template lost after reopening'); }});
add('TM-013', C.core, 'Template editor', 'Editing an existing template saves changes; leaving with unsaved changes asks first.', {
  severity: 'Major', tags: ['templates'], steps: ['Open a template, change it, Back.'], exp: 'Discard / keep-editing prompt.',
  async run(env){ const sb = await env.boot(); const t = sb.S.practiceTemplates[0]; sb.fn('openTemplateEditor', t.id); sb.fn('teSetLocation', t.location === 'indoor' ? 'outdoor' : 'indoor'); sb.fn('closeTemplateEditor'); eq(sb.S.confirmDiscardTemplateOpen, true, 'Prompt'); sb.fn('cancelDiscardTemplate'); sb.fn('teSaveTemplate'); assert(sb.S.practiceTemplates[0].updatedAt, 'Not stamped as updated'); eq(sb.S.practiceTemplates[0].location === t.location, false, 'Edit not saved'); }});
add('TM-014', C.core, 'Sessions > Templates', 'Deleting a template asks first.', {
  severity: 'Major', tags: ['templates'], steps: ['Delete a template, cancel, delete again, confirm.'], exp: 'Kept after cancel; gone after confirm.',
  async run(env){ const sb = await env.boot(); const t = sb.S.practiceTemplates[0], n = sb.S.practiceTemplates.length; sb.fn('requestDeleteTemplate', t.id); eq(sb.S.confirmDeleteTemplateId, t.id, 'Prompt'); sb.fn('cancelDeleteTemplate'); eq(sb.S.practiceTemplates.length, n, 'After cancel'); sb.fn('requestDeleteTemplate', t.id); sb.fn('confirmDeleteTemplateNow'); eq(sb.S.practiceTemplates.length, n - 1, 'After confirm'); }});
add('TM-015', C.core, 'Session Setup', 'A template chosen on Session Setup sets the session\'s sections and length.', {
  severity: 'Major', tags: ['templates', 'setup', 'build'], steps: ['Pick a template on Setup, continue.'], exp: 'Build uses the template\'s enabled sections and duration.',
  async run(env){
    const sb = await env.boot(); const t = sb.S.practiceTemplates[0]; sb.click('Start New Session'); sb.fn('selectSetupTemplate', t.id); sb.fn('setSetupDuration', t.duration); sb.click('Next: Build Session');
    const want = t.sections.filter(s => s.standard && s.enabled !== false).map(s => s.key); QA.deepEq([...sb.S.enabledPhaseKeys].sort(), want.slice().sort(), 'Enabled phases');
  }});
add('TM-016', C.core, 'Session Setup', 'Template usage is remembered so the most-used templates are offered first.', {
  severity: 'Polish', tags: ['templates', 'setup'], steps: ['Use a template twice.'], exp: 'useCount increases.',
  async run(env){ const sb = await env.boot(); const t = sb.S.practiceTemplates[0]; const before = t.useCount || 0; sb.fn('markTemplateUsed', t.id); eq(t.useCount, before + 1, 'useCount'); assert(t.lastUsedAt, 'lastUsedAt'); }});
add('TM-017', C.data, 'Templates', 'Every stored template has percentages that total 100 and minutes that match its length.', {
  severity: 'Major', tags: ['templates', 'data'], steps: ['Inspect the stored templates.'], exp: 'All consistent.',
  async run(env){ const sb = await env.boot(); sb.S.practiceTemplates.forEach(t => { eq(sb.fn('templateSum', t.id), 100, `"${t.name}" percentage total`); }); }});
add('TM-018', C.vis, 'Template editor', 'Template editor layout on a phone: compact top, toggles outlined, sliders neutral, % signs visible.', {
  type: 'Manual', severity: 'Polish', tags: ['templates', 'visual'], steps: ['Open the editor on a phone in light and dark.'], exp: 'Tidy, nothing clipped, clear selected states.', run: null});

/* ================================================================ SHARING (SH-001 .. SH-014) */
add('SH-001', C.integ, 'Sharing', 'Every saved session is given its own 24-character share token at the moment it is saved.', {
  smoke: true, severity: 'Critical', tags: ['share', 'save'], steps: ['Save several sessions.'], exp: 'Each has a unique 24-character token.',
  async run(env){ const sb = await L.withSaved(env, 5); const t = sb.S.savedSessions.map(s => s.shareToken); t.forEach(x => assert(/^[A-Za-z0-9]{24}$/.test(x), 'Bad token ' + x)); eq(new Set(t).size, 5, 'Distinct tokens'); }});
add('SH-002', C.integ, 'Sharing', 'The share link is the app address plus ?s=<token> and the token is accepted by the link reader.', {
  smoke: true, severity: 'Critical', tags: ['share'], steps: ['Build a share link.'], exp: 'https://.../index.html?s=<token>; passes the token rule.',
  async run(env){ const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const url = sb.fn('shareUrlFor', s.shareToken); assert(/^https?:\/\/.+\?s=[A-Za-z0-9]{24}$/.test(url), 'Link shape: ' + url); assert(sb.e('SHARE_TOKEN_RE').test(s.shareToken), 'Token rejected by SHARE_TOKEN_RE'); }});
add('SH-003', C.integ, 'Sharing', 'Opening your own saved session quietly prepares the link: the token is stored on the server and read back.', {
  severity: 'Major', tags: ['share', 'sync'], steps: ['Open a saved session, wait a moment.'], exp: 'Server has the session; link ready for a one-tap share.',
  async run(env){ const {sb, s} = await L.withShareReady(env); assert(sb.ctx.backend.sessions.has(s.id), 'Server does not have the session'); eq(sb.ctx.backend.sessions.get(s.id).shareToken, s.shareToken, 'Server token'); assert(sb.S.shareReady[s.id].url.includes(s.shareToken), 'Prepared URL'); }});
add('SH-004', C.integ, 'Sharing', 'One tap on Share Session copies the message and opens the phone\'s share sheet with the link.', {
  severity: 'Critical', tags: ['share'], steps: ['Tap Share Session.'], exp: '"Session Link Copied" flash; clipboard has the message; navigator.share receives the link.',
  async run(env){ const {sb, s} = await L.withShareReady(env); sb.click('Share Session', '#content'); await sb.sleep(40); eq(sb.ctx.clipboard.length, 1, 'Clipboard writes'); eq(sb.ctx.shareLog.length, 1, 'Share sheet opened'); assert(sb.ctx.shareLog[0].url.includes(s.shareToken), 'Link not passed to the share sheet'); eq(sb.S.shareFlash, 'ok', 'Flash'); assert(sb.has('Session Link Copied', '#overlay'), 'Flash text'); }});
add('SH-005', C.integ, 'Sharing', 'The message is: session name, "<min> · <age> · <place>", then the "View this session in FT2 Coaches" line and the link.', {
  severity: 'Major', tags: ['share'], steps: ['Share and read the copied text.'], exp: 'Exactly that shape.',
  async run(env){ const {sb, s} = await L.withShareReady(env); sb.click('Share Session', '#content'); await sb.sleep(30); const msg = sb.ctx.clipboard[0]; const lines = msg.split('\n'); eq(lines[0], s.name, 'Line 1'); assert(/^\d+ min( · U\d+)? · (Indoor|Outdoor)$/.test(lines[1]), 'Line 2: ' + lines[1]); eq(lines[3], 'View this session in FT2 Coaches:', 'Line 4'); assert(lines[4].includes('?s=' + s.shareToken), 'Link line'); }});
add('SH-006', C.err, 'Sharing', 'If the phone blocks copying, the coach is told (not shown a false "copied") and the share sheet still opens.', {
  severity: 'Major', tags: ['share'], steps: ['Share with clipboard blocked.'], exp: 'Flash says it couldn\'t copy; share still opens.',
  async run(env){ const {sb} = await L.withShareReady(env, {clipboardWorks: false}); sb.click('Share Session', '#content'); await sb.sleep(80); eq(sb.S.shareFlash, 'fail', 'Flash'); eq(sb.ctx.shareLog.length, 1, 'Share sheet'); }});
add('SH-007', C.integ, 'Shared link', 'A recipient opening the link sees the shared session (read-only) without signing in.', {
  smoke: true, severity: 'Critical', tags: ['share'], timeout: 40000, steps: ['Open the link in a fresh browser.'], exp: 'Shared Session page with the session name and exercises.',
  async run(env){ const {sb, s} = await L.withShareReady(env); const r = await L.recipient(env, sb, s.shareToken); await r.until(() => r.S.sharedStatus === 'ready', 5000, 'the shared session'); eq(r.screen, 'sharedSession', 'Screen'); assert(r.has(s.name, '#content'), 'Name missing'); eq(r.S.savedSessions.length, 0, 'Shared session must not be saved to the recipient'); }});
add('SH-008', C.integ, 'Shared link', 'The shared page shows the details (focus, age, style, place, phases, exercises) with nothing editable.', {
  severity: 'Major', tags: ['share', 'privacy'], timeout: 40000, steps: ['Read the shared page.'], exp: 'Details present; no edit / delete / rate controls.',
  async run(env){ const {sb, s} = await L.withShareReady(env); const r = await L.recipient(env, sb, s.shareToken); await r.until(() => r.S.sharedStatus === 'ready', 5000); ['Shared Session', 'Minutes', 'Exercises', 'Location', 'Activate'].forEach(w => assert(r.has(w, '#content'), 'Missing ' + w)); assert(!r.q('#content .star-btn') && !r.q('#content [onclick*="requestDeleteSession"]') && !r.q('#content .pcard-add-btn'), 'An editing control is visible to the recipient'); }});
add('SH-009', C.err, 'Shared link', 'An unknown or expired link shows a friendly "Session unavailable" page, not an error.', {
  smoke: true, severity: 'Major', tags: ['share', 'errors'], timeout: 40000, steps: ['Open a link with a wrong token.'], exp: '"Session unavailable" + Open FT2.',
  async run(env){ const sb = await env.boot({coach: null, query: '?s=ZZZZZZZZZZZZZZZZZZZZZZZZ'}); await sb.until(() => sb.S.sharedStatus === 'unavailable', 5000, 'unavailable'); assert(sb.has('Session unavailable', '#content'), 'Message'); assert(sb.canClick('Open FT2', '#content'), 'Open FT2 button'); eq(sb.errors.length, 0, 'Script errors'); }});
add('SH-010', C.err, 'Shared link', 'If the server has not been updated for sharing, the recipient is told sharing is not switched on yet.', {
  severity: 'Minor', tags: ['share', 'errors'], timeout: 40000, steps: ['Open a link while the server ignores ?share=.'], exp: '"Sharing isn\'t switched on yet".',
  async run(env){ const {sb, s} = await L.withShareReady(env); sb.ctx.backend.sharingOff = true; const r = await L.recipient(env, sb, s.shareToken); await r.until(() => r.S.sharedStatus === 'unsupported', 5000, 'unsupported'); assert(r.has("isn’t switched on", '#content') || r.has("isn't switched on", '#content'), 'Message'); }});
add('SH-011', C.err, 'Shared link', 'With no connection the recipient sees "Can\'t reach the session" and Try again works once back online.', {
  severity: 'Major', tags: ['share', 'errors', 'offline'], timeout: 40000, steps: ['Open a link offline, reconnect, Try again.'], exp: 'Offline message; then the session loads.',
  async run(env){ const {sb, s} = await L.withShareReady(env); sb.ctx.backend.down = true; const r = await L.recipient(env, sb, s.shareToken); await r.until(() => r.S.sharedStatus === 'offline', 5000, 'offline'); assert(r.canClick('Try again', '#content'), 'No Try again'); sb.ctx.backend.down = false; r.click('Try again', '#content'); await r.until(() => r.S.sharedStatus === 'ready', 5000, 'ready'); }});
add('SH-012', C.nav, 'Shared link', 'From a shared session, an exercise opens with "Back to Shared Session" and returns there.', {
  severity: 'Minor', tags: ['share', 'detail', 'nav'], timeout: 40000, steps: ['Tap an exercise, tap Back.'], exp: 'Returns to the shared page.',
  async run(env){ const {sb, s} = await L.withShareReady(env); const r = await L.recipient(env, sb, s.shareToken); await r.until(() => r.S.sharedStatus === 'ready', 5000); const row = r.q('#content .phase-ex-item:not(.shared-ex-missing)'); assert(row, 'No openable exercise'); row.click(); eq(r.screen, 'detail', 'Detail'); assert(/Shared Session/.test(r.text('#content .nav-back-link')), 'Back label'); r.fn('backFromDetail'); eq(r.screen, 'sharedSession', 'Back'); }});
add('SH-013', C.nav, 'Shared link', 'Open FT2 leaves the shared page, cleans the address and lands on Home (or the who-is-coaching screen for a new person).', {
  severity: 'Minor', tags: ['share', 'nav'], timeout: 40000, steps: ['Tap Open FT2.'], exp: 'Shared state cleared.',
  async run(env){ const {sb, s} = await L.withShareReady(env); const r = await L.recipient(env, sb, s.shareToken); await r.until(() => r.S.sharedStatus === 'ready', 5000); r.click('Open FT2', '#content'); eq(r.S.sharedToken, null, 'sharedToken'); assert(r.screen === 'home', 'Screen ' + r.screen); }});
add('SH-014', C.use, 'Sharing', 'The text message and share sheet read well on a real phone (Messages, WhatsApp, Mail).', {
  type: 'Manual', severity: 'Minor', tags: ['share', 'visual'], steps: ['Share to Messages and to WhatsApp from a real phone.'], exp: 'Message is clear, link opens the session, preview is tidy.', run: null});

/* ================================================================ PRINT / EXPORT (PR-001 .. PR-016) */
const printSession = async (env, n, o) => {
  const sb = await env.boot(Object.assign({live: true}, o || {})); sb.fn('resetBuilderDraft'); sb.S.sessionName = 'Print QA';
  const per = {}; const phases = sb.e('PHASES'); let left = n || 6;
  for(let r = 0; left > 0 && r < 4; r++) phases.forEach(p => { if(left > 0){ const e = sb.exercises().filter(x => x.section === p.section)[r]; if(e){ sb.S.phaseData[p.key].push(e.id); left--; } } });
  sb.fn('completeSession', {skipConfirm: true}); const s = sb.S.savedSessions[0]; return {sb, s};
};
const pdfInfo = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); const txt = new TextDecoder('latin1').decode(buf); return {head: txt.slice(0, 8), pages: (txt.match(/\/Type \/Page /g) || []).length, box: (/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(txt) || []).slice(1).map(Number), eof: txt.trimEnd().endsWith('%%EOF')}; };
add('PR-001', C.core, 'Print / Export', 'Print PDF / Create Image opens a sheet with Format (PDF or Image) and Layout (Pocket, Half Page, Full Page).', {
  smoke: true, severity: 'Critical', tags: ['print'], steps: ['Open a saved session, tap Print PDF / Create Image.'], exp: 'Both formats and the three layouts with their sizes.',
  async run(env){ const sb = await L.withSaved(env, 1); sb.fn('openPrintSheet', sb.S.savedSessions[0].id); const t = sb.overlayText(); ['Print PDF', 'Create Image', 'Pocket', 'Half Page', 'Full Page', '4.25', '5.5', '8.5', '11'].forEach(w => assert(t.includes(w), 'Sheet is missing ' + w)); eq(sb.S.printSheet.format, 'pdf', 'Default format'); eq(sb.S.printSheet.layout, 'pocket', 'Default layout'); }});
add('PR-002', C.data, 'Print / Export', 'The three layouts are exactly Pocket 4.25 x 5.5, Half Page 5.5 x 8.5, Full Page 8.5 x 11 inches.', {
  severity: 'Critical', tags: ['print'], steps: ['Compare with the spec.'], exp: 'Exact sizes.',
  async run(env){ const sb = await env.boot(); const P = sb.e('PRINT_LAYOUTS'); QA.deepEq([P.pocket.w, P.pocket.h, P.half.w, P.half.h, P.full.w, P.full.h], [4.25, 5.5, 5.5, 8.5, 8.5, 11], 'Layout sizes'); }});
add('PR-003', C.integ, 'Print / Export', 'Create PDF makes a valid, single-page PDF whose page size is exactly the chosen layout (all three layouts).', {
  severity: 'Critical', tags: ['print'], timeout: 60000, steps: ['Create a PDF for each layout.'], exp: 'Valid PDF, one page, MediaBox = inches x 72.',
  async run(env){
    const {sb, s} = await printSession(env, 6); const want = {pocket: [306, 396], half: [396, 612], full: [612, 792]};
    for(const k of Object.keys(want)){ const r = await sb.fn('ftRenderPages', s, k); eq(r.canvases.length, 1, k + ' pages'); const info = await pdfInfo(await sb.fn('ftBuildPdf', r.canvases, r.wPt, r.hPt)); eq(info.head.slice(0, 5), '%PDF-', k + ' header'); eq(info.pages, 1, k + ' PDF pages'); QA.deepEq(info.box, want[k], k + ' MediaBox'); assert(info.eof, k + ' has no %%EOF'); }
  }});
add('PR-004', C.integ, 'Print / Export', 'Create Image makes a PNG at the layout\'s exact proportions.', {
  severity: 'Major', tags: ['print'], timeout: 60000, steps: ['Create an image for each layout.'], exp: 'PNG with width/height ratio equal to the page.',
  async run(env){
    const {sb, s} = await printSession(env, 6);
    for(const [k, [w, h]] of Object.entries({pocket: [4.25, 5.5], half: [5.5, 8.5], full: [8.5, 11]})){ const r = await sb.fn('ftRenderPages', s, k); const blob = await sb.fn('ftBuildImage', r.canvases); eq(blob.type, 'image/png', k + ' type'); const bmp = await createImageBitmap(blob); assert(Math.abs(bmp.width / bmp.height - w / h) < 0.01, `${k}: ${bmp.width}x${bmp.height} is not ${w}x${h}`); }
  }});
add('PR-005', C.core, 'Print / Export', 'Sessions with 3, 6, 9 and 12 exercises always fit on exactly one page on every layout.', {
  severity: 'Major', tags: ['print', 'math'], timeout: 120000, steps: ['Create prints for small and large sessions.'], exp: 'One page each time; fit flag true.',
  async run(env){
    const bad = [];
    for(const n of [3, 6, 9, 12]){ const {sb, s} = await printSession(env, n); for(const k of ['pocket', 'half', 'full']){ const r = await sb.fn('ftRenderPages', s, k); if(r.canvases.length !== 1 || !r.fit.fits) bad.push(`${n} exercises on ${k}: pages=${r.canvases.length}, fits=${r.fit.fits}`); } sb.destroy(); }
    assert(!bad.length, bad.join('; '));
  }});
add('PR-006', C.core, 'Print / Export', 'Create PDF shows a preview step ("Your PDF is ready") with Print / Save PDF and Done.', {
  smoke: true, severity: 'Major', tags: ['print'], timeout: 60000, steps: ['Choose Create PDF.'], exp: 'Working spinner, then the preview with two buttons.',
  async run(env){ const {sb, s} = await printSession(env, 6); sb.fn('openPrintSheet', s.id); sb.click('Create PDF', '#overlay'); await sb.until(() => sb.S.printSheet && sb.S.printSheet.step === 'ready', 30000, 'the preview'); ['ready', 'Print / Save PDF', 'Done'].forEach(w => assert(sb.has(w, '#overlay'), 'Missing ' + w)); assert(sb.q('#overlay .pe-preview img'), 'No preview image'); }});
add('PR-007', C.core, 'Print / Export', 'Save / Send closes the sheet once it completes, but stays open if the coach backs out of the share sheet.', {
  severity: 'Major', tags: ['print', 'share'], timeout: 60000, steps: ['Tap Save / Send Image, then cancel; repeat and complete.'], exp: 'Stays open on cancel; closes on success.',
  async run(env){
    const {sb, s} = await printSession(env, 6, {shareAbort: true}); sb.fn('openPrintSheet', s.id); sb.fn('setPrintFormat', 'image'); sb.click('Create Image', '#overlay'); await sb.until(() => sb.S.printSheet.step === 'ready', 30000);
    sb.click('Save / Send Image', '#overlay'); await sb.sleep(120); assert(sb.S.printSheet, 'Sheet closed even though the share was cancelled');
    sb.ctx.shareAbort = false; sb.click('Save / Send Image', '#overlay'); await sb.sleep(120); eq(sb.S.printSheet, null, 'Sheet after a completed share');
  }});
add('PR-008', C.core, 'Print / Export', 'The print header and phase bars carry the title, date, start-to-finish time, length, age, place and each phase\'s clock window.', {
  smoke: true, severity: 'Major', tags: ['print'], steps: ['Read the top of a print.'], exp: 'All present, in order.',
  async run(env){
    const sb = await env.boot({live: true}); sb.click('Start New Session'); sb.fn('setSetupStartTime', '17:00'); sb.fn('setSetupDuration', 75); sb.click('Next: Build Session'); sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('completeSession', {skipConfirm: true});
    const s = sb.S.savedSessions[0]; const m = sb.fn('ftPrintModel', s, sb.e('PRINT_LAYOUTS').half, 0); const icons = m.info.map(i => i.icon); QA.deepEq(icons.slice(0, 3), ['calendar', 'clock', 'stopwatch'], 'Header items'); assert(/5:00/.test(m.info[1].text), 'Time range ' + m.info[1].text); assert(m.groups.every(g => g.timeText), 'A phase bar has no clock window'); eq(m.title, s.name, 'Title');
  }});
add('PR-009', C.core, 'Print / Export', 'Every exercise appears once, numbered 1..N in order, with its minutes.', {
  severity: 'Major', tags: ['print'], steps: ['Compare the print with the session.'], exp: 'N rows, numbered, same minutes.',
  async run(env){ const {sb, s} = await printSession(env, 9); const m = sb.fn('ftPrintModel', s, sb.e('PRINT_LAYOUTS').full, 0); const items = m.groups.flatMap(g => g.items); eq(items.length, s.exCount, 'Rows'); QA.deepEq(items.map(i => i.n), items.map((_, i) => i + 1), 'Numbering'); eq(items.reduce((a, i) => a + i.mins, 0), s.totalMin, 'Minutes'); }});
add('PR-010', C.err, 'Print / Export', 'An exercise that has since been removed from the library prints as "unavailable" instead of failing.', {
  severity: 'Major', tags: ['print', 'errors'], timeout: 40000, steps: ['Print a session containing a removed exercise.'], exp: 'The row says unavailable; the print still builds.',
  async run(env){ const {sb, s} = await printSession(env, 4); s.phases[0].exercises.push({id: 'EX99999', name: 'Removed Exercise Zed', duration: 10}); const m = sb.fn('ftPrintModel', s, sb.e('PRINT_LAYOUTS').half, 0); assert(m.groups.flatMap(g => g.items).some(i => i.unavailable), 'Not flagged unavailable'); const r = await sb.fn('ftRenderPages', s, 'half'); eq(r.canvases.length, 1, 'Pages'); }});
add('PR-011', C.err, 'Print / Export', 'If the live exercise library cannot be reached and the session has exercises the old copy does not know, the coach gets a clear message instead of a wrong print.', {
  severity: 'Major', tags: ['print', 'errors', 'offline'], timeout: 60000, steps: ['Print offline with unknown exercises.'], exp: '"Couldn\'t load the latest exercises" + Try Again.',
  async run(env){
    const sb = await env.boot({fetchMode: 'offline'}); sb.S.savedSessions.push({id: 'Sx', name: 'Offline Print', createdBy: 'QA Coach', totalMin: 10, exCount: 1, targetDuration: 60, location: 'outdoor', phases: [{label: 'Warmup', section: 'Warmup', exercises: [{id: 'EX88888', name: 'Brand New Live Only', duration: 10}]}]});
    sb.fn('openPrintSheet', 'Sx'); sb.click('Create PDF', '#overlay'); await sb.until(() => sb.S.printSheet && sb.S.printSheet.step === 'error', 45000, 'the error state'); eq(sb.S.printSheet.error, 'library', 'Error kind'); assert(sb.canClick('Try Again', '#overlay'), 'No Try Again');
  }});
add('PR-012', C.integ, 'Print / Export', 'File names are tidy: <session-name>-<layout>.pdf / .png.', {
  severity: 'Polish', tags: ['print'], steps: ['Create each file.'], exp: 'e.g. keep-the-ball-session-half.pdf',
  async run(env){ const sb = await env.boot(); eq(sb.fn('ftSlug', 'Mon: Keep the Ball! (U10)'), 'mon-keep-the-ball-u10', 'Slug'); eq(sb.fn('ftSlug', ''), 'session', 'Empty name'); }});
add('PR-013', C.sec, 'Print / Export', 'Closing the print sheet releases the preview file and clears its state.', {
  severity: 'Minor', tags: ['print', 'performance'], timeout: 60000, steps: ['Create, then close the sheet.'], exp: 'No preview kept.',
  async run(env){ const {sb, s} = await printSession(env, 4); sb.fn('openPrintSheet', s.id); sb.click('Create PDF', '#overlay'); await sb.until(() => sb.S.printSheet.step === 'ready', 30000); const ps = sb.S.printSheet; sb.fn('closePrintSheet'); eq(sb.S.printSheet, null, 'Sheet'); eq(ps.previewUrl, '', 'previewUrl released'); }});
add('PR-014', C.nav, 'Print / Export', 'The "Session saved" sheet\'s Print button opens the print sheet for that new session.', {
  severity: 'Major', tags: ['print', 'save'], steps: ['Save, tap Print PDF / Create Image.'], exp: 'Print sheet for that session.',
  async run(env){ const sb = await L.toReview(env); sb.click('Save Session'); const id = sb.S.savedSessions[0].id; sb.click('Print PDF', '#overlay'); eq(sb.S.printSheet.sessionId, id, 'Print sheet session'); }});
add('PR-015', C.core, 'Print / Export', 'Custom sections (beyond the six standard phases) are included in the print.', {
  severity: 'Minor', tags: ['print'], steps: ['Print a session with an extra section.'], exp: 'The section appears as its own bar.',
  async run(env){ const {sb, s} = await printSession(env, 4); s.phases.push({label: 'Cooldown', section: null, exercises: [{id: sb.exercises()[0].id, name: sb.exercises()[0].name, duration: 5}]}); const m = sb.fn('ftPrintModel', s, sb.e('PRINT_LAYOUTS').half, 0); assert(m.groups.some(g => g.label === 'Cooldown'), 'Extra section missing'); }});
add('PR-016', C.vis, 'Print / Export', 'How the PDF and image look: logo, header, phase bars, columns, diagrams, readability at each size.', {
  type: 'Manual', severity: 'Minor', tags: ['print', 'visual'], steps: ['Create each layout for a 6-exercise and a 9-exercise session; view on a phone and (for PDF) print on paper.'], exp: 'Clean, readable, nothing cut off, black square logo top-left.', run: null});

/* ================================================================ PERSISTENCE (P-001 .. P-012) */
add('P-001', C.data, 'Persistence', 'A session being built (name, exercises, length, place, date) survives closing and reopening the app.', {
  smoke: true, severity: 'Critical', tags: ['persistence', 'build'], steps: ['Add exercises, reopen the app.'], exp: 'Draft identical.',
  async run(env){ const sb = await L.startBuild(env); sb.S.sessionName = 'Persist Me'; sb.addExercises(sb.firstIdsPerPhase(2)); const snap = JSON.stringify([sb.S.phaseData, sb.S.sessionName, sb.S.targetDuration, sb.S.practiceLocation, sb.S.practiceDate]); const sb2 = await L.reopen(sb); eq(JSON.stringify([sb2.S.phaseData, sb2.S.sessionName, sb2.S.targetDuration, sb2.S.practiceLocation, sb2.S.practiceDate]), snap, 'Draft after reopen'); }});
add('P-002', C.data, 'Persistence', 'Saved sessions (with ratings, favourites, tokens) survive reopening.', {
  smoke: true, severity: 'Critical', tags: ['persistence', 'saved'], steps: ['Save and rate a session, reopen.'], exp: 'Identical.',
  async run(env){ const sb = await L.withSaved(env, 2); sb.S.savedSessions[0].rating = 4; sb.S.savedSessions[1].favorited = true; const before = JSON.stringify(sb.S.savedSessions.map(s => [s.id, s.rating, s.favorited, s.shareToken, s.exCount])); const sb2 = await L.reopen(sb); eq(JSON.stringify(sb2.S.savedSessions.map(s => [s.id, s.rating, s.favorited, s.shareToken, s.exCount])), before, 'Sessions'); }});
add('P-003', C.data, 'Persistence', 'Reopening in the browser puts the coach back on the screen they were on (Build, Review, a saved session).', {
  severity: 'Major', tags: ['persistence', 'nav'], steps: ['Be on Review, reopen.'], exp: 'Same screen.',
  async run(env){ const sb = await L.toReview(env); const sb2 = await L.reopen(sb); eq(sb2.screen, 'review', 'Screen after reopen'); }});
add('P-004', C.data, 'Persistence', 'Custom Session choices and the generated session persist.', {
  smoke: true, severity: 'Critical', tags: ['persistence', 'custom'], steps: ['Generate a session, reopen.'], exp: 'Same exercises and configuration.',
  async run(env){ const sb = await L.toStep4(env); const ids = L.draftIds(sb).join(','); const cfg = JSON.stringify(sb.S.csReviewCfg); const sb2 = await L.reopen(sb); eq(L.draftIds(sb2).join(','), ids, 'Exercises'); eq(JSON.stringify(sb2.S.csReviewCfg), cfg, 'Config'); }});
add('P-005', C.data, 'Persistence', 'Templates the coach created or edited persist.', {
  smoke: true, severity: 'Critical', tags: ['persistence', 'templates'], steps: ['Create a template, reopen.'], exp: 'Still there with the same sections.',
  async run(env){ const sb = await env.boot(); L.tmplDraft(sb); sb.fn('teSetName', 'Keep Me'); sb.fn('teSetDuration', 60); sb.fn('teSaveTemplate'); const sb2 = await L.reopen(sb); const t = sb2.S.practiceTemplates.find(x => x.name === 'Keep Me'); assert(t, 'Template lost'); eq(t.duration, 60, 'Duration'); eq(sb2.fn('templateSum', t.id), 100, 'Total'); }});
add('P-006', C.data, 'Persistence', 'The "who is coaching" name is remembered; with none stored the app asks first.', {
  smoke: true, severity: 'Critical', tags: ['persistence', 'home'], steps: ['Open with and without a stored name.'], exp: 'Remembered when set; otherwise the question appears and gates the app.',
  async run(env){ const a = await env.boot({coach: 'Pat'}); eq(a.S.coachName, 'Pat', 'Remembered'); a.destroy(); const b = await env.boot({coach: null}); eq(b.S.coachName, '', 'No stored name'); assert(!b.q('#bottomnav .navitem'), 'Navigation shown before a name is chosen'); assert(b.text('#content').length > 10, 'No who-is-coaching screen'); }});
add('P-007', C.data, 'Persistence', 'Bookmarked exercises persist.', { severity: 'Major', tags: ['persistence', 'library'], steps: ['Bookmark, reopen.'], exp: 'Still bookmarked.',
  async run(env){ const sb = await env.boot(); const ids = sb.exercises().slice(0, 3).map(e => e.id); ids.forEach(i => sb.S.bookmarks.add(i)); sb.fn('render'); const sb2 = await L.reopen(sb); ids.forEach(i => assert(sb2.S.bookmarks.has(i), 'Lost bookmark ' + i)); }});
add('P-008', C.data, 'Persistence', 'Exercises the coach created locally persist and merge into the library on reopening.', { severity: 'Major', tags: ['persistence', 'library'], steps: ['Create and save an exercise, reopen.'], exp: 'Present in the library.',
  async run(env){ const sb = await env.boot(); sb.fn('createNewExercise'); const id = sb.S.draftExercise.id; sb.fn('saveDraftExercise'); const sb2 = await L.reopen(sb); assert(sb2.fn('exById', id), 'Local exercise lost'); }});
add('P-009', C.err, 'Persistence', 'Corrupted saved data does not crash the app; it opens with defaults. (Unreadable data and data with the wrong shape, e.g. from a much older version.)', { severity: 'Minor', tags: ['persistence', 'errors'], steps: ['Damage the stored data, open the app.'], exp: 'Home opens normally.',
  async run(env){ const sb = await env.boot({seed: {[QA.KEYS.APP_STATE_KEY]: '{"phaseData": [1,2,3 BROKEN'}}); eq(sb.screen, 'home', 'Screen'); assert(sb.has('Start New Session', '#content'), 'Home missing'); const sb2 = await env.boot({seed: {[QA.KEYS.APP_STATE_KEY]: JSON.stringify({screen: 'build', phaseData: {warmup: 'nope'}, savedSessions: 'x'})}}); assert(sb2.q('#content').children.length > 0, 'Blank screen after odd state'); }});
add('P-010', C.err, 'Persistence', 'If the phone blocks storage (private browsing, full), the app still works.', { severity: 'Major', tags: ['persistence', 'errors'], steps: ['Block storage, use the app.'], exp: 'No crash; saving still works in memory.',
  async run(env){ const sb = await env.boot(); sb.e("Object.defineProperty(window,'localStorage',{configurable:true,get(){ throw new Error('blocked'); }})"); sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('saveAppStateToStorage'); sb.fn('completeSession', {skipConfirm: true}); eq(sb.S.savedSessions.length, 1, 'Saved session'); }});
add('P-011', C.data, 'Persistence', 'Phase choices from Settings (which phases are on, their order, default percentages) persist.', { severity: 'Minor', tags: ['persistence', 'settings'], steps: ['Turn a phase off, reopen.'], exp: 'Still off.',
  async run(env){ const sb = await env.boot(); sb.S.enabledPhaseKeys.delete('athletic'); sb.fn('render'); const sb2 = await L.reopen(sb); assert(!sb2.S.enabledPhaseKeys.has('athletic'), 'Phase came back on'); }});
add('P-012', C.data, 'Persistence', 'Launching from the Home Screen icon always opens Home but keeps all the data.', { severity: 'Minor', tags: ['persistence', 'home'], steps: ['Leave the app on Review, launch from the icon.'], exp: 'Home, draft still there.',
  async run(env){ const sb = await L.toReview(env); sb.flushState(); const store = sb.ctx.store; sb.destroy(); const sb2 = await env.boot({store, standalone: true}); eq(sb2.screen, 'home', 'Screen in Home Screen mode'); eq(sb2.fn('currentTotalMinutes').count, 6, 'Draft kept'); const sb3 = await env.boot({store, standalone: false}); eq(sb3.screen, 'review', 'Screen in a normal browser tab'); }});

QA.register(tests);
})();
