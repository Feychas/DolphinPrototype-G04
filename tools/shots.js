/* Screenshot capture for the prototype.
   Produces the images referenced by README.md:
     screenshots/01..13  — the P01 main journey at 1440 px
     screenshots/20..34  — one shot per exception preset
     screenshots/40..47  — the main journey at 390 px (narrow mobile)
   Usage:  node tools/shots.js */
const path = require('path');
const { Session, sleep } = require('./drive');
const BASE = 'http://127.0.0.1:8080/index.html';
const OUT = path.join(__dirname, '..', 'screenshots');
let s;

const J = expr => s.eval(expr);

async function role(userId) {
  await J('App.switchRole(' + JSON.stringify(userId) + ');');
  await sleep(220);
}
async function scenario(id) {
  await J('App.loadScenario(' + JSON.stringify(id) + ');');
  await sleep(260);
}
async function go(screen, params) {
  await J('App.go(' + JSON.stringify(screen) + ',' + JSON.stringify(params || {}) + ',{force:true});');
  await sleep(240);
}
async function clickText(text, selector) {
  const ok = await J(
    'var sel=' + JSON.stringify(selector || 'button, a, .btn, .tab') + ';' +
    'var els=document.querySelectorAll(sel);' +
    'for (var i=0;i<els.length;i++){ var t=(els[i].textContent||"").trim();' +
    ' if (t.indexOf(' + JSON.stringify(text) + ')!==-1 && !els[i].disabled){ els[i].scrollIntoView({block:"center"}); els[i].click(); return true; } }' +
    ' return false;');
  await sleep(300);
  return ok;
}
async function modalClick(text) {
  const ok = await J(
    'var b=document.querySelectorAll("#modal-root .modal-actions .btn, #modal-root .modal-actions button");' +
    'for (var i=0;i<b.length;i++){ if((b[i].textContent||"").indexOf(' + JSON.stringify(text) + ')!==-1){ b[i].click(); return true; } } return false;');
  await sleep(320);
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
async function shot(name) {
  await J('window.scrollTo(0,0); var t=document.querySelector("#toast-root"); if(t){t.innerHTML="";}');
  await sleep(150);
  const file = path.join(OUT, name + '.png');
  await s.screenshot(file, false);
  console.log('shot  ' + name + '.png');
}

/* ---------------- the P01 journey ---------------- */
async function journey(names) {
  const want = names;
  await J('App.resetAll();');
  await sleep(320);

  await go('S01', {});
  if (want.dashboard) await shot(want.dashboard);

  await go('S02', {});
  await J('Store.state.selectedVehicleId = "VEH-008"; App.render();');
  await sleep(200);
  if (want.customers) await shot(want.customers);

  await go('S04', { vehicleId: 'VEH-008' });
  await sleep(200);
  if (want.checkin) await shot(want.checkin);
  await setValue('#ci-mileage', '68000');
  await clickText('Create demo job', 'button');
  await sleep(400);

  await role('U-MANAGER');
  await go('S05', {});
  await clickText('Assign job to bay', 'button');
  await sleep(280);
  await setValue('#assign-job', 'JOB-2026-0008');
  await setValue('#assign-bay', 'BAY-2');
  await J('var c=document.querySelector(\'#assign-form input[name="staffIds"][value="U-AUNG"]\'); if(c){c.checked=true;}');
  await modalClick('Assign');
  await sleep(220);
  if (want.bay) await shot(want.bay);

  await role('U-AUNG');
  await go('S06', { jobId: 'JOB-2026-0008' });
  await clickText('Start inspection', 'button');
  await sleep(320);
  await J('var rows=document.querySelectorAll("[data-action=\\"quote.addShopMaterial\\"]");' +
    'for(var i=0;i<rows.length;i++){ if(rows[i].getAttribute("data-item-id")==="ITEM-BRAKE"){ rows[i].click(); return true; } } return false;');
  await sleep(260);
  await setValue('#q-notes', 'Rear brake pads worn and one disc scored. Replaced the brake part and bled the line.');
  if (want.quote) await shot(want.quote);

  await clickText('Submit quote v1', 'button');
  await sleep(400);

  await role('U-CASHIER');
  await go('S08', { jobId: 'JOB-2026-0008' });
  await sleep(220);
  if (want.approval) await shot(want.approval);
  await setValue('#ap-decision', 'Approved');
  await setValue('#ap-channel', 'Phone');
  await setValue('#ap-note', 'Customer agreed to 60,000 MMK by phone.');
  await J('var c=document.querySelector(\'[name="confirmed"]\'); if(c) c.checked=true;');
  await clickText('Record decision', 'button');
  await sleep(400);

  await role('U-AUNG');
  await go('S06', { jobId: 'JOB-2026-0008' });
  await clickText('Start work', 'button');
  await sleep(280);

  await go('S09', { jobId: 'JOB-2026-0008' });
  await sleep(220);
  if (want.materials) await shot(want.materials);
  await clickText('Add to job', 'button');
  await sleep(280);
  await modalClick('Issue to job');
  await sleep(240);

  await go('S06', { jobId: 'JOB-2026-0008' });
  await J('var j=Store.job("JOB-2026-0008"); (j.requiredChecklist||[]).forEach(function(c){c.done=true;}); App.render();');
  await sleep(180);
  await clickText('Mark complete', 'button');
  await sleep(340);
  if (want.jobcard) await shot(want.jobcard);

  await role('U-CASHIER');
  await go('S12', { jobId: 'JOB-2026-0008' });
  await sleep(260);
  if (want.payment) await shot(want.payment);
  await setValue('#pay-method', 'Cash');
  await sleep(150);
  await setValue('#pay-tendered', '100000');
  await sleep(150);
  await clickText('Post payment', 'button');
  await sleep(420);
  await clickText('Mark collected', 'button');
  await sleep(320);
  if (want.receipt) await shot(want.receipt);
  await clickText('Close job', 'button');
  await sleep(300);
  await modalClick('Close job');
  await sleep(300);
}

/* ---------------- one shot per exception preset ---------------- */
const EXCEPTIONS = [
  { id: 'P02', role: 'U-CASHIER', screen: 'S08', params: { jobId: 'JOB-2026-0008' }, name: '20-exception-approval-pending' },
  { id: 'P03', role: 'U-MANAGER', screen: 'S09', params: { jobId: 'JOB-2026-0008' }, name: '21-exception-material-issue' },
  { id: 'P04', role: 'U-MANAGER', screen: 'S06', params: { jobId: 'JOB-2026-0008' }, name: '22-exception-extra-work-job' },
  { id: 'P04b', skip: true },
  { id: 'P05', role: 'U-MANAGER', screen: 'S06', params: { jobId: 'JOB-2026-0008' }, name: '23-exception-shortage-waiting-parts' },
  { id: 'P06', role: 'U-CASHIER', screen: 'S12', params: { jobId: 'JOB-2026-0008' }, name: '24-exception-completed-unpaid' },
  { id: 'P07', role: 'U-MANAGER', screen: 'S17', params: { tab: 'corrections', jobId: 'JOB-2026-0008' }, name: '25-exception-corrections' },
  { id: 'P08', role: 'U-MANAGER', screen: 'S06', params: { jobId: 'JOB-2026-0008' }, name: '26-exception-zero-charge-redo' },
  { id: 'P09', role: 'U-MANAGER', screen: 'S15', params: {}, name: '27-exception-promotions-catalogue' },
  { id: 'P10', role: 'U-MANAGER', screen: 'S14', params: {}, name: '28-exception-bookings-no-show' },
  { id: 'P11', role: 'U-MANAGER', screen: 'S16', params: {}, name: '29-exception-stock-count' },
  { id: 'P12', role: 'U-MANAGER', screen: 'S17', params: {}, name: '30-exception-daily-closing' },
  { id: 'P13', role: 'U-MANAGER', screen: 'S18', params: {}, name: '31-exception-import-preview' },
  { id: 'P14', role: 'U-MANAGER', screen: 'S19', params: { tab: 'commission' }, name: '32-exception-commission-report' },
  { id: 'P15', role: 'U-MANAGER', screen: 'S19', params: { tab: 'daily' }, name: '33-exception-report-not-configured' },
  { id: 'P16', role: 'U-CASHIER', screen: 'S13', params: {}, name: '34-exception-reminders' }
];

(async () => {
  s = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    await sleep(600);

    /* ---- desktop journey ---- */
    await journey({
      dashboard: '01-dashboard', customers: '02-customers', checkin: '03-check-in',
      bay: '04-bay-board', quote: '05-quote-draft', approval: '06-approval-pending',
      materials: '07-materials', jobcard: '08-job-card-completed',
      payment: '09-payment', receipt: '10-receipt'
    });
    await go('S17', {});
    await sleep(260);
    await shot('11-closing');
    await role('U-MANAGER');
    await go('S19', {});
    await sleep(320);
    await shot('12-reports');
    await go('S10', {});
    await sleep(240);
    await shot('13-inventory');
    await role('U-OWNER');
    await go('S20', {});
    await sleep(240);
    await shot('14-demo-settings');

    /* ---- exception presets ---- */
    for (const e of EXCEPTIONS) {
      if (e.skip) continue;
      await scenario(e.id);
      await role(e.role);
      await go(e.screen, e.params);
      await sleep(320);
      await shot(e.name);
    }

    /* ---- narrow mobile journey ---- */
    await s.setViewport(390, 844);
    await sleep(400);
    await journey({
      customers: '40-customers', checkin: '41-check-in', bay: '42-bay-board',
      quote: '43-quote-draft', approval: '44-approval-pending',
      jobcard: '45-job-card-completed', receipt: '46-receipt'
    });
    await go('S17', {});
    await sleep(260);
    await shot('47-closing');

    const errs = s.logs.filter(l => l.type === 'exception' || l.type === 'error');
    if (errs.length) {
      console.log('console errors:');
      errs.forEach(e => console.log('  ' + e.text));
    } else {
      console.log('no console errors');
    }
  } finally {
    await s.close();
  }
})().catch(e => { console.error('ERROR', e); process.exit(2); });
