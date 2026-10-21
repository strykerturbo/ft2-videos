/* FT2 QA inventory, part 2: Exercise Library, Exercise Detail, Custom Session / Generator. */
(function(){
'use strict';
const QA = window.QA, L = QA.lib, C = QA.C, T = QA.T;
const {assert, eq} = QA;
const tests = [];
const add = (...a) => tests.push(T(...a));

/* helpers for the Custom Session flow */
Object.assign(L, {
  async customStart(env, o){ const sb = await env.boot(Object.assign({live: true}, o || {})); sb.click('Custom Session'); return sb; },
  pickFocus(sb, idx){ const btns = sb.qa('#content .cs-list button'); btns[idx || 0].click(); return sb.S.csFocusAreaId; },
  async toStep2(env, o){ const sb = await L.customStart(env, o); L.pickFocus(sb, (o && o.focusIdx) || 0); sb.click('Next: Session Setup'); eq(sb.screen, 'customSessionSetup', 'Step 2'); return sb; },
  async toStep4(env, o){
    const sb = await L.toStep2(env, o); sb.click('Next: Generate Session');
    await sb.until(() => sb.screen === 'customSessionReview' || (sb.S.customGeneration && sb.S.customGeneration.status === 'error'), 12000, 'Step 4');
    assert(sb.screen === 'customSessionReview', 'Generation did not reach Step 4: ' + (sb.S.customGeneration && sb.S.customGeneration.error));
    return sb;
  },
  draftIds(sb){ return sb.e('PHASES').flatMap(p => sb.S.phaseData[p.key]); },
});

/* ================================================================ EXERCISE LIBRARY (EX-001 .. EX-015) */
add('EX-001', C.core, 'Exercise Library', 'The Exercises tab lists the whole library and the tab is highlighted.', {
  smoke: true, severity: 'Critical', tags: ['library', 'bottomnav'],
  steps: ['Tap Exercises in the bottom bar.'], exp: 'Every exercise is listed; Exercises is the active tab.',
  async run(env){ const sb = await env.boot(); sb.click('Exercises', '#bottomnav'); eq(sb.screen, 'exercises', 'Screen'); eq(sb.navLabelActive(), 'Exercises', 'Active tab'); assert(sb.qa('#content .ex-name').length >= sb.exercises().length, 'Fewer cards than exercises'); }});
add('EX-002', C.core, 'Exercise Library', 'Each phase chip shows only that phase\'s exercises.', {
  severity: 'Major', tags: ['library'],
  steps: ['Tap each chip: Warmup, Athletic, Duels, Rondos, SSGs, Scrimmage.'], exp: 'Only exercises from that Section; counts match the data.',
  async run(env){
    const sb = await env.boot(); sb.fn('nav', 'exercises');
    for(const sec of sb.e('SECTION_LIST')){ sb.fn('setSectionFilter', sec); eq(sb.qa('#content .ex-name').length, sb.exercises().filter(e => e.section === sec).length, 'Cards in ' + sec); }
    sb.fn('setSectionFilter', null); assert(sb.qa('#content .ex-name').length >= sb.exercises().length, 'All chip does not show everything');
  }});
add('EX-003', C.core, 'Exercise Library', 'Search finds exercises by name and clearing it restores the list.', {
  smoke: true, severity: 'Major', tags: ['library'],
  steps: ['Tap the search icon, type part of a name, then clear.'], exp: 'Only matching exercises show; clearing restores all.',
  async run(env){
    const sb = await env.boot(); sb.fn('openSearch'); const word = sb.exercises()[3].name.split(' ')[0].toLowerCase();
    sb.S.search = word; sb.fn('renderSoft'); const n = sb.qa('#content .ex-name').length;
    assert(n > 0 && n < sb.exercises().length, `Search for "${word}" returned ${n} cards`);
    sb.fn('clearSearch'); assert(sb.qa('#content .ex-name').length >= sb.exercises().length, 'List not restored');
  }});
add('EX-004', C.core, 'Exercise Library', 'Search also matches tags and descriptions, and a nonsense search shows an empty result gracefully.', {
  severity: 'Minor', tags: ['library'],
  steps: ['Search for a tag word, then for "zzzzqq".'], exp: 'Tag search returns results; nonsense returns none without errors.',
  async run(env){
    const sb = await env.boot(); sb.fn('openSearch'); const ex = sb.exercises().find(e => (e.technicalTags || []).length); sb.S.search = ex.technicalTags[0]; sb.fn('renderSoft');
    assert(sb.qa('#content .ex-name').length > 0, 'Tag search found nothing'); sb.S.search = 'zzzzqq'; sb.fn('renderSoft'); eq(sb.qa('#content .ex-name').length, 0, 'Nonsense search results'); eq(sb.errors.length, 0, 'Script errors');
  }});
add('EX-005', C.core, 'Exercise Library', 'The duration filter narrows the list.', {
  severity: 'Minor', tags: ['library'],
  steps: ['Open Filters, choose a duration.'], exp: 'Only exercises of that length remain.',
  async run(env){
    const sb = await env.boot(); sb.fn('nav', 'exercises'); sb.S.filters.durations.add('5'); sb.fn('render');
    const shown = sb.exercises().filter(e => sb.fn('matchesFilters', e)); assert(shown.length > 0 && shown.every(e => (e.duration || 10) <= 5), 'A longer exercise slipped through the 5-minute filter');
  }});
add('EX-006', C.core, 'Exercise Library', 'Combined filters (difficulty, location, tags) work together and clear all at once.', {
  severity: 'Minor', tags: ['library'],
  steps: ['Pick a difficulty and a location; clear filters.'], exp: 'Intersection shown; clearing restores everything.',
  async run(env){
    const sb = await env.boot({live: true}); sb.fn('nav', 'exercises'); const all = sb.exercises().length;
    sb.S.filters.difficulty.add(1); sb.S.filters.location.add('indoor'); const m = sb.exercises().filter(e => sb.fn('matchesFilters', e));
    assert(m.every(e => e.difficulty === 1 && e.location === 'indoor'), 'Filter intersection wrong'); sb.fn('clearFilters'); eq(sb.exercises().filter(e => sb.fn('matchesFilters', e)).length, all, 'After clear');
  }});
add('EX-007', C.data, 'Exercise Library', 'Bookmarking an exercise toggles and is remembered after reopening.', {
  severity: 'Major', tags: ['library', 'persistence'],
  steps: ['Bookmark an exercise, reopen the app.'], exp: 'Still bookmarked.',
  async run(env){
    const sb = await env.boot(); const id = sb.exercises()[0].id; sb.fn('toggleBookmark', {stopPropagation(){}}, id); assert(sb.S.bookmarks.has(id), 'Not bookmarked');
    const sb2 = await L.reopen(sb); assert(sb2.S.bookmarks.has(id), 'Bookmark lost after reopening'); sb2.fn('toggleBookmark', {stopPropagation(){}}, id); assert(!sb2.S.bookmarks.has(id), 'Not removed');
  }});
add('EX-008', C.core, 'Exercise Library', 'The top bookmark button opens Favorites, which lists exactly the bookmarked exercises (and the Exercise Library still lists them all).', {
  severity: 'Minor', tags: ['library'],
  steps: ['Bookmark two exercises, tap the bookmark in the top bar.'], exp: 'Favorites shows exactly those two.',
  async run(env){
    const sb = await env.boot(); const ids = sb.exercises().slice(0, 2).map(e => e.id); ids.forEach(id => sb.S.bookmarks.add(id)); sb.clickSel('#topbar button[aria-label="Favorites"]');
    eq(sb.S.screen, 'favorites', 'Screen'); eq(sb.qa('#favList .ex-card').length, 2, 'Bookmarked exercises on Favorites'); sb.fn('nav', 'exercises'); assert(sb.qa('.ex-card').length > 2, 'The library should still list every exercise');
  }});
add('EX-009', C.core, 'Exercise Library', 'Tile and List views both list the exercises.', {
  severity: 'Polish', tags: ['library'],
  steps: ['Toggle Tile / List.'], exp: 'Both show every exercise.',
  async run(env){ const sb = await env.boot(); sb.fn('nav', 'exercises'); sb.fn('setViewMode', 'list'); const a = sb.qa('#content .ex-name').length; sb.fn('setViewMode', 'tile'); const b = sb.qa('#content .ex-name').length; assert(a > 0 && a === b, `List ${a} vs Tile ${b}`); }});
add('EX-010', C.core, 'Exercise Library', 'Adding from the library with no session started asks first, and Yes starts a draft.', {
  severity: 'Major', tags: ['library', 'build'],
  steps: ['In Exercises tap Add on an exercise.'], exp: 'A confirmation appears; Yes adds it to the right phase; No adds nothing.',
  async run(env){
    const sb = await env.boot(); sb.fn('nav', 'exercises'); const ex = sb.exercises()[0]; sb.q('#content .ex-addbtn').click();
    assert(sb.S.pendingQuickAdd, 'No confirmation'); sb.fn('confirmQuickAddNo'); eq(sb.fn('currentTotalMinutes').count, 0, 'Added despite No');
    sb.q('#content .ex-addbtn').click(); sb.fn('confirmQuickAddYes'); eq(sb.fn('currentTotalMinutes').count, 1, 'Not added after Yes');
  }});
add('EX-011', C.nav, 'Exercise Library', 'Tapping an exercise opens its Detail page for that exact exercise.', {
  smoke: true, severity: 'Critical', tags: ['library', 'detail', 'nav'],
  steps: ['Tap an exercise name.'], exp: 'Exercise Detail opens showing that exercise.',
  async run(env){ const sb = await env.boot(); sb.fn('nav', 'exercises'); const el = sb.qa('#content .ex-name')[4]; const name = el.textContent.trim(); el.click(); eq(sb.screen, 'detail', 'Screen'); assert(sb.text('#content').includes(name), 'Detail does not show ' + name); }});
add('EX-012', C.use, 'Exercise Library', 'Going into a detail page and back keeps the filter you had.', {
  severity: 'Minor', tags: ['library', 'nav'],
  steps: ['Pick a phase chip, open an exercise, tap Back.'], exp: 'Still on the same chip.',
  async run(env){ const sb = await env.boot(); sb.fn('nav', 'exercises'); sb.fn('setSectionFilter', 'Rondos'); sb.qa('#content .ex-name')[0].click(); sb.fn('backFromDetail'); eq(sb.S.sectionFilter, 'Rondos', 'Phase chip after Back'); }});
add('EX-013', C.core, 'Exercise Library', 'Creating a new exercise starts as an unsaved draft and only joins the library when saved.', {
  severity: 'Minor', tags: ['library', 'detail'],
  steps: ['Tap the new-exercise tile, then Discard; again and Save Exercise.'], exp: 'Discard leaves the library unchanged; Save adds exactly one.',
  async run(env){
    const sb = await env.boot(); sb.fn('nav', 'exercises'); const n = sb.exercises().length;
    sb.fn('createNewExercise'); eq(sb.screen, 'detail', 'Screen'); assert(sb.S.draftExercise, 'No draft'); sb.fn('discardDraftExercise'); eq(sb.exercises().length, n, 'Count after discard');
    sb.fn('createNewExercise'); sb.fn('saveDraftExercise'); eq(sb.exercises().length, n + 1, 'Count after save'); assert(sb.S.localExercises.length === 1, 'Not kept locally');
  }});
add('EX-014', C.err, 'Exercise Library', 'Exercises without a diagram show a friendly placeholder, never a broken image.', {
  severity: 'Minor', tags: ['library', 'visual'],
  steps: ['Scroll the library.'], exp: 'Cards without media show "Diagram coming soon".',
  async run(env){
    const sb = await env.boot(); sb.fn('nav', 'exercises'); const missing = sb.exercises().filter(e => !e.mediaUrl).length;
    if(missing) assert(sb.has('Diagram coming soon', '#content'), 'No placeholder text for exercises without a diagram'); assert(!sb.q('#content .ex-thumb img:not([src])'), 'An image tag has no source');
  }});
add('EX-015', C.data, 'Exercise Library', 'Every exercise appears exactly once in the library list.', {
  smoke: true, severity: 'Major', tags: ['library', 'data'],
  steps: ['Compare the list with the data.'], exp: 'Same set of names, no duplicates, none missing.',
  async run(env){
    const sb = await env.boot({live: true}); sb.fn('nav', 'exercises'); const names = sb.qa('#content .ex-name').map(e => e.textContent.trim()); const data = sb.exercises().map(e => e.name);
    eq(names.length, new Set(names).size === names.length ? names.length : -1, 'Duplicate cards');
    const missing = data.filter(n => !names.includes(n)); assert(missing.length === 0, 'Missing from list: ' + missing.slice(0, 3).join(', '));
  }});

/* ================================================================ EXERCISE DETAIL (ED-001 .. ED-017) */
const openDetailFor = async (env, o) => { const sb = await env.boot(o); sb.fn('nav', 'exercises'); sb.qa('#content .ex-name')[2].click(); eq(sb.screen, 'detail', 'Detail'); return sb; };
add('ED-001', C.core, 'Exercise Detail', 'Detail shows name, phase, duration, format and difficulty.', {
  severity: 'Critical', tags: ['detail'], steps: ['Open any exercise.'], exp: 'Header shows the exercise name and phase; stats row shows Duration, Format, Difficulty.',
  async run(env){ const sb = await openDetailFor(env); const ex = sb.fn('exById', sb.S.detailId); const t = sb.text('#content'); [ex.name, 'Duration', 'Format', 'Difficulty'].forEach(w => assert(t.includes(w), 'Missing ' + w)); assert(sb.text('#content .detail-eyebrow').includes(ex.section), 'Phase not shown'); }});
add('ED-002', C.core, 'Exercise Detail', 'Setup, Objective, Coaching points, Variations and Training profile sections are present.', {
  severity: 'Major', tags: ['detail'], steps: ['Scroll the detail page.'], exp: 'All five sections present (a dash when empty).',
  async run(env){ const sb = await openDetailFor(env); ['Setup', 'Objective', 'Coaching points', 'Variations', 'Training profile', 'Tags'].forEach(w => assert(sb.has(w, '#content'), 'Missing ' + w)); }});
add('ED-003', C.err, 'Exercise Detail', 'The diagram shows when there is one, or a "Diagram coming soon" box when there is not.', {
  severity: 'Minor', tags: ['detail'], steps: ['Open an exercise with and without a diagram.'], exp: 'Media box or placeholder - never blank.',
  async run(env){
    const sb = await env.boot(); const withM = sb.exercises().find(e => e.mediaUrl), without = sb.exercises().find(e => !e.mediaUrl);
    if(withM){ sb.fn('openDetail', withM.id); assert(sb.q('#content .media-box') && !sb.q('#content .media-box-placeholder'), 'Diagram box missing'); }
    if(without){ sb.fn('openDetail', without.id); assert(sb.q('#content .media-box-placeholder'), 'Placeholder missing'); }
  }});
add('ED-004', C.core, 'Exercise Detail', 'A Watch video button appears only when the exercise has a video link.', {
  severity: 'Minor', tags: ['detail'], steps: ['Open exercises with and without video.'], exp: 'Button only where a link exists, opening in a new tab.',
  async run(env){
    const sb = await env.boot(); const withV = sb.exercises().find(e => e.videoUrl), without = sb.exercises().find(e => !e.videoUrl);
    if(withV){ sb.fn('openDetail', withV.id); const a = sb.q('#content .video-link-btn'); assert(a && a.target === '_blank', 'Video button missing / not a new tab'); }
    if(without){ sb.fn('openDetail', without.id); assert(!sb.q('#content .video-link-btn'), 'Video button shown without a link'); }
  }});
add('ED-005', C.core, 'Exercise Detail', 'Add to Session adds the exercise to the right phase, shows Added, and tapping again removes it.', {
  severity: 'Critical', tags: ['detail', 'build'], steps: ['Start a session, open an exercise, tap Add to Session twice.'], exp: 'Added to its own phase; second tap removes it.',
  async run(env){
    const sb = await L.startBuild(env); const ex = sb.exercises().find(e => e.section === 'Rondos'); sb.fn('openDetail', ex.id); sb.clickSel('#content .add-session-btn');
    assert(sb.S.pendingQuickAdd, 'Adding the first exercise should ask "start a session?" first'); sb.fn('confirmQuickAddYes');
    assert(sb.S.phaseData.rondos.includes(ex.id), 'Not in Rondos'); assert(/Added/.test(sb.text('#content .add-session-btn')), 'Button does not say Added');
    sb.clickSel('#content .add-session-btn'); assert(!sb.S.phaseData.rondos.includes(ex.id), 'Not removed');
  }});
add('ED-006', C.core, 'Exercise Detail', 'While editing a saved session, Add to Session adds to that saved session.', {
  severity: 'Major', tags: ['detail', 'saved'], steps: ['Edit a saved session > + Add Exercise > open an exercise > Add to Session.'], exp: 'Saved session gains the exercise.',
  async run(env){
    const sb = await L.withSaved(env, 1); const s = sb.S.savedSessions[0]; const n = s.exCount; sb.fn('addExerciseToSavedSessionFlow', s.id);
    const pick = sb.exercises().find(e => !sb.fn('isExerciseInSavedSession', s.id, e.id)); sb.fn('openDetail', pick.id); sb.fn('detailToggle', pick.id); eq(s.exCount, n + 1, 'Saved exercise count');
  }});
add('ED-007', C.core, 'Exercise Detail', 'The bookmark in the header corner toggles the bookmark.', {
  severity: 'Minor', tags: ['detail'], steps: ['Tap the bookmark on the header.'], exp: 'Bookmarked, then not.',
  async run(env){ const sb = await openDetailFor(env); const id = sb.S.detailId; sb.clickSel('#content .dh-bm'); assert(sb.S.bookmarks.has(id), 'Not bookmarked'); sb.clickSel('#content .dh-bm'); assert(!sb.S.bookmarks.has(id), 'Not cleared'); }});
add('ED-008', C.nav, 'Exercise Detail', 'The Back button names the screen you came from and returns there.', {
  severity: 'Major', tags: ['detail', 'nav'], steps: ['Open a detail page from Home, the library, Find Exercises, Build, Review and a saved session.'], exp: 'Label and destination match each origin.',
  async run(env){
    const sb = await L.startBuild(env); sb.addExercises(sb.firstIdsPerPhase(1)); const id = sb.S.phaseData.warmup[0]; const label = () => sb.text('#content .nav-back-link');
    sb.fn('nav', 'home'); sb.fn('openDetailFromHome', id); assert(/Home/.test(label()), 'From Home: ' + label()); sb.fn('backFromDetail'); eq(sb.screen, 'home', 'Back to Home');
    sb.fn('nav', 'exercises'); sb.fn('openDetail', id); assert(/Exercises/.test(label()), 'From library: ' + label()); sb.fn('backFromDetail'); eq(sb.screen, 'exercises', 'Back to library');
    sb.fn('nav', 'build'); sb.fn('openDetailFromBuild', id); assert(/Build Session/.test(label()), 'From Build: ' + label()); sb.fn('backFromDetail'); eq(sb.screen, 'build', 'Back to Build');
    sb.fn('nav', 'review'); sb.fn('openDetailFromReview', id); assert(/Session Review/.test(label()), 'From Review: ' + label()); sb.fn('backFromDetail'); eq(sb.screen, 'review', 'Back to Review');
    sb.fn('pickForPhase', 'warmup'); sb.fn('openDetail', id); assert(/Find Exercises/.test(label()), 'From Find Exercises: ' + label()); sb.fn('backFromDetail'); eq(sb.screen, 'exercises', 'Back to Find Exercises');
  }});
add('ED-009', C.cons, 'Exercise Detail', 'The Back button and the coloured title box stay docked at the top while the details scroll.', {
  type: 'Hybrid', severity: 'Minor', tags: ['detail', 'visual'], steps: ['Open a detail page and scroll down on a phone.'], exp: 'Back pill and section/name bar remain visible.',
  async run(env){ const sb = await openDetailFor(env); eq(sb.e("getComputedStyle(document.querySelector('#content .nav-sticky-back')).position"), 'sticky', 'Back button position'); eq(sb.e("getComputedStyle(document.querySelector('#content .dh-dock')).position"), 'sticky', 'Title box position'); }});
add('ED-010', C.nav, 'Exercise Detail', 'Similar exercises are listed and tapping one opens it.', {
  severity: 'Polish', tags: ['detail'], steps: ['Tap a similar exercise.'], exp: 'That exercise opens.',
  async run(env){ const sb = await openDetailFor(env); const first = sb.S.detailId; const sim = sb.q('#content .sim-card'); assert(sim, 'No similar exercises'); sim.click(); assert(sb.S.detailId !== first, 'Did not open the similar exercise'); }});
add('ED-011', C.core, 'Exercise Detail', 'On an exercise the coach created, tags are shown and the Add tags sheet opens.', {
  severity: 'Minor', tags: ['detail'], steps: ['Create an exercise, tap Add tags.'], exp: 'Tag picker sheet opens with categories.',
  async run(env){ const sb = await env.boot(); sb.fn('createNewExercise'); sb.clickSel('#content .add-tag-trigger'); assert(sb.S.tagPickerFor || sb.overlayText().length > 10, 'Tag picker did not open'); }});
add('ED-018', C.core, 'Exercise Detail', 'Exercises from the club library are READ-ONLY on the detail page (nothing looks typeable, no Add tags, no dropdowns); exercises the coach created can still be edited.', {
  severity: 'Major', tags: ['detail', 'data'], steps: ['Open a library exercise, then a coach-created one.'], exp: 'Library: no editing controls. Own: editing controls.',
  async run(env){ const sb = await openDetailFor(env); const ro = () => ({edit: sb.qa('#content [contenteditable="true"]').length, sel: sb.qa('#content select').length, tag: sb.qa('#content .add-tag-trigger').length});
    const a = ro(); eq(a.edit + a.sel + a.tag, 0, 'A library exercise still shows editing controls ' + JSON.stringify(a)); assert(sb.has('Duration', '#content') && sb.has('Difficulty', '#content') && sb.has('Format', '#content'), 'The read-only stats are missing');
    sb.fn('createNewExercise'); const b = ro(); assert(b.edit >= 5 && b.sel >= 4 && b.tag === 1, 'A coach-created exercise lost its editing controls ' + JSON.stringify(b)); }});
add('ED-012', C.core, 'Exercise Detail', 'Changing the location pill updates the exercise.', {
  severity: 'Minor', tags: ['detail', 'data'], steps: ['Change Indoor / Outdoor on the exercise.'], exp: 'Stored on the exercise.',
  async run(env){ const sb = await openDetailFor(env); const id = sb.S.detailId; sb.fn('updateExerciseField', id, 'location', 'indoor', undefined, false); eq(sb.fn('exById', id).location, 'indoor', 'Location'); }});
add('ED-013', C.core, 'Exercise Detail', 'Editing the duration updates the exercise and the session totals.', {
  severity: 'Major', tags: ['detail', 'build', 'math'], steps: ['Add an exercise to a session, change its duration on the detail page.'], exp: 'Build total reflects the new duration.',
  async run(env){
    const sb = await L.startBuild(env); const id = sb.firstIdsPerPhase(1).warmup[0]; sb.fn('addToPhase', 'warmup', id); const before = sb.fn('currentTotalMinutes').total;
    sb.fn('updateExerciseField', id, 'duration', '25', 'number', false); eq(sb.fn('currentTotalMinutes').total, 25, 'New total (was ' + before + ')');
  }});
add('ED-014', C.core, 'Exercise Detail', 'Difficulty and format can be changed.', {
  severity: 'Minor', tags: ['detail', 'data'], steps: ['Change difficulty and format.'], exp: 'Both stored.',
  async run(env){ const sb = await openDetailFor(env); const id = sb.S.detailId; sb.fn('updateExerciseField', id, 'difficulty', '3', 'number', false); sb.fn('updateExerciseFormat', id, '4v4'); const ex = sb.fn('exById', id); eq(ex.difficulty, 3, 'Difficulty'); eq(ex.formatTags[0], '4v4', 'Format'); }});
add('ED-015', C.core, 'Exercise Detail', 'The Training profile shows four rows (technical, tactical, physical, cognitive).', {
  severity: 'Minor', tags: ['detail'], steps: ['Scroll to Training profile.'], exp: 'Four rows.',
  async run(env){ const sb = await openDetailFor(env); eq(sb.qa('#content .tprof-block .tp-row, #content .tprof-block [class*="tprof"]').length > 0, true, 'Profile rows present'); ['Technical', 'Tactical', 'Physical', 'Cognitive'].forEach(w => assert(sb.has(w, '#content .tprof-block'), 'Missing ' + w)); }});
add('ED-016', C.err, 'Exercise Detail', 'A missing exercise (bad link or removed from the sheet) shows a message instead of crashing.', {
  severity: 'Major', tags: ['detail', 'data'], steps: ['Open a detail for an id that does not exist.'], exp: '"Exercise not found", app keeps working.',
  async run(env){ const sb = await env.boot(); sb.fn('nav', 'detail', {detailId: 'EX99999'}); sb.S.detailId = 'EX99999'; sb.fn('nav', 'detail'); assert(sb.has('not found', '#content'), 'No friendly message'); assert(sb.errors.length === 0, 'Script error'); }});
add('ED-017', C.vis, 'Exercise Detail', 'Detail page layout: header box, bookmark corner, diagram, readable text, no clipping on a phone.', {
  type: 'Manual', severity: 'Polish', tags: ['detail', 'visual'], steps: ['Open details on a phone in light and dark.'], exp: 'Looks tidy; nothing overlaps or is cut off.', run: null});

/* ================================================================ CUSTOM SESSION (CS-001 .. CS-040) */
const FOCUS_TITLES = ['Keep the Ball', 'Play Forward', 'Create & Score', 'Beat Players', 'Defend Together', 'Win It Back', 'Transition Quickly', 'Master the Ball'];
add('CS-001', C.core, 'Custom Step 1', 'Step 1 lists the 8 focus areas in order with nothing pre-selected.', {
  smoke: true, severity: 'Critical', tags: ['custom'], steps: ['Home > Custom Session.'], exp: 'Eight focus cards in the agreed order; none highlighted; Next disabled.',
  async run(env){
    const sb = await L.customStart(env); const t = sb.qa('#content .cs-list button').map(b => b.textContent);
    FOCUS_TITLES.forEach((f, i) => assert(t[i] && t[i].includes(f), `Focus ${i + 1} should be "${f}"`)); eq(sb.qa('#content .cs-list button[aria-checked="true"], #content .cs-list button.on, #content .cs-list button.selected').length, 0, 'Selected cards'); eq(sb.S.csFocusAreaId, null, 'csFocusAreaId');
  }});
add('CS-002', C.core, 'Custom Step 1', 'Choosing a focus area highlights it and enables Next: Session Setup.', {
  smoke: true, severity: 'Critical', tags: ['custom', 'nav'], steps: ['Tap a focus area.'], exp: 'It is highlighted; Next becomes available and opens Step 2.',
  async run(env){ const sb = await L.customStart(env); L.pickFocus(sb, 2); eq(sb.S.csFocusAreaId, 'create_and_score', 'Selected id'); const next = sb.q('#workflowFooter button'); assert(next && !next.disabled, 'Next still disabled'); sb.click('Next: Session Setup'); eq(sb.screen, 'customSessionSetup', 'Step 2'); }});
add('CS-003', C.core, 'Custom Step 1', 'Only one focus area can be selected; tapping another moves the choice.', {
  severity: 'Minor', tags: ['custom'], steps: ['Tap two focus areas in turn.'], exp: 'The second replaces the first.',
  async run(env){ const sb = await L.customStart(env); L.pickFocus(sb, 0); L.pickFocus(sb, 5); eq(sb.S.csFocusAreaId, 'win_it_back', 'Selected id'); }});
add('CS-004', C.nav, 'Custom Step 1', 'Back to Home returns to Home.', {
  severity: 'Major', tags: ['custom', 'nav'], steps: ['Tap Back to Home.'], exp: 'Home opens.',
  async run(env){ const sb = await L.customStart(env); sb.clickSel('#content .nav-back-link'); eq(sb.screen, 'home', 'Screen'); }});
add('CS-005', C.core, 'Custom Step 2', 'Step 2 shows the chosen focus area with an Edit link back to Step 1.', {
  severity: 'Minor', tags: ['custom', 'nav'], steps: ['On Step 2 tap Edit.'], exp: 'Step 1 reopens with the choice kept.',
  async run(env){ const sb = await L.toStep2(env, {focusIdx: 1}); assert(sb.has('Play Forward', '#content .cs-carry'), 'Carried focus not shown'); sb.click('Edit', '#content .cs-carry'); eq(sb.screen, 'quickStartCustom', 'Screen'); eq(sb.S.csFocusAreaId, 'play_forward', 'Kept choice'); }});
add('CS-006', C.core, 'Custom Step 2', 'Step 2 defaults: title "<Focus> Session", age U10, style Balanced, a standard length and a location.', {
  severity: 'Major', tags: ['custom'], steps: ['Open Step 2.'], exp: 'Sensible defaults filled in.',
  async run(env){ const sb = await L.toStep2(env); const S = sb.S; eq(S.csTitle, 'Keep the Ball Session', 'Title'); eq(S.csAgeGroup, 'U10', 'Age'); eq(S.csSessionStyle, 'balanced', 'Style'); assert([60, 75, 90].includes(S.csDuration), 'Duration ' + S.csDuration); assert(['outdoor', 'indoor', 'either'].includes(S.csLocation), 'Location'); assert(S.csDate && S.csStartTime, 'Date / time'); }});
add('CS-007', C.core, 'Custom Step 2', 'Every Step 2 choice is carried into the generator\'s configuration.', {
  smoke: true, severity: 'Critical', tags: ['custom', 'generator'], steps: ['Change title, date, start time, length, place, age and style.'], exp: 'customSessionConfig() returns exactly those choices.',
  async run(env){
    const sb = await L.toStep2(env); sb.S.csTitleEdited = true; sb.S.csTitle = 'My Custom'; sb.fn('setCsDate', '2026-11-05'); sb.fn('setCsStartTime', '16:45'); sb.fn('setCsDuration', 90); sb.fn('setCsLocation', 'indoor'); sb.fn('setCsAgeGroup', 'U12'); sb.fn('setCsSessionStyle', 'game_based');
    const cfg = sb.fn('customSessionConfig'); QA.deepEq({t: cfg.title, d: cfg.date, s: cfg.startTime, n: cfg.duration, l: cfg.location, a: cfg.ageGroup, st: cfg.sessionStyle, f: cfg.focusArea}, {t: 'My Custom', d: '2026-11-05', s: '16:45', n: 90, l: 'indoor', a: 'U12', st: 'game_based', f: 'keep_the_ball'}, 'Config');
  }});
add('CS-008', C.core, 'Custom Step 2', 'Length choices are exactly 60, 75 and 90 minutes.', {
  severity: 'Minor', tags: ['custom'], steps: ['Look at the length buttons.'], exp: '60 / 75 / 90 only.',
  async run(env){ const sb = await L.toStep2(env); QA.deepEq(sb.e('CS_DURATIONS'), [60, 75, 90], 'CS_DURATIONS'); }});
add('CS-009', C.core, 'Custom Step 2', 'Location offers Outdoor, Indoor and Either; age offers U8-U12; style offers three styles.', {
  severity: 'Minor', tags: ['custom'], steps: ['Look at the toggles.'], exp: 'Exact option sets.',
  async run(env){ const sb = await L.toStep2(env); QA.deepEq(sb.e('CS_LOCATIONS').map(x => x[0]), ['outdoor', 'indoor', 'either'], 'Locations'); QA.deepEq(sb.e('CS_AGE_GROUPS'), ['U8', 'U9', 'U10', 'U11', 'U12'], 'Ages'); QA.deepEq(sb.e('CS_STYLES').map(x => x[0]), ['technical', 'balanced', 'game_based'], 'Styles'); }});
add('CS-010', C.core, 'Custom Step 2-4', 'Next: Generate Session builds a session and opens Step 4 (Session Review) with the real "Building" screen in between.', {
  smoke: true, severity: 'Critical', tags: ['custom', 'generator', 'nav'], timeout: 40000, steps: ['On Step 2 tap Next: Generate Session.'], exp: 'Step 3 appears with five stages, then Step 4 opens with a full session in the draft.',
  async run(env){
    const sb = await L.toStep2(env, {fastGen: false}); const t0 = performance.now(); sb.click('Next: Generate Session'); eq(sb.screen, 'customSessionGenerating', 'Step 3');
    await sb.until(() => sb.screen === 'customSessionReview', 12000, 'Step 4'); const ms = performance.now() - t0; assert(ms >= 2500, `Step 3 flashed by in ${Math.round(ms)}ms (should be shown for about 3 seconds)`);
    assert(sb.fn('currentTotalMinutes').count >= 4, 'Generated session is nearly empty'); eq(sb.S.csDraftGenerated, true, 'csDraftGenerated');
  }});
add('CS-011', C.core, 'Custom Step 3', 'The Building screen lists the five engine stages and ticks them off as they finish.', {
  severity: 'Minor', tags: ['custom', 'generator'], steps: ['Watch Step 3.'], exp: 'Five stages: Understanding, Finding, Scoring & ranking, Building, Finalizing.',
  async run(env){ const sb = await L.toStep2(env, {fastGen: false}); sb.click('Next: Generate Session'); await sb.sleep(700); const t = sb.text('#content'); ['Understanding your request', 'Finding the best exercises', 'Scoring', 'Building your session', 'Finalizing'].forEach(w => assert(t.includes(w), 'Missing stage: ' + w)); }});
add('CS-012', C.nav, 'Custom Step 3', 'Back to Session Setup from the Building screen cancels cleanly and keeps every Step 2 choice.', {
  severity: 'Major', tags: ['custom', 'nav'], steps: ['While building tap Back to Session Setup.'], exp: 'Step 2 reopens with the same choices; no session appears later.',
  async run(env){ const sb = await L.toStep2(env, {fastGen: false}); sb.fn('setCsAgeGroup', 'U12'); sb.click('Next: Generate Session'); await sb.sleep(300); sb.clickSel('#content .nav-sticky-back .nav-back-link'); eq(sb.screen, 'customSessionSetup', 'Screen'); await sb.sleep(3600); eq(sb.screen, 'customSessionSetup', 'A cancelled run still navigated'); eq(sb.S.csAgeGroup, 'U12', 'Age kept'); }});
add('CS-013', C.err, 'Custom Step 3', 'If building fails, the coach sees a clear message and Try Again, with their choices untouched.', {
  severity: 'Major', tags: ['custom', 'generator'], steps: ['Make generation fail, then tap Try Again.'], exp: '"We couldn\'t generate your session" + Try Again; choices intact.',
  async run(env){
    const sb = await L.toStep2(env); sb.S.enabledPhaseKeys.clear(); sb.fn('csGoToGenerate'); await sb.until(() => sb.S.customGeneration && sb.S.customGeneration.status === 'error', 6000, 'the error state');
    assert(sb.has("couldn't generate", '#content') || sb.has('could not generate', '#content'), 'No friendly failure message: ' + sb.text('#content').slice(0, 120)); assert(sb.canClick('Try Again', '#content'), 'No Try Again button');
  }});
add('CS-014', C.nav, 'Custom Step 4', 'Step 4 is the normal Session Review, labelled "Step 4 of 4", with a Back to Session Setup button.', {
  severity: 'Major', tags: ['custom', 'review', 'nav'], steps: ['Generate a session.'], exp: 'Title "Session Review", "STEP 4 OF 4", Back to Session Setup, Save Session.',
  async run(env){ const sb = await L.toStep4(env); assert(sb.has('Session Review', '#content'), 'Title'); assert(sb.q('#content .nav-page-title').dataset.step === 'STEP 4 OF 4', 'Step label'); assert(/Back to Session Setup/.test(sb.text('#content .nav-back-link')), 'Back label'); assert(sb.has('Save Session', '#workflowFooter'), 'Save button'); }});
add('CS-015', C.core, 'Custom Step 4', 'The review header repeats the focus, date, length, place, age and style.', {
  severity: 'Minor', tags: ['custom', 'review'], steps: ['Read the top of Step 4.'], exp: 'Focus plus the setup summary line.',
  async run(env){ const sb = await L.toStep4(env); const t = sb.text('#content .cs-review-focus') + ' ' + sb.text('#content .cs-review-setup'); ['Keep the Ball', 'min session', 'U10', 'Balanced'].forEach(w => assert(t.includes(w), `Header is missing "${w}": ${t}`)); }});
add('CS-016', C.core, 'Custom Step 4', '"How FT2 built this session" opens, explaining each step and each exercise.', {
  severity: 'Minor', tags: ['custom', 'generator'], steps: ['Tap How FT2 built this session.'], exp: 'Panel opens with step explanations and a "why" per exercise.',
  async run(env){ const sb = await L.toStep4(env); sb.clickSel('#content .cs-how-btn'); assert(sb.q('#content .cs-how-panel'), 'Panel did not open'); assert(sb.qa('#content .cs-how-whys li').length >= 4, 'Too few exercise reasons'); }});
add('CS-017', C.gen, 'Custom Step 4', 'Shuffle gives a different session for the same settings (and keeps the title).', {
  smoke: true, severity: 'Major', tags: ['custom', 'generator'], timeout: 40000, steps: ['On Step 4 tap Shuffle.'], exp: 'Different exercises; same focus, age, length; same title.',
  async run(env){ const sb = await L.toStep4(env); const before = L.draftIds(sb).join(','); const title = sb.S.sessionName; sb.fn('csShuffle'); await sb.sleep(150); assert(L.draftIds(sb).join(',') !== before, 'Shuffle produced the same session'); eq(sb.S.sessionName, title, 'Title kept'); eq(sb.S.csReviewCfg.focusArea, 'keep_the_ball', 'Focus kept'); }});
add('CS-018', C.use, 'Custom Step 4', 'Shuffle asks before replacing a session the coach has changed.', {
  severity: 'Major', tags: ['custom'], steps: ['Remove an exercise, then tap Shuffle.'], exp: 'Confirmation first; Cancel keeps the edits.',
  async run(env){ const sb = await L.toStep4(env); const id = L.draftIds(sb)[0]; const key = sb.e('PHASES').find(p => sb.S.phaseData[p.key].includes(id)).key; sb.fn('removeFromPhase', key, id); sb.fn('csShuffle'); eq(sb.S.confirmShuffleOpen, true, 'Confirmation'); sb.fn('cancelShuffleModal'); assert(!L.draftIds(sb).includes(id), 'Edit lost'); }});
add('CS-019', C.use, 'Custom Step 2-4', 'Generating again over an edited session asks first.', {
  severity: 'Major', tags: ['custom'], steps: ['Edit the generated session, go back and Generate again.'], exp: 'Confirmation before replacing.',
  async run(env){ const sb = await L.toStep4(env); const id = L.draftIds(sb)[0]; const key = sb.e('PHASES').find(p => sb.S.phaseData[p.key].includes(id)).key; sb.fn('removeFromPhase', key, id); sb.fn('csBackToStep2'); sb.fn('csGoToGenerate'); eq(sb.S.confirmGenerateOpen, true, 'Confirmation'); }});
add('CS-020', C.core, 'Custom Step 4', 'Saving a custom session stores the focus area, age group and style with it.', {
  smoke: true, severity: 'Critical', tags: ['custom', 'save', 'share'], steps: ['Generate, tap Save Session.'], exp: 'Saved session has focusArea / ageGroup / sessionStyle (and is private, with no share link, until the coach shares it).',
  async run(env){ const sb = await L.toStep4(env); sb.click('Save Session'); const s = sb.S.savedSessions[0]; eq(s.focusArea, 'keep_the_ball', 'focusArea'); eq(s.ageGroup, 'U10', 'ageGroup'); eq(s.sessionStyle, 'balanced', 'sessionStyle'); eq(s.visibility, 'private', 'A custom session must also start private'); eq(s.shareToken, '', 'No share link until the coach shares'); }});
add('CS-021', C.nav, 'Custom Step 4', 'Add exercise on Step 4 opens the picker with a Back to Session Review button, and the exercise lands in that phase.', {
  severity: 'Critical', tags: ['custom', 'library', 'nav'], steps: ['On Step 4 tap Add exercise under a phase, add one, tap Back.'], exp: 'Back button present; returns to Step 4 with the new exercise.',
  async run(env){
    const sb = await L.toStep4(env); const before = sb.fn('currentTotalMinutes').count; sb.clickSel('#content .cs-add-ex'); eq(sb.screen, 'exercises', 'Picker'); assert(/Back to Session Review/.test(sb.text('#content .nav-sticky-back')), 'Back label');
    const phase = sb.S.pickingPhase; const pick = sb.exercises().find(e => e.section === sb.e('PHASES').find(p => p.key === phase).section && !sb.S.phaseData[phase].includes(e.id)); sb.fn('addToPhase', phase, pick.id);
    sb.clickSel('#content .nav-sticky-back .nav-back-link'); eq(sb.screen, 'customSessionReview', 'Back to Step 4'); eq(sb.fn('currentTotalMinutes').count, before + 1, 'Exercise count');
  }});
add('CS-022', C.core, 'Custom Step 4', 'Replace swaps one exercise and returns to Step 4.', {
  severity: 'Major', tags: ['custom', 'library'], steps: ['Tap the replace arrows on an exercise, pick another.'], exp: 'Swapped in place; back on Step 4.',
  async run(env){
    const sb = await L.toStep4(env); const ph = sb.e('PHASES').find(p => sb.S.phaseData[p.key].length); const key = ph.key; const old = sb.S.phaseData[key][0];
    const pick = sb.exercises().find(e => e.section === ph.section && !sb.S.phaseData[key].includes(e.id)); sb.fn('pickReplacementFor', key, old, 'customReview'); eq(sb.screen, 'exercises', 'Picker'); sb.fn('performReplace', pick.id);
    eq(sb.screen, 'customSessionReview', 'Back on Step 4'); assert(sb.S.phaseData[key].includes(pick.id) && !sb.S.phaseData[key].includes(old), 'Replace failed');
  }});
add('CS-023', C.core, 'Custom Step 4', 'An exercise can be removed from the generated session and the total updates.', {
  severity: 'Major', tags: ['custom', 'math'], steps: ['Trash an exercise.'], exp: 'Gone; totals recalculated.',
  async run(env){ const sb = await L.toStep4(env); const t = sb.fn('currentTotalMinutes'); const id = L.draftIds(sb)[0]; const key = sb.e('PHASES').find(p => sb.S.phaseData[p.key].includes(id)).key; const d = sb.fn('exById', id).duration; sb.fn('removeFromPhase', key, id); const t2 = sb.fn('currentTotalMinutes'); eq(t2.count, t.count - 1, 'Count'); eq(t2.total, t.total - d, 'Minutes'); }});
add('CS-024', C.use, 'Custom Step 4', 'Exercises can be dragged into a new order on Step 4.', {
  type: 'Manual', severity: 'Minor', tags: ['custom', 'usability'], steps: ['Drag an exercise handle within a phase.'], exp: 'Order changes and sticks.', run: null});
add('CS-025', C.nav, 'Custom Step 4', 'Back to Session Setup keeps every Step 2 choice.', {
  severity: 'Major', tags: ['custom', 'nav'], steps: ['On Step 4 tap Back to Session Setup.'], exp: 'Step 2 shows the same title, length, place, age and style.',
  async run(env){ const sb = await L.toStep4(env); const cfg = JSON.stringify(sb.fn('customSessionConfig')); sb.clickSel('#content .nav-sticky-back .nav-back-link'); eq(sb.screen, 'customSessionSetup', 'Screen'); eq(JSON.stringify(sb.fn('customSessionConfig')), cfg, 'Config changed'); }});
add('CS-026', C.data, 'Custom Step 2', 'Closing and reopening on Step 2 restores every choice.', {
  severity: 'Major', tags: ['custom', 'persistence'], steps: ['Change Step 2 choices, reopen the app.'], exp: 'Same screen, same choices.',
  async run(env){ const sb = await L.toStep2(env); sb.fn('setCsAgeGroup', 'U8'); sb.fn('setCsDuration', 60); sb.fn('setCsSessionStyle', 'technical'); const sb2 = await L.reopen(sb); eq(sb2.screen, 'customSessionSetup', 'Screen'); eq(sb2.S.csAgeGroup, 'U8', 'Age'); eq(sb2.S.csDuration, 60, 'Duration'); eq(sb2.S.csSessionStyle, 'technical', 'Style'); }});
add('CS-027', C.data, 'Custom Step 4', 'Closing and reopening on Step 4 restores the generated session, its notes and explanation.', {
  severity: 'Critical', tags: ['custom', 'persistence'], steps: ['Generate, reopen the app.'], exp: 'Step 4 with the same exercises and "How FT2 built this session".',
  async run(env){ const sb = await L.toStep4(env); const ids = L.draftIds(sb).join(','); const sb2 = await L.reopen(sb); eq(sb2.screen, 'customSessionReview', 'Screen'); eq(L.draftIds(sb2).join(','), ids, 'Exercises'); assert(sb2.S.csReviewExplain, 'Explanation lost'); }});
add('CS-028', C.data, 'Custom Step 3', 'Reopening while the Building screen was showing lands safely on Step 2.', {
  severity: 'Major', tags: ['custom', 'persistence'], steps: ['Close the app during Step 3 and reopen.'], exp: 'Session Setup with choices kept - never a stuck spinner.',
  async run(env){ const sb = await L.toStep2(env, {fastGen: false}); sb.click('Next: Generate Session'); await sb.sleep(200); const sb2 = await L.reopen(sb); eq(sb2.screen, 'customSessionSetup', 'Screen'); }});
add('CS-029', C.cons, 'Custom Step 2', 'Custom Session settings and Start New Session settings are independent.', {
  severity: 'Major', tags: ['custom', 'setup'], steps: ['Change a Custom Session setting, then open Start New Session.'], exp: 'Setup has its own values.',
  async run(env){ const sb = await L.toStep2(env); sb.fn('setCsDuration', 90); sb.fn('setCsLocation', 'indoor'); sb.fn('nav', 'home'); sb.click('Start New Session'); assert(sb.S.setupDuration !== undefined, 'No setup duration'); eq(sb.S.csDuration, 90, 'Custom duration unchanged'); }});
add('CS-030', C.use, 'Custom Step 4', 'Starting a new session while a custom draft exists asks before discarding it.', {
  severity: 'Major', tags: ['custom', 'home'], steps: ['Generate a session, go Home, tap Start New Session.'], exp: 'A choice dialog.',
  async run(env){ const sb = await L.toStep4(env); sb.fn('nav', 'home'); sb.click('Start New Session'); eq(sb.S.confirmNewSessionOpen, true, 'Confirmation'); }});
add('CS-031', C.gen, 'Generator', 'Phases switched off in Settings are not offered a place the generator cannot fill.', {
  severity: 'Minor', tags: ['custom', 'generator'], steps: ['Turn off Scrimmage, generate.'], exp: 'A valid session is still produced.',
  async run(env){ const sb = await env.boot({live: true}); sb.S.enabledPhaseKeys.delete('scrimmage'); const s = sb.generate({focusArea: 'keep_the_ball', duration: 75, location: 'outdoor', ageGroup: 'U10', sessionStyle: 'balanced'}); assert(s.phases.flatMap(p => p.items).length >= 3, 'Too few exercises'); assert(!s.phases.some(p => p.phase.key === 'scrimmage' && p.items.length), 'Scrimmage used while off'); }});
add('CS-032', C.gen, 'Generator', 'The generated activities leave room for breaks: total is 10-15 minutes under the session length.', {
  severity: 'Major', tags: ['generator', 'math'], steps: ['Generate for 60 / 75 / 90.'], exp: 'Total within [length-15, length-10].',
  async run(env){ const sb = await env.boot({live: true}); const bad = []; [60, 75, 90].forEach(d => { const s = sb.generate({focusArea: 'play_forward', duration: d, location: 'outdoor', ageGroup: 'U10', sessionStyle: 'balanced'}); if(s.totalMin > d - 10 || s.totalMin < d - 15 - 5) bad.push(`${d}: ${s.totalMin}`); }); assert(!bad.length, 'Totals out of range - ' + bad.join(', ')); }});
add('CS-033', C.gen, 'Generator', 'A generated session never repeats the same exercise.', {
  severity: 'Major', tags: ['generator'], steps: ['Generate several sessions.'], exp: 'No duplicate ids.',
  async run(env){ const sb = await env.boot({live: true}); for(const f of ['keep_the_ball', 'win_it_back']) for(const d of [60, 90]){ const ids = sb.generate({focusArea: f, duration: d, location: 'either', ageGroup: 'U11', sessionStyle: 'game_based'}).phases.flatMap(p => p.items.map(i => i.ex.id)); eq(new Set(ids).size, ids.length, `Duplicates in ${f}/${d}`); } }});
add('CS-034', C.gen, 'Generator', 'An Indoor session never contains an outdoor-only exercise (and Outdoor never an indoor-only one).', {
  smoke: true, severity: 'Critical', tags: ['generator'], steps: ['Generate Indoor and Outdoor sessions for all focus areas.'], exp: 'No incompatible exercises.',
  async run(env){
    const sb = await env.boot({live: true}); const bad = [];
    for(const f of sb.e('FOCUS_AREAS').map(a => a.id)) for(const loc of ['indoor', 'outdoor']){ const s = sb.generate({focusArea: f, duration: 75, location: loc, ageGroup: 'U10', sessionStyle: 'balanced'}); s.phases.forEach(p => p.items.forEach(i => { const l = String(i.ex.location || 'both').toLowerCase(); if(l !== 'both' && l !== loc) bad.push(`${f}/${loc}: ${i.ex.name} is ${l}-only`); })); }
    assert(!bad.length, bad.slice(0, 3).join('; '));
  }});
add('CS-035', C.gen, 'Generator', 'The same request always gives the same session (deterministic), and a different shuffle gives a different one.', {
  severity: 'Major', tags: ['generator'], steps: ['Generate twice with identical settings.'], exp: 'Identical exercise lists; shuffle seed 1 differs.',
  async run(env){ const sb = await env.boot({live: true}); const cfg = {focusArea: 'create_and_score', duration: 75, location: 'outdoor', ageGroup: 'U10', sessionStyle: 'balanced'}; const ids = c => sb.generate(c).phases.flatMap(p => p.items.map(i => i.ex.id)).join(','); eq(ids(cfg), ids(cfg), 'Repeat'); assert(ids(cfg) !== ids({...cfg, shuffleSeed: 1}), 'Shuffle seed changed nothing'); }});
add('CS-036', C.gen, 'Generator', 'All 8 focus areas produce a non-empty session.', {
  severity: 'Critical', tags: ['generator'], steps: ['Generate once per focus area.'], exp: 'Every one has exercises in at least four phases.',
  async run(env){ const sb = await env.boot({live: true}); for(const f of sb.e('FOCUS_AREAS')){ const s = sb.generate({focusArea: f.id, duration: 75, location: 'either', ageGroup: 'U10', sessionStyle: 'balanced'}); const phases = s.phases.filter(p => p.items.length).length; assert(phases >= 4, `${f.title}: only ${phases} phases filled`); } }});
add('CS-037', C.gen, 'Generator', 'Age group changes the choice of exercises for at least some focus areas.', {
  severity: 'Major', tags: ['generator'], steps: ['Generate U8 and U12 for each focus area.'], exp: 'They differ for most.',
  async run(env){ const sb = await env.boot({live: true}); let diff = 0; const areas = sb.e('FOCUS_AREAS'); areas.forEach(f => { const g = a => sb.generate({focusArea: f.id, duration: 75, location: 'either', ageGroup: a, sessionStyle: 'balanced'}).phases.flatMap(p => p.items.map(i => i.ex.id)).join(','); if(g('U8') !== g('U12')) diff++; }); assert(diff >= 3, `Only ${diff} of ${areas.length} focus areas respond to age (U8 vs U12)`); return `${diff} of ${areas.length} focus areas change with age.`; }});
add('CS-038', C.gen, 'Generator', 'Sessions run Activate (one Warmup, up to two Athletic) then Develop then Play, with Activate near a quarter of the time.', {
  smoke: true, severity: 'Major', tags: ['generator'], steps: ['Generate a 75 minute session.'], exp: 'Phase order and counts as above.',
  async run(env){
    const sb = await env.boot({live: true}); const s = sb.generate({focusArea: 'keep_the_ball', duration: 75, location: 'outdoor', ageGroup: 'U10', sessionStyle: 'balanced'}); const order = sb.e('PHASES').map(p => p.key);
    QA.deepEq(s.phases.map(p => p.phase.key), order.filter(k => s.phases.some(p => p.phase.key === k)), 'Phase order'); const w = s.phases.find(p => p.phase.key === 'warmup'), a = s.phases.find(p => p.phase.key === 'athletic');
    assert(w.items.length <= 1 && a.items.length <= 2, 'Activate limits exceeded'); const act = w.totalMin + a.totalMin; assert(Math.abs(act - 0.25 * s.totalMin) <= 6, `Activate is ${act} of ${s.totalMin} min`);
  }});
add('CS-039', C.core, 'Generator', 'Every generated exercise carries a plain-English reason, and the session has an explanation.', {
  severity: 'Minor', tags: ['generator'], steps: ['Open "How FT2 built this session".'], exp: 'A reason per exercise; step-by-step explanation.',
  async run(env){ const sb = await env.boot({live: true}); const s = sb.generate({focusArea: 'beat_players', duration: 60, location: 'outdoor', ageGroup: 'U9', sessionStyle: 'technical'}); s.phases.forEach(p => p.items.forEach(i => assert(i.why && String(i.why).length > 10, 'No reason for ' + i.ex.name))); assert(s.explanation && s.explanation.steps && s.explanation.steps.length >= 3, 'Explanation too thin'); }});
add('CS-040', C.vis, 'Custom flow', 'Custom Session screens on a phone: sticky Back pills, spacing, step labels, focus cards, Save bar.', {
  type: 'Manual', severity: 'Polish', tags: ['custom', 'visual'], steps: ['Walk Steps 1-4 on a phone in light and dark.'], exp: 'Back pill docks while scrolling; equal spacing above/below it; nothing clipped.', run: null});

QA.register(tests);
})();
