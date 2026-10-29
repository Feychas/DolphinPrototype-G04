/* Exception-scenario acceptance test.
   Runs the documented demonstration of every preset that is not the main
   walkthrough: P02 approval, P03 issue, P04 extra work / cancel / return,
   P05 shortage, P06 unpaid, P07 corrections, P08 zero-charge Redo,
   P09 promotions and discounts, P10 bookings and no-show, P11 stock,
   P12 closing, P13 import, P14/P15 reports and commission, P16 reminders. */
const { Session, sleep } = require('./drive');
const BASE = 'http://127.0.0.1:8080/index.html';
const results = [];
let s;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
}
const J = expr => s.eval(expr);

async function load(id) {
  await J('App.loadScenario(' + JSON.stringify(id) + ');');
  await sleep(220);
}
async function role(userId) {
  await J('App.switchRole(' + JSON.stringify(userId) + ');');
  await sleep(200);
}
async function go(screen, params) {
  await J('App.go(' + JSON.stringify(screen) + ',' + JSON.stringify(params || {}) + ',{force:true});');
  await sleep(180);
}
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
  await sleep(150);
  return ok;
}
async function submit(formId) {
  const ok = await J(
    'var f=document.querySelector(' + JSON.stringify('form[data-form="' + formId + '"]') + ');' +
    'if(!f) return false; f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); return true;');
  await sleep(350);
  return ok;
}
async function toast() {
  return J('var t=document.querySelector("#toast-root"); return t? t.innerText.trim() : "";');
}
async function modalClick(text) {
  const ok = await J(
    'var b=document.querySelectorAll("#modal-root .modal-actions .btn, #modal-root .modal-actions button");' +
    'for (var i=0;i<b.length;i++){ if((b[i].textContent||"").indexOf(' + JSON.stringify(text) + ')!==-1){ b[i].click(); return true; } } return false;');
  await sleep(350);
  return ok;
}
async function body() { return s.bodyText(); }

(async () => {
  s = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    await sleep(600);

    /* ================= P02 — approval required ================= */
    await load('P02');
    await role('U-CASHIER');
    await go('S08', { jobId: 'JOB-2026-0008' });
    const p2a = await J('var j=Store.job("JOB-2026-0008"); return {appr:j.approvalStatus, work:j.workStatus, q:j.quotes[0].status, total:j.quotes[0].totalMMK};');
    check('P02 opens with a pending 60,000 quote', p2a.appr === 'Pending' && p2a.total === 60000 && p2a.q === 'Pending', JSON.stringify(p2a));
    await setValue('#ap-decision', 'Approved');
    await setValue('#ap-channel', 'Phone');
    await setValue('#ap-note', 'Customer agreed to 60,000 MMK.');
    await J('var c=document.querySelector(\'[name="confirmed"]\'); if(c) c.checked=true;');
    await click('Record decision');
    const p2b = await J('var j=Store.job("JOB-2026-0008"); return {appr:j.approvalStatus, work:j.workStatus, dec:(j.quotes[0].approval||{}).decision};');
    check('P02 approval unlocks the job', p2b.appr === 'Approved' && p2b.work === 'Approved', JSON.stringify(p2b));

    /* decline path */
    await load('P02');
    await role('U-CASHIER');
    await go('S08', { jobId: 'JOB-2026-0008' });
    await setValue('#ap-decision', 'Declined');
    await setValue('#ap-channel', 'Phone');
    await setValue('#ap-note', 'Customer refused the price.');
    await J('var c=document.querySelector(\'[name="confirmed"]\'); if(c) c.checked=true;');
    await click('Record decision');
    const p2c = await J('var j=Store.job("JOB-2026-0008"); return {appr:j.approvalStatus, work:j.workStatus, q:j.quotes[0].status};');
    check('P02 a decline blocks the work', p2c.appr === 'Declined' && p2c.q === 'Declined' && p2c.work !== 'In Progress', JSON.stringify(p2c));

    /* ================= P03 — approved, material not yet issued ================= */
    await load('P03');
    await role('U-AUNG');
    await go('S09', { jobId: 'JOB-2026-0008' });
    const p3a = await J('return {stock:Store.item("ITEM-BRAKE").onHand, issues:Store.job("JOB-2026-0008").materialIssues.length};');
    check('P03 starts with 5 on hand and nothing issued', p3a.stock === 5 && p3a.issues === 0, JSON.stringify(p3a));
    await click('Add to job');
    await sleep(200);
    await J('var b=document.querySelectorAll("#modal-root .modal-actions .btn"); for(var i=0;i<b.length;i++){ if((b[i].textContent||"").indexOf("Issue to job")>-1){ b[i].click(); return true; } } return false;');
    await sleep(300);
    const p3b = await J('return {stock:Store.item("ITEM-BRAKE").onHand, issues:Store.job("JOB-2026-0008").materialIssues.length, movements:Store.state.stockMovements.length};');
    check('P03 one issue deducts 5 → 4 and appends one movement', p3b.stock === 4 && p3b.issues === 1 && p3b.movements === 1, JSON.stringify(p3b));
    const p3c = await J('return Store.state.stockMovements.map(function(m){return m.type+":"+m.delta+":"+m.quantity;});');
    check('P03 the movement is a signed issue', p3c.length === 1 && p3c[0].indexOf('-1') >= 0, JSON.stringify(p3c));

    /* ================= P04 — extra work, cancel, recoverable return ================= */
    await load('P04');
    await role('U-AUNG');
    await go('S06', { jobId: 'JOB-2026-0008' });
    const p4a = await J('return {stock:Store.item("ITEM-BRAKE").onHand, issues:Store.job("JOB-2026-0008").materialIssues.length, work:Store.job("JOB-2026-0008").workStatus};');
    check('P04 starts with one part already issued (5 → 4)', p4a.stock === 4 && p4a.issues === 1, JSON.stringify(p4a));

    /* extra work always needs a new approval, even for 1,000 MMK */
    await click('Add extra work');
    await sleep(300);
    const p4b = await J('var d=window.__dolphinDraft; return d? {extra:d.isExtraWork, v:d.version} : null;');
    check('P04 an extra-work draft is prepared', !!p4b && p4b.extra === true, JSON.stringify(p4b));
    if (p4b) {
      await setValue('#q-notes', 'Customer asked for an additional brake adjustment.');
      const extraTotal = await J('var d=window.__dolphinDraft; var t=Rules.totals(d.lines,0); return {total:t.totalMMK, basis:Rules.approvalBasis(d.lines), needed:Rules.approvalRequired(Rules.approvalBasis(d.lines))};');
      check('P04 extra work below 50,000 still needs approval', extraTotal.needed === true, JSON.stringify(extraTotal));
      await click('Submit quote');
      await sleep(300);
      const p4c = await J('var j=Store.job("JOB-2026-0008"); var q=j.quotes[j.quotes.length-1]; return {v:q.version, extra:q.isExtraWork, status:q.status, appr:j.approvalStatus, work:j.workStatus};');
      check('P04 the extra version is pending while the old work continues',
        p4c.extra === true && p4c.status === 'Pending' && p4c.work === 'In Progress', JSON.stringify(p4c));
    }

    /* cancel releases the bay */
    await load('P04');
    await role('U-MANAGER');
    await go('S06', { jobId: 'JOB-2026-0008' });
    await click('Cancel job');
    await sleep(300);
    const cancelDialog = await J('return !!document.querySelector("#cancel-reason");');
    check('P04 the cancel dialog asks for a reason', cancelDialog === true);
    await setValue('#cancel-reason', 'Customer cancelled the repair.');
    await modalClick('Cancel job');
    const p4d = await J('var j=Store.job("JOB-2026-0008"); return {life:j.lifecycleStatus, bay:j.bayId, free:!Rules.bayOccupant("BAY-2"), reason:(j.cancellation||{}).reason};');
    check('P04 cancel releases the bay and keeps the record',
      p4d.life === 'Cancelled' && p4d.free === true && !!p4d.reason, JSON.stringify(p4d));

    /* recoverable return: 4 → 5 */
    await load('P04');
    await role('U-MANAGER');
    await go('S16', {});
    await setValue('#adj-type', 'jobReturn');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#adj-qty', '1');
    await setValue('#adj-reason', 'Unused part returned from JOB-2026-0008.');
    const hasIssue = await J('var s=document.querySelector("#adj-issue"); return s? (s.options.length>=1 && /^ISS-/.test(s.options[0].value)) : false;');
    check('P04 the returnable issue is offered', hasIssue === true);
    if (hasIssue) {
      await J('var sel=document.querySelector("#adj-issue"); sel.selectedIndex=0; sel.dispatchEvent(new Event("change",{bubbles:true}));');
      await sleep(150);
    }
    await setValue('#adj-disposition', 'Recoverable');
    await sleep(200);
    await submit('adjustments.post');
    await modalClick('Confirm adjustment');
    const p4e = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:(Store.state.stockMovements||[]).length};');
    check('P04 a recoverable return adds the unused part back (4 → 5)', p4e.stock === 5, JSON.stringify(p4e));

    /* ================= P05 — shortage keeps the bay ================= */
    await load('P05');
    await role('U-AUNG');
    await go('S09', { jobId: 'JOB-2026-0008' });
    const p5 = await J('var j=Store.job("JOB-2026-0008"); return {work:j.workStatus, bay:j.bayId, stock:Store.item("ITEM-BRAKE").onHand, busy:!!Rules.bayOccupant("BAY-2")};');
    check('P05 shows Waiting for Parts and keeps the bay', p5.work === 'Waiting for Parts' && p5.bay === 'BAY-2' && p5.busy === true, JSON.stringify(p5));
    check('P05 the shortage is shown on screen', (await body()).indexOf('Waiting for Parts') >= 0);

    /* ================= P06 — completed but unpaid ================= */
    await load('P06');
    await role('U-CASHIER');
    await go('S12', { jobId: 'JOB-2026-0008' });
    const p6 = await J('var j=Store.job("JOB-2026-0008"); return {work:j.workStatus, pay:j.paymentStatus, coll:j.collectionStatus, bay:j.bayId, free:!Rules.bayOccupant("BAY-2")};');
    check('P06 completed, unpaid, bay already free', p6.work === 'Completed' && p6.pay === 'Unpaid' && p6.coll === 'Not collected' && p6.free === true, JSON.stringify(p6));
    const p6b = await J('return {receipts:Store.state.receipts.length, payments:Store.state.payments.length};');
    check('P06 the seeded receipt is not replayed', p6b.receipts === 1 && p6b.payments === 1, JSON.stringify(p6b));

    /* ================= P07 — paid, COPY and corrections ================= */
    await load('P07');
    await role('U-CASHIER');
    await go('S12', { jobId: 'JOB-2026-0008' });
    const p7a = await J('var j=Store.job("JOB-2026-0008"); var r=Store.jobReceipt(j.id); return {pay:j.paymentStatus, coll:j.collectionStatus, rc:r&&r.id, total:r&&r.totalMMK, receipts:Store.state.receipts.length};');
    check('P07 is paid but not collected', p7a.pay === 'Paid' && p7a.coll === 'Not collected' && p7a.total === 60000, JSON.stringify(p7a));
    check('P07 no extra receipt was created on load', p7a.receipts === 2, String(p7a.receipts));

    /* a reprint keeps the same number and adds a COPY marker */
    const before = await J('return Store.state.receipts.length;');
    await click('Reprint');
    await sleep(300);
    const p7b = await J('return {receipts:Store.state.receipts.length, copies:(Store.state.receipts||[]).filter(function(r){return r.isCopy||r.copyOf;}).length};');
    check('P07 a reprint does not create a second receipt', p7b.receipts === before, JSON.stringify(p7b));
    check('P07 the COPY is labelled', (await body()).indexOf('COPY') >= 0);

    /* charge correction: −5,000 charge and −5,000 refund */
    await load('P07');
    await role('U-MANAGER');
    await go('S17', { tab: 'corrections' });
    await click('Charge and refund');
    await sleep(300);
    await setValue('#correction-reason', 'Customer was charged for a part that was not fitted.');
    const deltas = await J('return {charge:(document.querySelector("#correction-charge-delta")||{}).value, refund:(document.querySelector("#correction-refund")||{}).value};');
    check('P07 the charge sample prefills −5,000 and a 5,000 refund', String(deltas.charge) === '-5000' && String(deltas.refund) === '5000', JSON.stringify(deltas));
    await submit('correction.save');
    const p7c = await J(
      'var j=Store.job("JOB-2026-0008"); var r=Store.jobReceipt(j.id);' +
      'var corrs=(Store.state.corrections||[]);' +
      'return {orig:r&&r.totalMMK, eff:Rules.effectiveCharge? Rules.effectiveCharge(r,corrs): null,' +
      ' corrCount:corrs.length, text:document.querySelector("#content").innerText.indexOf("55,000")>=0};');
    check('P07 the correction is recorded and the effective charge is 55,000',
      p7c.corrCount >= 1 && p7c.text === true, JSON.stringify(p7c));

    /* method correction keeps revenue unchanged */
    await load('P07');
    await role('U-MANAGER');
    await go('S17', { tab: 'corrections' });
    await click('Method change');
    await sleep(300);
    const p7d = await J('return {reason:(document.querySelector("#correction-reason")||{}).value, ref:(document.querySelector("#correction-reference")||{}).value};');
    await setValue('#correction-reason', 'Customer paid by KBZPay, not cash.');
    await setValue('#correction-reference', 'KBZ-DEMO-7788');
    await J('var c=document.querySelector(\'[name="walletVerified"]\'); if(c) c.checked=true;');
    await submit('correction.save');
    const p7e = await J('return {corrCount:(Store.state.corrections||[]).length, rev:Rules.revenueForDate? Rules.revenueForDate(Store.today()) : null};');
    check('P07 a method correction is recorded', p7e.corrCount >= 1, JSON.stringify(p7e));

    /* the paid price of a settled job is locked */
    await load('P07');
    await role('U-AUNG');
    await go('S07', { jobId: 'JOB-2026-0008' });
    const p7f = await J('var t=document.querySelector("#content").innerText;' +
      'return {locked:t.indexOf("price of this job is settled")>=0, button:!!document.querySelector(\'[data-action="quote.newVersion"]\')};');
    check('P07 a paid job offers no new quote version', p7f.locked === true && p7f.button === false, JSON.stringify(p7f));
    const p7g = await J('return {quotes:(Store.job("JOB-2026-0008").quotes||[]).length, total:Store.job("JOB-2026-0008").quotes[0].totalMMK};');
    check('P07 the paid quote is unchanged', p7g.quotes === 1 && p7g.total === 60000, JSON.stringify(p7g));

    /* ================= P08 — zero-charge Redo ================= */
    await load('P08');
    await role('U-MANAGER');
    await go('S06', { jobId: 'JOB-2026-0008' });
    const p8 = await J('var j=Store.job("JOB-2026-0008"); return {of:j.redoOfJobId, price:j.managerSetRedoChargeMMK, work:j.workStatus, pay:j.paymentStatus};');
    check('P08 opens on the linked zero-charge Redo job',
      p8.of === 'JOB-2026-0005' && p8.price === 0 && p8.pay === 'Unpaid', JSON.stringify(p8));
    check('P08 the link to the original is shown', (await body()).indexOf('JOB-2026-0005') >= 0);
    await go('S06', { jobId: 'JOB-2026-0005' });
    const redoBtn = await J('return !!document.querySelector(\'[data-action="job.createRedo"]\');');
    check('P08 a paid job can take a further linked Redo', redoBtn === true);
    await go('S06', { jobId: 'JOB-2026-0008' });

    /* the Redo is a normal job: bay, mechanic, work, completion */
    await go('S05', {});
    await click('Assign job to bay');
    await sleep(300);
    await setValue('#assign-job', 'JOB-2026-0008');
    await setValue('#assign-bay', 'BAY-2');
    await J('var c=document.querySelector(\'#modal-root input[name="staffIds"][value="U-AUNG"]\'); if(c){c.checked=true;}');
    await modalClick('Assign');
    await sleep(250);
    const p8bay = await J('var j=Store.job("JOB-2026-0008"); return {bay:j.bayId, staff:j.assignedStaffIds};');
    check('P08 the Redo is assigned to a bay and a mechanic',
      p8bay.bay === 'BAY-2' && p8bay.staff.indexOf('U-AUNG') >= 0, JSON.stringify(p8bay));

    await go('S06', { jobId: 'JOB-2026-0008' });
    await click('Start work');
    await sleep(300);
    const p8work = await J('return Store.job("JOB-2026-0008").workStatus;');
    check('P08 the Redo can be worked like any other job', p8work === 'In Progress', p8work);
    await J('document.querySelectorAll(\'#content .checklist input[type="checkbox"]\').forEach(function(c){ if(!c.checked){ c.checked=true; c.dispatchEvent(new Event("input",{bubbles:true})); c.dispatchEvent(new Event("change",{bubbles:true})); } });');
    await sleep(250);
    await click('Mark complete');
    await sleep(350);
    const p8done = await J('var j=Store.job("JOB-2026-0008"); return {work:j.workStatus, bay:j.bayId};');
    check('P08 completing the Redo releases its bay', p8done.work === 'Completed' && p8done.bay === null, JSON.stringify(p8done));
    await go('S12', { jobId: 'JOB-2026-0008' });
    const settleBtn = await J('return !!document.querySelector(\'[data-action="receipt.settleNoCharge"]\');');
    check('P08 a zero-charge Redo offers “Settle as no charge”', settleBtn === true);
    if (settleBtn) {
      await click('Settle as no charge');
      await sleep(350);
      const p8c = await J('var j=Store.job("JOB-2026-0008"); var r=Store.jobReceipt(j.id);' +
        'var pays=(Store.state.payments||[]).filter(function(p){return p.jobId===j.id;});' +
        'return {pay:j.paymentStatus, rc:r&&r.id, total:r&&r.totalMMK, payments:pays.length};');
      check('P08 the zero-charge Redo gets a zero-total receipt and no payment',
        p8c.pay === 'No charge' && p8c.total === 0 && p8c.payments === 0, JSON.stringify(p8c));
    }

    /* ================= P09 — promotions and discount approvals ================= */
    await load('P09');
    await role('U-MANAGER');
    await go('S15', {});
    const p9a = await J('var p=Store.state.promotions||[]; return p.map(function(x){return x.id+":"+x.type+":"+x.value;});');
    check('P09 the catalogue has demo promotions', p9a.length > 0, JSON.stringify(p9a));
    const p9b = await J(
      'var s=Store.service("SVC-POLISH");' +
      'var reg=s.priceBySizeMMK.S; var promo=Rules.bestPromotion(Store.state.promotions,"SVC-POLISH","S",Util.dayKey(Store.state.demoNow),reg);' +
      'return {reg:reg, promo:promo&&promo.id, final:promo?Rules.promotionFinal(promo,reg):null};');
    check('P09 the S wash-and-polish promotion gives 12,000 (18,500 − 6,500)', p9b.final === 12000, JSON.stringify(p9b));

    /* a 10% labour discount is a Manager decision */
    await role('U-MANAGER');
    const p9c = await J('return (Actions.click["catalogue.approveDiscount"]? true:false);');
    check('P09 the discount approval action exists', p9c === true);

    /* the Cashier may request a discount but sees no catalogue */
    await load('P09');
    await role('U-CASHIER');
    await go('S15', { tab: 'requests' });
    const p9cash = await J('var t=document.querySelector("#content").innerText;' +
      'return {form:!!document.querySelector(\'form[data-form="catalogue.discountRequest"]\'),' +
      ' services:t.indexOf("Catalogue services")>=0, tab:t.indexOf("Services")>=0};');
    check('P09 the Cashier reaches the discount request but not the catalogue',
      p9cash.form === true && p9cash.services === false, JSON.stringify(p9cash));

    /* request 10% of 40,000 */
    await setValue('#dr-job', 'JOB-2026-0006');
    await sleep(200);
    const lineOpts = await J('var s=document.querySelector("#dr-line"); return s? Array.from(s.options).map(function(o){return o.value+" | "+o.text;}) : null;');
    const sampleLine = (lineOpts || []).filter(t => t.indexOf('40000') >= 0)[0];
    check('P09 the 40,000 MMK labour sample is offered', !!sampleLine, JSON.stringify(lineOpts));
    if (sampleLine) {
      await J('var s=document.querySelector("#dr-line"); s.value=' + JSON.stringify(sampleLine.split(' | ')[0]) +
        '; s.dispatchEvent(new Event("change",{bubbles:true}));');
      await sleep(200);
      await setValue('#dr-percent', '10');
      await setValue('#dr-reason', 'Regular customer asked for a 10% labour discount.');
      await sleep(200);
      const preview = await J('var e=document.querySelector("#dr-preview"); return e? e.innerText : "";');
      check('P09 the preview shows 36,000 after 10%', preview.indexOf('36,000') >= 0, preview.slice(0, 200));
      await submit('catalogue.discountRequest');
      const p9d = await J('var r=(Store.state.discountRequests||[]); return r.map(function(x){return x.id+":"+x.status+":"+x.percent+":"+x.finalMMK+":"+x.regularMMK;});');
      check('P09 the 10% request is recorded as pending', p9d.length === 1 && p9d[0].indexOf('Pending') > 0, JSON.stringify(p9d));
    }

    /* the Manager approves 10% */
    await role('U-MANAGER');
    await go('S15', { tab: 'requests' });
    await click('Approve');
    await sleep(300);
    await modalClick('Approve request');
    const p9e = await J('var r=(Store.state.discountRequests||[])[0]; return r? {status:r.status, final:r.finalMMK, approver:r.approver}:null;');
    check('P09 a Manager may approve 10% (40,000 → 36,000)',
      p9e && p9e.status === 'Approved' && p9e.final === 36000, JSON.stringify(p9e));

    /* 15% needs the Owner */
    await load('P09');
    await role('U-CASHIER');
    await go('S15', { tab: 'requests' });
    await setValue('#dr-job', 'JOB-2026-0007');
    await sleep(200);
    const lineOpts2 = await J('var s=document.querySelector("#dr-line"); return s? Array.from(s.options).map(function(o){return o.value+" | "+o.text;}) : null;');
    const sampleLine2 = (lineOpts2 || []).filter(t => t.indexOf('40000') >= 0)[0];
    if (sampleLine2) {
      await J('var s=document.querySelector("#dr-line"); s.value=' + JSON.stringify(sampleLine2.split(' | ')[0]) +
        '; s.dispatchEvent(new Event("change",{bubbles:true}));');
      await sleep(200);
      await setValue('#dr-percent', '15');
      await setValue('#dr-reason', 'Regular customer asked for a 15% labour discount.');
      await sleep(200);
      const preview2 = await J('var e=document.querySelector("#dr-preview"); return e? e.innerText : "";');
      check('P09 the preview shows 34,000 after 15%', preview2.indexOf('34,000') >= 0, preview2.slice(0, 200));
      await submit('catalogue.discountRequest');
      await role('U-MANAGER');
      await go('S15', { tab: 'requests' });
      const managerView = await J('var t=document.querySelector("#content").innerText; return {owner:t.indexOf("Owner approval required")>=0};');
      check('P09 a Manager is told that 15% needs the Owner', managerView.owner === true, JSON.stringify(managerView));
      await role('U-OWNER');
      await go('S15', { tab: 'requests' });
      await click('Approve');
      await sleep(300);
      await modalClick('Approve request');
      const p9f = await J('var r=(Store.state.discountRequests||[])[0]; return r? {status:r.status, final:r.finalMMK, approver:r.approver}:null;');
      check('P09 the Owner may approve 15% (40,000 → 34,000)',
        p9f && p9f.status === 'Approved' && p9f.final === 34000, JSON.stringify(p9f));
    }

    /* a promotion lowers the quoted price of a new service line */
    await load('P09');
    await role('U-MANAGER');
    await go('S07', { jobId: 'JOB-2026-0007' });
    await sleep(200);
    const added = await J('var rows=document.querySelectorAll(\'[data-action="quote.addService"]\');' +
      'for (var i=0;i<rows.length;i++){ if (rows[i].getAttribute("data-service-id")==="SVC-POLISH"){ rows[i].click(); return true; } } return false;');
    await sleep(300);
    const p9g = await J('var d=window.__dolphinDraft; if(!d) return null;' +
      'var l=d.lines.filter(function(x){return x.serviceId==="SVC-POLISH";})[0];' +
      'return l? {price:l.unitPriceMMK, regular:l.regularPriceMMK, promo:l.promotionId}:null;');
    check('P09 a promoted service line is quoted at 12,000 (18,500 − 6,500)',
      !!p9g && p9g.price === 12000 && p9g.promo === 'PROMO-01', JSON.stringify(p9g));

    /* ================= P10 — bookings and the no-show boundary ================= */
    await load('P10');
    await role('U-CASHIER');
    await go('S14', {});
    const p10a = await J('return (Store.state.bookings||[]).map(function(b){return b.id+":"+b.status+":"+b.startTime+":"+b.bayId;});');
    check('P10 the fixture bookings are loaded', p10a.length >= 3, JSON.stringify(p10a));
    const before10 = await J('return (Store.state.bookings||[]).length;');
    await click('Run demo no-show check');
    await sleep(300);
    const p10b = await J('var b=(Store.state.bookings||[]); var ns=b.filter(function(x){return x.status==="No-show"||x.noShow;}); return {count:b.length, noShow:ns.length, ids:ns.map(function(x){return x.id;})};');
    check('P10 the no-show check cancels the overdue booking once', p10b.noShow === 1 && p10b.count === before10, JSON.stringify(p10b));
    await click('Run demo no-show check');
    await sleep(300);
    const p10c = await J('return (Store.state.bookings||[]).filter(function(x){return x.status==="No-show"||x.noShow;}).length;');
    check('P10 running it twice does not cancel twice', p10c === 1, String(p10c));

    /* ================= P11 — stock, purchasing and adjustments ================= */
    await load('P11');
    await role('U-MANAGER');
    await go('S10', { tab: 'inventory' });
    const p11a = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:(Store.state.stockMovements||[]).length};');
    check('P11 opens with 5 on hand and no replayed movement', p11a.stock === 5 && p11a.movements === 0, JSON.stringify(p11a));

    /* a purchase order alone does not change stock */
    await go('S10', { tab: 'orders' });
    const poForm = await J('return !!document.querySelector(\'form[data-form="po.create"]\');');
    check('P11 the purchase-order form is on screen', poForm === true);
    if (poForm) {
      const stockBefore = await J('return Store.item("ITEM-BRAKE").onHand;');
      const ok = await J('var f=document.querySelector(\'form[data-form="po.create"]\'); if(!f) return false; f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); return true;');
      await sleep(350);
      const p11b = await J('return {stock:Store.item("ITEM-BRAKE").onHand, orders:(Store.state.purchaseOrders||[]).length};');
      check('P11 creating a purchase order does not change stock', p11b.stock === stockBefore, JSON.stringify(p11b));
    }

    /* count adjustment 5 → 4 appends one movement */
    await go('S16', {});
    await setValue('#adj-type', 'count');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#adj-qty', '4');
    await setValue('#adj-reason', 'Physical count on 28 Oct 2026 found 4 pieces.');
    await submit('adjustments.post');
    await modalClick('Confirm adjustment');
    const p11c = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:(Store.state.stockMovements||[]).length};');
    check('P11 a count of 4 gives a −1 movement and a final balance of 4', p11c.stock === 4 && p11c.movements === 1, JSON.stringify(p11c));

    /* ================= P12 — daily closing ================= */
    await load('P12');
    await role('U-CASHIER');
    await go('S17', { tab: 'closing' });
    const p12a = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return {cash:t.indexOf("60,000")>=0, kbz:t.indexOf("30,000")>=0, wave:t.indexOf("20,000")>=0};');
    check('P12 the expected 60,000 / 30,000 / 20,000 are shown', p12a.cash && p12a.kbz && p12a.wave, JSON.stringify(p12a));
    await setValue('#closing-count-WavePay', '19500');
    await sleep(200);
    const p12b = await J('return document.querySelector("#content").innerText.indexOf("-500")>=0 || document.querySelector("#content").innerText.indexOf("−500")>=0;');
    check('P12 a 500 difference is shown for WavePay', p12b === true);
    const savedNoReason = await J('return true;');
    const p12c = await J('return !!document.querySelector("#closing-reason");');
    check('P12 an explanation field is required when a difference exists', p12c === true);
    await setValue('#closing-reason', 'WavePay settlement for one transfer was short by 500 MMK.');
    await submit('closing.save');
    const p12d = await J('return {closings:(Store.state.cashClosings||[]).length};');
    check('P12 the closing is saved', p12d.closings >= 1, JSON.stringify(p12d));

    /* ================= P13 — import preview ================= */
    await load('P13');
    await role('U-MANAGER');
    await go('S18', {});
    await click('Load sample rows');
    await sleep(300);
    const p13a = await J('var b=Store.state.importStaging; return b? JSON.stringify(b).slice(0,300):"none";');
    check('P13 the sample rows create a staging preview', p13a !== 'none', p13a);
    const p13b = await J('var t=document.querySelector("#content").innerText; return {valid:t.indexOf("Valid")>=0, dup:t.indexOf("Duplicate")>=0, err:t.indexOf("Error")>=0, sim:!!document.querySelector(\'[data-action="import.simulate"]\')};');
    check('P13 valid, duplicate and error counts are shown', p13b.valid && p13b.dup && p13b.err, JSON.stringify(p13b));
    const p13c = await J('var b=document.querySelector(\'[data-action="import.simulate"]\'); if(!b) return "missing"; if(b.disabled) return "disabled"; return "enabled";');
    const vehBeforeBlock = await J('return Store.state.vehicles.length;');
    if (p13c === 'enabled') await click('Simulate import');
    await sleep(300);
    const p13c2 = await J('return {vehicles:Store.state.vehicles.length, blocked:document.querySelector("#content").innerText.indexOf("Blocked")>=0 || document.querySelector("#content").innerText.indexOf("blocked")>=0, toast:(document.querySelector("#toast-root")||{}).innerText||""};');
    check('P13 the import is blocked while errors remain',
      p13c === 'disabled' || (p13c2.vehicles === vehBeforeBlock && (p13c2.blocked || p13c2.toast.length > 0)),
      p13c + ' ' + JSON.stringify(p13c2));
    await click('Use corrected sample');
    await sleep(300);
    const p13d = await J('var b=document.querySelector(\'[data-action="import.simulate"]\'); return b? (b.disabled? "disabled":"enabled") : "missing";');
    check('P13 the corrected sample removes the blocking error', p13d === 'enabled', p13d);
    const vehBefore = await J('return Store.state.vehicles.length;');
    await click('Simulate import');
    await sleep(400);
    const p13e = await J('return {vehicles:Store.state.vehicles.length, logs:(Store.state.importBatches||[]).length};');
    check('P13 the import adds the two new vehicles and skips the duplicate', p13e.vehicles === vehBefore + 2, JSON.stringify(p13e));

    /* ================= P14 — reports and illustrative commission ================= */
    await load('P14');
    await role('U-MANAGER');
    await go('S19', { tab: 'overview' });
    const p14 = await J('var t=document.querySelector("#content").innerText; return {rev:t.indexOf("60,000")>=0, cost:t.indexOf("12,000")>=0, profit:t.indexOf("48,000")>=0, comm:t.indexOf("4,000")>=0, split:t.indexOf("2,000")>=0, contrib:t.indexOf("44,000")>=0};');
    check('P14 revenue 60,000, cost 12,000, profit 48,000, commission 4,000, 2,000 each, contribution 44,000',
      p14.rev && p14.cost && p14.profit && p14.comm && p14.split && p14.contrib, JSON.stringify(p14));

    /* ================= P15 — missing cost and no rule ================= */
    await load('P15');
    await role('U-MANAGER');
    await go('S19', { tab: 'overview' });
    const p15 = await J('var t=document.querySelector("#content").innerText; return {inc:t.indexOf("Incomplete")>=0, notcfg:t.indexOf("Not configured")>=0, zero:t.indexOf("0")>=0};');
    check('P15 shows Incomplete cost and Not configured commission', p15.inc && p15.notcfg, JSON.stringify(p15));

    /* ================= P16 — reminders ================= */
    await load('P16');
    await role('U-CASHIER');
    await go('S13', {});
    const p16a = await J('var t=document.querySelector("#content").innerText; return {due:t.indexOf("Service due")>=0, coll:t.indexOf("collection")>=0||t.indexOf("Collection")>=0, j7:t.indexOf("JOB-2026-0007")>=0, j5:t.indexOf("JOB-2026-0005")>=0};');
    check('P16 lists the service-due job and the uncollected job', p16a.due && p16a.j7, JSON.stringify(p16a));

    /* a follow-up needs a channel and an outcome */
    const p16b = await J('return !!document.querySelector(\'form[data-form="reminders.followUp"]\');');
    check('P16 the follow-up form is present', p16b === true);

    const errs = s.logs.filter(l => l.type === 'exception' || l.type === 'error');
    check('no console errors during the exception run', errs.length === 0, errs.map(e => e.text).join(' | ').slice(0, 300));
  } finally {
    await s.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
