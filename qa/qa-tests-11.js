/* FT2 QA inventory, part 11: ADMIN DASHBOARD, Pass 2 (Nov 2026) - Settings > Admin Dashboard and the coach-profile report behind it.
   Server tests (AD-S..) run the REAL Apps Script file on a pretend Sheet. Client tests (AD-C..) run the real app in the sandbox against that
   same server code: a club with known history is created first, so every number on the dashboard can be checked against what really happened. */
(function(){
'use strict';
const QA = window.QA, C = QA.C, T = QA.T;
const {assert, eq} = QA;
const tests = [];
const add = (...a) => tests.push(T(...a));
const adt = (id, desc, o) => add(id, o.cat || C.core, o.screen || 'Admin Dashboard', desc, Object.assign({severity: 'Critical', tags: ['analytics', 'admin'], timeout: 60000}, o));

let seq = 0;
const ev = (type, o) => Object.assign({id: 'ad' + (++seq) + '_' + Math.random().toString(36).slice(2, 12), type}, o || {});
const view = n => ev('exercise_viewed', {entityId: 'EX00' + n, meta: {name: 'Drill ' + n}});
const added = n => ev('exercise_added', {entityId: 'EX00' + n, meta: {name: 'Drill ' + n}});
const times = (k, f) => Array.from({length: k}, f);
const sess = (id, nums, o) => Object.assign({id, name: 'Session ' + id, createdAt: Date.now() - 5000, updatedAt: Date.now() - 4000, lastUsedAt: Date.now() - 3000, totalMin: nums.length * 10, exCount: nums.length, targetDuration: 60,
  practiceDate: '2026-11-02', startTime: '17:00', location: 'outdoor', locationPref: '', templateId: '', rating: 4, comment: 'PRIVATE-COMMENT', favorited: false, notes: 'PRIVATE-NOTE', visibility: 'private',
  phases: [{label: 'Warmup', section: 'Warmup', exercises: nums.map(n => ({id: 'EX00' + n, name: 'Drill ' + n, duration: 10}))}]}, o || {});
const posts = (sb, action) => sb.ctx.fetchLog.filter(f => (f.body || '').includes('"action":"' + action + '"')).length;
const REPORTS = ['getAdminOverview', 'getAdminCoachActivity', 'getAdminExerciseAnalytics', 'getAdminSessionAnalytics', 'getAdminFeatureAnalytics', 'getAdminActivityFeed', 'getAdminCoachProfile'];
const reportPosts = sb => REPORTS.reduce((a, r) => a + posts(sb, r), 0);

/* A club with known history. Alice and Bob are ordinary coaches; the app is opened as "QA Coach" (an administrator unless admin:false).
   Alice: views Drill 1 x5, Drill 2 x3; adds Drill 1 x2; Quick Pick x2; one search. Saves A1 [1,2] (shared, titled) and A2 [1] (private, custom: keep_the_ball / U10 / balanced / indoor).
   Bob:   views Drill 1 x1, Drill 3 x4; adds Drill 2 x1; Balance My Session x1. Saves B1 [1,3] (private). */
async function world(env, o){
  o = o || {};
  const backend = await QA.makeBackend(), srv = backend.server;
  const A = srv.coach('Alice Coach'), B = srv.coach('Bob Coach');
  srv.sheet('Coaches').getRange(2, 5).setValue(Date.now() - 10 * 86400000); srv.sheet('Coaches').getRange(3, 5).setValue(Date.now() - 5 * 86400000);      // Alice joined 10 days ago, Bob 5
  const log = (c, events) => { for(let i = 0; i < events.length; i += 20){ const r = srv.post({action: 'logEvent', token: c.token, events: events.slice(i, i + 20)}); if(!r.ok) throw new Error('QA could not seed events: ' + JSON.stringify(r)); } };
  const up = (c, s) => { const r = srv.post({action: 'upsert', token: c.token, session: s}); if(!r.ok) throw new Error('QA could not seed a session: ' + JSON.stringify(r)); return r; };
  if(!o.empty){
    log(A, [...times(5, () => view(1)), ...times(3, () => view(2)), added(1), added(1), ev('quick_pick_used', {meta: {section: 'warmup'}}), ev('quick_pick_used', {meta: {section: 'warmup'}}), ev('exercise_search_performed')]);
    log(B, [view(1), ...times(4, () => view(3)), added(2), ev('balance_session_used')]);
    up(A, sess('SESS_A1', [1, 2], {visibility: 'shared', name: 'Shared Rondo Plan'}));
    up(A, sess('SESS_A2', [1], {name: 'SECRET-TITLE-A2', focusArea: 'keep_the_ball', ageGroup: 'U10', sessionStyle: 'balanced', location: 'indoor'}));
    up(B, sess('SESS_B1', [1, 3], {name: 'SECRET-TITLE-B1'}));
    if(o.extra) o.extra({srv, A, B, log, up});
  }
  const me = backend.signIn('QA Coach');
  if(o.admin !== false) srv.makeAdmin('QA Coach');
  const sb = await env.boot(Object.assign({backend}, o.boot || {}));
  return {sb, srv, backend, A, B, me, log, up};
}
const openCoach = (sb, name) => { const r = sb.qa('#adCoachList .ad-tr:not(.ad-th)').find(x => x.textContent.includes(name)); if(!r) throw new Error('No row for ' + name + ' in the coach list'); r.click(); };
const loaded = sb => sb.until(() => sb.q('#adBody') && !sb.q('#adBody .ad-loading'), 8000, 'the reports to load');
async function openDash(sb){
  sb.fn('openSettingsTab'); await sb.until(() => sb.q('#adSettingsRow'), 6000, 'the Admin Dashboard row in Settings');
  sb.clickSel('#adSettingsRow'); eq(sb.screen, 'admin', 'Screen after tapping Admin Dashboard'); await loaded(sb);
}
async function tab(sb, name){ sb.click(name, '.ad-tabs', {exact: true}); await loaded(sb); }
const kpi = (sb, label) => { const k = sb.qa('#adBody .ad-kpi').find(x => x.querySelector('.ad-kpi-label').textContent.trim().toLowerCase() === label.toLowerCase()); if(!k) throw new Error('No "' + label + '" card on the dashboard'); return k.querySelector('.ad-kpi-value').textContent.trim(); };
const rowsOf = (sb, sel) => sb.qa(sel + ' .ad-tr:not(.ad-th)').map(r => [...r.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
const noPrivate = (sb, what) => ['SECRET-TITLE', 'PRIVATE-NOTE', 'PRIVATE-COMMENT'].forEach(x => assert(!sb.doc.documentElement.innerHTML.includes(x), what + ' shows private text: ' + x));

/* ================================================================== SERVER: the coach-profile report */
adt('AD-S01', 'The coach-profile report is for administrators only, is worked out from the real events and saved sessions, keeps viewed / added / in-saved-sessions as three separate lists, and never returns notes, comments or the titles of private sessions.', {
  cat: C.sec, tags: ['analytics', 'admin', 'security'], steps: ['Ask for a coach\'s profile as a coach, with no sign-in, and as an administrator.'], exp: 'Refused unless administrator; numbers match; nothing private.',
  async run(env){ const {sb, srv, B, me} = await world(env); sb.destroy();
    const ask = (token, o) => srv.post(Object.assign({action: 'getAdminCoachProfile', token, coach: 'Alice Coach', period: '30d'}, o || {}));
    eq(ask(B.token).error, 'forbidden', 'An ordinary coach'); eq(ask('').error, 'auth', 'No sign-in'); eq(ask('x'.repeat(40)).error, 'auth', 'A made-up token');
    const r = ask(me.token); eq(r.ok, true, 'Administrator'); const c = r.coach;
    QA.deepEq([c.name, c.sessionsSaved, c.sessionsSavedAllTime, c.sessionsShared, c.exercisesAdded, c.exerciseViews, c.active], ['Alice Coach', 2, 2, 1, 2, 8, true], 'Alice (name, saved, all time, shared, added, views, active)');
    QA.deepEq(r.topViewed.map(x => [x.name, x.count]), [['Drill 1', 5], ['Drill 2', 3]], 'Most viewed'); QA.deepEq(r.topAdded.map(x => [x.name, x.count]), [['Drill 1', 2]], 'Most added'); QA.deepEq(r.topInSavedSessions.map(x => [x.name, x.count]), [['Drill 1', 2], ['Drill 2', 1]], 'Most used in saved sessions');
    eq(r.features.find(f => f.feature === 'quick_pick').uses, 2, 'Quick Pick uses'); assert(!r.features.some(f => f.feature === 'balance_session'), 'Bob\'s feature use leaked into Alice\'s profile');
    eq(r.trend.reduce((a, b) => a + b.sessionsSaved, 0), 2, 'Sessions in the trend'); assert(r.recentActivity.length > 0 && r.recentActivity.length <= 15, 'Recent actions');
    const text = JSON.stringify(r); ['SECRET-TITLE', 'PRIVATE-NOTE', 'PRIVATE-COMMENT', me.token, srv.club].forEach(x => assert(!text.includes(x), 'The profile contains: ' + x)); assert(text.includes('Shared Rondo Plan'), 'A shared session\'s title is allowed');
    eq(ask(me.token, {coach: 'Nobody Here'}).error, 'invalid', 'An unknown coach'); eq(ask(me.token, {coach: ''}).ok, false, 'No coach named'); eq(ask(me.token, {period: '1y'}).error, 'invalid', 'A bad period');
    const bob = ask(me.token, {coach: 'bob  COACH'}); eq(bob.coach.name, 'Bob Coach', 'Name matching ignores capitals / spaces'); QA.deepEq([bob.coach.exerciseViews, bob.coach.exercisesAdded, bob.coach.sessionsSaved], [5, 1, 1], 'Bob'); }});

adt('AD-S02', 'Every report says when usage recording began (nothing yet = no date), so "nobody used it" can be told apart from "it was not being recorded".', {
  cat: C.integ, severity: 'Major', steps: ['Read a report before any event exists, then after.'], exp: 'No date first; then the first event\'s time.',
  async run(){ const srv = await QA.newServer(); const A = srv.coach('Alice Coach'), me = srv.coach('QA Coach'); srv.makeAdmin('QA Coach'); const log = (c, events) => srv.post({action: 'logEvent', token: c.token, events}); const ask = a => srv.post({action: a, token: me.token, period: 'all'});
    const before = ask('getAdminFeatureAnalytics'); eq(before.ok, true, 'Report'); assert('trackingSince' in before && before.trackingSince === null, 'trackingSince before any event: ' + before.trackingSince);
    log(A, [ev('quick_pick_used')]); const first = srv.events()[0].timestamp; ['getAdminOverview', 'getAdminFeatureAnalytics', 'getAdminActivityFeed', 'getAdminExerciseAnalytics'].forEach(a => eq(ask(a).trackingSince, first, 'trackingSince in ' + a)); }});

/* ================================================================== CLIENT: who can see it */
adt('AD-C01', 'An ordinary coach never sees the Admin Dashboard: no row in Settings, and going to the screen directly shows "Administrators only" with no numbers and without a single report being requested. The server refuses the reports too.', {
  cat: C.sec, tags: ['analytics', 'admin', 'security', 'settings'], steps: ['As a normal coach open Settings; force the dashboard screen; try the reports directly.'], exp: 'No entry, no data, server says forbidden.',
  async run(env){ const {sb, srv, me} = await world(env, {admin: false});
    sb.fn('openSettingsTab'); await sb.until(() => posts(sb, 'getAdminStatus') === 1 && sb.e('ad.status') === 'denied', 6000, 'the access check'); assert(!sb.q('#adSettingsRow') && !sb.has('Admin Dashboard', '#content'), 'Settings shows an Admin Dashboard entry to a normal coach'); assert(!sb.has('Admin', '#bottomnav'), 'Bottom menu has an Admin item');
    sb.fn('nav', 'admin'); eq(sb.screen, 'admin', 'Forced screen'); assert(sb.has('Administrators only', '#content'), 'No access-denied message'); assert(!sb.q('.ad-tabs') && !sb.q('.ad-kpi') && !sb.q('#adBody'), 'Dashboard parts were drawn for a normal coach');
    sb.e("ad.status = 'admin'"); sb.fn('render'); await sb.until(() => sb.has('Administrators only', '#content'), 6000, 'the server to refuse');       // even if the hint is forced, the server decides
    eq(sb.e('ad.status'), 'denied', 'Status after the server refused'); eq(sb.e('Object.keys(ad.cache).length'), 0, 'Reports kept after being refused'); assert(!sb.q('.ad-kpi'), 'Numbers drawn after being refused'); assert(!/Alice|Bob Coach|Drill 1/.test(sb.text('#content')), 'Club data on a normal coach\'s screen');
    REPORTS.forEach(a => eq(srv.post({action: a, token: me.token, coach: 'Alice Coach'}).error, 'forbidden', a + ' for a normal coach'));
    sb.flushState(); const stored = JSON.stringify([...sb.ctx.store.entries()]); assert(!/Bob Coach|Drill 3|quick_pick/.test(stored), 'Report data in this phone\'s storage');
    const out = await env.boot({auth: false}); out.fn('openSettingsTab'); await out.sleep(300); eq(posts(out, 'getAdminStatus'), 0, 'A coach who is not signed in asked the server'); assert(!out.q('#adSettingsRow'), 'Entry shown when not signed in'); out.fn('nav', 'admin'); assert(out.has('Sign in to the club first', '#content') && !out.q('.ad-tabs'), 'Dashboard when not signed in'); eq(reportPosts(out), 0, 'Reports requested when not signed in'); }});

adt('AD-C02', 'An administrator finds Admin Dashboard in Settings (not in the bottom menu), it opens with the title "Admin Dashboard", six sections and the four date ranges, and "Back to Settings" returns to Settings. Settings stays lit in the bottom menu.', {
  tags: ['analytics', 'admin', 'settings', 'navigation'], steps: ['Open Settings, tap Admin Dashboard, look, go back.'], exp: 'Entry, title, 6 sections, 4 ranges, back works.',
  async run(env){ const {sb} = await world(env); await openDash(sb);
    eq(sb.q('#content h2').textContent.trim(), 'Admin Dashboard', 'Page title'); QA.deepEq(sb.qa('.ad-tab').map(b => b.textContent.trim()), ['Overview', 'Coaches', 'Exercises', 'Sessions', 'Feature Usage', 'Activity Feed'], 'Sections');
    QA.deepEq(sb.qa('.ad-seg button').map(b => b.getAttribute('aria-label')), ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'All Time'], 'Date ranges'); eq(sb.q('.ad-seg button.active').getAttribute('aria-label'), 'Last 30 Days', 'Default range');
    QA.deepEq(sb.qa('#bottomnav .navitem').map(b => b.textContent.trim()), ['Home', 'Exercises', 'Sessions', 'Settings'], 'Bottom menu'); eq(sb.q('#bottomnav .navitem.active').textContent.trim(), 'Settings', 'Lit bottom-menu item');
    eq(posts(sb, 'getAdminStatus'), 1, 'Access checks'); sb.click('Back to Settings'); eq(sb.screen, 'settings', 'After Back'); assert(sb.q('#adSettingsRow'), 'Row after coming back'); eq(posts(sb, 'getAdminStatus'), 1, 'Access asked again for nothing');
    sb.flushState(); const sb2 = await QA.lib.reopen(sb); eq(posts(sb2, 'getAdminOverview'), 0, 'A fresh launch asked for reports before the dashboard was opened'); eq(sb2.errors.length, 0, 'Errors: ' + sb2.errors.join(' | ')); }});

/* ================================================================== CLIENT: the numbers */
adt('AD-C03', 'Overview shows the six headline numbers exactly as the server worked them out from real activity, plus the three charts; switching sections and coming back does not ask the server again; changing the date range does.', {
  cat: C.integ, tags: ['analytics', 'admin', 'sync'], steps: ['Open the dashboard on a club with known history.'], exp: '3 coaches, 2 active, 3 saved, 3 added, 1 shared, Quick Pick.',
  async run(env){ const {sb, srv, me} = await world(env); await openDash(sb);
    const truth = srv.post({action: 'getAdminOverview', token: me.token, period: '30d'}).totals;
    QA.deepEq([kpi(sb, 'Total Coaches'), kpi(sb, 'Active Coaches'), kpi(sb, 'Sessions Saved'), kpi(sb, 'Exercises Added'), kpi(sb, 'Sessions Shared'), kpi(sb, 'Most Used Feature')], ['3', '2', '3', '3', '1', 'Quick Pick'], 'Headline numbers');
    QA.deepEq([truth.totalCoaches, truth.activeCoaches, truth.sessionsSaved, truth.exercisesAdded, truth.sessionsShared], [3, 2, 3, 3, 1], 'The server\'s own numbers'); eq(sb.qa('#adBody .ad-kpi').length, 6, 'Headline cards');
    ['Coach Activity Over Time', 'Sessions Saved Over Time', 'Most Popular Focus Areas'].forEach(t => assert(sb.has(t, '#adBody'), 'Missing chart: ' + t)); eq(sb.qa('#adBody .ad-line polyline').length, 1, 'Line chart'); assert(sb.qa('#adBody .ad-bar').length >= 1, 'Bar chart has no bars'); eq(sb.qa('#adBody .ad-hit').length, 60, 'One point per day in both time charts');
    const today = sb.qa('#adBody .ad-plot')[0].querySelectorAll('.ad-hit'); assert(/2 active coaches$/.test(today[today.length - 1].getAttribute('data-tip')), 'Today\'s read-out: ' + today[today.length - 1].getAttribute('data-tip')); assert(/3 sessions saved$/.test([...sb.qa('#adBody .ad-plot')[1].querySelectorAll('.ad-hit')].pop().getAttribute('data-tip')), 'Sessions read-out');
    assert(sb.has('Keep the Ball', '#adBody') && sb.has('Not set', '#adBody'), 'Focus areas'); assert(!sb.q('#adBody .ad-error'), 'An error is showing'); noPrivate(sb, 'Overview');
    eq(posts(sb, 'getAdminOverview'), 1, 'Overview requests'); eq(posts(sb, 'getAdminSessionAnalytics'), 1, 'Session requests'); await tab(sb, 'Sessions'); await tab(sb, 'Overview'); eq(posts(sb, 'getAdminOverview'), 1, 'Overview asked again after switching sections'); eq(posts(sb, 'getAdminSessionAnalytics'), 1, 'Sessions asked again (Overview and Sessions share one report)');
    sb.click('7 Days', '.ad-seg', {exact: true}); await loaded(sb); eq(posts(sb, 'getAdminOverview'), 2, 'Requests after changing the range'); assert(sb.ctx.fetchLog.some(f => /"action":"getAdminOverview"/.test(f.body || '') && /"period":"7d"/.test(f.body)), 'The 7-day range was not sent'); eq(sb.qa('#adBody .ad-plot')[0].querySelectorAll('.ad-hit').length, 7, 'Days in a 7-day chart'); eq(kpi(sb, 'Sessions Saved'), '3', 'Saved in 7 days');
    sb.click('30 Days', '.ad-seg', {exact: true}); await loaded(sb); eq(posts(sb, 'getAdminOverview'), 2, 'Going back to a range already loaded asked again'); await tab(sb, 'Coaches'); eq(sb.q('.ad-seg button.active').getAttribute('aria-label'), 'Last 30 Days', 'The range is kept across sections');
    sb.clickSel('.ad-refresh'); await loaded(sb); eq(posts(sb, 'getAdminCoachActivity'), 2, 'Refresh asks again'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

adt('AD-C04', 'Coaches: every coach is listed with joined date, last active, sessions saved, exercises added and sessions shared; search and sorting work; tapping a coach opens their activity (three separate exercise lists, features, recent actions) and Back returns to the list.', {
  tags: ['analytics', 'admin'], steps: ['Open Coaches; search; sort; open Alice; go back.'], exp: 'Right numbers; profile matches.',
  async run(env){ const {sb} = await world(env); await openDash(sb); await tab(sb, 'Coaches');
    let rows = rowsOf(sb, '#adCoachList'); eq(rows.length, 3, 'Coaches listed'); const by = n => rows.find(r => r[0].includes(n));
    QA.deepEq(by('Alice Coach').slice(3), ['2', '2', '1'], 'Alice (saved, added, shared)'); QA.deepEq(by('Bob Coach').slice(3), ['1', '1', '0'], 'Bob'); QA.deepEq(by('QA Coach').slice(3), ['0', '0', '0'], 'QA Coach'); eq(by('Alice Coach')[2], 'Today', 'Alice last active'); eq(by('QA Coach')[2], 'Never', 'A coach who has only opened the app'); assert(/\d{4}/.test(by('Bob Coach')[1]), 'Joined date: ' + by('Bob Coach')[1]);
    sb.fn('adSetCoachSort', 'sessionsSaved'); QA.deepEq(rowsOf(sb, '#adCoachList').map(r => r[0].replace(/Active.*/, '').trim()), ['ACAlice Coach', 'BCBob Coach', 'QCQA Coach'], 'Sorted by sessions saved'); sb.fn('adSetCoachSort', 'name'); assert(rowsOf(sb, '#adCoachList')[0][0].includes('Alice'), 'Sorted by name'); sb.fn('adSetCoachSort', 'joined'); assert(rowsOf(sb, '#adCoachList')[0][0].includes('QA Coach'), 'Newest joined first'); sb.fn('adSetCoachSort', 'exercisesAdded'); assert(rowsOf(sb, '#adCoachList')[0][0].includes('Alice'), 'Sorted by exercises added');
    const before = reportPosts(sb); const box = sb.q('#adCoachSearch'); box.focus(); sb.type(box, 'bo'); eq(rowsOf(sb, '#adCoachList').length, 1, 'Search "bo"'); assert(sb.q('#adCoachSearch') === box, 'The search box was rebuilt while typing (the keyboard would close)'); sb.type(box, 'zzz'); assert(sb.has('No coach matches', '#adCoachList'), 'No-match message'); sb.type(box, ''); eq(rowsOf(sb, '#adCoachList').length, 3, 'Search cleared'); eq(reportPosts(sb), before, 'Searching / sorting asked the server');
    openCoach(sb, 'Alice Coach'); await loaded(sb); assert(sb.has('Back to Coaches', '#adBody'), 'No way back'); QA.deepEq([kpi(sb, 'Sessions Saved'), kpi(sb, 'Exercises Added'), kpi(sb, 'Sessions Shared')], ['2', '2', '1'], 'Alice\'s profile numbers'); assert(sb.has('Active in this period', '.ad-profile-head'), 'Active badge');
    const card = t => sb.qa('#adBody .ad-card').find(c => (c.querySelector('.ad-card-title') || {}).textContent === t); const list = t => [...card(t).querySelectorAll('.ad-hbar')].map(r => r.querySelector('.ad-hbar-label').textContent + '=' + r.querySelector('.ad-hbar-val').textContent.trim());
    QA.deepEq(list('Most Viewed Exercises'), ['Drill 1=5', 'Drill 2=3'], 'Most viewed'); QA.deepEq(list('Most Added Exercises'), ['Drill 1=2'], 'Most added'); QA.deepEq(list('Most Used in Saved Sessions'), ['Drill 1=2', 'Drill 2=1'], 'Most used in saved sessions'); assert(list('Most Used Features').includes('Quick Pick=2'), 'Features: ' + list('Most Used Features'));
    assert(card('Activity Over Time').querySelectorAll('.ad-bar').length >= 1, 'Activity chart'); assert(card('Recent Actions').querySelectorAll('.ad-feed-row').length >= 5, 'Recent actions'); noPrivate(sb, 'A coach profile');
    sb.click('Back to Coaches'); await loaded(sb); eq(rowsOf(sb, '#adCoachList').length, 3, 'Back on the list'); eq(posts(sb, 'getAdminCoachActivity'), 1, 'The list was asked for again'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

adt('AD-C05', 'Exercises: views, additions and saved-session use are three separate numbers for every exercise (Drill 1 = 6 / 2 / 3); the three rankings each use their own measure; search and sorting work; an exercise that is looked at but never added is pointed out.', {
  tags: ['analytics', 'admin', 'exercises'], steps: ['Open Exercises; read the table; switch rankings; search; sort.'], exp: 'Three distinct measures.',
  async run(env){ const {sb} = await world(env); await openDash(sb); await tab(sb, 'Exercises');
    QA.deepEq([kpi(sb, 'Exercise Views'), kpi(sb, 'Additions'), kpi(sb, 'In Saved Sessions')], ['13', '3', '5'], 'Totals (views, additions, in saved sessions)');
    const rows = () => rowsOf(sb, '#adExList').map(r => [r[0].replace(/Warmup.*|no longer.*/, '').trim(), ...r.slice(1)]);
    QA.deepEq(rows(), [['Drill 1', '6', '2', '3', '2'], ['Drill 3', '4', '0', '1', '1'], ['Drill 2', '3', '1', '1', '1']], 'Table, most viewed first (views, additions, saved sessions, unique coaches)');
    const ranking = () => [...sb.qa('#adBody .ad-card')[0].querySelectorAll('.ad-hbar')].map(r => r.querySelector('.ad-hbar-label').textContent + '=' + r.querySelector('.ad-hbar-val').textContent.trim());
    QA.deepEq(ranking(), ['Drill 1=6', 'Drill 3=4', 'Drill 2=3'], 'Most Viewed'); sb.click('Most Added', '.ad-pills', {exact: true}); QA.deepEq(ranking(), ['Drill 1=2', 'Drill 2=1'], 'Most Added'); sb.click('Most Used in Saved Sessions', '.ad-pills'); QA.deepEq(ranking(), ['Drill 1=3', 'Drill 2=1', 'Drill 3=1'], 'Most Used in Saved Sessions');
    const ins = sb.qa('.ad-insight').map(b => b.textContent.replace(/\s+/g, ' ')); assert(ins.some(t => /Viewed a lot, rarely added/.test(t) && /Drill 3/.test(t) && !/Drill 1/.test(t)), 'Viewed-but-not-added insight: ' + ins.join(' || ')); assert(ins.some(t => /Added most often/.test(t) && /Drill 1/.test(t)), 'Added-most insight'); assert(ins.some(t => /Used by the most coaches/.test(t) && /Drill 1/.test(t) && !/Drill 2/.test(t)), 'Most-coaches insight');
    sb.fn('adSetExSort', 'additions'); QA.deepEq(rows().map(r => r[0]), ['Drill 1', 'Drill 2', 'Drill 3'], 'Sorted by additions'); sb.fn('adSetExSort', 'coachesUsed'); eq(rows()[0][0], 'Drill 1', 'Sorted by unique coaches'); sb.fn('adSetExSort', 'savedSessions'); eq(rows()[0][0], 'Drill 1', 'Sorted by saved sessions'); sb.fn('adSetExSort', 'views');
    const box = sb.q('#adExSearch'); sb.type(box, 'drill 3'); QA.deepEq(rows().map(r => r[0]), ['Drill 3'], 'Search'); sb.type(box, 'nothing'); assert(sb.has('No exercise matches', '#adExList'), 'No-match message'); sb.type(box, ''); eq(rows().length, 3, 'Search cleared'); eq(posts(sb, 'getAdminExerciseAnalytics'), 1, 'Searching / sorting / ranking asked the server'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

adt('AD-C06', 'Sessions shows the four headline numbers and the four breakdowns from the saved sessions themselves; Feature Usage lists every tracked feature with uses, coaches and adoption %, most used first.', {
  cat: C.integ, tags: ['analytics', 'admin', 'saved'], steps: ['Open Sessions, then Feature Usage.'], exp: '3 saved, 1 shared, 1.7 exercises, 16.7 min; Quick Pick 2 uses / 1 coach / 50%.',
  async run(env){ const {sb, srv, me} = await world(env); await openDash(sb); await tab(sb, 'Sessions');
    QA.deepEq([kpi(sb, 'Total Sessions Saved'), kpi(sb, 'Total Sessions Shared'), kpi(sb, 'Avg Exercises per Session'), kpi(sb, 'Avg Session Duration')], ['3', '1', '1.7', '16.7 min'], 'Headline numbers');
    const card = t => sb.qa('#adBody .ad-card').find(c => (c.querySelector('.ad-card-title') || {}).textContent === t); const list = t => [...card(t).querySelectorAll('.ad-hbar')].map(r => r.querySelector('.ad-hbar-label').textContent + '=' + r.querySelector('.ad-hbar-val').textContent.replace(/\s+/g, ' ').trim());
    QA.deepEq(list('Focus Areas'), ['Keep the Ball=1 · 33.3%', 'Not set=2 · 66.7%'], 'Focus areas'); QA.deepEq(list('Age Groups'), ['U10=1 · 33.3%', 'Not set=2 · 66.7%'], 'Age groups'); QA.deepEq(list('Session Style'), ['Balanced=1 · 33.3%', 'Not set=2 · 66.7%'], 'Styles'); QA.deepEq(list('Location'), ['Outdoor=2 · 66.7%', 'Indoor=1 · 33.3%'], 'Location'); noPrivate(sb, 'Sessions');
    await tab(sb, 'Feature Usage'); const truth = srv.post({action: 'getAdminFeatureAnalytics', token: me.token, period: '30d'}).features; const rows = rowsOf(sb, '#adBody'); eq(rows.length, truth.length, 'Features listed');
    QA.deepEq(rows[0], ['1. Quick Pick', '2', '1', '50%'], 'Top feature (uses, coaches, adoption)'); truth.forEach((f, i) => { assert(rows[i][0].includes(f.label), 'Order: row ' + i + ' is ' + rows[i][0] + ', expected ' + f.label); QA.deepEq(rows[i].slice(1), [String(f.uses), String(f.coaches), f.adoptionPct + '%'], f.label); });
    ['Custom Session Generator', 'Quick Pick', 'Balance My Session', 'Favorites', 'Templates', 'Exercise Search', 'Print / Export', 'Share Session'].forEach(l => assert(rows.some(r => r[0].includes(l)), 'Feature missing: ' + l));
    const zero = rows.find(r => r[0].includes('Print / Export')); assert(/0 recorded/.test(zero[0]) && zero[1] === '0', 'A feature nobody used while recording was on must read as a real zero: ' + zero.join(' | ')); assert(sb.has('Usage recording began on', '#adBody'), 'A range that reaches back before recording began must say so'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

adt('AD-C07', 'Activity Feed lists real events newest first in plain sentences with the coach, what it was about and when; private sessions are never named; filtering by coach and by activity works; older entries load on request.', {
  cat: C.integ, tags: ['analytics', 'admin', 'privacy'], steps: ['Open the feed on a club with 70+ events; filter; load more.'], exp: 'Readable entries; 50 then more.',
  async run(env){ const {sb, srv} = await world(env, {extra: ({B, log}) => log(B, times(60, (_, i) => Object.assign(view(3), {age: (i + 1) * 1000})))}); await openDash(sb); await tab(sb, 'Activity Feed');
    const rows = () => sb.qa('#adBody .ad-feed-row').map(r => r.querySelector('.ad-feed-text').textContent.replace(/\s+/g, ' ').trim()); const first = rows().length; assert(first >= 50 && first < 84, 'First page: ' + first); const total = srv.events().filter(e => e.eventType !== 'app_opened' && e.eventType !== 'app_session_started').length;
    assert(!sb.has('exercise_viewed', '#adBody') && !sb.has('session_saved', '#adBody'), 'Raw event names are showing'); assert(rows().every(t => /^(AC|BC|QC)?\s*(Alice|Bob|QA) Coach /.test(t)), 'An entry without its coach: ' + rows().find(t => !/(Alice|Bob|QA) Coach /.test(t))); assert(rows().every(t => /\d{1,2}:\d\d/.test(t)), 'An entry without a time');
    sb.click('Show older activity'); await sb.until(() => rows().length > first && !sb.q('#adBody .ad-loading'), 8000, 'older entries'); eq(rows().length, total, 'All entries after loading more'); assert(!sb.q('#adFeedMoreBtn'), 'Still offering more'); eq(posts(sb, 'getAdminActivityFeed'), 2, 'Feed requests');
    const all = rows().join(' || '); assert(/Alice Coach viewed Drill 1/.test(all) && /Alice Coach added Drill 1 to a session/.test(all) && /Alice Coach used Quick Pick/.test(all) && /Bob Coach used Balance My Session/.test(all) && /Alice Coach saved a private session/.test(all) && /Alice Coach (saved|shared) the session Shared Rondo Plan/.test(all) && /searched the exercise library/.test(all), 'Sentences: ' + all.slice(0, 600)); noPrivate(sb, 'The feed');
    sb.type(sb.q('#adFeedCoachSel'), 'alice coach'); await loaded(sb); assert(rows().length > 0 && rows().every(t => t.startsWith('Alice Coach')), 'Coach filter'); eq(sb.q('#adFeedCoachSel').value, 'alice coach', 'Coach filter kept');
    sb.type(sb.q('#adFeedTypeSel'), 'quick_pick_used'); await loaded(sb); QA.deepEq(rows().map(t => t.replace(/(Quick Pick).*/, '$1')), ['Alice Coach used Quick Pick', 'Alice Coach used Quick Pick'], 'Coach + activity filter'); sb.type(sb.q('#adFeedCoachSel'), 'bob coach'); await loaded(sb); assert(sb.has('Nothing matches these filters', '#adBody'), 'Empty filtered feed');
    await tab(sb, 'Overview'); await tab(sb, 'Activity Feed'); eq(sb.q('#adFeedTypeSel').value, 'quick_pick_used', 'Filters kept when leaving and coming back'); sb.type(sb.q('#adFeedCoachSel'), ''); sb.type(sb.q('#adFeedTypeSel'), ''); await loaded(sb); sb.click('7 Days', '.ad-seg', {exact: true}); await loaded(sb); assert(sb.ctx.fetchLog.some(f => /getAdminActivityFeed/.test(f.body || '') && /"period":"7d"/.test(f.body)), 'The date range was not applied to the feed'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

/* ================================================================== CLIENT: loading, empty, error, partial */
adt('AD-C08', 'A brand-new club shows honest empty states (and says nothing has been recorded yet) instead of blank charts or made-up numbers.', {
  cat: C.err, severity: 'Major', tags: ['analytics', 'admin', 'error'], steps: ['Open each section when nothing has happened yet.'], exp: 'Zeros where they are real, explanations everywhere else.',
  async run(env){ const {sb} = await world(env, {empty: true}); sb.e('anOff = true'); await openDash(sb);
    QA.deepEq([kpi(sb, 'Total Coaches'), kpi(sb, 'Active Coaches'), kpi(sb, 'Sessions Saved'), kpi(sb, 'Most Used Feature')], ['3', '0', '0', '—'], 'Overview'); ['No coach activity in this period', 'No sessions have been saved', 'No usage has been recorded yet'].forEach(t => assert(sb.has(t, '#adBody'), 'Overview is missing: ' + t)); assert(!sb.q('#adBody .ad-plot'), 'A chart was drawn with nothing to show');
    await tab(sb, 'Coaches'); eq(rowsOf(sb, '#adCoachList').length, 3, 'Coaches still listed'); await tab(sb, 'Exercises'); assert(sb.has('No exercise activity in this period', '#adBody'), 'Exercises empty state'); await tab(sb, 'Sessions'); assert(sb.has('No sessions have been saved', '#adBody') && kpi(sb, 'Avg Session Duration') === '—', 'Sessions empty state');
    await tab(sb, 'Feature Usage'); assert(sb.has('No tracking data yet', '#adBody'), 'Features must say there is no tracking data (not "0 uses")'); assert(rowsOf(sb, '#adBody').every(r => r[1] === '—'), 'Untracked features show a number'); await tab(sb, 'Activity Feed'); assert(sb.has('Nothing has been recorded yet', '#adBody'), 'Feed empty state'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

adt('AD-C09', 'When the server cannot be reached, or sends something unexpected, the section says so and offers Try again - it never shows zeros or old numbers as if they were current - and the sections that did load stay usable. Losing administrator rights or the sign-in mid-way clears the screen.', {
  cat: C.err, tags: ['analytics', 'admin', 'error', 'offline', 'security'], steps: ['Fail one report; fail all; send a broken reply; remove the admin; expire the sign-in.'], exp: 'Clear error + Try again; partial data kept; no stale data.',
  async run(env){ const {sb, srv, backend} = await world(env); const real = backend.handle.bind(backend); let mode = {};
    backend.handle = async (url, o) => { const a = (() => { try{ return JSON.parse(o && o.body || '{}').action; }catch(e){ return ''; } })(); if(mode[a] === 'down') throw new TypeError('Failed to fetch'); if(mode[a] === 'junk') return new Response('<html>Sorry</html>', {status: 200}); if(mode[a] === 'odd') return backend.json({ok: true, totals: 'lots', trend: null}); if(mode[a] === 'old') return backend.json({ok: false, error: 'unknown_action'}); return real(url, o); };
    mode = {getAdminOverview: 'down'}; await openDash(sb); assert(sb.q('#adBody .ad-error') && sb.has("Couldn't reach the club server", '#adBody'), 'No error for a failed report'); assert(sb.has('Most Popular Focus Areas', '#adBody') && sb.has('Keep the Ball', '#adBody'), 'The part that loaded was thrown away'); eq(sb.qa('#adBody .ad-kpi').length, 0, 'Numbers shown for a report that failed');
    mode = {}; sb.click('Try again', '#adBody'); await loaded(sb); eq(kpi(sb, 'Total Coaches'), '3', 'After Try again'); assert(!sb.q('#adBody .ad-error'), 'Error still showing');
    mode = {getAdminCoachActivity: 'junk', getAdminExerciseAnalytics: 'odd', getAdminFeatureAnalytics: 'old'}; await tab(sb, 'Coaches'); assert(sb.q('#adBody .ad-error') && !sb.q('#adCoachList'), 'A reply that is not JSON'); await tab(sb, 'Exercises'); assert(sb.q('#adBody .ad-error') && sb.has("wasn't in the expected form", '#adBody') && sb.qa('#adBody .ad-kpi').length === 0, 'A reply in the wrong shape was drawn'); await tab(sb, 'Feature Usage'); assert(sb.has("hasn't had its latest update", '#adBody'), 'An older server');
    await tab(sb, 'Overview'); eq(kpi(sb, 'Total Coaches'), '3', 'Working section after others failed'); assert(sb.q('.ad-tabs') && sb.q('.ad-seg'), 'Navigation lost after errors');
    backend.down = true; sb.clickSel('.ad-refresh'); await loaded(sb); assert(sb.qa('#adBody .ad-error').length >= 1 && sb.qa('#adBody .ad-kpi').length === 0, 'Offline: old numbers stayed on screen as if current'); backend.down = false; mode = {}; sb.click('Try again', '#adBody'); await loaded(sb); eq(kpi(sb, 'Sessions Saved'), '3', 'Back online');
    mode = {getAdminCoachProfile: 'old'}; await tab(sb, 'Coaches'); openCoach(sb, 'Alice Coach'); await sb.until(() => sb.has('needs the latest update', '#adBody'), 6000, 'the older-server profile'); QA.deepEq([kpi(sb, 'Sessions Saved'), kpi(sb, 'Exercises Added')], ['2', '2'], 'Profile basics on an older server'); sb.click('Back to Coaches'); mode = {};
    srv.sheet('Admins').getRange(2, 1).setValue('Someone Else'); sb.clickSel('.ad-refresh'); await sb.until(() => sb.has('Administrators only', '#content'), 6000, 'access to be withdrawn'); assert(!sb.q('.ad-tabs') && !sb.q('.ad-kpi') && !/Alice Coach/.test(sb.text('#content')), 'Data stayed on screen after access was withdrawn'); eq(sb.e('Object.keys(ad.cache).length'), 0, 'Reports kept after access was withdrawn'); sb.click('Back to Settings'); assert(!sb.q('#adSettingsRow'), 'Settings still offers the dashboard');
    srv.sheet('Admins').getRange(2, 1).setValue('QA Coach'); sb.e("ad.status = 'unknown'"); await openDash(sb); const tok = sb.S.authToken; srv.post({action: 'logout', token: tok}); sb.clickSel('.ad-refresh'); await sb.until(() => sb.S.authStatus === 'expired', 6000, 'the sign-in to expire'); assert(sb.has('Sign in to the club first', '#content') && !sb.q('.ad-kpi') && !sb.q('.ad-tabs'), 'Dashboard after the sign-in expired'); eq(sb.e('Object.keys(ad.cache).length'), 0, 'Reports kept after signing out'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

adt('AD-C10', 'Names typed by coaches (coach names, exercise names, shared session titles) are shown as plain text everywhere on the dashboard - they can never run as code or add anything to the page - and no report is kept in this phone\'s storage.', {
  cat: C.sec, tags: ['analytics', 'admin', 'security', 'privacy'], steps: ['Seed hostile names; open every section and a profile.'], exp: 'Shown as text; nothing injected; nothing stored.',
  async run(env){ const evil = '<img src=x onerror="window.__pwned=1"><b id="inj">x</b>';
    const {sb} = await world(env, {extra: ({srv, A, log, up}) => { log(A, [ev('exercise_viewed', {entityId: 'EX009', meta: {name: evil}}), ev('exercise_added', {entityId: 'EX009', meta: {name: evil}})]); up(A, sess('SESS_X1', [1], {visibility: 'shared', name: evil})); srv.sheet('Coaches').appendRow(['eve <i id=inj2>co</i>', 'Eve <i id=inj2>Co</i>', '', '', Date.now() - 86400000]); srv.sheet('AnalyticsEvents').appendRow(['rawevil' + (++seq) + 'abcdefgh', new Date().toISOString(), 'eve <i id=inj2>co</i>', 'exercise_viewed', 'exercise', 'EX001', '', JSON.stringify({name: 'Drill 1'})]); }});
    await openDash(sb); for(const t of ['Coaches', 'Exercises', 'Sessions', 'Feature Usage', 'Activity Feed', 'Overview']){ await tab(sb, t); assert(!sb.q('#inj') && !sb.q('#inj2') && !sb.q('#content img[src="x"]'), 'Coach-typed text became part of the page in ' + t); }
    await tab(sb, 'Activity Feed'); assert(sb.text('#adBody').includes('<b id="inj">x</b>'), 'The name should be visible as text'); await tab(sb, 'Coaches'); const eve = sb.qa('#adCoachList .ad-tr:not(.ad-th)').find(r => r.textContent.includes('Eve')); assert(eve, 'Eve is not listed'); eve.click(); await loaded(sb); assert(sb.has('Back to Coaches', '#adBody') && sb.text('.ad-profile-name').includes('<i id=inj2>Co</i>') && !sb.q('#inj2'), 'Profile of a coach with markup in the name');
    await sb.sleep(50); assert(!sb.win.__pwned, 'Injected code ran'); eq(QA.cspLog.filter(x => /onerror|inj/.test(x)).length, 0, 'Blocked script attempts (should not even be attempted)');
    sb.flushState(); const stored = JSON.stringify([...sb.ctx.store.entries()]); assert(!/Bob Coach|Drill 3|quick_pick/.test(stored), 'Report data was written to this phone\'s storage'); eq(sb.errors.length, 0, 'Errors: ' + sb.errors.join(' | ')); }});

adt('AD-C11', 'The dashboard fits a phone held upright, a phone held sideways, a tablet and a computer: nothing spills off the side, every section opens, and controls are big enough to tap.', {
  cat: C.resp || C.core, severity: 'Major', tags: ['analytics', 'admin', 'responsive'], timeout: 120000, steps: ['Open every section at 390x844, 844x390, 768x1024 and 1280x800.'], exp: 'No sideways overflow; 44px controls.',
  async run(env){ const out = [];
    for(const [w, h] of [[390, 844], [844, 390], [768, 1024], [1280, 800], [320, 568]]){
      const {sb} = await world(env, {boot: {width: w, height: h}}); await openDash(sb);
      for(const t of ['Overview', 'Coaches', 'Exercises', 'Sessions', 'Feature Usage', 'Activity Feed']){ await tab(sb, t); if(t === 'Coaches'){ openCoach(sb, 'Alice Coach'); await loaded(sb); }
        const c = sb.q('#content'), root = sb.q('.ad-root'); assert(c.scrollWidth <= c.clientWidth + 1, `${t} at ${w}x${h}: the page scrolls sideways (${c.scrollWidth} > ${c.clientWidth})`); assert(sb.doc.documentElement.scrollWidth <= w + 1, `${t} at ${w}x${h}: wider than the screen`);
        const cr = c.getBoundingClientRect(); sb.qa('#adBody .ad-card, #adBody .ad-kpi, #adBody .ad-table, #adBody .ad-tools > *').forEach(el => { const r = el.getBoundingClientRect(); assert(r.right <= cr.right + 1 && r.left >= cr.left - 1, `${t} at ${w}x${h}: a ${el.className} sticks out sideways`); assert(r.width > 40, `${t} at ${w}x${h}: a ${el.className} is squashed`); });
        sb.qa('.ad-tab, .ad-seg button, .ad-refresh, #adBody .back-pill-flat, #adBody select, #adBody .so-search-input').forEach(el => { const r = el.getBoundingClientRect(); assert(r.height >= 40, `${t} at ${w}x${h}: "${(el.textContent || el.id).trim().slice(0, 20)}" is only ${Math.round(r.height)}px tall`); });
        assert(root.getBoundingClientRect().width > 250, 'Dashboard has no width'); }
      eq(sb.errors.length, 0, `Errors at ${w}x${h}: ` + sb.errors.join(' | ')); out.push(`${w}x${h} ok`); sb.destroy(); }
    return out.join(', '); }});

QA.register(tests);
})();
