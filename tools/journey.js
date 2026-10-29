/* P01 main journey acceptance test.
   S02 → S04 check-in → S05 bay assign → S07 quote 60,000 → S08 approval →
   S09 issue one brake part (stock 5 → 4) → S06 complete (bay released) →
   S12 cash 100,000 (change 40,000) → collect → close. */
const { Session, sleep } = require('./drive');
const BASE = 'http://127.0.0.1:8080/index.html';
const results = [];
let s;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
}
const J = expr => s.eval(expr);

async function switchRole(userId) {
  await s.eval('App.switchRole(' + JSON.stringify(userId) + ');');
  await sleep(200);
}
async function modalPrimary(text) {
  const ok = await J('var b=document.querySelectorAll("#modal-root .modal-actions .btn");' +
    'for(var i=0;i<b.length;i++){ if((b[i].textContent||"").indexOf(' + JSON.stringify(text) + ')!==-1){ b[i].click(); return true; } } return false;');
  await sleep(300);
  return ok;
}

(async () => {
  s = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    await sleep(500);

    /* reset everything to P01 with the Cashier role */
    await J('App.resetAll();');
    await sleep(300);
    check('reset all → P01', await J('return Store.scenarioId === "P01" && Store.role === "Cashier"'),
      await J('return Store.scenarioId + " / " + Store.role'));

    /* ---------- S02 customers ---------- */
    await J('App.go("S02",{},{force:true});');
    await sleep(200);
    await J('Store.state.selectedVehicleId = "VEH-008"; App.render();');
    await sleep(200);
    check('S02 shows the vehicle', (await s.bodyText()).indexOf('DEMO-008') >= 0);

    /* ---------- S04 check-in ---------- */
    await J('App.go("S04",{vehicleId:"VEH-008"},{force:true});');
    await sleep(200);
    await s.setValue('#ci-mileage', '68000');
    await s.clickText('Create demo job', 'button');
    await sleep(400);
    const jobId = await J('return Store.state.selectedJobId');
    check('check-in created JOB-2026-0008', jobId === 'JOB-2026-0008', jobId);
    const job0 = await J('var j=Store.job("JOB-2026-0008"); return {m:j.mileageKm,size:j.size,svc:j.requestedServiceIds,fuel:j.fuelLevel,work:j.workStatus};');
    check('check-in values', job0.m === 68000 && job0.size === 'M' && job0.svc[0] === 'SVC-BRAKE' && job0.fuel === 'Half', JSON.stringify(job0));

    /* ---------- S05 bay assign (Manager) ---------- */
    await switchRole('U-MANAGER');
    await J('App.go("S05",{},{force:true});');
    await sleep(250);
    await s.clickText('Assign job to bay', 'button');
    await sleep(300);
    check('assign modal open', await J('return !!document.querySelector("#assign-form");'));
    await s.setValue('#assign-job', 'JOB-2026-0008');
    await s.setValue('#assign-bay', 'BAY-2');
    await J('var c=document.querySelector(\'#assign-form input[name="staffIds"][value="U-AUNG"]\'); if(c){c.checked=true;}');
    await modalPrimary('Assign');
    const assigned = await J('var j=Store.job("JOB-2026-0008"); return {bay:j.bayId, staff:j.assignedStaffIds};');
    check('bay 2 + Aung assigned', assigned.bay === 'BAY-2' && assigned.staff.indexOf('U-AUNG') >= 0, JSON.stringify(assigned));

    /* ---------- S07 inspection and quote (Mechanic) ---------- */
    await switchRole('U-AUNG');
    await J('App.go("S06",{jobId:"JOB-2026-0008"},{force:true});');
    await sleep(250);
    await s.clickText('Start inspection', 'button');
    await sleep(350);
    check('S07 draft open', await J('return !!window.__dolphinDraft;'));
    const draft0 = await J('var d=window.__dolphinDraft; return {v:d.version, lines:d.lines.map(function(l){return l.label+"="+l.unitPriceMMK;})};');
    check('draft seeded with brake labour 40,000', draft0.lines.length === 1 && draft0.lines[0].indexOf('40000') >= 0, JSON.stringify(draft0));

    /* add the brake part (the shop material table) */
    await J('var rows=document.querySelectorAll("[data-action=\\"quote.addShopMaterial\\"]");' +
      'for(var i=0;i<rows.length;i++){ if(rows[i].getAttribute("data-item-id")==="ITEM-BRAKE"){ rows[i].click(); return true; } } return false;');
    await sleep(300);
    const draft1 = await J('var d=window.__dolphinDraft; return d.lines.map(function(l){return l.label+" "+l.unitPriceMMK;});');
    check('brake part line added at 20,000', draft1.some(t => t.indexOf('Brake part 20000') >= 0), JSON.stringify(draft1));

    /* stock must not change while quoting */
    const stockDuringQuote = await J('return Store.item("ITEM-BRAKE").onHand;');
    check('quoting does not deduct stock', stockDuringQuote === 5, String(stockDuringQuote));

    await s.setValue('#q-notes', 'Rear brake pads worn, one disc scored. Replaced the brake part and bled the line.');
    const totals = await J('var d=window.__dolphinDraft; var t=Rules.totals(d.lines,0); var b=Rules.approvalBasis(d.lines); return {total:t.totalMMK, basis:b, needed:Rules.approvalRequired(b)};');
    check('quote total 60,000 and approval needed', totals.total === 60000 && totals.basis === 60000 && totals.needed === true, JSON.stringify(totals));

    await s.clickText('Submit quote v1', 'button');
    await sleep(400);
    const q1 = await J('var j=Store.job("JOB-2026-0008"); var q=j.quotes[0]; return {status:q.status, total:q.totalMMK, appr:j.approvalStatus, screen:Store.screen};');
    check('quote v1 submitted as Pending', q1.status === 'Pending' && q1.total === 60000 && q1.appr === 'Pending', JSON.stringify(q1));
    check('sent to the approval screen', q1.screen === 'S08', q1.screen);

    /* ---------- S08 approval (Cashier) ---------- */
    await switchRole('U-CASHIER');
    await J('App.go("S08",{jobId:"JOB-2026-0008"},{force:true});');
    await sleep(250);
    await s.setValue('#ap-decision', 'Approved');
    await s.setValue('#ap-channel', 'Phone');
    await s.setValue('#ap-note', 'Customer agreed to 60,000 MMK by phone.');
    await J('var c=document.querySelector(\'[name="confirmed"]\'); if(c) c.checked=true;');
    await s.clickText('Record decision', 'button');
    await sleep(400);
    const approved = await J('var j=Store.job("JOB-2026-0008"); return {appr:j.approvalStatus, work:j.workStatus, lines:(j.committedServiceLines||[]).map(function(l){return l.label+" "+l.totalMMK;})};');
    check('approval recorded', approved.appr === 'Approved', JSON.stringify(approved));
    check('labour committed to the job', approved.lines.some(t => t.indexOf('40000') >= 0), JSON.stringify(approved.lines));

    /* ---------- S06 start work ---------- */
    await switchRole('U-AUNG');
    await J('App.go("S06",{jobId:"JOB-2026-0008"},{force:true});');
    await sleep(250);
    await s.clickText('Start work', 'button');
    await sleep(300);
    check('work started', await J('return Store.job("JOB-2026-0008").workStatus === "In Progress";'));

    /* ---------- S09 issue material ---------- */
    await J('App.go("S09",{jobId:"JOB-2026-0008"},{force:true});');
    await sleep(250);
    await s.clickText('Add to job', 'button');
    await sleep(300);
    check('issue modal open', await J('return !!document.querySelector("#issue-qty");'));
    await modalPrimary('Issue to job');
    const issued = await J('var j=Store.job("JOB-2026-0008"); return {issues:j.materialIssues.length, stock:Store.item("ITEM-BRAKE").onHand, cost:(j.materialIssues[0]||{}).unitCostSnapshotMMK};');
    check('one part issued, stock 5 → 4', issued.issues === 1 && issued.stock === 4, JSON.stringify(issued));
    check('purchase cost snapshot 12,000', issued.cost === 12000, String(issued.cost));

    /* a repeated issue is refused */
    const stillFour = await J('return Store.item("ITEM-BRAKE").onHand;');
    const lineState = await s.bodyText();
    check('fully issued line is disabled, stock stays 4', stillFour === 4 && lineState.indexOf('Fully issued') >= 0, stillFour + ' / ' + (lineState.indexOf('Fully issued') >= 0));

    /* ---------- S06 complete → bay released ---------- */
    await J('App.go("S06",{jobId:"JOB-2026-0008"},{force:true});');
    await sleep(250);
    await J('var j=Store.job("JOB-2026-0008"); (j.requiredChecklist||[]).forEach(function(c){c.done=true;}); App.render();');
    await sleep(150);
    await s.clickText('Mark complete', 'button');
    await sleep(350);
    const done = await J('var j=Store.job("JOB-2026-0008"); return {work:j.workStatus, bay:j.bayId, pay:j.paymentStatus, coll:j.collectionStatus, bayFree:!Rules.bayOccupant("BAY-2")};');
    check('repair completed and bay released immediately', done.work === 'Completed' && done.bay === null && done.bayFree === true, JSON.stringify(done));
    check('payment still open after completion', done.pay === 'Unpaid' && done.coll === 'Not collected', JSON.stringify(done));

    /* ---------- S12 payment ---------- */
    await switchRole('U-CASHIER');
    await J('App.go("S12",{jobId:"JOB-2026-0008"},{force:true});');
    await sleep(300);
    await s.setValue('#pay-method', 'Cash');
    await sleep(150);
    await s.setValue('#pay-tendered', '100000');
    await sleep(150);
    await s.clickText('Post payment', 'button');
    await sleep(450);
    const paid = await J('var j=Store.job("JOB-2026-0008"); var r=Store.jobReceipt(j.id); var p=Store.jobPayment(j.id);' +
      'return {status:j.paymentStatus, receipt:r&&r.id, total:r&&r.totalMMK, applied:p&&p.amountAppliedMMK, tendered:p&&p.cashTenderedMMK, change:p&&p.changeMMK};');
    check('receipt RC-2026-0002 for 60,000', paid.receipt === 'RC-2026-0002' && paid.total === 60000, JSON.stringify(paid));
    check('cash 100,000 applied 60,000 change 40,000', paid.tendered === 100000 && paid.applied === 60000 && paid.change === 40000, JSON.stringify(paid));

    /* ---------- collect + close ---------- */
    await s.clickText('Mark collected', 'button');
    await sleep(350);
    check('vehicle collected', await J('return Store.job("JOB-2026-0008").collectionStatus === "Collected";'));
    await s.clickText('Close job', 'button');
    await sleep(350);
    check('close dialog open', await J('return !!document.querySelector("#next-date");'));
    await modalPrimary('Close job');
    await sleep(300);
    const closed = await J('var j=Store.job("JOB-2026-0008"); return {life:j.lifecycleStatus, closedAt:!!j.closedAt};');
    check('job closed and in history', closed.life === 'Closed' && closed.closedAt, JSON.stringify(closed));

    /* ---------- summary ---------- */
    const finalState = await J('var j=Store.job("JOB-2026-0008"); return {work:j.workStatus, pay:j.paymentStatus, coll:j.collectionStatus, life:j.lifecycleStatus, stock:Store.item("ITEM-BRAKE").onHand, receipts:Store.state.receipts.length, payments:Store.state.payments.length, movements:Store.state.stockMovements.length};');
    console.log('\nfinal state:', JSON.stringify(finalState));

    const errs = s.logs.filter(l => l.type === 'exception' || l.type === 'error');
    if (errs.length) { console.log('console errors:'); errs.forEach(e => console.log('  ' + e.text)); }
    check('no console errors', errs.length === 0, errs.length + ' errors');
  } finally {
    await s.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
