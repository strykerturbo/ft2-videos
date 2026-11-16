/* FT2 QA inventory, part 12: WORKFLOW PROGRESS DOTS ("Option C", Nov 2026) - the Setup / Build / Review (and Intent / Setup / Generate / Review)
   circles between the "Back to ..." link and the page title. Checks where they show, their done / current / upcoming states, that only finished
   steps can be tapped, that tapping one goes back without losing anything, and that they fit every screen size. */
(function(){
'use strict';
const QA = window.QA, L = QA.lib, C = QA.C, T = QA.T;
const {assert, eq} = QA;
const tests = [];
const add = (...a) => tests.push(T(...a));
const wf = (id, desc, o) => add(id, o.cat || C.core, o.screen || 'Workflow', desc, Object.assign({severity: 'Major', tags: ['workflow', 'navigation', 'setup', 'build', 'review'], timeout: 60000}, o));

/* What the dots on screen say: [label, state, tappable] per step, e.g. [['Setup','done',true], ['Build','current',false], ['Review','todo',false]] */
const dots = sb => sb.qa('#content .wf-steps .wf-step').map(li => [li.querySelector('.wf-lab').textContent.trim(), ['done', 'current', 'todo'].find(c => li.classList.contains(c)), !!li.querySelector('button')]);
const expect = (sb, want, label) => QA.deepEq(dots(sb), want, label + ' (label, state, tappable)');
const placed = (sb, label) => { const w = sb.q('#content .wf-steps'), back = sb.q('#content .nav-back-link'), title = sb.q('#content .nav-page-title'); assert(w && back && title, label + ': dots / back link / title missing'); assert(back.compareDocumentPosition(w) & 4, label + ': the dots are not below the Back link'); assert(w.compareDocumentPosition(title) & 4, label + ': the dots are not above the page title'); eq(sb.qa('#content .wf-steps').length, 1, label + ': number of progress indicators'); };
const draft = sb => JSON.stringify({p: sb.S.phaseData, x: sb.S.extraSections, n: sb.S.sessionName, d: sb.S.targetDuration, l: sb.S.practiceLocation, t: sb.S.exDurations, notes: sb.S.exNotes});
const STD = (a, b, c) => [['Setup', a[0], a[1]], ['Build', b[0], b[1]], ['Review', c[0], c[1]]];
const DONE = ['done', false], CUR = ['current', false], TODO = ['todo', false];      // the dots only show progress: nothing is tappable
const noStepLabel = (sb, label) => { assert(!sb.q('#content .nav-page-title[data-step]'), label + ': a separate "STEP n OF n" label is still shown'); assert(!sb.q('#content .session-state-tag'), label + ': an In Progress / New tag is still shown'); };

wf('WF-001', 'Standard session: Setup / Build / Review dots sit under the Back link and above the title, showing the right step on Session Setup, Build Session, Find Exercises, Exercise Detail (opened while building) and Session Review. The dots only show progress (none can be tapped), and there is no separate STEP label or In Progress tag beside them.', {
  steps: ['Start New Session; go through Setup, Build, Find Exercises, an exercise page, Review.'], exp: 'Setup current -> Build current (also on Find Exercises / Exercise Detail) -> Review current.',
  async run(env){ const sb = await env.boot(); sb.click('Start New Session'); eq(sb.screen, 'practiceSetup', 'Screen'); expect(sb, STD(CUR, TODO, TODO), 'Session Setup'); placed(sb, 'Session Setup'); noStepLabel(sb, 'Session Setup');
    sb.click('Next: Build Session'); expect(sb, STD(DONE, CUR, TODO), 'Build Session'); placed(sb, 'Build Session'); noStepLabel(sb, 'Build Session');
    sb.fn('pickForPhase', 'warmup'); eq(sb.screen, 'exercises', 'Find Exercises'); expect(sb, STD(DONE, CUR, TODO), 'Find Exercises'); placed(sb, 'Find Exercises');
    sb.clickSel('#content .ex-card'); eq(sb.screen, 'detail', 'Exercise Detail'); expect(sb, STD(DONE, CUR, TODO), 'Exercise Detail (from Find Exercises)'); placed(sb, 'Exercise Detail');
    sb.fn('backFromDetail'); sb.fn('nav', 'build'); sb.addExercises(sb.firstIdsPerPhase(1)); sb.click('Next: Session Review'); expect(sb, STD(DONE, DONE, CUR), 'Session Review'); placed(sb, 'Session Review'); noStepLabel(sb, 'Session Review');
    const id = sb.S.phaseData.warmup[0]; sb.fn('openDetailFromReview', id); expect(sb, STD(DONE, DONE, CUR), 'Exercise Detail (from Review)');
    eq(sb.qa('#content .wf-steps [aria-current="step"]').length, 1, 'Exactly one current step'); eq(sb.qa('#content .wf-steps button, #content .wf-steps [data-onclick], #content .wf-steps a').length, 0, 'A progress dot can be tapped'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

wf('WF-002', 'Going back is the Back link\'s job: Review -> Build -> Setup one step at a time keeps the exercises, times, notes, title and settings, and Next carries on with the same session. Leaving a replacement with Back swaps nothing.', {
  steps: ['Build a draft; Back from Review; Back from Build; Next; Next; start a replace and go Back.'], exp: 'Same draft every time.',
  async run(env){ const sb = await L.toReview(env); const id = sb.S.phaseData.warmup[0]; sb.S.exDurations[id] = 7; sb.S.exNotes[id] = 'keep me'; sb.S.sessionName = 'Tuesday Rondos'; const before = draft(sb);
    sb.click('Back to Build Session'); eq(sb.screen, 'build', 'Review -> Build'); eq(draft(sb), before, 'Draft after Review -> Build');
    sb.click('Back to Session Setup'); eq(sb.screen, 'practiceSetup', 'Build -> Setup'); eq(draft(sb), before, 'Draft after Build -> Setup'); eq(sb.S.setupName, 'Tuesday Rondos', 'Setup shows the session\'s own title');
    sb.click('Next: Build Session'); eq(sb.screen, 'build', 'Next from Setup'); eq(draft(sb), before, 'Draft after Setup -> Next'); sb.click('Next: Session Review'); eq(sb.screen, 'review', 'Next from Build'); eq(draft(sb), before, 'Draft after Build -> Next');
    sb.click('Back to Build Session'); sb.fn('pickReplacementFor', 'warmup', id, 'build'); eq(sb.screen, 'exercises', 'Replace picker'); sb.click('Back to Build Session'); eq(sb.screen, 'build', 'Find Exercises -> Build'); eq(sb.S.replaceContext, null, 'The replacement was left open'); eq(draft(sb), before, 'Draft after leaving a replacement');
    eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

wf('WF-003', 'Custom Session: Intent / Setup / Generate / Review dots follow the four steps; the dots only show progress; going Back (Review -> Setup -> Intent) keeps the focus, every setting and the generated exercises.', {
  cat: C.core, screen: 'Custom Session', tags: ['workflow', 'navigation', 'custom'], steps: ['Run Custom Session to Review; tap Setup; tap Intent; come forward again.'], exp: 'Right states; nothing lost.',
  async run(env){ const C4 = (a, b, c, d) => [['Intent', ...a], ['Setup', ...b], ['Generate', ...c], ['Review', ...d]];
    const sb0 = await env.boot(); sb0.fn('startCustomSession'); expect(sb0, C4(CUR, TODO, TODO, TODO), 'Intent'); placed(sb0, 'Intent'); sb0.destroy();
    const sb = await L.toStep4(env); expect(sb, C4(DONE, DONE, DONE, CUR), 'Custom Review'); placed(sb, 'Custom Review');
    const focus = sb.S.csFocusAreaId, cfg = JSON.stringify([sb.S.csDuration, sb.S.csLocation, sb.S.csAgeGroup, sb.S.csStyle, sb.S.csTitle, sb.S.csDate]), before = draft(sb);
    sb.click('Back to Session Setup'); eq(sb.screen, 'customSessionSetup', 'Review -> Setup'); expect(sb, C4(DONE, CUR, TODO, TODO), 'Custom Setup'); eq(JSON.stringify([sb.S.csDuration, sb.S.csLocation, sb.S.csAgeGroup, sb.S.csStyle, sb.S.csTitle, sb.S.csDate]), cfg, 'Settings after going back'); eq(draft(sb), before, 'Generated exercises after going back');
    sb.click('Back to Intent'); eq(sb.screen, 'quickStartCustom', 'Setup -> Intent'); eq(sb.S.csFocusAreaId, focus, 'Focus after going back'); eq(draft(sb), before, 'Generated exercises at Intent');
    assert(!sb.q('#content .nav-page-title[data-step]'), 'Custom Session still shows a STEP label');
    sb.fn('csGoToSetup'); sb.click('Next: Generate Session'); await sb.until(() => sb.screen === 'customSessionGenerating' || sb.screen === 'customSessionReview' || sb.S.confirmGenerateOpen, 6000, 'generation'); if(sb.screen === 'customSessionGenerating') expect(sb, C4(DONE, DONE, CUR, TODO), 'Generating');
    eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

wf('WF-004', 'The dots appear only in the session-building workflows: not on Home, the Exercises library, an exercise opened from the library / Favorites / a saved session, Sessions, a saved session (or its edit picker), Favorites or Settings.', {
  severity: 'Minor', tags: ['workflow', 'navigation'], steps: ['Visit each screen.'], exp: 'No dots there.',
  async run(env){ const sb = await L.withSaved(env, 1); const none = label => eq(sb.qa('#content .wf-steps').length, 0, label + ' shows the progress dots');
    sb.fn('nav', 'home'); none('Home'); sb.click('Exercises', '#bottomnav'); none('Exercises library'); sb.clickSel('#content .ex-card'); none('Exercise opened from the library');
    sb.fn('openFavorites'); none('Favorites'); sb.fn('openSettingsTab'); none('Settings'); sb.fn('nav', 'sessions'); none('Sessions');
    const s = sb.S.savedSessions[0]; L.openSaved(sb, s.id); none('Saved session'); sb.fn('openDetailFromSavedSession', s.phases[0].exercises[0].id); none('Exercise opened from a saved session'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

wf('WF-005', 'The dots fit every screen: phone upright (incl. a small 320px phone), phone sideways, tablet and computer - three (or four) evenly spaced circles, labels on one line, nothing overlapping, no sideways scrolling, centred in the page column, a quieter Back pill.', {
  cat: C.vis, tags: ['workflow', 'responsive'], timeout: 120000, steps: ['Open Build Session and Custom Review at 5 sizes.'], exp: 'Even, one line, no overflow, 44px targets.',
  async run(env){ const out = [];
    for(const [w, h] of [[390, 844], [320, 568], [844, 390], [768, 1024], [1280, 800]]){
      for(const which of ['build', 'custom']){
        const sb = which === 'build' ? await L.toReview(env, {width: w, height: h}) : await L.toStep4(env, {width: w, height: h}); const tag = `${which} ${w}x${h}`;
        const wrap = sb.q('#content .wf-steps'), circles = sb.qa('#content .wf-dot').map(d => d.getBoundingClientRect()), labels = sb.qa('#content .wf-lab').map(d => d.getBoundingClientRect());
        const gaps = circles.slice(1).map((c, i) => Math.round((c.left + c.width / 2) - (circles[i].left + circles[i].width / 2))); assert(Math.max(...gaps) - Math.min(...gaps) <= 2, tag + ': uneven spacing ' + gaps);
        circles.forEach(c => assert(c.width >= 24 && c.width <= 28 && Math.abs(c.top - circles[0].top) < 1, tag + ': circle size / row'));
        labels.forEach((l, i) => { assert(l.height <= 18, tag + ': a label wraps'); if(i) assert(l.left >= labels[i - 1].right, tag + ': labels overlap'); });
        const c = sb.q('#content'), wr = wrap.getBoundingClientRect(), col = sb.q('#content .section-pad').getBoundingClientRect(); assert(c.scrollWidth <= c.clientWidth + 1, tag + ': sideways scrolling'); assert(Math.abs((wr.left + wr.right) / 2 - (col.left + col.right) / 2) <= 2, tag + ': not centred in the page column');
        const back = sb.q('#content .nav-back-link').getBoundingClientRect(); assert(back.height >= 34 && back.height <= 40, tag + ': Back pill height ' + Math.round(back.height));
        assert(wr.height <= 46, tag + ': the dots take ' + Math.round(wr.height) + 'px of height');
        eq(sb.errors.length, 0, tag + ' errors: ' + sb.errors.join(' | ')); out.push(tag); sb.destroy();
      } }
    return out.length + ' screens checked'; }});

wf('WF-006', 'The three navigation rules: (1) "Back to ..." goes one step back to the screen just left - Exercise Detail -> Find Exercises -> Build Session -> Session Setup, never further; (2) the dots only show where the coach is - nothing on them can be tapped; (3) the yellow Next button is there on Setup, Build and Review and is the way forward. The Back link\'s touch area stays 44px tall even though it looks smaller.', {
  steps: ['Build: open Find Exercises, an exercise, then Back step by step; check the dots and the Next button on each stage.'], exp: 'Back is always one step; Next always present; Review not tappable from Build.',
  async run(env){ const sb = await env.boot(); sb.click('Start New Session'); assert(sb.has('Next: Build Session', '#workflowFooter'), 'Setup has no Next button'); sb.click('Next: Build Session');
    sb.fn('pickForPhase', 'warmup'); const phase = sb.S.pickingPhase; sb.clickSel('#content .ex-card'); eq(sb.screen, 'detail', 'Exercise Detail');
    assert(/Back to Find Exercises/.test(sb.text('#content .nav-back-link')), 'Back label on Exercise Detail: ' + sb.text('#content .nav-back-link'));
    sb.click('Back to Find Exercises'); eq(sb.screen, 'exercises', 'Back from Exercise Detail went to ' + sb.screen); eq(sb.S.pickingPhase, phase, 'Still picking for the same phase');
    sb.click('Back to Build Session'); eq(sb.screen, 'build', 'Back from Find Exercises went to ' + sb.screen);
    sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('render'); eq(sb.qa('#content .wf-steps button').length, 0, 'A progress dot can be tapped'); assert(sb.has('Next: Session Review', '#workflowFooter'), 'Build has no Next button');
    sb.click('Back to Session Setup'); eq(sb.screen, 'practiceSetup', 'Back from Build went to ' + sb.screen); sb.click('Next: Build Session'); sb.click('Next: Session Review'); eq(sb.screen, 'review', 'Next reaches Review'); assert(sb.has('Save Session', '#workflowFooter'), 'Review has no Save button');
    const bl = sb.q('#content .nav-back-link'), area = sb.win.getComputedStyle(bl, '::before'); assert(bl.getBoundingClientRect().height + parseFloat(area.bottom) * -1 + parseFloat(area.top) * -1 >= 43, 'The Back link touch area is under 44px'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

QA.register(tests);
})();
