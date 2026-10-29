/* Scenario preset test: all 16 presets load as a complete deep copy, the demo
   panel exposes them, and reset restores the preset exactly. */
const { Session, sleep } = require('./drive');
const BASE = 'http://127.0.0.1:8080/index.html';
const results = [];
let s;
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
}
const J = expr => s.eval(expr);

(async () => {
  s = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    await sleep(500);

    const fixtureIds = await J('return DOLPHIN_FIXTURES.scenarios.map(function(x){return x.id;});');
    check('16 presets in the fixture', fixtureIds.length === 16, fixtureIds.join(','));

    /* the demo panel lists all of them */
    await J('App.toggleDemoPanel();');
    await sleep(250);
    const buttons = await J('return Array.from(document.querySelectorAll("[data-scenario]")).map(function(b){return b.getAttribute("data-scenario");});');
    check('demo panel lists 16 presets', buttons.length === 16, buttons.length + ' buttons');
    check('panel has Reset scenario and Reset all', await J('return !!document.querySelector(\'[data-action="demo.resetScenario"]\') && !!document.querySelector(\'[data-action="demo.resetAll"]\');'));
    await J('App.closePanel();');

    for (const id of fixtureIds) {
      await J('App.loadScenario(' + JSON.stringify(id) + ');');
      await sleep(180);
      const state = await J('var st=Store.state; return {id:Store.scenarioId, jobs:st.jobs.length, items:st.items.length, ' +
        'receipts:st.receipts.length, movements:st.stockMovements.length, payments:st.payments.length, ' +
        'now:st.demoNow, screen:Store.screen, start:Store.scenario().startScreen};');
      const expected = await J('var sc=DOLPHIN_FIXTURES.scenarios.filter(function(x){return x.id===' + JSON.stringify(id) + ';})[0];' +
        'return {jobs:sc.state.jobs.length, items:sc.state.items.length, receipts:sc.state.receipts.length, ' +
        'movements:sc.state.stockMovements.length, payments:sc.state.payments.length, start:sc.startScreen};');
      const same = state.jobs === expected.jobs && state.items === expected.items &&
        state.receipts === expected.receipts && state.movements === expected.movements &&
        state.payments === expected.payments && state.start === expected.start;
      check('preset ' + id + ' loads completely (' + state.start + ')', same,
        'jobs ' + state.jobs + '/' + expected.jobs + ', receipts ' + state.receipts + '/' + expected.receipts +
        ', movements ' + state.movements + '/' + expected.movements);
    }

    /* editing one preset must not touch the others */
    await J('App.loadScenario("P11");');
    await sleep(200);
    const before = await J('return Store.item("ITEM-BRAKE").onHand;');
    await J('Store.state.items[0].onHand = 99;');
    await J('App.loadScenario("P05");');
    await sleep(200);
    const other = await J('return Store.item("ITEM-BRAKE").onHand;');
    await J('App.loadScenario("P11");');
    await sleep(200);
    const again = await J('return Store.item("ITEM-BRAKE").onHand;');
    check('presets are deep copies, not merged', again === before, before + ' → edited → ' + other + ' → ' + again);

    /* reset scenario restores the preset */
    const p11Expected = await J('var sc=DOLPHIN_FIXTURES.scenarios.filter(function(x){return x.id==="P11";})[0];' +
      'return {stock:(sc.state.items.filter(function(i){return i.id==="ITEM-BRAKE";})[0]||{}).onHand, jobs:sc.state.jobs.length};');
    await J('Store.state.items[0].onHand = 1; Store.state.jobs.push({id:"JOB-X"});');
    await J('App.resetScenario();');
    await sleep(250);
    const reset = await J('return {stock:Store.item("ITEM-BRAKE").onHand, jobs:Store.state.jobs.length};');
    check('reset scenario restores the preset', reset.stock === p11Expected.stock && reset.jobs === p11Expected.jobs,
      JSON.stringify(reset) + ' expected ' + JSON.stringify(p11Expected));

    /* reset all returns to P01 with the Cashier role */
    await J('App.switchRole("U-OWNER"); App.loadScenario("P09");');
    await sleep(200);
    await J('App.resetAll();');
    await sleep(250);
    const all = await J('return {sc:Store.scenarioId, role:Store.role, screen:Store.screen};');
    check('reset all → P01 and Cashier', all.sc === 'P01' && all.role === 'Cashier', JSON.stringify(all));

    /* a refresh starts again at P01 */
    await J('App.loadScenario("P07");');
    await sleep(200);
    await s.send('Page.reload');
    await s.waitForLoad();
    await sleep(500);
    const reload = await J('return {sc:Store.scenarioId, role:Store.role};');
    check('refresh resets to P01', reload.sc === 'P01', JSON.stringify(reload));

    /* role switching keeps the state */
    await J('App.go("S06",{jobId:"JOB-2026-0006"},{force:true});');
    await sleep(200);
    const beforeRole = await J('return Store.state.jobs.length;');
    await J('App.switchRole("U-MIN");');
    await sleep(250);
    const afterRole = await J('return {jobs:Store.state.jobs.length, screen:Store.screen, role:Store.role};');
    check('switching role keeps the state', afterRole.jobs === beforeRole, JSON.stringify(afterRole));

    /* a mechanic only sees assigned jobs */
    const mine = await J('return Store.visibleJobs().map(function(j){return j.id;});');
    const assignedToMin = await J('return Store.state.jobs.filter(function(j){return (j.assignedStaffIds||[]).indexOf("U-MIN")>=0;}).map(function(j){return j.id;});');
    const othersHidden = await J('var m=Store.visibleJobs().map(function(j){return j.id;});' +
      'return Store.state.jobs.filter(function(j){return (j.assignedStaffIds||[]).indexOf("U-MIN")<0;}).every(function(j){return m.indexOf(j.id)<0;});');
    check('mechanic sees only assigned jobs',
      mine.length === assignedToMin.length && mine.every(id => assignedToMin.indexOf(id) >= 0) && othersHidden,
      'visible: ' + mine.join(',') + ' · assigned to Min: ' + assignedToMin.join(','));
  } finally {
    await s.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
