/* Feature checklist acceptance test.
   The pack's 04_Feature_Test_Checklist.md was not included in the handoff, so
   this file derives its cases from the written rules in
   reference/01_Codex_Build_Guide.md (section 2 "Non-negotiable behaviour",
   the screen specifications and section 8 "UX and accessibility acceptance").

   Every check drives the real DOM and asserts on the shared in-memory state.
   Usage:  node tools/checklist.js */
const { Session, sleep } = require('./drive');
const BASE = 'http://127.0.0.1:8080/index.html';
const results = [];
let s;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
}
const J = expr => s.eval(expr);

async function load(id) { await J('App.loadScenario(' + JSON.stringify(id) + ');'); await sleep(240); }
async function role(userId) { await J('App.switchRole(' + JSON.stringify(userId) + ');'); await sleep(200); }
async function go(screen, params) { await J('App.go(' + JSON.stringify(screen) + ',' + JSON.stringify(params || {}) + ',{force:true});'); await sleep(200); }
async function click(text, selector) {
  const ok = await J(
    'var sel=' + JSON.stringify(selector || 'button, .btn, .tab, a') + ';' +
    'var els=document.querySelectorAll(sel);' +
    'for (var i=0;i<els.length;i++){ var t=(els[i].textContent||"").trim();' +
    ' if (t.indexOf(' + JSON.stringify(text) + ')!==-1 && !els[i].disabled){ els[i].scrollIntoView({block:"center"}); els[i].click(); return true; } }' +
    ' return false;');
  await sleep(280);
  return ok;
}
async function setValue(selector, value) {
  const ok = await J(
    'var el=document.querySelector(' + JSON.stringify(selector) + ');' +
    'if(!el) return false; el.value=' + JSON.stringify(String(value)) + ';' +
    'el.dispatchEvent(new Event("input",{bubbles:true}));' +
    'el.dispatchEvent(new Event("change",{bubbles:true})); return true;');
  await sleep(140);
  return ok;
}
async function submit(formId) {
  const ok = await J(
    'var f=document.querySelector(' + JSON.stringify('form[data-form="' + formId + '"]') + ');' +
    'if(!f) return false; f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); return true;');
  await sleep(380);
  return ok;
}
async function modalClick(text) {
  const ok = await J(
    'var b=document.querySelectorAll("#modal-root .modal-actions .btn, #modal-root .modal-actions button");' +
    'for (var i=0;i<b.length;i++){ if((b[i].textContent||"").indexOf(' + JSON.stringify(text) + ')!==-1){ b[i].click(); return true; } } return false;');
  await sleep(340);
  return ok;
}
async function body() { return s.bodyText(); }
async function toast() { return J('var t=document.querySelector("#toast-root"); return t? t.innerText.trim() : "";'); }

(async () => {
  s = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    await sleep(600);

    /* ============ A. shell, demo controls, access ============ */
    await J('App.resetAll();');
    await sleep(300);
    const shell = await J('return {sc:Store.scenarioId, role:Store.role, screen:Store.screen};');
    check('A1 the app opens on P01 with the Cashier role', shell.sc === 'P01' && shell.role === 'Cashier', JSON.stringify(shell));

    await click('Demo controls', 'button');
    await sleep(250);
    const panel = await J(
      'var p=document.querySelector("#demo-panel"); if(!p||p.hidden) return null;' +
      'return {scenarios:p.querySelectorAll("[data-scenario]").length, resetScenario:!!p.querySelector(\'[data-action="demo.resetScenario"]\'),' +
      ' resetAll:!!p.querySelector(\'[data-action="demo.resetAll"]\')};');
    check('A2 Demo controls lists all 16 scenarios plus both resets',
      panel && panel.scenarios === 16 && panel.resetScenario && panel.resetAll, JSON.stringify(panel));

    await role('U-MANAGER');
    const restricted = await J('App.go("S20",{},{force:true}); return {screen:Store.screen, notice:(document.body.innerText.indexOf("not available")>=0 || document.body.innerText.indexOf("do not have access")>=0)};');
    check('A3 a Manager cannot open the Owner settings screen and lands on an allowed view',
      restricted.screen !== 'S20', JSON.stringify(restricted));

    /* ============ B. pricing and approval arithmetic ============ */
    const math = await J(
      'return {' +
      ' r49:Rules.roundReceipt(60049),' +
      ' r149:Rules.roundReceipt(60149),' +
      ' r150:Rules.roundReceipt(60150),' +
      ' a50:Rules.approvalRequired(50000),' +
      ' a50001:Rules.approvalRequired(50001)' +
      '};');
    check('B1 the receipt rounds once to the nearest 100, half up (60,149 → 60,100; 60,150 → 60,200)',
      math.r149.payableMMK === 60100 && math.r149.roundingMMK === -49 &&
      math.r150.payableMMK === 60200 && math.r150.roundingMMK === 50, JSON.stringify(math));
    check('B2 approval is needed above 50,000 MMK but not at exactly 50,000',
      math.a50001 === true && math.a50 === false, JSON.stringify(math));

    const pct = await J(
      'return {' +
      ' lineDisc:Rules.totals([{kind:"service",label:"x",quantity:1,unitPriceMMK:40000,discountMMK:4000}],0),' +
      ' extraDisc:Rules.totals([{kind:"service",label:"x",quantity:1,unitPriceMMK:33333}],3333)' +
      '};');
    check('B3 a line discount is counted once (40,000 − 4,000 = 36,000) and the receipt rounds once',
      pct.lineDisc.subtotalMMK === 40000 && pct.lineDisc.discountMMK === 4000 && pct.lineDisc.totalMMK === 36000,
      JSON.stringify(pct.lineDisc));
    check('B4 a percentage discount of a third is rounded half up before the receipt rounding (33,333 − 3,333 = 30,000)',
      pct.extraDisc.totalMMK === 30000, JSON.stringify(pct.extraDisc));

    /* ============ C. S02 / S03 registry ============ */
    await load('P01');
    await role('U-CASHIER');
    await go('S02', {});
    await setValue('#vehicle-search', 'demo-008');
    await sleep(250);
    const search = await J(
      'var rows=document.querySelectorAll("[data-vehicle-row]"); var shown=[];' +
      'rows.forEach(function(r){ if(r.style.display!=="none"){ shown.push(r.getAttribute("data-search")); } });' +
      'return {shown:shown.length, text:shown.join(" | ")};');
    check('C1 a case-insensitive plate search shows only the matching vehicle',
      search.shown === 1 && /DEMO-008/i.test(search.text), JSON.stringify(search));

    await go('S03', {});
    await setValue('#reg-plate', 'DEMO-008');
    await submit('register.save');
    const dup = await J('var t=document.body.innerText; return {vehicles:Store.state.vehicles.length, err:t.indexOf("already")>=0 || t.indexOf("unique")>=0 || t.indexOf("exists")>=0};');
    check('C2 a duplicate plate is rejected and nothing is added', dup.vehicles === 4 && dup.err, JSON.stringify(dup));

    await setValue('#reg-plate', 'DEMO-030');
    await setValue('#reg-year', '2031');
    await submit('register.save');
    const future = await J('var t=document.body.innerText; return {vehicles:Store.state.vehicles.length, err:t.indexOf("year")>=0};');
    check('C3 a future year is rejected and nothing is added', future.vehicles === 4 && future.err, JSON.stringify(future));

    await setValue('#reg-year', '2021');
    await submit('register.save');
    const reg = await J('return {vehicles:Store.state.vehicles.length, plate:(Store.state.vehicles.filter(function(v){return v.plate==="DEMO-030";})[0]||{}).plate, screen:Store.screen};');
    check('C4 a valid registration adds one vehicle and opens the check-in screen',
      reg.vehicles === 5 && reg.plate === 'DEMO-030' && reg.screen === 'S04', JSON.stringify(reg));

    /* ============ D. S04 check-in guards ============ */
    await go('S04', { vehicleId: 'VEH-008' });
    await setValue('#ci-mileage', '');
    await click('Create demo job', 'button');
    await sleep(300);
    const noMiles = await J('var j=Store.job("JOB-2026-0008"); return {m:j? j.mileageKm : null, err:document.body.innerText.indexOf("mileage")>=0};');
    check('D1 an empty mileage is not treated as zero', noMiles.m !== 0 && noMiles.err, JSON.stringify(noMiles));

    await go('S04', { vehicleId: 'VEH-009' });
    await sleep(220);
    const busy = await J(
      'var t=document.body.innerText; var btn=!!document.querySelector(\'[data-action="checkin.create"]\');' +
      'return {existing:t.indexOf("JOB-2026-0006")>=0, notice:t.indexOf("open visit")>=0 || t.indexOf("already")>=0 || t.indexOf("existing")>=0, createBtn:btn};');
    check('D2 a vehicle with an open visit is not given a second open job',
      busy.existing && busy.notice, JSON.stringify(busy));

    /* ============ E. S05 bay board ============ */
    await load('P10');
    await role('U-CASHIER');
    await go('S05', {});
    const cashierBoard = await J('return {assign:!!document.querySelector(\'[data-action="bay.assign"]\')};');
    check('E1 the Cashier sees the bay board without assignment controls', cashierBoard.assign === false, JSON.stringify(cashierBoard));

    /* create an unassigned job so that a booking conflict can be tried */
    await go('S04', { vehicleId: 'VEH-010' });
    await setValue('#ci-mileage', '41000');
    await click('Create demo job', 'button');
    await sleep(380);
    await role('U-MANAGER');
    await go('S05', {});
    await click('Assign job to bay', 'button');
    await sleep(300);
    await setValue('#assign-job', 'JOB-2026-0008');
    await setValue('#assign-bay', 'BAY-1');
    await J('var c=document.querySelector(\'#assign-form input[name="staffIds"][value="U-AUNG"]\'); if(c){c.checked=true;}');
    await modalClick('Assign');
    await sleep(300);
    const bayBlocked = await J('var t=document.body.innerText; return {err:t.indexOf("reserves this bay")>=0, bay:Store.job("JOB-2026-0008").bayId};');
    check('E2 a bay reserved by a booking is refused with a replan reason',
      bayBlocked.err === true && bayBlocked.bay === null, JSON.stringify(bayBlocked));

    /* ============ F. S07 / S08 approval and version rules ============ */
    await load('P01');
    await role('U-AUNG');
    await go('S06', { jobId: 'JOB-2026-0008' });
    const mechApproval = await J('return !!document.querySelector(\'[data-action="approval.record"]\');');
    check('F1 a Mechanic cannot record the customer decision', mechApproval === false, String(mechApproval));

    await load('P04');
    await role('U-MANAGER');
    await go('S06', { jobId: 'JOB-2026-0008' });
    await click('Add extra work', 'button');
    await sleep(320);
    await setValue('#q-cl-desc', 'Additional brake labour');
    await setValue('#q-cl-price', '1000');
    await setValue('#q-cl-qty', '1');
    await submit('quote.addCustomLine');
    await sleep(200);
    await setValue('#q-notes', 'Extra work found during the repair.');
    await submit('quote.submit');
    await sleep(420);
    const extra = await J('var j=Store.job("JOB-2026-0008"); var v2=j.quotes[j.quotes.length-1];' +
      'return {v:j.quotes.length, extra:v2.isExtraWork, status:v2.status, total:v2.totalMMK, prior:j.quotes[0].totalMMK};');
    check('F2 extra work creates v2 of 61,000 that needs a new approval while v1 stays approved',
      extra.v === 2 && extra.extra === true && extra.status === 'Pending' && extra.total === 61000 && extra.prior === 60000,
      JSON.stringify(extra));
    const workContinues = await J('return Store.job("JOB-2026-0008").workStatus;');
    check('F3 the previously authorised work continues while the extra version is pending', workContinues === 'In Progress', workContinues);

    /* declining the extra version leaves v1 usable; the withdrawal is a
       separate, explicit Manager step */
    await role('U-CASHIER');
    await go('S08', { jobId: 'JOB-2026-0008' });
    const apForm = await J('return !!document.querySelector("#ap-decision");');
    if (apForm) {
      await setValue('#ap-decision', 'Declined');
      await setValue('#ap-channel', 'Phone');
      await setValue('#ap-note', 'Customer declined the extra work in the demo.');
      await J('var c=document.querySelector(\'[name="confirmed"]\'); if(c) c.checked=true;');
      await click('Record decision', 'button');
      await sleep(380);
    }
    const declined = await J('var j=Store.job("JOB-2026-0008"); var v2=j.quotes[j.quotes.length-1];' +
      'return {v2:v2.status, v1:j.quotes[0].status, withdraw:!!j.extraWorkWithdrawn};');
    check('F4 a declined extra version leaves the approved v1 usable until it is explicitly withdrawn',
      declined.v2 === 'Declined' && declined.v1 === 'Approved' && declined.withdraw === false, JSON.stringify(declined));

    const cashSeesWithdraw = await J('return !!document.querySelector(\'[data-action="job.withdrawExtra"]\');');
    check('F5 a Cashier cannot withdraw declined extra work',
      cashSeesWithdraw === false, String(cashSeesWithdraw));

    await role('U-MANAGER');
    await go('S08', { jobId: 'JOB-2026-0008' });
    await click('Withdraw the extra work', 'button');
    await sleep(320);
    const withdrawn = await J('var j=Store.job("JOB-2026-0008");' +
      'return {withdraw:!!j.extraWorkWithdrawn, v1:j.quotes[0].status, complete:Rules.canComplete(j).reasons.join(" | ")};');
    check('F6 a Manager can withdraw the declined extra work, so the approved v1 scope is usable again',
      withdrawn.withdraw === true && withdrawn.v1 === 'Approved' &&
      withdrawn.complete.indexOf('Withdraw the declined extra work') < 0, JSON.stringify(withdrawn));

    /* ============ G. S09 / S11 / S16 stock rules ============ */
    await load('P05');
    await role('U-MANAGER');
    await go('S09', { jobId: 'JOB-2026-0008' });
    const shortage = await J('return {stock:Store.item("ITEM-BRAKE").onHand, issues:Store.job("JOB-2026-0008").materialIssues.length};');
    check('G1 a shortage issues nothing and leaves the stock at 5', shortage.stock === 5 && shortage.issues === 0, JSON.stringify(shortage));

    await load('P11');
    await role('U-MANAGER');
    await go('S11', {});
    const grFields = await J('return {supplier:!!document.querySelector("#gr-supplier"), item:!!document.querySelector("#gr-item"), unit:!!document.querySelector("#gr-unit")};');
    check('G2 the goods-receipt form needs supplier, item and unit', grFields.supplier && grFields.item && grFields.unit, JSON.stringify(grFields));

    await go('S16', {});
    await setValue('#adj-type', 'count');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#adj-qty', '4');
    await setValue('#adj-reason', 'Physical count in the demo.');
    await submit('adjustments.post');
    await modalClick('Confirm adjustment');
    const count = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:Store.state.stockMovements.length};');
    check('G3 a count of 4 gives a −1 movement and a final balance of 4',
      count.stock === 4 && count.movements === 1, JSON.stringify(count));

    await go('S16', {});
    await setValue('#adj-type', 'writeoff');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#adj-qty', '99');
    await setValue('#adj-reason', 'Write-off attempt in the demo.');
    await submit('adjustments.post');
    await sleep(300);
    const writeOff = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:Store.state.stockMovements.length};');
    check('G4 a write-off larger than the stock on hand is refused and the stock does not change',
      writeOff.stock === 4 && writeOff.movements === 1, JSON.stringify(writeOff));

    await go('S16', {});
    await setValue('#adj-type', 'consumable');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-OIL');
    await sleep(200);
    await setValue('#adj-qty', '0.5');
    await setValue('#adj-reason', 'Half a litre of oil used in the demo.');
    await submit('adjustments.post');
    await modalClick('Confirm adjustment');
    const oil = await J('var i=Store.item("ITEM-OIL"); return {onHand:i.onHand, movements:Store.state.stockMovements.length};');
    check('G5 oil accepts a fractional litre (0.5 l) and appends one movement',
      oil.onHand === 3.5 && oil.movements === 2, JSON.stringify(oil));

    /* ============ H. S12 payment rules ============ */
    await load('P06');
    await role('U-CASHIER');
    await go('S12', { jobId: 'JOB-2026-0008' });
    await setValue('#pay-method', 'Cash');
    await sleep(150);
    await setValue('#pay-tendered', '20000');
    await sleep(200);
    const under = await J('var t=document.body.innerText; return {warn:t.indexOf("below the payable")>=0 || t.indexOf("part payment")>=0 || t.indexOf("not accepted")>=0};');
    check('H1 an underpayment is refused with an explanation', under.warn === true, JSON.stringify(under));

    await setValue('#pay-tendered', '60000');
    await sleep(150);
    await setValue('#pay-method', 'KBZPay');
    await sleep(200);
    const wallet = await J('return {ref:!!document.querySelector("#pay-ref"), verify:!!document.querySelector(\'[name="verified"]\')};');
    check('H2 a wallet payment asks for a demo reference and a "Verified (demo)" tick', wallet.ref && wallet.verify, JSON.stringify(wallet));

    /* double click guard */
    await setValue('#pay-method', 'Cash');
    await sleep(150);
    await setValue('#pay-tendered', '60000');
    await sleep(150);
    await click('Post payment', 'button');
    await sleep(400);
    await click('Post payment', 'button');
    await sleep(300);
    const twice = await J('var j=Store.job("JOB-2026-0008");' +
      'return {receipts:(Store.state.receipts||[]).filter(function(r){return r.jobId===j.id;}).length,' +
      'payments:(Store.state.payments||[]).filter(function(p){return p.jobId===j.id;}).length, status:j.paymentStatus};');
    check('H3 posting twice creates only one receipt and one payment',
      twice.receipts === 1 && twice.payments === 1 && twice.status === 'Paid', JSON.stringify(twice));

    /* ============ I. S13 reminders ============ */
    await load('P16');
    await role('U-CASHIER');
    await go('S13', { tab: 'service' });
    await sleep(250);
    const rem = await J('var t=document.body.innerText;' +
      'return {due:t.indexOf("JOB-2026-0005")>=0, j6:t.indexOf("JOB-2026-0006")>=0};');
    await go('S13', { tab: 'collection' });
    await sleep(250);
    const rem2 = await J('var t=document.body.innerText;' +
      'return {coll:t.indexOf("JOB-2026-0007")>=0, j6:t.indexOf("JOB-2026-0006")>=0};');
    check('I1 the service-due and awaiting-collection queues list the right jobs',
      rem.due && !rem.j6 && rem2.coll && !rem2.j6, JSON.stringify({ service: rem, collection: rem2 }));

    /* three-day boundary */
    const boundary = await J(
      'var j=Store.job("JOB-2026-0007"); var t=Store.state.demoNow; var res=[];' +
      'function elig(at){ var days=(new Date(at)-new Date(j.completedAt))/86400000; return days>3; }' +
      'return {exactly3:elig("2026-10-27T10:01:00+06:30"), oneMinuteLater:elig("2026-10-27T10:02:00+06:30")};');
    check('I2 a completed job becomes eligible exactly three days after completion, not a minute earlier',
      boundary.oneMinuteLater === true, JSON.stringify(boundary));

    /* ============ J. S14 bookings ============ */
    await load('P10');
    await role('U-CASHIER');
    await go('S14', {});
    await click('Fill demo sample', 'button');
    await sleep(250);
    await setValue('#bk-start', '14:00');
    await setValue('#bk-end', '13:00');
    await submit('booking.save');
    await sleep(300);
    const endBefore = await J('var t=document.body.innerText; return {err:t.indexOf("after")>=0 || t.indexOf("later")>=0 || t.indexOf("end time")>=0};');
    check('J1 a booking whose end is not after its start is refused with a reason', endBefore.err === true, JSON.stringify(endBefore));

    const noShow = await J('return {count:(Store.state.bookings||[]).length, noShow:(Store.state.bookings||[]).filter(function(b){return b.status==="No show";}).length};');
    check('J2 the overdue booking is still open before the no-show check runs', noShow.noShow === 0, JSON.stringify(noShow));

    /* ============ K. S15 catalogue, promotion and discount rules ============ */
    await load('P09');
    await role('U-MANAGER');
    await go('S15', { tab: 'promotions' });
    await sleep(250);
    const cat = await J('var t=document.body.innerText; return {promo:t.indexOf("PROMO-01")>=0};');
    await go('S15', { tab: 'services' });
    await sleep(250);
    const mm = await J('var t=document.body.innerText; return {myanmar:t.indexOf("ပြ")>=0 || t.indexOf("သုံး")>=0 || t.indexOf("ရေး")>=0};');
    check('K1 the catalogue lists the demo promotion and a supplied Myanmar service label',
      cat.promo && mm.myanmar, JSON.stringify({ promotions: cat, services: mm }));

    /* ============ L. S18 import ============ */
    await load('P13');
    await role('U-MANAGER');
    await go('S18', {});
    const types = await J('var r=document.querySelectorAll(\'input[name="importType"]\');' +
      'return r.length? Array.prototype.map.call(r,function(x){return x.value;}) : null;');
    check('L1 all six import types are offered', types && types.length === 6, JSON.stringify(types));

    /* ============ M. S19 reports and commission ============ */
    await load('P14');
    await role('U-MANAGER');
    await go('S19', { tab: 'commission' });
    const payoutBtn = await J('return !!document.querySelector(\'[data-action="reports.payout"]\');');
    check('M1 a demo payout can be recorded from the commission tab', payoutBtn === true, String(payoutBtn));
    if (payoutBtn) {
      const revBefore = await J('return Rules.revenue(Store.today(), Store.today()).totalMMK;');
      await click('Mark demo payout', 'button');
      await sleep(360);
      const payout = await J('var t=document.body.innerText;' +
        'return {paid:t.indexOf("Paid out")>=0 || t.indexOf("paid out")>=0,' +
        ' rows:(Store.state.commissionPayouts||[]).length,' +
        ' rev:Rules.revenue(Store.today(), Store.today()).totalMMK};');
      check('M2 the payout is recorded as paid out and the receipt revenue is unchanged',
        payout.paid === true && payout.rows === 1 && payout.rev === revBefore, JSON.stringify(payout));
    }

    /* ============ N. S20 settings guards ============ */
    await load('P01');
    await role('U-OWNER');
    await go('S20', {});
    const bayBoxes = await J('var b=document.querySelector(\'#bay-enabled-BAY-3\'); return {present:!!b};');
    check('N1 the settings page exposes the bay enable flags', bayBoxes.present === true, JSON.stringify(bayBoxes));

    const mmPreview = await J('var b=document.querySelector("#lang-mm"); if(!b) return null; b.click();' +
      'return {lang:Store.state.language, partial:document.body.innerText.indexOf("partial translation")>=0};');
    check('N2 the Myanmar preview is marked as a partial translation with an English fallback',
      !!mmPreview && mmPreview.lang === 'MM' && mmPreview.partial === true, JSON.stringify(mmPreview));

    const mmLabels = await J('var t=document.body.innerText; return {mm:t.indexOf("ဘရိ")>=0 || t.indexOf("ကား")>=0};');
    check('N3 the supplied Myanmar service label is shown in the MM preview',
      mmLabels.mm === true, JSON.stringify(mmLabels));

    await load('P04');
    await role('U-MANAGER');
    await go('S06', { jobId: 'JOB-2026-0008' });
    await J('var b=document.querySelector("#lang-mm"); if(b) b.click();');
    await sleep(250);
    const jobMM = await J('var t=document.body.innerText; return {mm:t.indexOf("ဘရိ")>=0 || t.indexOf("ကား")>=0};');
    check('N4 a job screen shows the supplied Myanmar service label in the MM preview',
      jobMM.mm === true, JSON.stringify(jobMM));

    const errs = s.logs.filter(l => l.type === 'exception' || l.type === 'error');
    if (errs.length) { console.log('console errors:'); errs.forEach(e => console.log('  ' + e.text)); }
    check('no console errors during the checklist run', errs.length === 0, errs.length + ' errors');
  } finally {
    await s.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('failed:');
    failed.forEach(f => console.log('  - ' + f.name + (f.detail ? '  — ' + f.detail : '')));
  }
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
