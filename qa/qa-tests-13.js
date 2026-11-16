/* FT2 QA inventory, part 13: USABILITY PASS on Home, Session Setup and Build Session (Nov 2026).
   Home: Start New Session first, Continue Session only with a draft, Custom Session kept, Coming Soon reduced to a note.
   Setup: subtitle, Start from Scratch as the main path, templates as a quieter alternative.
   Build: empty phases say so with a phase-named Add button, a plain-words time summary that stays in view, short exercise rows with a
   tappable time, Undo after removing, and the picker saying which phase it is adding to / which exercise it is replacing. */
(function(){
'use strict';
const QA = window.QA, L = QA.lib, C = QA.C, T = QA.T;
const {assert, eq} = QA;
const tests = [];
const add = (...a) => tests.push(T(...a));
const us = (id, screen, desc, o) => add(id, o.cat || C.use, screen, desc, Object.assign({severity: 'Major', tags: ['usability'], timeout: 60000}, o));
const draft = sb => JSON.stringify({p: sb.S.phaseData, x: sb.S.extraSections, n: sb.S.sessionName, t: sb.S.exDurations, notes: sb.S.exNotes});

us('UX-001', 'Home', 'Home puts the session actions first: greeting, Start New Session, Continue Session (only when a draft exists, showing its name, date and length, and opening that draft), Custom Session, then Recent Sessions, Featured Exercise, Club Feed and the Coming Soon note last. Starting a new session with a draft still asks first.', {
  tags: ['usability', 'home'], steps: ['Open Home with and without a draft.'], exp: 'Order as listed; Continue only with a draft.',
  async run(env){ const sb = await env.boot(); const order = () => [...sb.q('#content .hm-page').children].map(e => e.matches('.hm-greet') ? 'greet' : e.matches('.hm-start') ? 'start' : e.matches('.hm-continue') ? 'continue' : e.matches('.hm-custom') ? 'custom' : e.matches('.hm-soon-note') ? 'soon' : /Recent Sessions/.test(e.textContent) ? 'recent' : /Featured Exercise/.test(e.textContent) ? 'featured' : /Club Feed/.test(e.textContent) ? 'feed' : '').filter(Boolean);
    assert(!sb.q('#content .hm-continue'), 'Continue Session shown without a draft'); const o1 = order(); eq(o1[0], 'greet', 'First'); eq(o1[1], 'start', 'Start New Session second'); eq(o1[2], 'custom', 'Custom Session'); eq(o1[o1.length - 1], 'soon', 'Coming Soon is last');
    assert(o1.indexOf('recent') < o1.indexOf('featured') && (o1.indexOf('feed') === -1 || o1.indexOf('featured') < o1.indexOf('feed')), 'Order of the lower sections: ' + o1.join(' > '));
    sb.addExercises(sb.firstIdsPerPhase(1)); sb.S.sessionName = 'Thursday Pressing'; sb.fn('nav', 'home'); const o2 = order(); eq(o2.slice(0, 4).join(' '), 'greet start continue custom', 'Order with a draft');
    const c = sb.q('#content .hm-continue'); assert(/Continue Session/.test(c.textContent) && /Thursday Pressing/.test(c.textContent) && new RegExp(sb.S.targetDuration + ' min').test(c.textContent), 'Continue card: ' + c.textContent.replace(/\s+/g, ' ')); eq(c.tagName, 'BUTTON', 'The whole Continue card is one button');
    const before = draft(sb); c.click(); eq(sb.screen, 'build', 'Continue opens Build'); eq(draft(sb), before, 'The same draft');
    sb.fn('nav', 'home'); sb.click('Start New Session'); assert(sb.screen === 'home' && /in progress|discard|continue/i.test(sb.overlayText()), 'Starting over a draft did not ask first: ' + sb.overlayText().slice(0, 120)); eq(draft(sb), before, 'The draft was touched by asking');
    eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

us('UX-002', 'Session Setup', 'Session Setup is short: title, the subtitle "Set up your practice. You can adjust everything later.", Date / Start Time / Duration / Location in that order, Start from Scratch as the main (selected) path and "Choose a Template" as a quieter link; picking a template still works and then shows as the selected option.', {
  tags: ['usability', 'setup', 'templates'], steps: ['Open Session Setup; check the order; pick a template; go to Build.'], exp: 'As described; Next works.',
  async run(env){ const sb = await env.boot(); sb.click('Start New Session'); eq(sb.screen, 'practiceSetup', 'Screen'); eq(sb.text('#content .nav-page-sub'), 'Set up your practice. You can adjust everything later.', 'Subtitle');
    QA.deepEq(sb.qa('#content .su-row .su-lab').map(e => e.textContent.trim()), ['Date', 'Start Time', 'Duration (min)', 'Location'], 'Field order');
    const scratch = sb.q('#content .su-opt'); assert(/Start from Scratch/.test(scratch.textContent) && /Build your session from the six FT2 phases\./.test(scratch.textContent) && scratch.classList.contains('selected'), 'Start from Scratch is not the selected main option');
    const alt = sb.q('#content .su-alt'); assert(alt && /Choose a Template/.test(alt.textContent), 'No quiet Choose a Template link'); assert(alt.getBoundingClientRect().height < scratch.getBoundingClientRect().height, 'The template link is as big as Start from Scratch'); assert(alt.getBoundingClientRect().height >= 44, 'The template link is too small to tap');
    sb.fn('setSetupDuration', 90); sb.fn('setSetupLocation', 'indoor'); eq(sb.S.setupDuration, 90, 'Duration'); eq(sb.S.setupLocation, 'indoor', 'Location');
    const t = sb.S.practiceTemplates[0]; sb.fn('selectSetupScratch'); sb.q('#content .su-alt').click(); sb.fn('chooseTemplate', t.id); sb.fn('render'); assert(sb.q('#content .su-opt.su-opt-row.selected') && sb.has('Using: ' + t.name, '#content'), 'The chosen template is not shown as selected'); assert(!sb.q('#content .su-alt'), 'The quiet link is still shown after choosing');
    sb.click('Next: Build Session'); eq(sb.screen, 'build', 'Next'); eq(sb.S.activeTemplateId, t.id, 'Template applied'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

us('UX-003', 'Build Session', 'Build Session: an empty phase says "No <Phase> exercises yet" with one "+ Add <Phase> Exercise" button that opens the picker for that phase; a phase with exercises shows minutes and count and the usual Add button; the picker says "Adding to: <Phase>" and, when replacing, "Replacing: <exercise>".', {
  tags: ['usability', 'build'], steps: ['Open Build; read the empty phases; tap an empty phase\'s button; add; start a replace.'], exp: 'Phase-named wording everywhere.',
  async run(env){ const sb = await L.startBuild(env); const rows = () => sb.qa('#content .phase-row');
    rows().forEach(r => { const name = r.querySelector('.phase-row-title').textContent.trim(); eq(r.querySelector('.phase-row-sub').textContent.trim(), `No ${name} exercises yet`, name + ' line'); const b = r.querySelector('.pcard-add-pill'); eq(b.textContent.replace(/\s+/g, ' ').replace(/^\+\s*/, '+ ').trim(), `+ Add ${name} Exercise`, name + ' button'); assert(b.getBoundingClientRect().height >= 44, name + ' button too small'); });
    rows()[2].querySelector('.pcard-add-pill').click(); eq(sb.screen, 'exercises', 'Picker'); eq(sb.S.pickingPhase, 'duels', 'Picking for Duels'); assert(/Adding to: Duels/.test(sb.text('#content .sbb-context')), 'Picker context: ' + sb.text('#content .sbb-context'));
    const id = sb.exerciseBySection('Duels', 2).map(e => e.id); sb.fn('addToPhase', 'duels', id[0]); sb.fn('nav', 'build'); const duels = rows()[2]; assert(/^\d+ min · 1 exercise$/.test(duels.querySelector('.phase-row-sub').textContent.trim()), 'Filled phase line: ' + duels.querySelector('.phase-row-sub').textContent); assert(!duels.querySelector('.pcard-add-wide') && /Add\s*Exercise/.test(duels.querySelector('.pcard-add-pill').textContent), 'A filled phase lost its normal Add button');
    sb.fn('pickReplacementFor', 'duels', id[0], 'build'); const name = sb.fn('exById', id[0]).name; assert(new RegExp('Replacing: ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(sb.text('#content .replace-banner')), 'Replace banner: ' + sb.text('#content .replace-banner')); assert(/Replacing in: Duels/.test(sb.text('#content .sbb-context')), 'Picker context while replacing');
    sb.fn('performReplace', id[1]); eq(sb.screen, 'build', 'After replacing'); QA.deepEq(sb.S.phaseData.duels, [id[1]], 'Replaced without a duplicate'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

us('UX-004', 'Build Session', 'Build Session\'s time summary says "<allocated> of <length> min allocated · N exercises" and "<n> min remaining" / "<n> min over" / "Right on time" in plain words, updates the moment an exercise is added, removed, replaced or its time changed, and stays in view while scrolling.', {
  tags: ['usability', 'build', 'math'], steps: ['Add, change a time, remove, go over; scroll.'], exp: 'Summary always right; stays visible.',
  async run(env){ const sb = await L.startBuild(env, {width: 390, height: 700}); const lbl = () => sb.text('#content .bp-progress-label'), rem = () => sb.text('#content .bp-progress-remaining'); const tgt = sb.S.targetDuration;
    assert(new RegExp('^0 of ' + tgt + ' min allocated').test(lbl()) && rem() === tgt + ' min remaining', 'Empty: ' + lbl() + ' | ' + rem());
    sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('render'); let tot = sb.fn('currentTotalMinutes').total; assert(lbl().startsWith(tot + ' of ' + tgt + ' min allocated'), 'After adding: ' + lbl()); eq(rem(), tgt - tot > 0 ? (tgt - tot) + ' min remaining' : tgt === tot ? 'Right on time' : (tot - tgt) + ' min over', 'Remaining');
    const id = sb.S.phaseData.warmup[0]; sb.clickSel(`#content .build-ex-row[data-ex-id="${id}"] .build-ex-dur`); assert(sb.S.timeSheet && sb.S.timeSheet.id === id, 'The time button did not open Set Exercise Time'); sb.fn('timeSheetSet', 1); sb.clickSel('#overlay .btn-primary'); const tot2 = sb.fn('currentTotalMinutes').total; assert(lbl().startsWith(tot2 + ' of'), 'After changing a time: ' + lbl()); eq(sb.q(`#content .build-ex-row[data-ex-id="${id}"] .build-ex-dur`).textContent.trim(), '1 min', 'Row time');
    sb.S.targetDuration = tot2 - 5; sb.fn('render'); eq(rem(), '5 min over', 'Over'); assert(sb.q('#content .bp-progress-remaining.over'), 'Over is not marked'); sb.S.targetDuration = tot2; sb.fn('render'); eq(rem(), 'Right on time', 'Exactly'); sb.S.targetDuration = tgt; sb.fn('render');
    const c = sb.q('#content'); c.scrollTop = c.scrollHeight; await sb.sleep(30); const r = sb.q('#content .bp-progress').getBoundingClientRect(), cr = c.getBoundingClientRect(); assert(r.top >= cr.top - 1 && r.bottom <= cr.top + 140, 'The time summary scrolled out of view (top ' + Math.round(r.top - cr.top) + ')'); const back = sb.q('#content .nav-sticky-back').getBoundingClientRect(); assert(r.top >= back.bottom - 1, 'The time summary is hidden behind the Back bar (' + Math.round(back.bottom - r.top) + 'px)');
    eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

us('UX-005', 'Build Session', 'Exercise rows on Build Session are quick to scan - name, a time button, a picture, one short line of description (setup, coaching points and variations stay on the exercise page, opened by tapping the row) - with labelled Replace / Remove buttons; removing shows Undo, which puts the exercise back in the same place with its time and notes.', {
  tags: ['usability', 'build', 'notes'], steps: ['Read a row; tap it; remove one; Undo.'], exp: 'Short rows; Undo restores everything.',
  async run(env){ const sb = await L.startBuild(env); const ids = sb.firstIdsPerPhase(2); sb.addExercises({warmup: ids.warmup.slice(0, 2)}); sb.fn('nav', 'build');
    const row = sb.q('#content .build-ex-row'); assert(row.querySelector('.build-ex-name') && row.querySelector('.build-ex-image') && row.querySelector('.build-ex-dur'), 'Row parts'); assert(!row.querySelector('.build-ex-bullets'), 'The long bullet list is still on the row'); const desc = row.querySelector('.build-ex-desc'); if(desc) assert(desc.getBoundingClientRect().height <= 42, 'The description is longer than two lines');
    ['.build-ex-replace', '.build-ex-remove', '.build-ex-dur'].forEach(sel => { const b = row.querySelector(sel); assert(b.getAttribute('aria-label'), sel + ' has no spoken label'); });
    const [a, b] = sb.S.phaseData.warmup; sb.S.exDurations[a] = 13; sb.S.exNotes[a] = 'bring cones'; sb.fn('render'); const before = draft(sb);
    sb.clickSel(`#content .build-ex-row[data-ex-id="${a}"] .build-ex-remove`); QA.deepEq(sb.S.phaseData.warmup, [b], 'Removed'); assert(sb.S.toastUndo && /Removed/.test(sb.overlayText()), 'No Undo offer'); sb.click('Undo', '#overlay'); QA.deepEq(sb.S.phaseData.warmup, [a, b], 'Undo put it back in place'); eq(sb.S.exDurations[a], 13, 'Its time'); eq(sb.S.exNotes[a], 'bring cones', 'Its notes'); eq(draft(sb), before, 'The whole draft');
    sb.clickSel(`#content .build-ex-row[data-ex-id="${a}"]`); eq(sb.screen, 'detail', 'Tapping a row opens the exercise page'); assert(sb.has('Setup', '#content') && sb.has('Coaching', '#content'), 'The exercise page lost its details'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

us('UX-006', 'Home / Setup / Build', 'Home, Session Setup and Build Session fit every screen: phone upright (incl. 320px), phone sideways, tablet and computer - no sideways scrolling, nothing hidden under the Next button / bottom menu, and the main buttons big enough to tap.', {
  cat: C.vis, tags: ['usability', 'responsive'], timeout: 120000, steps: ['Open the three screens at five sizes.'], exp: 'Fits; 44px buttons.',
  async run(env){ const out = [];
    for(const [w, h] of [[390, 844], [320, 568], [844, 390], [768, 1024], [1280, 800]]){
      const sb = await env.boot({width: w, height: h}); sb.addExercises(sb.firstIdsPerPhase(1)); const fits = tag => { const c = sb.q('#content'); assert(c.scrollWidth <= c.clientWidth + 1, tag + ': sideways scrolling'); };
      sb.fn('nav', 'home'); fits(`Home ${w}x${h}`); [sb.q('#content .hm-start'), sb.q('#content .hm-continue'), sb.q('#content .hm-custom')].forEach(b => assert(b && b.getBoundingClientRect().height >= 44, `Home ${w}x${h}: a main button is too small`));
      sb.fn('editPracticeSetup'); fits(`Setup ${w}x${h}`); assert(sb.q('#content .su-alt, #content .su-opt-row').getBoundingClientRect().height >= 44, `Setup ${w}x${h}: template option too small`);
      sb.click('Next: Build Session'); fits(`Build ${w}x${h}`); const c = sb.q('#content'); c.scrollTop = c.scrollHeight; await sb.sleep(30); const last = [...sb.qa('#content .phase-row-wrap')].pop().getBoundingClientRect(), foot = sb.q('#workflowFooter').getBoundingClientRect(); assert(last.bottom <= foot.top + 1 || foot.height === 0, `Build ${w}x${h}: the last phase is hidden under the Next button`);
      eq(sb.errors.length, 0, `Errors at ${w}x${h}: ` + sb.errors.join(' | ')); out.push(`${w}x${h}`); sb.destroy(); }
    return out.join(', ') + ' ok'; }});

us('UX-007', 'Home', 'Start New Session with a draft opens a bottom sheet ("You have a session in progress") showing the real draft - title, date, length, exercise count and whether it is saved - with Resume Session as the main button, Start New Session and Cancel. Resume returns to the exact draft; Cancel, tapping outside and Esc keep it.', {
  tags: ['usability', 'home', 'persistence'], steps: ['Make a draft; Home; Start New Session; read; Resume; again Cancel / outside / Esc.'], exp: 'Real draft details; nothing lost.',
  async run(env){ const sb = await env.boot(); sb.click('Start New Session'); eq(sb.screen, 'practiceSetup', 'No draft: straight to Setup'); assert(!sb.S.confirmNewSessionOpen, 'Sheet shown without a draft');
    sb.click('Next: Build Session'); sb.addExercises(sb.firstIdsPerPhase(1)); sb.S.sessionName = 'Tue Rondo Night'; sb.S.exDurations[sb.S.phaseData.warmup[0]] = 9; sb.fn('nav', 'home'); await sb.sleep(500); const before = draft(sb), n = sb.fn('currentTotalMinutes').count;
    sb.click('Start New Session'); eq(sb.screen, 'home', 'Stayed on Home'); const sheet = sb.q('#overlay .sheet.dsh-sheet'); assert(sheet, 'No bottom sheet'); const t = sb.overlayText();
    ['Current draft', 'You have a session in progress', 'Would you like to pick up where you left off or start fresh?', 'Tue Rondo Night', sb.fn('formatPracticeDateShort', sb.S.practiceDate), `${sb.S.targetDuration} min · ${n} exercises`, 'Draft saved', 'Resume Session', 'Start New Session', 'Cancel'].forEach(x => assert(sb.norm(t).includes(sb.norm(x)), 'Sheet is missing "' + x + '": ' + t.slice(0, 200)));
    const resume = sb.q('#overlay .dsh-resume'), cs = sb.win.getComputedStyle(resume); assert(/247, 255, 0/.test(cs.backgroundColor) && resume.getBoundingClientRect().height >= 48, 'Resume is not the big yellow button'); assert(sb.q('#overlay .dsh-new').getBoundingClientRect().height >= 44 && sb.q('#overlay .dsh-cancel').getBoundingClientRect().height >= 44, 'Buttons too small');
    sb.clickSel('#overlay .dsh-resume'); eq(sb.screen, 'build', 'Resume'); eq(draft(sb), before, 'Resume: same draft'); assert(!sb.S.confirmNewSessionOpen, 'Sheet still open');
    sb.fn('nav', 'home'); sb.click('Start New Session'); sb.clickSel('#overlay .dsh-cancel'); assert(!sb.S.confirmNewSessionOpen && sb.screen === 'home', 'Cancel'); eq(draft(sb), before, 'Cancel: same draft');
    sb.click('Start New Session'); sb.clickSel('#overlay .sheet-backdrop'); assert(!sb.S.confirmNewSessionOpen, 'Tapping outside'); eq(draft(sb), before, 'Outside: same draft');
    sb.click('Start New Session'); sb.doc.dispatchEvent(new sb.win.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await sb.sleep(20); assert(!sb.S.confirmNewSessionOpen, 'Esc'); eq(draft(sb), before, 'Esc: same draft');
    const sb2 = await L.reopen(sb); eq(draft(sb2), before, 'After reopening the app'); eq(sb2.S.savedSessions.length, 0, 'A saved session appeared'); eq(sb2.errors.length, 0, 'Errors: ' + sb2.errors.join(' | ')); }});

us('UX-008', 'Home', 'Only the second step can discard: "Start New Session" in the sheet opens "Discard your current draft?" (naming the draft, red - never yellow - "Discard & Start New", and "Keep Existing Session"); Keep and tapping outside go back to the sheet with the draft intact; Discard & Start New clears the draft once and opens a fresh Session Setup, with no extra saved session.', {
  tags: ['usability', 'home', 'persistence'], steps: ['Draft; Start New Session; Start New Session; Keep; outside; Discard (double tap).'], exp: 'Draft kept until Discard; one clean new session.',
  async run(env){ const sb = await env.boot(); sb.addExercises(sb.firstIdsPerPhase(1)); sb.S.sessionName = 'Old Plan'; sb.fn('nav', 'home'); const before = draft(sb), saved = sb.S.savedSessions.length;
    sb.click('Start New Session'); sb.clickSel('#overlay .dsh-new'); eq(draft(sb), before, 'Draft after the first Start New Session'); assert(!sb.q('#overlay .dsh-sheet'), 'The sheet is still showing under the dialog'); const t = sb.overlayText();
    ['Discard your current draft?', 'Starting a new session will replace your unfinished session. This cannot be undone.', 'Old Plan', 'Discard & Start New', 'Keep Existing Session'].forEach(x => assert(sb.norm(t).includes(sb.norm(x)), 'Dialog is missing "' + x + '"'));
    const danger = sb.q('#overlay .ft-alert-btn.danger'), cs = sb.win.getComputedStyle(danger); assert(!/247, 255, 0/.test(cs.backgroundColor) && /185, 28, 28|252, 165, 165/.test(cs.color), 'Discard is not red: ' + cs.color + ' on ' + cs.backgroundColor);
    sb.click('Keep Existing Session', '#overlay'); assert(sb.q('#overlay .dsh-sheet') && sb.S.confirmNewSessionOpen, 'Keep did not return to the sheet'); eq(draft(sb), before, 'Draft after Keep');
    sb.clickSel('#overlay .dsh-new'); sb.clickSel('#overlay .ft-alert-backdrop'); assert(sb.q('#overlay .dsh-sheet'), 'Tapping outside the dialog did not return to the sheet'); eq(draft(sb), before, 'Draft after tapping outside');
    sb.clickSel('#overlay .dsh-new'); const btn = sb.q('#overlay .ft-alert-btn.danger'); btn.click(); btn.click(); sb.fn('confirmDiscardDraftAndStart');
    eq(sb.screen, 'practiceSetup', 'After Discard & Start New'); eq(sb.fn('currentTotalMinutes').count, 0, 'Old exercises gone'); assert(sb.S.sessionName !== 'Old Plan', 'Old title kept'); assert(!sb.S.confirmNewSessionOpen && !sb.S.confirmDiscardDraftOpen, 'Something is still open'); eq(sb.S.savedSessions.length, saved, 'A saved session was created or removed');
    sb.click('Next: Build Session'); eq(sb.screen, 'build', 'The new session carries on'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

us('UX-009', 'Home', 'The draft sheet and the discard dialog fit phone upright (incl. 320px), phone sideways, tablet and computer: everything visible without scrolling the sheet on a normal phone, nothing under the bottom menu, a centred dialog on a computer.', {
  cat: C.vis, tags: ['usability', 'responsive'], timeout: 90000, steps: ['Open both at five sizes.'], exp: 'Fits.',
  async run(env){ const out = [];
    for(const [w, h] of [[390, 844], [320, 568], [844, 390], [768, 1024], [1280, 800]]){
      const sb = await env.boot({width: w, height: h}); sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('nav', 'home'); sb.click('Start New Session'); const tag = `${w}x${h}`; sb.qa('#overlay .sheet, #overlay .sheet-backdrop').forEach(n => { n.style.transition = 'none'; n.classList.add('is-open'); });      // the hidden test frame does not run the slide-up animation, so finish it by hand
      const sh = sb.q('#overlay .dsh-sheet'), r = sh.getBoundingClientRect(); assert(r.left >= -1 && r.right <= w + 1 && r.bottom <= h + 1 && r.top >= -1, tag + ': the sheet is off screen'); if(h >= 700) assert(sh.scrollHeight <= sh.clientHeight + 1, tag + ': the sheet needs scrolling');
      if(w >= 900) assert(Math.abs((r.left + r.right) / 2 - w / 2) < w * 0.25 && r.bottom < h - 20, tag + ': not a centred dialog on a computer');
      sb.clickSel('#overlay .dsh-new'); await sb.sleep(30); const d = sb.q('#overlay .ft-alert').getBoundingClientRect(); assert(d.left >= 0 && d.right <= w && d.top >= 0 && d.bottom <= h, tag + ': the dialog is off screen');
      eq(sb.errors.length, 0, tag + ' errors: ' + sb.errors.join(' | ')); out.push(tag); sb.destroy(); }
    return out.join(', ') + ' ok'; }});

QA.register(tests);
})();
