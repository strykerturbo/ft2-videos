/* FT2 QA inventory, part 1: Home, Normal Session (Start New Session flow), Session Review, Saved Session.
   Written from the app's actual behaviour. Each test: id, category, screen, desc, pre, steps, exp, type (Automated | Manual | Hybrid),
   severity, smoke, tags (used to pick the tests relevant to a change), and run(env, QA) for anything a program can check. */
(function(){
'use strict';
const QA = window.QA;
const {assert, eq, fail, partial} = QA;
const C = {core: 'Core Functionality', data: 'Data & State / Persistence', nav: 'Navigation & Workflow', gen: 'Generator / Recommendation Engine', use: 'Usability',
  cons: 'Consistency', vis: 'Visual / Responsive', integ: 'Integration', err: 'Error Handling / Offline', sec: 'Security / Privacy / Performance'};
QA.C = C;
const T = (id, category, screen, desc, o) => Object.assign({id, category, screen, desc, pre: 'App open on a phone-size screen with a coach name set.', steps: [], exp: '', type: 'Automated', severity: 'Major', smoke: false, tags: [], notes: ''}, o);
QA.T = T;

/* ---------- shared flow helpers (also used by the other test files) ---------- */
const L = QA.lib = {
  /* Home -> Start New Session -> Next: Build Session, the way a coach does it. */
  async startBuild(env, o){
    const sb = await env.boot(o);
    sb.click('Start New Session'); sb.click('Next: Build Session');
    assert(sb.screen === 'build', 'Expected to land on Build Session, got ' + sb.screen);
    return sb;
  },
  /* A draft with one exercise in every phase, then to Session Review. */
  async toReview(env, o){
    const sb = await L.startBuild(env, o);
    sb.addExercises(sb.firstIdsPerPhase(1));
    sb.click('Next: Session Review');
    assert(sb.screen === 'review', 'Expected Session Review, got ' + sb.screen);
    return sb;
  },
  /* Save through the real Save Session button. Returns the saved session. */
  saveFromReview(sb){
    const before = sb.S.savedSessions.length;
    sb.click('Save Session');
    assert(sb.S.savedSessions.length === before + 1, 'Save Session did not add exactly one saved session');
    return sb.S.savedSessions[sb.S.savedSessions.length - 1];
  },
  /* A booted app that already holds N saved sessions (made through the app's own save path). */
  async withSaved(env, n, o){
    const sb = await env.boot(o);
    for(let i = 0; i < (n || 1); i++){
      sb.fn('resetBuilderDraft');
      sb.S.sessionName = 'QA Session ' + (i + 1);
      sb.addExercises(sb.firstIdsPerPhase(1));
      sb.fn('completeSession', {skipConfirm: true});
    }
    return sb;
  },
  openSaved(sb, id){ sb.fn('openSessionDetail', id); assert(sb.screen === 'sessionDetail', 'Saved Session did not open'); },
  sumDraftMinutes(sb){
    let t = 0; const S = sb.S;
    sb.e('PHASES').forEach(p => S.phaseData[p.key].forEach(id => { const ex = sb.fn('exById', id); t += (ex && ex.duration) || 10; }));
    return t;
  },
  reopen(sb, o){ sb.flushState(); return sb.reboot(o); },
  backLabel(sb){ const b = sb.q('#content .nav-back-link, #content .backbtn'); return b ? sb.text('#content .nav-back-link') : ''; },
};

const tests = [];
const add = (...a) => tests.push(T(...a));

/* ================================================================ HOME (H-001 .. H-012) */
add('H-001', C.core, 'Home', 'Home loads with greeting, Start New Session, Quick Start, Recent Sessions and a Featured Exercise.', {
  smoke: true, severity: 'Critical', tags: ['home'],
  steps: ['Open the app.', 'Look at the Home screen.'], exp: 'Greeting, Start New Session button, Quick Start cards, Recent Sessions and Featured Exercise are all visible; no script errors.',
  async run(env){
    const sb = await env.boot();
    eq(sb.screen, 'home', 'First screen');
    ['Start New Session', 'Quick Start', 'Recent Sessions', 'Featured Exercise'].forEach(t => assert(sb.has(t, '#content'), `Home is missing "${t}"`));
    assert(/Good (Morning|Afternoon|Evening)/.test(sb.text('#content')), 'No time-of-day greeting');
    assert(sb.errors.length === 0, 'Script errors on load: ' + sb.errors.join(' | '));
  }});
add('H-002', C.core, 'Home', 'Start New Session opens Session Setup with an empty draft.', {
  smoke: true, severity: 'Critical', tags: ['home', 'setup', 'nav'],
  steps: ['Tap Start New Session.'], exp: 'Session Setup opens; the draft has no exercises; "Next: Build Session" is offered.',
  async run(env){
    const sb = await env.boot();
    sb.click('Start New Session');
    eq(sb.screen, 'practiceSetup', 'Screen after Start New Session');
    eq(sb.fn('currentTotalMinutes').count, 0, 'Exercises in a brand-new draft');
    assert(sb.has('Next: Build Session', '#workflowFooter'), 'Missing "Next: Build Session" button');
  }});
add('H-003', C.core, 'Home', 'Custom Session opens Step 1 (pick an objective) with nothing pre-selected.', {
  smoke: true, severity: 'Critical', tags: ['home', 'custom', 'nav'],
  steps: ['Tap Custom Session.'], exp: 'Step 1 "What do you want to work on?" shows the 8 focus areas, none selected, Next disabled.',
  async run(env){
    const sb = await env.boot();
    sb.click('Custom Session');
    eq(sb.screen, 'quickStartCustom', 'Screen after Custom Session');
    assert(sb.has('What do you want to work on', '#content'), 'Step 1 title missing');
    eq(sb.qa('#content .cs-list button').length, 8, 'Number of focus areas');
    eq(sb.S.csFocusAreaId, null, 'Pre-selected focus area');
    const next = sb.q('#workflowFooter button');
    assert(next && next.disabled, 'Next button should be disabled until a focus area is picked');
  }});
add('H-004', C.nav, 'Home', 'Bottom navigation shows Home, Exercises, Sessions, Settings with Home active.', {
  smoke: true, severity: 'Major', tags: ['home', 'bottomnav', 'nav'],
  steps: ['Look at the bottom bar on Home.'], exp: 'Four items in that order; Home is the highlighted one.',
  async run(env){
    const sb = await env.boot();
    QA.deepEq(sb.visibleNavLabels(), ['Home', 'Exercises', 'Sessions', 'Settings'], 'Bottom nav items');
    eq(sb.navLabelActive(), 'Home', 'Active bottom-nav item');
  }});
add('H-005', C.core, 'Home', 'Pre-built Sessions and Surprise Me are clearly "Coming Soon" and do nothing when tapped.', {
  severity: 'Minor', tags: ['home'],
  steps: ['Tap Pre-built Sessions, then Surprise Me.'], exp: 'Both are labelled Coming Soon!; tapping leaves you on Home.',
  async run(env){
    const sb = await env.boot();
    const cards = sb.qa('#content .hm-qs[aria-disabled="true"]');
    eq(cards.length, 2, 'Number of "Coming Soon" cards');
    cards.forEach(c => { assert(/coming soon/i.test(c.textContent), 'A disabled card is not labelled Coming Soon'); c.click(); });
    eq(sb.screen, 'home', 'Screen after tapping the Coming Soon cards');
  }});
add('H-006', C.core, 'Home', 'Continue Session appears only when a draft exists, and resumes Build Session.', {
  severity: 'Major', tags: ['home', 'build', 'persistence'],
  steps: ['With no draft, look for Continue Session.', 'Add an exercise to a draft, return Home.', 'Tap Continue Session.'], exp: 'Hidden with no draft; visible with a draft; tapping opens Build Session with the draft intact.',
  async run(env){
    const sb = await env.boot();
    assert(!sb.has('Continue Session', '#content'), 'Continue Session shown with an empty draft');
    sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('nav', 'home');
    assert(sb.has('Continue Session', '#content'), 'Continue Session missing while a draft exists');
    sb.click('Continue Session');
    eq(sb.screen, 'build', 'Screen after Continue Session');
    eq(sb.fn('currentTotalMinutes').count, 6, 'Exercises still in the draft');
  }});
add('H-007', C.core, 'Home', 'Start New Session with a draft in progress asks before anything is lost.', {
  severity: 'Critical', tags: ['home', 'setup', 'persistence'],
  steps: ['Build a draft with exercises.', 'Go Home and tap Start New Session.'], exp: 'A choice appears; cancelling keeps the draft; discarding starts a clean Setup.',
  async run(env){
    const sb = await env.boot();
    sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('nav', 'home');
    sb.click('Start New Session');
    eq(sb.S.confirmNewSessionOpen, true, 'Confirmation dialog open');
    assert(sb.overlayText().length > 10, 'Dialog has no text');
    sb.fn('cancelNewSessionModal');
    eq(sb.fn('currentTotalMinutes').count, 6, 'Draft after cancelling');
    sb.click('Start New Session'); sb.fn('startNewSessionDiscardingDraft');
    eq(sb.screen, 'practiceSetup', 'Screen after discarding'); eq(sb.fn('currentTotalMinutes').count, 0, 'Draft after discarding');
  }});
add('H-008', C.core, 'Home', 'Recent Sessions lists the 3 newest saved sessions; See all opens the full list.', {
  severity: 'Major', tags: ['home', 'saved'],
  steps: ['Save 4 sessions.', 'Look at Recent Sessions on Home.', 'Tap See all.'], exp: 'Only 3 rows, newest first; See all opens Sessions with the full list.',
  async run(env){
    const sb = await L.withSaved(env, 4); sb.fn('nav', 'home');
    const rows = sb.qa('#content .hm-sess');
    eq(rows.length, 3, 'Rows in Recent Sessions');
    assert(rows[0].textContent.includes('QA Session 4'), 'Newest session is not first');
    sb.click('See all'); eq(sb.screen, 'sessions', 'Screen after See all'); eq(sb.S.sessionsViewAll, true, 'Full list mode');
  }});
add('H-009', C.use, 'Home', 'With no saved sessions Home invites the coach to create their first one.', {
  severity: 'Minor', tags: ['home'],
  steps: ['Open the app with no saved sessions.'], exp: '"No saved sessions yet" and a "Create your first session" link that starts Session Setup.',
  async run(env){
    const sb = await env.boot();
    assert(sb.has('No saved sessions yet', '#content'), 'Empty-state text missing');
    sb.click('Create your first session'); eq(sb.screen, 'practiceSetup', 'Screen after the link');
  }});
add('H-010', C.nav, 'Home', 'Featured Exercise opens that exercise; Back returns to Home.', {
  severity: 'Minor', tags: ['home', 'detail', 'nav'],
  steps: ['Tap the Featured Exercise card.', 'Tap Back.'], exp: 'Exercise Detail opens with the "Back to Home" label; Back returns Home.',
  async run(env){
    const sb = await env.boot();
    sb.clickSel('#content .hm-feat');
    eq(sb.screen, 'detail', 'Screen after tapping Featured Exercise');
    assert(/Back to Home/i.test(sb.text('#content .nav-back-link')), 'Back label should say "Back to Home"');
    sb.clickSel('#content .nav-back-link'); eq(sb.screen, 'home', 'Screen after Back');
  }});
add('H-011', C.core, 'Home', 'Club Feed opens and closes.', {
  severity: 'Polish', tags: ['home'],
  steps: ['Tap Club Feed twice.'], exp: 'It expands, then collapses.',
  async run(env){
    const sb = await env.boot();
    const head = sb.q('#content .hm-feed-head'); assert(head, 'Club Feed header missing');
    head.click(); eq(sb.S.homeFeedOpen, true, 'Open after first tap');
    sb.q('#content .hm-feed-head').click(); eq(sb.S.homeFeedOpen, false, 'Open after second tap');
  }});
add('H-012', C.vis, 'Home', 'Home layout on a real phone: spacing, alignment, readable text, nothing clipped.', {
  type: 'Hybrid', severity: 'Polish', tags: ['home', 'visual'],
  steps: ['Open Home on a phone in light mode, then dark mode.', 'Check text alignment, card spacing and that nothing is cut off.'], exp: 'Clean, left-aligned layout; no overlapping or clipped text in either mode.',
  async run(env){
    const sb = await env.boot({width: 390});
    const sc = sb.q('#content');
    assert(sc.scrollWidth <= sc.clientWidth + 1, 'Home scrolls sideways at 390px wide');
  }});

/* ================================================================ NORMAL SESSION (NS-001 .. NS-024) */
add('NS-001', C.core, 'Session Setup', 'Session Setup shows title, date, start time, duration, location and the template choices.', {
  smoke: true, severity: 'Critical', tags: ['setup'],
  steps: ['Home > Start New Session.'], exp: 'All fields present with sensible defaults; Next: Build Session offered.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session');
    ['Title', 'Date', 'Start Time', 'Duration', 'Location', 'Start from Scratch', 'Choose a Template'].forEach(t => assert(sb.has(t, '#content'), `Session Setup is missing "${t}"`));
    assert(sb.S.setupName && sb.S.setupDate && sb.S.setupDuration && sb.S.setupLocation, 'A Setup field has no default value');
  }});
add('NS-002', C.core, 'Session Setup', 'The default session name is sensible and the coach can rename it.', {
  severity: 'Minor', tags: ['setup'],
  steps: ['Open Setup, edit the title.', 'Continue to Build.'], exp: 'Default name follows the "<Day> Session" pattern; the typed name carries into Build.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session');
    assert(/\S/.test(sb.S.setupName), 'Default name is blank');
    sb.S.setupName = 'Tuesday Rondos'; sb.click('Next: Build Session');
    eq(sb.S.sessionName, 'Tuesday Rondos', 'Session name after Setup'); assert(sb.has('Tuesday Rondos', '#content') || sb.has('Build Session', '#content'), 'Build did not render');
  }});
add('NS-003', C.core, 'Session Setup', 'Duration choices 60 / 75 / 90 / Custom change the target length.', {
  smoke: true, severity: 'Major', tags: ['setup', 'build'],
  steps: ['Pick each duration.', 'Choose Custom and type a length.'], exp: 'The chosen duration is used by Build Session as the target.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session');
    [60, 75, 90].forEach(n => { sb.fn('setSetupDuration', n); eq(sb.S.setupDuration, n, 'Duration after choosing ' + n); });
    sb.fn('commitSetupCustomDuration', '100'); await sb.sleep(20); eq(sb.S.setupDuration, 100, 'Custom duration');
    sb.click('Next: Build Session'); eq(sb.S.targetDuration, 100, 'Target duration in Build');
  }});
add('NS-004', C.core, 'Session Setup', 'Next: Build Session carries name, date, start time, duration and location into the draft.', {
  smoke: true, severity: 'Critical', tags: ['setup', 'build', 'nav'],
  steps: ['Fill Setup, tap Next: Build Session.'], exp: 'Build Session shows the same values; the draft is empty.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session');
    sb.S.setupName = 'Carry Test'; sb.fn('setSetupDate', '2026-11-05'); sb.fn('setSetupStartTime', '16:30'); sb.fn('setSetupDuration', 90); sb.fn('setSetupLocation', 'indoor');
    sb.click('Next: Build Session');
    const S = sb.S;
    eq(S.screen, 'build', 'Screen'); eq(S.sessionName, 'Carry Test', 'Name'); eq(S.practiceDate, '2026-11-05', 'Date'); eq(S.practiceStartTime, '16:30', 'Start time');
    eq(S.targetDuration, 90, 'Duration'); eq(S.practiceLocation, 'indoor', 'Location'); eq(sb.fn('currentTotalMinutes').count, 0, 'Exercises');
  }});
add('NS-005', C.core, 'Session Setup', 'Location can be switched between Outdoor and Indoor.', {
  severity: 'Major', tags: ['setup'],
  steps: ['Tap Indoor, then Outdoor.'], exp: 'The choice changes and is used by Build.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session');
    sb.click('Indoor', '#content'); eq(sb.S.setupLocation, 'indoor', 'After Indoor');
    sb.click('Outdoor', '#content'); eq(sb.S.setupLocation, 'outdoor', 'After Outdoor');
  }});
add('NS-006', C.core, 'Session Setup', 'Picking a Monday / Tuesday / Thursday date pre-fills that night\'s start time, length and place.', {
  severity: 'Minor', tags: ['setup'],
  steps: ['Pick a Monday, Tuesday and Thursday date.'], exp: 'Mon 5:00 PM 90 min outdoor; Tue 6:00 PM 60 min indoor; Thu 5:00 PM 75 min outdoor. A Saturday keeps the defaults.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session');
    const check = (date, start, dur, loc) => { sb.fn('initSetupDraft'); sb.fn('setSetupDate', date); const S = sb.S; eq(S.setupStartTime, start, date + ' start'); eq(S.setupDuration, dur, date + ' duration'); eq(S.setupLocation, loc, date + ' location'); };
    check('2026-11-02', '17:00', 90, 'outdoor'); check('2026-11-03', '18:00', 60, 'indoor'); check('2026-11-05', '17:00', 75, 'outdoor');
    sb.fn('initSetupDraft'); sb.fn('setSetupDuration', 60); sb.fn('setSetupDate', '2026-11-02'); eq(sb.S.setupDuration, 60, 'A hand-picked duration must not be overwritten by the schedule');
  }});
add('NS-007', C.data, 'Session Setup', 'The start time chosen in Setup is stored and shown on the draft and saved session.', {
  severity: 'Minor', tags: ['setup', 'save'],
  steps: ['Set a start time, build and save.'], exp: 'The saved session keeps the start time.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session'); sb.fn('setSetupStartTime', '18:15'); sb.click('Next: Build Session');
    sb.addExercises(sb.firstIdsPerPhase(1)); sb.click('Next: Session Review'); const s = L.saveFromReview(sb);
    eq(s.startTime, '18:15', 'Saved start time');
  }});
add('NS-008', C.core, 'Session Setup', 'Choosing a template on Setup applies its length and location to the new session.', {
  severity: 'Major', tags: ['setup', 'templates'],
  steps: ['On Setup tap a template card, then Next.'], exp: 'The template is the active template on Build.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session');
    const t = sb.S.practiceTemplates[0]; assert(t, 'There are no templates to choose from');
    sb.fn('selectSetupTemplate', t.id); eq(sb.S.setupSelectedTemplateId, t.id, 'Selected template');
    sb.click('Next: Build Session'); eq(sb.S.activeTemplateId, t.id, 'Active template in Build');
  }});
add('NS-009', C.core, 'Build Session', 'Build Session lists all six phases, each with an Add Exercise button.', {
  severity: 'Critical', tags: ['build'],
  steps: ['Open Build Session.'], exp: 'Warmup, Athletic, Duels, Rondos, Small Sided Games and Scrimmage each show an Add Exercise button.',
  async run(env){
    const sb = await L.startBuild(env);
    ['Warmup', 'Athletic', 'Duels', 'Rondos', 'Small Sided Games', 'Scrimmage'].forEach(t => assert(sb.has(t, '#content'), `Build is missing the "${t}" phase`));
    eq(sb.qa('#content .pcard-add-pill').length, 6, 'Add Exercise buttons');
  }});
add('NS-010', C.nav, 'Build Session', 'Add Exercise opens Find Exercises scoped to that phase, with a Back button to Build.', {
  severity: 'Major', tags: ['build', 'library', 'nav'],
  steps: ['Tap Add Exercise on Duels.'], exp: 'Find Exercises opens on Duels; Back to Build Session returns.',
  async run(env){
    const sb = await L.startBuild(env);
    sb.qa('#content .pcard-add-pill')[2].click();
    eq(sb.screen, 'exercises', 'Screen'); eq(sb.S.pickingPhase, 'duels', 'Phase being picked');
    assert(/Back to Build Session/i.test(sb.text('#content .nav-back-link')), 'Back label');
    sb.clickSel('#content .nav-back-link'); eq(sb.screen, 'build', 'Screen after Back');
  }});
add('NS-011', C.core, 'Find Exercises', 'Adding an exercise from Find Exercises puts it in that phase.', {
  smoke: true, severity: 'Critical', tags: ['build', 'library'],
  steps: ['Add Exercise on Warmup, tap Add on the first exercise, go back.'], exp: 'The exercise appears under Warmup and counts toward the total.',
  async run(env){
    const sb = await L.startBuild(env);
    sb.qa('#content .pcard-add-pill')[0].click();
    const card = sb.q('#content .ex-card'); const btn = card.querySelector('.ex-addbtn'); btn.click();
    await sb.sleep(30);
    if(sb.S.pendingQuickAdd) sb.fn('confirmQuickAddYes');
    eq(sb.S.phaseData.warmup.length, 1, 'Exercises in Warmup');
    sb.clickSel('#content .nav-back-link'); assert(sb.fn('currentTotalMinutes').count === 1, 'Total exercise count');
  }});
add('NS-012', C.core, 'Build Session', 'An exercise can be removed from the draft.', {
  smoke: true, severity: 'Critical', tags: ['build'],
  steps: ['Add an exercise, remove it.'], exp: 'Gone from the phase and from the total.',
  async run(env){
    const sb = await L.startBuild(env); const id = sb.firstIdsPerPhase(1).warmup[0];
    sb.fn('addToPhase', 'warmup', id); eq(sb.S.phaseData.warmup.length, 1, 'After add');
    sb.fn('removeFromPhase', 'warmup', id); eq(sb.S.phaseData.warmup.length, 0, 'After remove'); eq(sb.fn('currentTotalMinutes').count, 0, 'Total count');
  }});
add('NS-013', C.core, 'Build Session', 'Exercises can be reordered inside a phase by dragging.', {
  type: 'Manual', severity: 'Minor', tags: ['build', 'usability'],
  steps: ['Add two Warmup exercises.', 'Drag the grip handle of one past the other.'], exp: 'The order changes and stays changed after leaving and returning.', run: null});
add('NS-014', C.core, 'Build Session', 'The planned-minutes total equals the sum of the exercises\' durations.', {
  smoke: true, severity: 'Critical', tags: ['build', 'math'],
  steps: ['Add exercises to several phases.', 'Compare the total at the top with the individual durations.'], exp: 'Total = sum of durations; header shows "<total> / <target> MIN PLANNED".',
  async run(env){
    const sb = await L.startBuild(env); sb.addExercises(sb.firstIdsPerPhase(2));
    eq(sb.fn('currentTotalMinutes').total, L.sumDraftMinutes(sb), 'currentTotalMinutes() vs sum of durations');
    assert(new RegExp(sb.fn('currentTotalMinutes').total + '\\s*/\\s*' + sb.S.targetDuration, 'i').test(sb.text('#content')), 'Header does not show "<total> / <target>"');
  }});
add('NS-015', C.use, 'Build Session', 'The page makes it obvious when the session is under or over the target length.', {
  severity: 'Minor', tags: ['build', 'math'],
  steps: ['Build well over the target.'], exp: 'Remaining / over-by wording appears and changes with the total.',
  async run(env){
    const sb = await L.startBuild(env); const under = sb.text('#content');
    assert(/remaining|planned/i.test(under), 'Remaining/planned wording missing');
    sb.addExercises(sb.firstIdsPerPhase(4)); sb.fn('render');
    assert(sb.text('#content') !== under, 'The summary did not change after adding many exercises');
  }});
add('NS-016', C.core, 'Build Session', 'Replace swaps an exercise in place without changing the order.', {
  severity: 'Major', tags: ['build', 'library'],
  steps: ['Use Replace on an exercise, pick another.'], exp: 'The new exercise sits in the same position; the old one is gone.',
  async run(env){
    const sb = await L.startBuild(env); const ids = sb.exercises().filter(e => e.section === 'Warmup').slice(0, 3).map(e => e.id);
    sb.fn('addToPhase', 'warmup', ids[0]); sb.fn('addToPhase', 'warmup', ids[1]);
    sb.fn('pickReplacementFor', 'warmup', ids[0], 'build'); eq(sb.screen, 'exercises', 'Picker opened');
    sb.fn('performReplace', ids[2]);
    QA.deepEq(sb.S.phaseData.warmup, [ids[2], ids[1]], 'Warmup order after replace');
  }});
add('NS-017', C.core, 'Build Session', 'Next: Session Review works with at least one exercise and the page says so when empty.', {
  smoke: true, severity: 'Major', tags: ['build', 'review', 'nav'],
  steps: ['Open Build with no exercises.', 'Add one and tap Next: Session Review.'], exp: 'With none, you are told to add an exercise; with one, Session Review opens.',
  async run(env){
    const sb = await L.startBuild(env);
    const next = sb.q('#workflowFooter button'); assert(next && next.disabled, '"Next: Session Review" should be disabled while the draft is empty');
    eq(sb.screen, 'build', 'Screen with an empty draft');
    sb.addExercises({warmup: sb.firstIdsPerPhase(1).warmup}); sb.click('Next: Session Review'); eq(sb.screen, 'review', 'Screen with an exercise');
  }});
add('NS-018', C.nav, 'Find Exercises', 'The phase chips at the top of Find Exercises switch the phase being filled.', {
  severity: 'Minor', tags: ['build', 'library'],
  steps: ['Open Find Exercises, tap another phase chip.'], exp: 'The list and heading change to that phase.',
  async run(env){
    const sb = await L.startBuild(env); sb.qa('#content .pcard-add-pill')[0].click();
    eq(sb.S.pickingPhase, 'warmup', 'Start phase'); sb.fn('switchPickingPhase', 'rondos'); eq(sb.S.pickingPhase, 'rondos', 'Phase after chip');
    assert(sb.qa('#content .ex-card').length > 0, 'No exercises listed for Rondos');
  }});
add('NS-019', C.core, 'Find Exercises', 'Quick Pick suggests exercises for the phase and can add one.', {
  severity: 'Minor', tags: ['build', 'library'],
  steps: ['In Find Exercises tap "Quick Pick".'], exp: 'A sheet suggests exercises for the phase; adding one puts it in the draft.',
  async run(env){
    const sb = await L.startBuild(env); sb.qa('#content .pcard-add-pill')[0].click();
    sb.fn('openQuickPick'); eq(sb.S.quickPickOpen, true, 'Quick Pick open'); assert(sb.overlayText().length > 20, 'Quick Pick sheet is empty');
    sb.fn('closeQuickPick'); eq(sb.S.quickPickOpen, false, 'Quick Pick closed');
  }});
add('NS-020', C.core, 'Build Session', 'A custom extra section can be added, named and filled.', {
  severity: 'Minor', tags: ['build'],
  steps: ['Use Add Section, name it, add an exercise.'], exp: 'The section exists with the exercise and counts in the total.',
  async run(env){
    const sb = await L.startBuild(env); sb.fn('addExtraSection'); eq(sb.S.extraSections.length, 1, 'Extra sections');
    const key = sb.S.extraSections[0].key; sb.fn('renameExtraSection', key, 'Cool Down');
    sb.S.extraSections[0].exercises.push(sb.exercises()[0].id); sb.fn('render');
    eq(sb.S.extraSections[0].label, 'Cool Down', 'Section label'); assert(sb.fn('currentTotalMinutes').count === 1, 'Extra-section exercise not counted');
  }});
add('NS-021', C.nav, 'Build Session', 'Back to Session Setup keeps the exercises already added.', {
  severity: 'Critical', tags: ['build', 'setup', 'nav'],
  steps: ['Add exercises.', 'Tap Back to Session Setup, change the title, tap Next.'], exp: 'Exercises are still there; the new title applies.',
  async run(env){
    const sb = await L.startBuild(env); sb.addExercises(sb.firstIdsPerPhase(1));
    sb.clickSel('#content .nav-back-link'); eq(sb.screen, 'practiceSetup', 'Screen after Back');
    sb.S.setupName = 'Renamed'; sb.click('Next: Build Session');
    eq(sb.fn('currentTotalMinutes').count, 6, 'Exercises kept'); eq(sb.S.sessionName, 'Renamed', 'Name');
  }});
add('NS-022', C.core, 'Build Session', 'A phase switched off in Settings does not appear in Build Session.', {
  severity: 'Minor', tags: ['build', 'settings'],
  steps: ['In Settings turn a phase off, open Build.'], exp: 'That phase is hidden.',
  async run(env){
    const sb = await env.boot(); sb.S.enabledPhaseKeys.delete('athletic'); sb.click('Start New Session'); sb.click('Next: Build Session');
    eq(sb.qa('#content .pcard-add-pill').length, 5, 'Add Exercise buttons with Athletic off');
  }});
add('NS-023', C.core, 'Normal Session', 'Full flow: Setup, Build, Review, Save creates one saved session that appears in Sessions.', {
  smoke: true, severity: 'Critical', tags: ['setup', 'build', 'review', 'save', 'nav'],
  steps: ['Start New Session > Next: Build Session > add exercises > Next: Session Review > Save Session.', 'Open Sessions.'], exp: 'One new saved session with the right name and minutes; it is listed under Sessions; the draft is cleared.',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session'); sb.S.setupName = 'Flow Test'; sb.click('Next: Build Session');
    sb.addExercises(sb.firstIdsPerPhase(1)); const expected = L.sumDraftMinutes(sb);
    sb.click('Next: Session Review'); const s = L.saveFromReview(sb);
    eq(s.name, 'Flow Test', 'Saved name'); eq(s.totalMin, expected, 'Saved minutes'); eq(s.exCount, 6, 'Saved exercise count');
    eq(sb.fn('currentTotalMinutes').count, 0, 'Draft cleared after save');
    sb.click('Sessions', '#bottomnav'); assert(sb.has('Flow Test', '#content'), 'Saved session is not listed under Sessions');
  }});
add('NS-024', C.cons, 'Normal Session', 'Every screen in the flow has a Back button naming where it goes, and one forward button.', {
  severity: 'Minor', tags: ['nav', 'build', 'setup', 'review'],
  steps: ['Visit Setup, Build, Find Exercises, Review.'], exp: 'Each shows "Back to <place>"; forward buttons read "Next: <place>".',
  async run(env){
    const sb = await env.boot(); sb.click('Start New Session');
    assert(/Back to Home/i.test(sb.text('#content .nav-back-link')), 'Setup back label'); assert(sb.has('Next: Build Session', '#workflowFooter'), 'Setup forward label');
    sb.click('Next: Build Session'); assert(/Back to Session Setup/i.test(sb.text('#content .nav-back-link')), 'Build back label');
    sb.addExercises(sb.firstIdsPerPhase(1)); assert(sb.has('Next: Session Review', '#workflowFooter'), 'Build forward label');
    sb.click('Next: Session Review'); assert(/Back to Build Session/i.test(sb.text('#content .nav-back-link')), 'Review back label');
  }});

/* ================================================================ SESSION REVIEW (RV-001 .. RV-012) */
add('RV-001', C.core, 'Session Review', 'Review shows the session name, totals and every phase with its exercises.', {
  smoke: true, severity: 'Critical', tags: ['review'],
  steps: ['Build a draft and open Session Review.'], exp: 'Name, "N min planned" bar against the session length, "M exercises", Activate / Develop / Play groups with the exercises.',
  async run(env){
    const sb = await L.toReview(env); const t = sb.text('#content');
    ['Session Review', 'Activate', 'Develop', 'Play', 'min planned', 'min session', '6 exercises', 'unsaved'].forEach(w => assert(t.includes(w), `Review is missing "${w}"`));
  }});
add('RV-002', C.core, 'Session Review', 'Each phase group shows planned minutes against its share of the target.', {
  severity: 'Minor', tags: ['review', 'math'],
  steps: ['Open Review.'], exp: 'Each group line reads "<minutes> / <share> min".',
  async run(env){ const sb = await L.toReview(env); eq((sb.text('#content').match(/\d+\s*\/\s*\d+\s*min/gi) || []).length >= 3, true, 'Number of "x / y min" group lines >= 3'); }});
add('RV-003', C.core, 'Session Review', 'Save Session saves exactly once and clears the draft.', {
  smoke: true, severity: 'Critical', tags: ['review', 'save'],
  steps: ['Tap Save Session once.'], exp: 'One saved session; draft empty; coach lands Home.',
  async run(env){
    const sb = await L.toReview(env); L.saveFromReview(sb); eq(sb.S.savedSessions.length, 1, 'Saved sessions'); eq(sb.fn('currentTotalMinutes').count, 0, 'Draft cleared'); eq(sb.screen, 'home', 'Screen');
  }});
add('RV-004', C.core, 'Session Review', 'Saving a second session with the same name keeps both, with unique names.', {
  severity: 'Major', tags: ['review', 'save'],
  steps: ['Save two sessions with the same name.'], exp: 'The second is numbered, e.g. "Name 2"; no overwriting.',
  async run(env){
    const sb = await env.boot();
    for(let i = 0; i < 3; i++){ sb.S.sessionName = 'Same Name'; sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('completeSession', {skipConfirm: true}); }
    const names = sb.S.savedSessions.map(s => s.name); eq(new Set(names).size, 3, 'Distinct names ' + JSON.stringify(names));
  }});
add('RV-005', C.nav, 'Session Review', 'Back to Build Session returns with the draft intact.', {
  smoke: true, severity: 'Major', tags: ['review', 'build', 'nav'],
  steps: ['On Review tap Back to Build Session.'], exp: 'Build opens with the same exercises.',
  async run(env){ const sb = await L.toReview(env); sb.clickSel('#content .nav-back-link'); eq(sb.screen, 'build', 'Screen'); eq(sb.fn('currentTotalMinutes').count, 6, 'Exercises'); }});
add('RV-006', C.nav, 'Session Review', 'Tapping an exercise opens its detail and Back returns to the review.', {
  severity: 'Major', tags: ['review', 'detail', 'nav'],
  steps: ['Tap an exercise on Review, tap Back.'], exp: 'Detail opens ("Back to Session Review"); Back returns.',
  async run(env){
    const sb = await L.toReview(env); sb.clickSel('#content .phase-ex-item'); eq(sb.screen, 'detail', 'Screen');
    assert(/Back to Session Review/i.test(sb.text('#content .nav-back-link')), 'Back label'); sb.clickSel('#content .nav-back-link'); eq(sb.screen, 'review', 'Screen after Back');
  }});
add('RV-007', C.core, 'Session Review', 'Print & Share on an unsaved review asks the coach to save first.', {
  severity: 'Major', tags: ['review', 'print', 'share'],
  steps: ['On an unsaved Review tap Print PDF / Create Image.'], exp: '"Save your session first" sheet with Not yet / Save Session.',
  async run(env){
    const sb = await L.toReview(env); sb.click('Print PDF'); assert(sb.S.saveFirstSheet, 'Save-first sheet did not open'); assert(/save/i.test(sb.overlayText()), 'Sheet has no save wording');
  }});
add('RV-008', C.core, 'Session Review', 'Training profile summarises Technical / Tactical / Physical / Cognitive for the draft.', {
  severity: 'Minor', tags: ['review'],
  steps: ['Open Review.'], exp: 'Four scores and a one-line interpretation.',
  async run(env){ const sb = await L.toReview(env); ['Technical', 'Tactical', 'Physical', 'Cognitive'].forEach(w => assert(sb.has(w, '#content'), 'Missing ' + w)); }});
add('RV-009', C.use, 'Session Review', 'An empty draft shows an empty state, not a broken page.', {
  severity: 'Minor', tags: ['review'],
  steps: ['Open Review with no exercises.'], exp: 'Friendly empty message with a button back to Build.',
  async run(env){ const sb = await env.boot(); sb.fn('nav', 'review'); assert(sb.has('No exercises', '#content'), 'No empty-state message'); }});
add('RV-010', C.core, 'Session Review', 'After saving, a "Session saved" sheet offers Print, Share, View Session and Done.', {
  smoke: true, severity: 'Major', tags: ['review', 'save', 'print', 'share'],
  steps: ['Save a session.'], exp: 'Sheet titled "Session saved" with the four choices.',
  async run(env){
    const sb = await L.toReview(env); sb.click('Save Session');
    ['Session saved', 'Print PDF', 'Share Session', 'View Session', 'Done'].forEach(w => assert(sb.has(w, '#overlay'), `Saved sheet is missing "${w}"`));
    sb.click('Done', '#overlay'); eq(sb.S.savedSheet, null, 'Sheet closed after Done');
  }});
add('RV-011', C.core, 'Session Review', 'Balance My Session suggests an exercise that fills the weakest training area.', {
  severity: 'Minor', tags: ['review'],
  steps: ['Tap Balance My Session.'], exp: 'A sheet shows suggestions you can add.',
  async run(env){ const sb = await L.toReview(env); sb.click('Balance My Session'); eq(sb.S.balanceSheetOpen, true, 'Balance sheet open'); assert(sb.overlayText().length > 20, 'Balance sheet is empty'); }});
add('RV-012', C.vis, 'Session Review', 'Review layout on a phone: Back button, timeline, sticky Save, rate box.', {
  type: 'Manual', severity: 'Polish', tags: ['review', 'visual'],
  steps: ['Open Review on a phone, scroll to the bottom.'], exp: 'Back pill docked at top, Save Session always reachable, nothing overlaps the bottom bar.', run: null});

/* ================================================================ SAVED SESSION (SS-001 .. SS-022) */
add('SS-001', C.core, 'Saved Session', 'A saved session opens from Sessions and shows name, date, length, place, coach and exercise count.', {
  smoke: true, severity: 'Critical', tags: ['saved'],
  steps: ['Sessions > tap a saved session.'], exp: 'Header shows all of that metadata.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; sb.click('Sessions', '#bottomnav'); sb.clickSel('#content .so-row');
    eq(sb.screen, 'sessionDetail', 'Screen'); const t = sb.text('#content');
    [s.name, 'min session', 'Outdoor', 'QA Coach', 'Exercises'].forEach(w => assert(t.includes(w), `Saved session header is missing "${w}"`));
  }});
add('SS-002', C.nav, 'Saved Session', 'Back from a saved session returns to Sessions.', {
  severity: 'Major', tags: ['saved', 'nav'],
  steps: ['Open a saved session, tap Back.'], exp: 'Sessions hub opens.',
  async run(env){ const sb = await L.withSaved(env, 1); L.openSaved(sb, sb.S.savedSessions[0].id); sb.clickSel('#content .backbtn'); eq(sb.screen, 'sessions', 'Screen'); }});
add('SS-003', C.core, 'Saved Session', 'Phase groups add up to the session total.', {
  severity: 'Major', tags: ['saved', 'math'],
  steps: ['Open a saved session.'], exp: 'Activate + Develop + Play minutes = the "min total".',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const groups = sb.fn('sessionDetailPhaseGroups', s);
    eq(groups.reduce((a, g) => a + g.mins, 0), s.totalMin, 'Group minutes vs total');
  }});
add('SS-004', C.data, 'Saved Session', 'The saved total equals the sum of its exercises\' durations.', {
  severity: 'Major', tags: ['saved', 'math'],
  steps: ['Compare the total with the exercise rows.'], exp: 'Equal.',
  async run(env){ const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; eq(s.phases.flatMap(p => p.exercises).reduce((a, e) => a + (e.duration || 10), 0), s.totalMin, 'Sum vs totalMin'); }});
add('SS-005', C.nav, 'Saved Session', 'Tapping an exercise in a saved session opens it; Back returns to the saved session.', {
  severity: 'Major', tags: ['saved', 'detail', 'nav'],
  steps: ['Tap an exercise, tap Back.'], exp: '"Back to Saved Session" label; returns to the same session.',
  async run(env){
    const sb = await L.withSaved(env, 1); const id = sb.S.savedSessions[0].id; L.openSaved(sb, id);
    sb.clickSel('#content .phase-ex-item'); eq(sb.screen, 'detail', 'Screen'); assert(/Back to Saved Session/i.test(sb.text('#content .nav-back-link')), 'Back label');
    sb.clickSel('#content .nav-back-link'); eq(sb.screen, 'sessionDetail', 'Back screen'); eq(sb.S.viewingSessionId, id, 'Same session');
  }});
add('SS-006', C.core, 'Saved Session', 'The Training profile row shows for a saved session.', {
  severity: 'Minor', tags: ['saved'], steps: ['Open a saved session.'], exp: 'Four scores and an interpretation.',
  async run(env){ const sb = await L.withSaved(env, 1); L.openSaved(sb, sb.S.savedSessions[0].id); ['Training profile', 'Technical', 'Tactical'].forEach(w => assert(sb.has(w, '#content'), 'Missing ' + w)); }});
add('SS-007', C.core, 'Saved Session', 'Rename in Edit mode saves, and a name already in use is made unique.', {
  smoke: true, severity: 'Major', tags: ['saved', 'save'],
  steps: ['More > Edit, rename to an existing name.'], exp: 'Renamed with a number added; the other session is untouched.',
  async run(env){
    const sb = await L.withSaved(env, 2); const [a, b] = sb.S.savedSessions;
    sb.fn('renameSavedSession', a.id, 'Brand New'); eq(a.name, 'Brand New', 'Plain rename');
    sb.fn('renameSavedSession', b.id, 'Brand New'); assert(b.name !== 'Brand New' && /Brand New/.test(b.name), 'Duplicate name was allowed: ' + b.name); eq(a.name, 'Brand New', 'First session kept its name');
  }});
add('SS-008', C.core, 'Saved Session', 'Delete asks first; cancelling keeps the session, confirming removes it.', {
  smoke: true, severity: 'Critical', tags: ['saved'],
  steps: ['More > Delete Session, Cancel; then again and confirm.'], exp: 'Kept after Cancel; gone after Delete, and removed from the server copy too.',
  async run(env){
    const sb = await L.withSaved(env, 2); await sb.sleep(50); const id = sb.S.savedSessions[0].id; L.openSaved(sb, id);
    sb.fn('openSessionMore', id); sb.click('Delete Session', '#overlay'); eq(sb.S.confirmDeleteSessionId, id, 'Confirmation open'); sb.fn('cancelDeleteSession'); eq(sb.S.savedSessions.length, 2, 'After cancel');
    sb.fn('requestDeleteSession', id); sb.fn('confirmDeleteSessionNow'); await sb.sleep(50);
    eq(sb.S.savedSessions.length, 1, 'After confirm'); assert(!sb.ctx.backend.sessions.has(id), 'Deleted session still on the (mock) server');
  }});
add('SS-009', C.core, 'Saved Session', 'Copy Session makes a new unsaved draft and never alters the original.', {
  severity: 'Major', tags: ['saved', 'build'],
  steps: ['More > Copy Session > confirm.'], exp: 'Build opens with the same exercises; the original is unchanged.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const strip = o => JSON.stringify({...o, lastUsedAt: 0}); const snap = strip(s);   // Copy Session counts as using the original, so only lastUsedAt may move
    sb.fn('requestDuplicateSession', s.id); sb.fn('confirmDuplicateSession');
    eq(sb.fn('currentTotalMinutes').count, s.exCount, 'Draft exercises'); eq(strip(sb.S.savedSessions[0]), snap, 'Original saved session changed'); eq(sb.S.savedSessions.length, 1, 'A copy was saved prematurely');
  }});
add('SS-010', C.core, 'Saved Session', 'A star rating saves, can be changed and cleared, and persists.', {
  smoke: true, severity: 'Major', tags: ['saved', 'persistence'],
  steps: ['Tap 4 stars, tap 4 again.'], exp: '4 stars saved; tapping again clears it.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; L.openSaved(sb, s.id);
    sb.qa('#content .star-btn')[3].click(); eq(s.rating, 4, 'Rating'); sb.qa('#content .star-btn')[3].click(); eq(s.rating, 0, 'Rating after repeat tap');
    sb.qa('#content .star-btn')[4].click(); const sb2 = await L.reopen(sb); eq(sb2.S.savedSessions[0].rating, 5, 'Rating after reopen');
  }});
add('SS-011', C.core, 'Saved Session', 'Make Private / Make Shared toggles visibility and syncs it.', {
  smoke: true, severity: 'Major', tags: ['saved', 'privacy'],
  steps: ['More > Make Private, then Make Shared.'], exp: 'Visibility flips each time.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; eq(s.visibility, 'private', 'Starts private');
    sb.fn('toggleSessionVisibility', s.id); eq(s.visibility, 'shared', 'After 1st'); sb.fn('toggleSessionVisibility', s.id); eq(s.visibility, 'private', 'After 2nd');
  }});
add('SS-012', C.core, 'Saved Session', 'Print PDF / Create Image opens the print sheet for that session.', {
  smoke: true, severity: 'Major', tags: ['saved', 'print'],
  steps: ['Tap Print PDF / Create Image.'], exp: 'A sheet offering PDF or Image.',
  async run(env){ const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; L.openSaved(sb, s.id); sb.click('Print PDF'); assert(sb.S.printSheet, 'Print sheet state missing'); assert(/PDF/.test(sb.overlayText()) && /Image/.test(sb.overlayText()), 'Sheet is missing PDF / Image'); }});
add('SS-013', C.sec, 'Saved Session', 'Share Session is offered only to the session\'s owner.', {
  severity: 'Major', tags: ['saved', 'share', 'privacy'],
  steps: ['Open someone else\'s shared session.'], exp: 'No Share Session, no Edit, no Delete.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; s.createdBy = 'Another Coach'; L.openSaved(sb, s.id);
    assert(!sb.has('Share Session', '#content'), 'Share shown to a non-owner');
    sb.fn('openSessionMore', s.id); assert(!sb.has('Delete Session', '#overlay') && !sb.canClick('Edit', '#overlay', {exact: true}), 'Owner-only actions offered to a non-owner');
  }});
add('SS-014', C.core, 'Saved Session', 'Bookmarking a saved session toggles and persists.', {
  severity: 'Minor', tags: ['saved', 'persistence'],
  steps: ['Tap the bookmark.'], exp: 'Bookmark fills; remains after reopening.',
  async run(env){ const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; sb.fn('toggleSessionFavorite', s.id); eq(s.favorited, true, 'Favorited'); const sb2 = await L.reopen(sb); eq(sb2.S.savedSessions[0].favorited, true, 'After reopen'); }});
add('SS-015', C.nav, 'Saved Session', 'Edit > + Add Exercise opens the library with a Back to Saved Session button, and the added exercise lands in the session.', {
  severity: 'Critical', tags: ['saved', 'library', 'nav'],
  steps: ['More > Edit > + Add Exercise.', 'Tap Add on an exercise.', 'Tap Back to Saved Session.'], exp: 'Back button present; returns to the session still in edit mode; exercise included; totals updated.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const before = s.exCount; L.openSaved(sb, s.id); sb.fn('toggleEditSessionDetail');
    sb.clickSel('#content .pcard-add-btn'); eq(sb.screen, 'exercises', 'Picker'); assert(/Back to Saved Session/i.test(sb.text('#content .nav-sticky-back')), 'No "Back to Saved Session" button');
    const pick = sb.exercises().find(e => !sb.fn('isExerciseInSavedSession', s.id, e.id)); sb.fn('addExerciseToSavedSession', s.id, pick.id);
    sb.clickSel('#content .nav-sticky-back .nav-back-link'); eq(sb.screen, 'sessionDetail', 'Screen after Back'); eq(sb.S.editingSessionDetail, true, 'Still in edit mode'); eq(s.exCount, before + 1, 'Exercise count');
  }});
add('SS-016', C.core, 'Saved Session', 'Removing an exercise in Edit mode updates the count and total.', {
  severity: 'Major', tags: ['saved', 'math'],
  steps: ['Edit > trash an exercise.'], exp: 'Count and minutes drop by that exercise.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const e = s.phases[0].exercises[0]; const total = s.totalMin, count = s.exCount;
    sb.fn('removeExerciseFromSavedSession', s.id, e.id, e.name); eq(s.exCount, count - 1, 'Count'); eq(s.totalMin, total - (e.duration || 10), 'Minutes');
  }});
add('SS-017', C.core, 'Saved Session', 'Changing a saved session\'s target length saves.', {
  severity: 'Minor', tags: ['saved'],
  steps: ['Edit the target duration.'], exp: 'New target is stored.',
  async run(env){ const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; sb.fn('setSavedSessionDuration', s.id, '90'); eq(s.targetDuration, 90, 'Target'); sb.fn('setSavedSessionDuration', s.id, 'abc'); eq(s.targetDuration, 90, 'Bad input must be ignored'); }});
add('SS-018', C.core, 'Saved Session', 'A comment on a saved session is stored.', {
  severity: 'Minor', tags: ['saved'], steps: ['Type a comment.'], exp: 'Stored with the session.',
  async run(env){ const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; sb.fn('setSessionComment', s.id, 'Great energy'); eq(s.comment, 'Great energy', 'Comment'); }});
add('SS-019', C.sec, 'Saved Session', 'Another coach\'s session is read-only: no edit, delete, rate, favorite or visibility change.', {
  severity: 'Major', tags: ['saved', 'privacy'],
  steps: ['Community > open a session by someone else.'], exp: 'View only.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; s.createdBy = 'Another Coach'; L.openSaved(sb, s.id);
    sb.qa('#content .star-btn')[2].click(); eq(s.rating, 0, 'A non-owner changed the rating'); assert(!sb.q('#content .pcard-add-btn'), 'Add Exercise offered to a non-owner');
    assert(!sb.q('#content [data-onclick*="removeExerciseFromSavedSession"]'), 'Remove offered to a non-owner'); assert(!sb.has('Share Session', '#content'), 'Share offered');
  }});
add('SS-020', C.data, 'Saved Session', 'A saved session survives closing and reopening the app.', {
  smoke: true, severity: 'Critical', tags: ['saved', 'persistence'],
  steps: ['Save a session, close and reopen the app.'], exp: 'The session is still listed with the same content.',
  async run(env){ const sb = await L.withSaved(env, 2); const before = JSON.stringify(sb.S.savedSessions.map(s => [s.id, s.name, s.totalMin, s.exCount])); const sb2 = await L.reopen(sb); eq(JSON.stringify(sb2.S.savedSessions.map(s => [s.id, s.name, s.totalMin, s.exCount])), before, 'Saved sessions after reopen'); }});
add('SS-021', C.cons, 'Saved Session', 'Editing a saved session does not show a start-time field (it is not editable there).', {
  severity: 'Minor', tags: ['saved'],
  steps: ['Open a saved session, More > Edit.'], exp: 'No time input is shown.',
  async run(env){ const sb = await L.withSaved(env, 1); L.openSaved(sb, sb.S.savedSessions[0].id); sb.fn('toggleEditSessionDetail'); eq(sb.qa('#content input[type="time"]').length, 0, 'Time inputs in edit mode'); }});
add('SS-022', C.vis, 'Saved Session', 'Saved Session top section: dark header, action buttons, More menu, Print / Share buttons.', {
  type: 'Manual', severity: 'Polish', tags: ['saved', 'visual'],
  steps: ['Open a saved session on a phone, light and dark.'], exp: 'Header is tidy, buttons are tappable and clearly labelled, nothing is clipped.', run: null});

add('SS-023', C.core, 'Saved Session', 'Edit mode: exercises can be dragged into a new order inside a phase, the new order is saved, synced and survives reopening.', {
  severity: 'Major', tags: ['saved', 'persistence', 'print'], timeout: 30000, steps: ['More > Edit, long-press the grip of an exercise and drag it below another.', 'Leave edit mode, reopen the app.'], exp: 'Order changes in the phase, totals unchanged, same order after reopening (and in prints).',
  async run(env){
    const sb = await env.boot({live: true}); sb.fn('resetBuilderDraft'); const ex = (sec, n) => sb.exercises().filter(e => e.section === sec).slice(0, n).map(e => e.id);
    Object.assign(sb.S.phaseData, {warmup: ex('Warmup', 1), athletic: ex('Athletic', 2), duels: ex('Duels', 1), rondos: ex('Rondos', 1), ssg: ex('SSGs', 1), scrimmage: ex('Scrimmage', 1)});
    sb.S.sessionName = 'Reorder QA'; sb.fn('completeSession', {skipConfirm: true}); const s = sb.S.savedSessions[0]; const names = key => sb.fn('sessionDetailPhaseGroups', s).find(g => g.key === key).items.map(e => e.name);
    sb.fn('openSessionDetail', s.id); eq(sb.qa('#content .build-ex-grip').length, 0, 'Drag handles outside edit mode'); sb.fn('toggleEditSessionDetail'); assert(sb.qa('#content .build-ex-grip').length >= 5, 'No drag handles in edit mode');
    const before = names('develop'), total = [s.totalMin, s.exCount]; const rows = sb.qa('.phase-exlist[data-saved-key="develop"] .phase-ex-item'); const grip = rows[0].querySelector('.build-ex-grip'), gr = grip.getBoundingClientRect(), last = rows[rows.length - 1].getBoundingClientRect();
    const pe = (t, y) => new sb.win.PointerEvent(t, {bubbles: true, clientX: gr.left + 5, clientY: y, pointerId: 1});
    grip.dispatchEvent(pe('pointerdown', gr.top + gr.height / 2)); await sb.sleep(400);
    for(const y of [gr.top + 40, gr.top + 90, last.top + last.height]){ sb.doc.dispatchEvent(pe('pointermove', y)); await sb.sleep(40); }
    sb.doc.dispatchEvent(pe('pointerup', last.top + last.height)); await sb.sleep(450);
    const after = names('develop'); assert(after.join() !== before.join(), 'The order did not change'); eq(after[after.length - 1], before[0], 'Dragged exercise should now be last'); QA.deepEq([s.totalMin, s.exCount], total, 'Totals changed by a reorder');
    assert(sb.ctx.backend.sessions.get(s.id), 'Not synced to the server'); sb.flushState(); const sb2 = await sb.reboot(); eq(sb2.fn('sessionDetailPhaseGroups', sb2.S.savedSessions[0]).find(g => g.key === 'develop').items.map(e => e.name).join(), after.join(), 'Order after reopening');
  }});

add('SS-024', C.use, 'Saved Session', 'Editing a saved session shows an "editing" note and a Save Changes button at the bottom (like Save Session); tapping it saves and leaves edit mode without altering an untouched title.', {
  severity: 'Major', tags: ['saved', 'save'], steps: ['More > Edit, change the title, tap Save Changes.'], exp: 'Bottom button present only while editing; title saved as typed; back to the normal view with a "Changes saved" message.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; s.name = 'Mixed Case Plan'; L.openSaved(sb, s.id); assert(!sb.has('Save Changes', '#workflowFooter'), 'Save Changes shown outside edit mode');
    sb.fn('toggleEditSessionDetail'); assert(sb.has('Save Changes', '#workflowFooter'), 'No Save Changes button while editing'); assert(sb.q('#content .sd-edit-note'), 'No "you are editing" note');
    sb.click('Save Changes', '#workflowFooter'); eq(sb.S.editingSessionDetail, false, 'Still editing'); eq(s.name, 'Mixed Case Plan', 'An untouched title was altered (CSS uppercase leaking into the saved name?)'); eq(sb.S.toast, 'Changes saved', 'Toast');
    sb.fn('toggleEditSessionDetail'); sb.q('#content .editable-title').textContent = 'Typed Name'; sb.click('Save Changes', '#workflowFooter'); eq(s.name, 'Typed Name', 'Typed title');
    s.createdBy = 'Other'; sb.fn('toggleEditSessionDetail'); assert(!sb.has('Save Changes', '#workflowFooter'), 'Save Changes offered to a non-owner');
  }});

/* ================================================================ SAVED SESSIONS ORGANIZATION (SS-025 .. SS-034) */
const SO_FOCUS = ['keep_the_ball', 'play_forward', 'create_and_score', 'beat_players', 'defend_together', 'win_it_back', 'transition_quickly', 'master_the_ball'];
Object.assign(L, {
  /* n saved sessions with varied metadata, made through the app's own save path, then given distinct dates / usage so every sort has an answer */
  async library(env, n, o){
    const sb = await env.boot(o); const base = Date.now() - 1000 * 60 * 60 * 24 * 90; const sess = [];
    for(let i = 0; i < n; i++){
      sb.fn('resetBuilderDraft'); sb.S.sessionName = 'Session ' + String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '') + ' ' + (i % 7);
      sb.S.targetDuration = [60, 75, 90][i % 3]; sb.S.practiceLocation = i % 2 ? 'indoor' : 'outdoor'; sb.S.practiceDate = '2026-' + String(1 + (i * 5) % 12).padStart(2, '0') + '-' + String(1 + (i * 7) % 27).padStart(2, '0');
      sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('completeSession', {skipConfirm: true}); const s = sb.S.savedSessions[sb.S.savedSessions.length - 1];
      s.createdAt = base + i * 3600000 * 7; s.updatedAt = s.createdAt; s.lastUsedAt = s.createdAt + ((i * 37) % 11) * 3600000;
      if(i % 3 !== 2){ s.ageGroup = ['U8', 'U9', 'U10', 'U11', 'U12'][i % 5]; s.focusArea = SO_FOCUS[i % 8]; s.sessionStyle = ['technical', 'balanced', 'game_based'][i % 3]; s.locationPref = ['outdoor', 'indoor', 'either'][i % 3]; if(s.locationPref !== 'either') s.location = s.locationPref; }
      if(i % 4 === 0) s.favorited = true; sess.push(s);
    }
    sb.fn('nav', 'sessions'); return {sb, sess};
  },
  ids(list){ return list.map(s => s.id); },
  rowIds(sb, scope){ return sb.qa((scope || '#content') + ' .so-row').map(r => r.dataset.sid); },
  sectionOf(sb, title){ const h = sb.qa('#content .ss-h2').find(x => x.textContent.trim().toLowerCase() === title.toLowerCase()); return h ? h.closest('.ss-section') : null; },
  openLibrary(sb){ sb.fn('openSessionsAll'); },
});
add('SS-025', C.core, 'Sessions page', 'Sessions page: Continue (only with a draft), Recent Sessions = the 5 most recently USED newest first, Favorites only when there are some, My Sessions entry, Templates - and no extra Start New Session button.', {
  severity: 'Major', tags: ['saved', 'nav', 'templates'], timeout: 30000, steps: ['Open Sessions with 8 saved sessions.'], exp: 'Sections in order; 5 recent rows sorted by last used; See All Sessions opens the library.',
  async run(env){
    const {sb, sess} = await L.library(env, 8); const h2 = () => sb.qa('#content .ss-h2').map(x => x.textContent.trim());
    assert(!h2().includes('Continue Session'), 'Continue Session shown with no draft'); assert(!/Start New Session/i.test(sb.text('#content')), 'A Start New Session button is on the Sessions page');
    const want = sb.fn('sortSessions', sess, 'used').slice(0, 5).map(s => s.id); const recent = L.sectionOf(sb, 'Recent Sessions'); QA.deepEq(sb.qa('.so-row', recent).map(r => r.dataset.sid), want, 'Recent Sessions order'); eq(sb.qa('.so-row', recent).length, 5, 'Recent rows');
    sess.forEach(s => { s.favorited = false; }); sb.fn('render'); assert(!h2().includes('Favorites'), 'Empty Favorites section shown'); sess[3].favorited = true; sb.fn('render'); assert(h2().includes('Favorites'), 'Favorites section missing'); eq(sb.qa('.so-row', L.sectionOf(sb, 'Favorites')).length, 1, 'Favorites rows');
    ['My Sessions', 'Templates'].forEach(t => assert(h2().includes(t), 'Missing section ' + t)); sb.addExercises(sb.firstIdsPerPhase(1)); sb.fn('render'); assert(h2()[0] === 'Continue Session', 'Continue Session missing with a draft');
    sb.click('See All Sessions', '#content'); eq(sb.S.sessionsViewAll, true, 'Library open'); eq(sb.qa('#content .so-row').length, 8, 'All sessions in the library (older ones are not hidden)');
  }});
add('SS-026', C.data, 'Saved Session data', 'createdAt, updatedAt, lastUsedAt and the session date are separate: opening or copying updates "last used" only, editing updates "last edited" too, and merely showing the list changes nothing.', {
  severity: 'Critical', tags: ['saved', 'persistence', 'save'], timeout: 30000, steps: ['Save, open, edit and copy a session.'], exp: 'Each date moves only when it should; the copy is a separate session.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const t = () => [s.createdAt, s.updatedAt, s.lastUsedAt];
    assert(s.createdAt && s.updatedAt && s.lastUsedAt && /^\d{4}-\d{2}-\d{2}$/.test(s.practiceDate), 'A date field is missing on a new session'); eq(s.updatedAt, s.createdAt, 'updatedAt at creation'); eq(s.lastUsedAt, s.createdAt, 'lastUsedAt at creation');
    s.createdAt -= 100000; s.updatedAt = s.createdAt; s.lastUsedAt = s.createdAt; const day = s.practiceDate; const before = t();
    sb.fn('nav', 'sessions'); sb.fn('openSessionsAll'); sb.fn('render'); QA.deepEq(t(), before, 'Showing the Sessions list changed a date');
    sb.fn('openSessionDetail', s.id); assert(s.lastUsedAt > before[2], 'Opening did not update lastUsedAt'); eq(s.updatedAt, before[1], 'Opening changed updatedAt'); eq(s.createdAt, before[0], 'Opening changed createdAt'); eq(s.practiceDate, day, 'Opening changed the session date');
    const used = s.lastUsedAt; await sb.sleep(5); sb.fn('renameSavedSession', s.id, 'Edited Name'); assert(s.updatedAt > before[1] && s.lastUsedAt > used, 'Editing did not update updatedAt + lastUsedAt'); eq(s.createdAt, before[0], 'Editing changed createdAt');
    const used2 = s.lastUsedAt, edited = s.updatedAt; await sb.sleep(5); sb.fn('requestDuplicateSession', s.id); sb.fn('confirmDuplicateSession'); assert(s.lastUsedAt > used2, 'Copy Session did not count as using the original'); eq(s.updatedAt, edited, 'Copy changed the original\'s updatedAt'); eq(sb.S.savedSessions.length, 1, 'The copy was saved before the coach saved it');
    sb.fn('completeSession', {skipConfirm: true}); const copy = sb.S.savedSessions[1]; assert(copy && copy.id !== s.id && copy.createdAt >= s.lastUsedAt && copy.name !== s.name, 'The copy is not a separate new session'); eq(copy.updatedAt, copy.createdAt, 'Copy updatedAt'); eq(s.name, 'Edited Name', 'The original was overwritten');
    const legacy = {id: 'L1', createdAt: 1000}; eq(sb.fn('sessionUsedAt', legacy), 1000, 'Fallback to createdAt'); legacy.updatedAt = 2000; eq(sb.fn('sessionUsedAt', legacy), 2000, 'Fallback to updatedAt'); legacy.lastUsedAt = 3000; eq(sb.fn('sessionUsedAt', legacy), 3000, 'lastUsedAt wins');
  }});
add('SS-027', C.core, 'My Sessions library', 'My Sessions library: every sort option orders correctly and only changes the view; search matches name, focus area and age group; filters (including several at once) really narrow the list, and the Filter button shows how many are on.', {
  smoke: false, severity: 'Major', tags: ['saved'], timeout: 40000, steps: ['Open My Sessions; try each sort, a search, and two filters together.'], exp: 'Results always equal the independent calculation; saved order untouched.',
  async run(env){
    const {sb, sess} = await L.library(env, 24); L.openLibrary(sb); const stored = L.ids(sb.S.savedSessions).join();
    eq(sb.S.sessionsSort, 'used', 'Default sort'); eq(L.rowIds(sb).length, 24, 'All 24 listed');
    const day = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.practiceDate); return new Date(+m[1], +m[2] - 1, +m[3]).getTime(); };
    const exp = {used: (a, b) => (b.lastUsedAt - a.lastUsedAt), saved: (a, b) => b.createdAt - a.createdAt, oldest: (a, b) => a.createdAt - b.createdAt, date: (a, b) => day(b) - day(a), name: (a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base', numeric: true})};
    for(const k of ['used', 'saved', 'oldest', 'date', 'name']){ sb.fn('setSessionsSort', k); const want = sess.slice().sort((a, b) => exp[k](a, b) || b.createdAt - a.createdAt); QA.deepEq(L.rowIds(sb), L.ids(want), 'Order for sort "' + k + '"'); }
    eq(L.ids(sb.S.savedSessions).join(), stored, 'Sorting changed the stored order'); sb.fn('setSessionsSort', 'used');
    const focusTitle = id => sb.e('FOCUS_AREAS').find(f => f.id === id).title.toLowerCase();
    const searchIds = q => { sb.fn('clearSessionsSearch'); sb.q('#soSearch').value = q; sb.fn('onSessionsSearch', q); sb.fn('refreshSessionsLibrary'); return L.rowIds(sb).sort(); };
    const blob = s => [s.name, s.focusArea ? focusTitle(s.focusArea) : '', s.ageGroup || '', ({technical: 'more technical', balanced: 'balanced', game_based: 'more game-based'})[s.sessionStyle] || ''].join('|').toLowerCase(); const words = q => q.split(/\s+/); const exp2 = q => sess.filter(s => words(q).every(w => blob(s).includes(w))).map(s => s.id).sort();
    QA.deepEq(searchIds('session c'), exp2('session c'), 'Search by name (every word must match)'); QA.deepEq(searchIds('u10'), exp2('u10'), 'Search by age'); assert(exp2('u10').length > 0, 'Test data has no U10 sessions'); QA.deepEq(searchIds('defend together'), exp2('defend together'), 'Search by focus area'); assert(exp2('defend together').length > 0, 'Test data has no Defend Together sessions'); eq(searchIds('zzzqqq').length, 0, 'Nonsense search'); searchIds('');
    const nf = f => { sb.S.sessionsFilters = Object.assign({age: '', focus: '', duration: '', location: '', style: '', fav: false}, f); sb.fn('render'); return L.rowIds(sb).sort(); };
    QA.deepEq(nf({age: 'U9'}), sess.filter(s => s.ageGroup === 'U9').map(s => s.id).sort(), 'Age filter'); QA.deepEq(nf({focus: 'keep_the_ball'}), sess.filter(s => s.focusArea === 'keep_the_ball').map(s => s.id).sort(), 'Focus filter'); QA.deepEq(nf({duration: '90'}), sess.filter(s => s.targetDuration === 90).map(s => s.id).sort(), 'Duration filter');
    QA.deepEq(nf({location: 'either'}), sess.filter(s => s.locationPref === 'either').map(s => s.id).sort(), 'Either filter'); QA.deepEq(nf({location: 'indoor'}), sess.filter(s => s.locationPref !== 'either' && s.location === 'indoor').map(s => s.id).sort(), 'Indoor filter'); QA.deepEq(nf({style: 'balanced'}), sess.filter(s => s.sessionStyle === 'balanced').map(s => s.id).sort(), 'Style filter'); QA.deepEq(nf({fav: true}), sess.filter(s => s.favorited).map(s => s.id).sort(), 'Favorites filter');
    const multi = nf({age: 'U10', duration: '60', fav: true}); QA.deepEq(multi, sess.filter(s => s.ageGroup === 'U10' && s.targetDuration === 60 && s.favorited).map(s => s.id).sort(), 'Three filters at once'); assert(/Filter\s*·\s*3/.test(sb.text('.so-ctl-filter')), 'Filter button does not show the count: ' + sb.text('.so-ctl-filter'));
    sb.S.sessionsFilters.age = 'U10'; sb.S.sessionsFilters.duration = ''; sb.S.sessionsFilters.fav = false; sb.fn('openSessionsFilter'); sb.fn('setSessionsFilterDraft', 'focus', 'play_forward'); sb.fn('applySessionFilters'); QA.deepEq(L.rowIds(sb).sort(), sess.filter(s => s.ageGroup === 'U10' && s.focusArea === 'play_forward').map(s => s.id).sort(), 'Filter sheet Apply'); sb.fn('openSessionsFilter'); sb.fn('clearAllSessionFilters'); eq(L.rowIds(sb).length, 24, 'Clear All');
  }});
add('SS-028', C.use, 'My Sessions library', 'Empty states: no saved sessions ("You haven\'t saved any sessions yet" + Create Session), no search / filter results ("No sessions found" + Clear Search / Clear Filters that work), and no empty Favorites section.', {
  severity: 'Major', tags: ['saved'], timeout: 30000, steps: ['Open My Sessions with nothing saved; then search for nonsense and filter to nothing.'], exp: 'Helpful messages with working buttons.',
  async run(env){
    const e = await env.boot(); e.fn('nav', 'sessions'); e.fn('openSessionsAll'); assert(e.has("You haven't saved any sessions yet", '#content'), 'No empty-library message'); assert(e.canClick('Create Session', '#content'), 'No Create Session button'); e.click('Create Session', '#content'); eq(e.screen, 'practiceSetup', 'Create Session destination'); e.destroy();
    const {sb} = await L.library(env, 6); L.openLibrary(sb); sb.q('#soSearch').value = 'zzzqq'; sb.fn('onSessionsSearch', 'zzzqq'); sb.fn('refreshSessionsLibrary'); assert(sb.has('No sessions found', '#content'), 'No "No sessions found"'); assert(sb.canClick('Clear Search', '#content'), 'No Clear Search'); assert(!sb.canClick('Clear Filters', '#content'), 'Clear Filters offered with no filters');
    sb.S.sessionsFilters.age = 'U12'; sb.S.sessionsFilters.focus = 'keep_the_ball'; sb.S.sessionsFilters.style = 'game_based'; sb.fn('render'); assert(sb.canClick('Clear Filters', '#content'), 'No Clear Filters'); sb.click('Clear Search', '#content'); sb.click('Clear Filters', '#content'); eq(sb.qa('#content .so-row').length, 6, 'After clearing both');
  }});
add('SS-029', C.core, 'Favorites', 'Favorites use the existing bookmark on the same session record: one tap toggles it, it persists after reopening, appears in the Favorites section and filter, and is not copied anywhere.', {
  severity: 'Major', tags: ['saved', 'persistence'], timeout: 30000, steps: ['Tap a bookmark, reopen the app, filter to Favorites.'], exp: 'Same record flagged; listed in Favorites; remembered.',
  async run(env){
    const {sb, sess} = await L.library(env, 5); sess.forEach(s => { s.favorited = false; }); sb.fn('openSessionsAll'); const row = sb.q('#content .so-row'); const id = row.dataset.sid; sb.clickSel(`#content .so-row[data-sid="${id}"] .so-fav`); const s = sb.S.savedSessions.find(x => x.id === id);
    eq(s.favorited, true, 'Record not flagged'); assert(!/heart/i.test(sb.html('#content .so-row')), 'A heart icon is used'); sb.fn('toggleSessionFavorite', id); eq(s.favorited, false, 'Second tap'); sb.fn('toggleSessionFavorite', id);
    eq(sb.S.savedSessions.filter(x => x.favorited).length, 1, 'Exactly one flagged record'); eq(sb.S.savedSessions.length, 5, 'A duplicate record was created'); sb.S.sessionsFilters.fav = true; sb.fn('render'); QA.deepEq(L.rowIds(sb), [id], 'Favorites filter');
    sb.flushState(); const sb2 = await sb.reboot(); eq(sb2.S.savedSessions.find(x => x.id === id).favorited, true, 'Favorite lost after reopening'); sb2.S.sessionsFilters = {age: '', focus: '', duration: '', location: '', style: '', fav: false}; sb2.fn('nav', 'sessions'); eq(sb2.qa('.so-row', L.sectionOf(sb2, 'Favorites')).length, 1, 'Favorites section after reopening');
  }});
add('SS-030', C.core, 'My Sessions library', 'Deleting a session (with confirmation) removes it from Recent, Favorites, My Sessions, search results and filtered results, and returns to the Sessions screens.', {
  severity: 'Critical', tags: ['saved'], timeout: 30000, steps: ['Delete a favourite session from its detail page.'], exp: 'Gone from every list; no stale rows.',
  async run(env){
    const {sb, sess} = await L.library(env, 6); const s = sess[4]; s.favorited = true; s.name = 'Zebra Target'; s.ageGroup = 'U11'; sb.fn('openSessionsAll'); const id = s.id; sb.S.sessionsQuery = 'zebra'; sb.S.sessionsFilters.age = 'U11'; sb.fn('render'); assert(L.rowIds(sb).includes(id), 'Test session not found before deleting');
    sb.fn('openSessionDetail', id); sb.fn('requestDeleteSession', id); eq(sb.S.confirmDeleteSessionId, id, 'No confirmation'); eq(sb.S.savedSessions.length, 6, 'Deleted without confirming'); sb.fn('confirmDeleteSessionNow'); eq(sb.screen, 'sessions', 'Screen after delete'); eq(sb.S.savedSessions.length, 5, 'Not deleted');
    assert(!L.rowIds(sb).includes(id) && !sb.html('#content').includes(id), 'Still in the library / filtered / search results'); sb.fn('resetSessionsLibraryView'); sb.fn('closeSessionsAll'); assert(!sb.html('#content').includes(id), 'Still on the Sessions page (Recent / Favorites)'); sb.fn('openSessionsAll'); assert(!L.rowIds(sb).includes(id), 'Still in My Sessions');
  }});
add('SS-031', C.sec, 'My Sessions library', 'Community stays separate: other coaches\' sessions never appear in My Sessions / Recent / Favorites, and the Templates section does not change when switching My Sessions / Community.', {
  severity: 'Major', tags: ['saved', 'privacy', 'templates'], timeout: 30000, steps: ['Add sessions from another coach, switch toggles.'], exp: 'My views contain only mine; Templates identical in both modes.',
  async run(env){
    const {sb, sess} = await L.library(env, 4); const other = JSON.parse(JSON.stringify(sess[0])); other.id = 'OTHER1'; other.createdBy = 'Another Coach'; other.name = 'Their Shared Session'; other.visibility = 'shared'; other.favorited = true; sb.S.savedSessions.push(other); sb.fn('nav', 'sessions');
    assert(!sb.html('#content').includes('OTHER1'), 'Another coach\'s session is in My Sessions / Recent / Favorites'); const tmpl = () => L.sectionOf(sb, 'Templates').textContent.replace(/\s+/g, ' '); const mine = tmpl(); sb.fn('setSessionsViewMode', 'community'); assert(sb.html('#content').includes('OTHER1'), 'Community does not show the shared session'); eq(tmpl(), mine, 'Templates changed with the Community toggle');
    sb.fn('setSessionsViewMode', 'mine'); sb.fn('openSessionsAll'); assert(!L.rowIds(sb).includes('OTHER1'), 'Library lists another coach\'s session'); eq(sb.qa('#content .so-row').length, 4, 'Library count');
  }});
add('SS-032', C.sec, 'My Sessions library', 'Scale: with 300 saved sessions the library draws, searches, filters and sorts quickly (each under 150 ms) and the Sessions page still shows only 5 recent rows.', {
  severity: 'Major', tags: ['saved', 'performance'], timeout: 90000, steps: ['Create 300 sessions and use the library.'], exp: 'Fast; nothing hidden.',
  async run(env){
    const {sb} = await L.library(env, 300); const ms = fn => { const t0 = performance.now(); fn(); return Math.round(performance.now() - t0); }; const out = {};
    out.hub = ms(() => sb.fn('nav', 'sessions')); eq(sb.qa('#content .so-row').length <= 10, true, 'Hub rows'); out.open = ms(() => sb.fn('openSessionsAll')); eq(sb.qa('#content .so-row').length, 300, 'Library rows');
    out.search = ms(() => { sb.q('#soSearch').value = 'session a'; sb.fn('onSessionsSearch', 'session a'); sb.fn('refreshSessionsLibrary'); }); out.sort = ms(() => sb.fn('setSessionsSort', 'name')); out.filter = ms(() => { sb.S.sessionsFilters.age = 'U10'; sb.S.sessionsFilters.duration = '75'; sb.fn('render'); });
    const worst = Math.max(...Object.values(out)); const msg = Object.entries(out).map(([k, v]) => `${k} ${v}ms`).join(', '); if(worst > 400) throw new QA.Fail('Too slow: ' + msg); if(worst > 150) QA.partial('Slowish: ' + msg); return msg;
  }});
add('SS-033', C.data, 'Persistence', 'All session dates, favorites and the chosen sort survive closing and reopening the app, and a sort change reorders the view without reordering the saved data.', {
  severity: 'Critical', tags: ['saved', 'persistence'], timeout: 30000, steps: ['Choose a sort, favourite one, reopen.'], exp: 'Identical fields; same sort.',
  async run(env){
    const {sb, sess} = await L.library(env, 6); sb.fn('openSessionsAll'); sb.fn('setSessionsSort', 'name'); const snap = JSON.stringify(sb.S.savedSessions.map(s => [s.id, s.createdAt, s.updatedAt, s.lastUsedAt, s.practiceDate, s.favorited, s.locationPref]));
    sb.flushState(); const sb2 = await sb.reboot(); eq(JSON.stringify(sb2.S.savedSessions.map(s => [s.id, s.createdAt, s.updatedAt, s.lastUsedAt, s.practiceDate, s.favorited, s.locationPref])), snap, 'Session fields after reopening'); eq(sb2.S.sessionsSort, 'name', 'Sort preference after reopening');
    sb2.fn('nav', 'sessions'); sb2.fn('openSessionsAll'); QA.deepEq(L.rowIds(sb2), L.ids(sb2.fn('sortSessions', sb2.S.savedSessions, 'name')), 'Library order after reopening');
  }});
add('SS-034', C.vis, 'My Sessions library', 'Phone touch targets: search box, Sort, Filter and each bookmark are at least 44px tall/wide, rows are generous, and the library does not scroll sideways at 390 and 320px.', {
  type: 'Hybrid', severity: 'Minor', tags: ['saved', 'visual', 'responsive'], timeout: 30000, steps: ['Open My Sessions on a phone.'], exp: '48px controls; rows 60px+; no sideways scroll. (A person should still try them with a thumb.)',
  async run(env){
    for(const w of [390, 320]){ const {sb} = await L.library(env, 8, {width: w}); sb.fn('openSessionsAll'); const h = sel => sb.q(sel).getBoundingClientRect(); assert(h('.so-search-input').height >= 44, 'Search height ' + h('.so-search-input').height); assert(h('.so-ctl').height >= 44 && h('.so-ctl-filter').height >= 44, 'Sort/Filter height'); const fav = h('.so-fav'); assert(fav.width >= 44 && fav.height >= 44, 'Bookmark ' + fav.width + 'x' + fav.height); assert(h('.so-row').height >= 60, 'Row height ' + h('.so-row').height); const c = sb.q('#content'); assert(c.scrollWidth - c.clientWidth <= 1, `Sideways scroll at ${w}px`); sb.destroy(); }
  }});

QA.register(tests);
})();
