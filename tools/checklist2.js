/* Feature checklist, part 2 — the paths that part 1 did not reach.
   These are the secondary paths of the build guide: registration of a new
   customer, supplier and purchase-order forms, duplicate goods receipts,
   follow-up notes, catalogue price versioning, the remaining stock
   adjustment dispositions, a refund larger than the amount collected, the
   import merge path, the commission adjustment path and the bay-disable
   guard.

   Every check drives the real DOM and asserts on the shared in-memory state.
   Usage:  node tools/checklist2.js */
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
  await sleep(400);
  return ok;
}
async function modalClick(text) {
  const ok = await J(
    'var b=document.querySelectorAll("#modal-root .modal-actions .btn, #modal-root .modal-actions button");' +
    'for (var i=0;i<b.length;i++){ if((b[i].textContent||"").indexOf(' + JSON.stringify(text) + ')!==-1){ b[i].click(); return true; } } return false;');
  await sleep(340);
  return ok;
}
async function fieldErrors() {
  return J('var e=document.querySelectorAll(".field-error-text");return Array.prototype.map.call(e,function(x){return x.innerText;}).join(" | ");');
}
/* Swap the scenario without the "discard unsaved changes?" dialog. The flag
   is only a UI guard for typed-but-unsaved input; the suites below always
   want a clean snapshot. */
async function loadClean(id) {
  await J('Store.dirty = false;');
  await load(id);
}

(async () => {
  s = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    await sleep(600);

    /* ============ O. S03 registration of a new customer ============ */
    await load('P01');
    await role('U-CASHIER');
    await go('S03', {});
    await J('var r=document.querySelector(\'input[name="customerMode"][value="New"]\'); if(r){r.checked=true;r.dispatchEvent(new Event("change",{bubbles:true}));}');
    await sleep(200);
    await setValue('#reg-new-name', 'New Customer Demo');
    await setValue('#reg-new-phone', '09-0000-0099');
    await setValue('#reg-plate', 'DEMO-031');
    await setValue('#reg-brand', 'Toyota');
    await setValue('#reg-model', 'Corolla');
    await setValue('#reg-year', '2022');
    await setValue('#reg-size', 'M');
    await submit('register.save');
    await sleep(300);
    const reg = await J('return {customers:(Store.state.customers||[]).length, vehicles:(Store.state.vehicles||[]).length,' +
      ' plate:(Store.state.vehicles||[]).filter(function(v){return v.plate==="DEMO-031";}).length,' +
      ' cust:(Store.state.customers||[]).filter(function(c){return c.name==="New Customer Demo";}).length};');
    check('O1 registering a new customer and vehicle adds one of each',
      reg.customers === 3 && reg.vehicles === 5 && reg.plate === 1 && reg.cust === 1, JSON.stringify(reg));

    await load('P01');
    await role('U-CASHIER');
    await go('S03', {});
    await J('var r=document.querySelector(\'input[name="customerMode"][value="New"]\'); if(r){r.checked=true;r.dispatchEvent(new Event("change",{bubbles:true}));}');
    await sleep(200);
    await setValue('#reg-new-name', '');
    await setValue('#reg-new-phone', '');
    await setValue('#reg-plate', 'DEMO-008');
    await submit('register.save');
    await sleep(300);
    const regErr = await fieldErrors();
    const regCount = await J('return {c:(Store.state.customers||[]).length, v:(Store.state.vehicles||[]).length};');
    check('O2 a registration with a missing name and a duplicate plate is refused with reasons',
      regErr.length > 0 && regCount.c === 2 && regCount.v === 4, JSON.stringify({ err: regErr, counts: regCount }));

    /* ============ P. S10 suppliers and purchase orders ============ */
    await loadClean('P11');
    await role('U-MANAGER');
    await go('S10', { tab: 'suppliers' });
    await sleep(250);
    const supCount = await J('return (Store.state.suppliers||[]).length;');
    const supForm = await J('return {name:!!document.querySelector("#sup-name"), contact:!!document.querySelector("#sup-contact")};');
    await setValue('#sup-name', 'Demo Supplier Extra');
    await setValue('#sup-contact', 'Demo contact note');
    await submit('supplier.save');
    await sleep(350);
    const supAfter = await J('return {n:(Store.state.suppliers||[]).length,' +
      ' made:(Store.state.suppliers||[]).filter(function(x){return x.name==="Demo Supplier Extra";}).length};');
    check('P1 a supplier can be created with a name and a contact note',
      supForm.name && supForm.contact && supAfter.n === supCount + 1 && supAfter.made === 1, JSON.stringify(supAfter));

    await go('S10', { tab: 'suppliers' });
    await sleep(250);
    const archiveBtn = await J('var b=document.querySelectorAll(\'[data-action="supplier.archive"]\');return b.length;');
    if (archiveBtn) {
      await J('var b=document.querySelector(\'[data-action="supplier.archive"]\');if(b) b.click();');
      await sleep(300);
    }
    const archived = await J('return (Store.state.suppliers||[]).filter(function(x){return !x.active;}).length;');
    check('P2 a supplier can be archived and the record is kept',
      archiveBtn > 0 && archived >= 1, JSON.stringify({ buttons: archiveBtn, archived: archived }));

    await go('S10', { tab: 'orders' });
    await sleep(250);
    const orderFields = await J('return {sup:!!document.querySelector("#po-supplier"), item:!!document.querySelector("#po-item"), qty:!!document.querySelector("#po-qty")};');
    check('P3 the purchase-order form asks for a supplier, an item and a quantity',
      orderFields.sup && orderFields.item && orderFields.qty, JSON.stringify(orderFields));

    /* ============ Q. S11 duplicate goods receipt ============ */
    /* A clean P11 is loaded again: P2 above archived a supplier and S11 only
       offers active suppliers, so the old snapshot would have no SUP-01. */
    await loadClean('P11');
    await role('U-MANAGER');
    await go('S11', {});
    await setValue('#gr-supplier', 'SUP-01');
    await sleep(150);
    await setValue('#gr-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#gr-qty', '5');
    await setValue('#gr-reference', 'DEMO-REF-1');
    await setValue('#gr-cost', '12000');
    const grPreview = await J('var t=document.querySelector("#gr-preview");return t?t.innerText:"";');
    await submit('receipt.save');
    await sleep(400);
    const gr1 = await J('return {stock:Store.item("ITEM-BRAKE").onHand, receipts:(Store.state.goodsReceipts||[]).length};');
    check('Q1 a goods receipt of 5 pieces at 12,000 raises the balance by 5',
      gr1.stock === 10 && gr1.receipts === 1 && grPreview.indexOf('60,000') >= 0,
      JSON.stringify({ state: gr1, preview: grPreview.slice(0, 120) }));

    /* the same supplier, reference and item a second time */
    await go('S11', {});
    await setValue('#gr-supplier', 'SUP-01');
    await sleep(150);
    await setValue('#gr-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#gr-qty', '5');
    await setValue('#gr-reference', 'DEMO-REF-1');
    await setValue('#gr-cost', '12000');
    await submit('receipt.save');
    await sleep(400);
    const gr2 = await J('return {stock:Store.item("ITEM-BRAKE").onHand, receipts:(Store.state.goodsReceipts||[]).length};');
    const dupErr = await fieldErrors();
    check('Q2 the same supplier, reference and item is not received twice',
      gr2.stock === 10 && gr2.receipts === 1 && dupErr.indexOf('already received') >= 0,
      JSON.stringify({ state: gr2, err: dupErr }));

    /* ============ R. S13 follow-up note ============ */
    await load('P16');
    await role('U-CASHIER');
    await go('S13', { tab: 'collection' });
    await sleep(250);
    const fuFields = await J('return {channel:!!document.querySelector("#followup-channel"), outcome:!!document.querySelector("#followup-outcome"), note:!!document.querySelector("#followup-note")};');
    check('R1 the follow-up form asks for a channel, an outcome and a note',
      fuFields.channel && fuFields.outcome && fuFields.note, JSON.stringify(fuFields));
    const before = await J('return (Store.state.followUps||[]).length;');
    await setValue('#followup-note', 'Called the customer in the demo.');
    await submit('reminders.followUp');
    await sleep(400);
    const after = await J('var f=(Store.state.followUps||[]);return {n:f.length, last:f.length?f[f.length-1]:null};');
    check('R2 a follow-up note is recorded in the demo state',
      after.n === before + 1 && !!after.last && !!after.last.note, JSON.stringify(after));

    /* ============ S. S15 catalogue price versioning ============ */
    await load('P01');
    await role('U-OWNER');
    await go('S15', { tab: 'services' });
    await sleep(250);
    const svc = await J('var s=Store.state.services.filter(function(x){return x.id==="SVC-BRAKE";})[0];' +
      'return {v:s.priceVersion, fixed:s.fixedPriceMMK, bySize:s.priceBySizeMMK};');
    check('S1 a catalogue service carries a price version and a price',
      !!svc.v && (!!svc.fixed || !!svc.bySize), JSON.stringify(svc));
    const editBtn = await J('return !!document.querySelector(\'[data-action="catalogue.editService"]\');');
    check('S2 the Owner can open a catalogue service for editing',
      editBtn === true, String(editBtn));

    /* ============ T. S16 remaining dispositions ============ */
    await loadClean('P11');
    await role('U-MANAGER');
    await go('S16', {});
    await setValue('#adj-type', 'supplierReturn');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#adj-qty', '1');
    await setValue('#adj-reason', 'Sent one piece back to the supplier in the demo.');
    await submit('adjustments.post');
    await modalClick('Confirm adjustment');
    const ret = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:Store.state.stockMovements.length};');
    check('T1 a supplier return takes one piece off the balance and appends one movement',
      ret.stock === 4 && ret.movements === 1, JSON.stringify(ret));

    await go('S16', {});
    await setValue('#adj-type', 'supplierReturn');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#adj-qty', '99');
    await setValue('#adj-reason', 'A return larger than the stock on hand.');
    await submit('adjustments.post');
    await sleep(300);
    const bigRet = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:Store.state.stockMovements.length, err:document.body.innerText.indexOf("on hand")>=0};');
    check('T2 a supplier return larger than the stock on hand is refused',
      bigRet.stock === 4 && bigRet.movements === 1 && bigRet.err === true, JSON.stringify(bigRet));

    /* A count is a different movement type from a supplier return, so it is
       allowed and appends its own movement: the counted 5 replaces the
       balance of 4 and the ledger keeps both entries. */
    await go('S16', {});
    await setValue('#adj-type', 'count');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-BRAKE');
    await sleep(200);
    await setValue('#adj-qty', '5');
    await setValue('#adj-reason', 'Counted five pieces in the demo.');
    await submit('adjustments.post');
    await modalClick('Confirm adjustment');
    const counted = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:Store.state.stockMovements.length,' +
      ' types:Store.state.stockMovements.map(function(m){return m.type+":"+m.delta;})};');
    check('T3 a count appends its own movement and sets the balance to the counted quantity',
      counted.stock === 5 && counted.movements === 2, JSON.stringify(counted));

    /* The same movement type for the same item is posted once per session:
       the confirm button is disabled and nothing is posted twice. */
    await go('S16', {});
    await setValue('#adj-type', 'count');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-BRAKE');
    await sleep(250);
    const again = await J('var b=document.querySelector(\'#adjust-form button[type="submit"]\');' +
      'return {disabled:b?b.disabled:null, banner:document.body.innerText.indexOf("Already applied")>=0};');
    await setValue('#adj-qty', '5');
    await setValue('#adj-reason', 'A second count of the same item in the same session.');
    await submit('adjustments.post');
    await sleep(350);
    const twice = await J('return {stock:Store.item("ITEM-BRAKE").onHand, movements:Store.state.stockMovements.length};');
    check('T4 the same movement type for the same item is posted once per session',
      again.disabled === true && again.banner === true && twice.stock === 5 && twice.movements === 2,
      JSON.stringify({ button: again, state: twice }));

    await go('S16', {});
    await setValue('#adj-type', 'writeoff');
    await sleep(200);
    await setValue('#adj-item', 'ITEM-CLEANER');
    await sleep(200);
    await setValue('#adj-qty', '1');
    await setValue('#adj-reason', 'Cleaner container damaged in the demo.');
    await submit('adjustments.post');
    await modalClick('Confirm adjustment');
    const clean = await J('return {stock:Store.item("ITEM-CLEANER").onHand, movements:Store.state.stockMovements.length};');
    check('T5 a write-off of one consumable takes the balance to zero with one movement',
      clean.stock === 0 && clean.movements === 3, JSON.stringify(clean));

    /* ============ U. S17 a refund larger than the amount collected ============ */
    await load('P07');
    await role('U-MANAGER');
    await go('S17', { tab: 'corrections' });
    await sleep(250);
    await setValue('#correction-type', 'charge');
    await sleep(200);
    await setValue('#correction-charge-delta', '-70000');
    await setValue('#correction-refund', '70000');
    await setValue('#correction-reason', 'A refund larger than the amount collected.');
    await submit('correction.save');
    await sleep(400);
    const bigCorr = await J('var t=document.body.innerText;' +
      'return {err:t.indexOf("larger than")>=0 || t.indexOf("more than")>=0 || t.indexOf("cannot be")>=0,' +
      ' count:(Store.state.corrections||[]).length};');
    check('U1 a refund larger than the amount collected is refused',
      bigCorr.err === true && bigCorr.count === 0, JSON.stringify(bigCorr));

    /* ============ V. S18 the import merge path ============ */
    await load('P13');
    await role('U-MANAGER');
    await go('S18', {});
    await sleep(250);
    await click('Load sample rows', 'button');
    await sleep(320);
    await click('Use corrected sample', 'button');
    await sleep(320);
    const staged = await J('var st=Store.state.importStaging && Store.state.importStaging.vehicles;' +
      'return st ? st.rows.length : 0;');
    const dupIndex = await J('var st=Store.state.importStaging && Store.state.importStaging.vehicles; if(!st) return null;' +
      'for (var i=0;i<st.rows.length;i++){ if (st.rows[i].status === "duplicate") return st.rows[i].index; } return null;');
    if (dupIndex !== null) {
      await J('var r=document.querySelector(\'input[name="choice-row-' + dupIndex + '"][value="merge"]\'); if(r){r.click();}');
      await sleep(350);
    }
    const mergeBtn = await J('return !!document.querySelector(\'[data-action="import.confirmMerge"]\');');
    check('V1 the corrected import sample can be staged and a duplicate row can be marked for merge',
      staged > 0 && mergeBtn === true, JSON.stringify({ staged: staged, dupIndex: dupIndex, merge: mergeBtn }));

    await J('var b=document.querySelector(\'[data-action="import.confirmMerge"]\'); if(b) b.click();');
    await sleep(350);
    const confirmed = await J('var st=Store.state.importStaging && Store.state.importStaging.vehicles;' +
      'return st ? st.rows.filter(function(r){return r.mergeConfirmed;}).length : 0;');
    check('V2 the merge has to be confirmed row by row before the import runs',
      confirmed === 1, JSON.stringify({ confirmed: confirmed }));

    const vehBefore = await J('return Store.state.vehicles.length;');
    await click('Simulate import', 'button');
    await sleep(450);
    const sim = await J('var b=Store.state.importBatches||[]; var last=b[b.length-1]||null;' +
      'return {vehicles:Store.state.vehicles.length, counts:last?last.counts:null};');
    check('V3 the simulated import creates the two new vehicles and merges the duplicate row',
      sim.vehicles === vehBefore + 2 && !!sim.counts && sim.counts.merged === 1 && sim.counts.skipped === 0,
      JSON.stringify({ before: vehBefore, after: sim }));

    /* ============ W. S19 the commission adjustment path ============ */
    await load('P14');
    await role('U-MANAGER');
    await go('S19', { tab: 'commission' });
    await sleep(300);
    await click('Mark demo payout', 'button');
    await sleep(420);
    const paidOne = await J('var p=Store.state.commissionPayouts||[];return {n:p.length, amount:p.length?p[0].amountMMK:null};');
    check('W1 a demo payout is recorded for the earned share',
      paidOne.n === 1 && paidOne.amount === 2000, JSON.stringify(paidOne));

    /* The Owner changes the illustrative rule, so the earned share no longer
       matches the recorded payout. */
    await role('U-OWNER');
    await go('S19', { tab: 'commission' });
    await sleep(300);
    await setValue('#rule-value', '20');
    await submit('reports.commissionRule');
    await sleep(420);
    const adjustBtn = await J('return !!document.querySelector(\'[data-action="reports.adjustment"]\');');
    check('W2 after the rule changes the row offers an adjustment instead of a second payout',
      adjustBtn === true, JSON.stringify({ adjust: adjustBtn }));

    const revBefore = await J('return Rules.revenue(Store.today(), Store.today()).totalMMK;');
    await J('var b=document.querySelector(\'[data-action="reports.adjustment"]\'); if(b) b.click();');
    await sleep(420);
    const adjusted = await J('var p=Store.state.commissionPayouts||[];' +
      'return {n:p.length, total:p.reduce(function(a,x){return a+(x.amountMMK||0);},0),' +
      ' note:p.length?p[p.length-1].note:"", rev:Rules.revenue(Store.today(), Store.today()).totalMMK};');
    check('W3 the adjustment records only the difference and leaves the receipt revenue unchanged',
      adjusted.n === 2 && adjusted.total === 4000 && adjusted.note.indexOf('Adjustment') === 0 &&
      adjusted.rev === revBefore,
      JSON.stringify({ revenueBefore: revBefore, after: adjusted }));

    /* ============ X. S20 the bay-disable guard ============ */
    await load('P01');
    await role('U-OWNER');
    await go('S20', {});
    await sleep(250);
    const occupied = await J('var bs=Store.state.bays; for (var i=0;i<bs.length;i++){' +
      ' var o=Rules.bayOccupant(bs[i].id); if (o) return {bay:bs[i].id, job:o.id}; } return null;');
    if (occupied) {
      const box = '#bay-enabled-' + occupied.bay;
      await J('var b=document.querySelector(' + JSON.stringify(box) + '); if(b){b.checked=false;b.dispatchEvent(new Event("change",{bubbles:true}));}');
      await sleep(200);
      await submit('settings.bays');
      await sleep(350);
      const errText = await fieldErrors();
      const stillOn = await J('var b=document.querySelector(' + JSON.stringify(box) + ');' +
        'var s=Store.state.bays.filter(function(x){return x.id===' + JSON.stringify(occupied.bay) + ';})[0];' +
        'return {box:b?b.checked:null, state:s?s.enabled:null};');
      check('X1 a bay with an active assignment cannot be switched off',
        stillOn.state === true && stillOn.box === true && errText.indexOf(occupied.job) >= 0,
        JSON.stringify({ occupied: occupied, bay: stillOn, err: errText }));
    } else {
      check('X1 a bay with an active assignment cannot be switched off', false, 'no occupied bay in P01 to test');
    }

    /* a free bay can be switched off */
    const freeBay = await J('var bs=Store.state.bays;for(var i=0;i<bs.length;i++){if(!Rules.bayOccupant(bs[i].id)) return bs[i].id;} return null;');
    if (freeBay) {
      const freeBox = '#bay-enabled-' + freeBay;
      await J('var b=document.querySelector(' + JSON.stringify(freeBox) + '); if(b){b.checked=false;b.dispatchEvent(new Event("change",{bubbles:true}));}');
      await sleep(200);
      await submit('settings.bays');
      await sleep(350);
      const nowOff = await J('var b=Store.state.bays.filter(function(x){return x.id===' + JSON.stringify(freeBay) + ';})[0];return b?b.enabled:null;');
      check('X2 a bay with no assignment can be switched off', nowOff === false, JSON.stringify({ bay: freeBay, enabled: nowOff }));
    }

    /* ============ Y. S13 the reminder queues ============ */
    await load('P16');
    await role('U-CASHIER');
    await go('S13', { tab: 'service' });
    await sleep(250);
    const dueText = await J('var t=document.querySelector("#content").innerText;' +
      'return {job:t.indexOf("JOB-2026-0005")>=0, other:t.indexOf("JOB-2026-0007")>=0};');
    check('Y1 the service-due queue lists the job whose stored service date has passed',
      dueText.job === true && dueText.other === false, JSON.stringify(dueText));

    await go('S13', { tab: 'collection' });
    await sleep(250);
    const collText = await J('var t=document.querySelector("#content").innerText;' +
      'return {job:t.indexOf("JOB-2026-0007")>=0, other:t.indexOf("JOB-2026-0005")>=0};');
    check('Y2 the collection queue lists the completed job that is still uncollected',
      collText.job === true && collText.other === false, JSON.stringify(collText));

    const errs = s.logs.filter(l => l.type === 'exception' || l.type === 'error');
    if (errs.length) { console.log('console errors:'); errs.forEach(e => console.log('  ' + e.text)); }
    check('no console errors during the second checklist run', errs.length === 0, errs.length + ' errors');
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
