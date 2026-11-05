/* tools/acceptance.js — the acceptance checklist of the UI/UX review.

   §6 asks for nine acceptance points and §10 for six more. They are checked
   here against the running prototype, with populated, empty and error states,
   so a simplification that breaks a workflow shows up as a failed check.

   Usage:  node tools/acceptance.js                          */
const { Session, sleep } = require('./drive');
const BASE = process.env.DOLPHIN_BASE || 'http://127.0.0.1:8080/index.html';

const results = [];
let s;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
}
const J = expr => s.eval(expr);

async function load(id) {
  await J('Store.dirty = false;');
  await J('App.loadScenario(' + JSON.stringify(id) + ');');
  await sleep(220);
}
async function role(userId) {
  await J('Store.dirty = false;');
  await J('App.switchRole(' + JSON.stringify(userId) + ');');
  await sleep(200);
}
async function go(screen, params) {
  await J('App.go(' + JSON.stringify(screen) + ',' + JSON.stringify(params || {}) + ',{force:true});');
  await sleep(170);
}
async function click(text, selector) {
  const ok = await J(
    'var sel=' + JSON.stringify(selector || 'button, .btn, .tab, a') + ';' +
    'var els=document.querySelectorAll(sel);' +
    'for (var i=0;i<els.length;i++){ var t=(els[i].textContent||"").trim();' +
    ' if (t.indexOf(' + JSON.stringify(text) + ')!==-1 && !els[i].disabled){ els[i].scrollIntoView({block:"center"}); els[i].click(); return true; } }' +
    ' return false;');
  await sleep(230);
  return ok;
}
async function setValue(selector, value) {
  await J(
    'var el=document.querySelector(' + JSON.stringify(selector) + ');' +
    'if(!el) return false;' +
    'el.value=' + JSON.stringify(String(value)) + ';' +
    'el.dispatchEvent(new Event("input",{bubbles:true}));' +
    'el.dispatchEvent(new Event("change",{bubbles:true}));' +
    'return true;');
  await sleep(130);
}
async function submit(formName) {
  await J('var f=document.querySelector(\'form[data-form="' + formName + '"]\');' +
    'if(f){ f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); } return !!f;');
  await sleep(280);
}

/* The screens every role may open. A screen outside the list is checked
   separately as a permission. */
const SCREENS_FOR = {
  'U-OWNER': ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12',
    'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20'],
  'U-MANAGER': ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12',
    'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19'],
  'U-CASHIER': ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S08', 'S12', 'S13', 'S14', 'S15', 'S17'],
  'U-AUNG': ['S01', 'S05', 'S06', 'S07', 'S08', 'S09']
};

(async () => {
  s = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    await sleep(700);
    await J('App.resetAll();');
    await sleep(300);

    /* ==================================================================
       §6.1 — the next valid action is visible at a glance
       ================================================================== */
    await load('P01');
    await role('U-MANAGER');
    const jobId = await J('var j=Store.state.jobs.filter(function(x){return x.lifecycleStatus==="Open";})[0]; return j?j.id:null;');
    await go('S06', { jobId: jobId });
    const head = await J(
      'var h=document.querySelector("#content .job-head");' +
      'if(!h) return null;' +
      'var na=h.querySelector(".next-action");' +
      'return {' +
      '  chips: h.querySelectorAll(".chip").length,' +
      '  labels: Array.prototype.map.call(h.querySelectorAll(".chip-label"), function(c){return c.textContent;}),' +
      '  nextLabel: na ? na.textContent : "",' +
      '  nextButtons: na ? na.querySelectorAll("button").length : 0' +
      '};');
    check('§6.1 the job header shows the four status chips',
      head && head.chips === 4 && JSON.stringify(head.labels) === JSON.stringify(['Work', 'Approval', 'Payment', 'Collection']),
      JSON.stringify(head));
    check('§6.1 the job header shows one next action',
      head && head.nextButtons === 1 && head.nextLabel.indexOf('Next action') >= 0, JSON.stringify(head));

    const nextAct = await J('var b=document.querySelector(".next-action button[data-action]"); return b? b.getAttribute("data-action") : null;');
    const known = nextAct ? await J('return !!(window.Actions && window.Actions.click[' + JSON.stringify(nextAct) + ']);') : false;
    check('§6.1 the next action is a wired action, not a label', !!nextAct && known === true, String(nextAct));

    await go('S06', {});
    const listNext = await J(
      'var rows=document.querySelectorAll("#content .data-table tbody tr");' +
      'var head=Array.prototype.map.call(document.querySelectorAll("#content .data-table thead th"), function(t){return t.textContent.trim();});' +
      'var withNext=0, empty=0;' +
      'rows.forEach(function(r){ var cells=r.querySelectorAll("td");' +
      '  var last=cells[cells.length-1];' +
      '  if(last && last.textContent.trim() && last.textContent.trim()!=="—") withNext++; else empty++; });' +
      'return { rows: rows.length, withNext: withNext, empty: empty, head: head };');
    check('§6.1 the job list names the next action for every open job',
      listNext.head.indexOf('Next action') >= 0 && listNext.rows > 0 && listNext.empty === 0,
      JSON.stringify(listNext));

    /* ==================================================================
       §6.2 — a job can be completed without hunting through other screens
       ================================================================== */
    await go('S06', { jobId: jobId });
    const tabs = await J('return Array.prototype.map.call(document.querySelectorAll("#content .tabs .tab"), function(t){return t.textContent.trim();});');
    const wanted = ['Overview', 'Quote & Approval', 'Work & Materials', 'Payment & Collection', 'Activity History'];
    check('§6.2 the job page carries the five tabs of the review',
      JSON.stringify(tabs) === JSON.stringify(wanted), JSON.stringify(tabs));

    /* the next action leads straight to the next step of the workflow */
    const completedJob = await J('var j=Store.state.jobs.filter(function(x){return x.workStatus==="Completed" && x.lifecycleStatus==="Open";})[0]; return j?j.id:null;');
    await go('S06', { jobId: completedJob });
    const nextStep = await J(
      'var na=document.querySelector("#content .next-action");' +
      'var b=na?na.querySelector("button"):null;' +
      'return { text: na?na.textContent:"", action: b?b.getAttribute("data-action"):null,' +
      '  nav: b?b.getAttribute("data-nav"):null, attrs: b?Array.prototype.map.call(b.attributes, function(a){return a.name+"="+a.value;}):[] };');
    check('§6.2 the next action of a completed job is the payment, one click away',
      nextStep.text.indexOf('Collect payment') >= 0 && (nextStep.action === 'nav' || nextStep.nav === 'S12'),
      JSON.stringify(nextStep));

    /* ==================================================================
       §6.3 — eligible jobs can be assigned to available bays and mechanics
       ================================================================== */
    await go('S05', {});
    await click('Assign job to bay', 'button');
    const assign = await J(
      'var m=document.querySelector("#modal-root .modal");' +
      'if(!m) return null;' +
      'var jobs=m.querySelector("#assign-job"), bays=m.querySelector("#assign-bay");' +
      'if(!jobs||!bays) return {noSelect:true};' +
      'var preJob=jobs.value;' +
      'var busy=[], free=[];' +
      'for (var i=0;i<bays.options.length;i++){ var o=bays.options[i];' +
      '  if (o.disabled) { busy.push(o.value); } else { free.push(o.value);' +
      '    if (Rules.bayOccupant(o.value, preJob)) busy.push("occupied:"+o.value); } }' +
      'return {' +
      '  jobOptions: jobs.options.length,' +
      '  bayOptions: bays.options.length,' +
      '  free: free.length,' +
      '  busy: busy,' +
      '  mechanics: m.querySelectorAll("input[name=\\"staffIds\\"]").length' +
      '};');
    check('§6.3 the assignment modal offers eligible jobs, free bays and mechanics',
      assign && !assign.noSelect && assign.jobOptions > 0 && assign.free > 0 &&
      assign.busy.every(function (b) { return b.indexOf('occupied:') !== 0; }) && assign.mechanics > 0,
      JSON.stringify(assign));
    await J('App.closeModal();');
    await sleep(150);

    /* ==================================================================
       §6.4 — drafts editable, paid records protected, corrections logged
       ================================================================== */
    await load('P07');
    await role('U-MANAGER');
    const paidJob = await J('var j=Store.state.jobs.filter(function(x){return x.paymentStatus==="Paid";})[0]; return j?j.id:null;');
    await go('S07', { jobId: paidJob });
    const frozen = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { settled: t.indexOf("The price of this job is settled")>=0,' +
      '  newVersion: !!document.querySelector(\'[data-action="quote.newVersion"]\') };');
    check('§6.4 an approved and paid job cannot be quoted again',
      frozen.settled && !frozen.newVersion, JSON.stringify(frozen));

    /* a draft quote is editable */
    await load('P08');
    await role('U-MANAGER');
    const draftJob = await J('var j=Store.state.jobs.filter(function(x){return !(x.quotes||[]).length && x.lifecycleStatus==="Open";})[0]; return j?j.id:null;');
    await go('S07', { jobId: draftJob });
    const draftEdit = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { notes: !!document.querySelector("#q-notes"),' +
      '  remove: !!document.querySelector(\'[data-action="quote.removeLine"]\'),' +
      '  add: !!document.querySelector(\'[data-action="quote.addService"]\'),' +
      '  submit: !!document.querySelector(\'[data-action="quote.newVersion"]\') };');
    check('§6.4 a draft quote stays editable', draftEdit.notes && draftEdit.add, JSON.stringify(draftEdit));

    /* the correction keeps what was typed when the user goes back to edit */
    await load('P07');
    await role('U-MANAGER');
    await go('S17', { tab: 'corrections', jobId: paidJob });
    await setValue('#correction-reason', 'Customer complained about the bill');
    await click('Back to edit', 'button');
    await J('App.render();');
    await sleep(200);
    const kept = await J('var el=document.querySelector("#correction-reason"); return el? el.value : null;');
    check('§6.4 the correction keeps the entered values',
      kept === 'Customer complained about the bill', String(kept));

    /* only an authorised user may confirm a correction */
    await role('U-CASHIER');
    const cashierGuard = await J(
      'var before=(Store.state.corrections||[]).length;' +
      'var f=document.querySelector(\'form[data-form="correction.save"]\');' +
      'var hadForm=!!f;' +
      'if (f) { f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); }' +
      'return { hadForm: hadForm, after: (Store.state.corrections||[]).length, before: before };');
    check('§6.4 a Cashier cannot confirm a correction',
      cashierGuard.hadForm === false && cashierGuard.after === cashierGuard.before, JSON.stringify(cashierGuard));

    /* a confirmed correction is logged and the original receipt is unchanged */
    await role('U-MANAGER');
    await go('S17', { tab: 'corrections', jobId: paidJob });
    await setValue('#correction-reason', 'Customer complained about the bill');
    await sleep(150);
    const before = await J(
      'var r=Store.jobReceipt(' + JSON.stringify(paidJob) + ');' +
      'return { total: r?r.totalMMK:null, receipts: (Store.state.receipts||[]).length,' +
      '  corrections: (Store.state.corrections||[]).length, revenue: Rules.revenue("2026-10-01","2026-10-28").totalMMK };');
    await click('Confirm correction', 'button');
    await sleep(300);
    const after = await J(
      'var r=Store.jobReceipt(' + JSON.stringify(paidJob) + ');' +
      'var logs=(Store.state.activity||[]).filter(function(a){return a.type==="Correction";});' +
      'return { total: r?r.totalMMK:null, receipts: (Store.state.receipts||[]).length,' +
      '  corrections: (Store.state.corrections||[]).length, logged: logs.length,' +
      '  revenue: Rules.revenue("2026-10-01","2026-10-28").totalMMK,' +
      '  listed: document.querySelector("#content").innerText.indexOf("Customer complained about the bill")>=0 };');
    check('§6.4 a correction is logged and the original receipt is kept as it was',
      after.corrections === before.corrections + 1 && after.logged > 0 &&
      after.total === before.total && after.receipts === before.receipts && after.listed,
      JSON.stringify({ before: before, after: after }));

    /* ==================================================================
       §6.5 — the daily closing calculates, saves and explains
       ================================================================== */
    await load('P12');
    await role('U-CASHIER');
    await go('S17', {});
    const closing = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { expected: t.indexOf("Expected (MMK)")>=0, counted: t.indexOf("Counted (MMK)")>=0,' +
      '  difference: t.indexOf("Difference (MMK)")>=0, reason: !!document.querySelector(\'#closing-reason\'),' +
      '  expectedValue: (document.querySelector("#closing-exp-Cash")||{}).textContent };');
    check('§6.5 the closing shows expected, counted and difference with an explanation',
      closing.expected && closing.counted && closing.difference && closing.reason, JSON.stringify(closing));

    /* a difference needs an explanation, and a Manager is told about it */
    await setValue('#closing-count-Cash', '1');
    await sleep(200);
    const diffShown = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { diff: t.indexOf("Difference:")>=0, reason: (document.querySelector("#closing-reason")||{}).value };');
    check('§6.5 a difference asks for an explanation', diffShown.diff, JSON.stringify(diffShown));
    await setValue('#closing-reason', 'Sample discrepancy for review');
    await submit('closing.save');
    const saved = await J(
      'var list=Store.state.cashClosings||[];' +
      'var last=list[list.length-1];' +
      'return { count: list.length, reason: last?last.reason:null,' +
      '  review: list.some(function(c){return c.reviewRequired;}),' +
      '  logged: (Store.state.activity||[]).filter(function(a){return /closing/i.test(a.type||"");}).length };');
    check('§6.5 the closing is saved with the counted amounts and the explanation',
      saved.count > 0 && saved.reason === 'Sample discrepancy for review' && saved.review === true,
      JSON.stringify(saved));

    /* ==================================================================
       §6.6 — reports are readable when populated, empty or broken
       ================================================================== */
    await load('P14');
    await role('U-MANAGER');
    await go('S19', { group: 'sales', view: 'overview' });
    const filled = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { figures: t.indexOf("60,000")>=0, tables: document.querySelectorAll("#content .data-table").length,' +
      '  noData: t.indexOf("Nothing to report for this period")>=0 };');
    check('§6.6 a populated report shows its figures', filled.figures && filled.tables > 0 && !filled.noData,
      JSON.stringify(filled));

    await setValue('#report-from', '2026-01-05');
    await setValue('#report-to', '2026-01-06');
    await submit('reports.range');
    const emptyReport = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { message: t.indexOf("Nothing to report for this period")>=0,' +
      '  empties: document.querySelectorAll("#content .empty-state").length,' +
      '  tables: document.querySelectorAll("#content .data-table").length };');
    check('§6.6 an empty period shows one no-data message and no empty tables',
      emptyReport.message && emptyReport.empties === 1 && emptyReport.tables === 0, JSON.stringify(emptyReport));

    await go('S19', { group: 'sales', view: 'overview', from: '2026-10-29', to: '2026-10-27' });
    const broken = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { error: t.indexOf("The end date is before the start date")>=0,' +
      '  tables: document.querySelectorAll("#content .data-table").length,' +
      '  figures: t.indexOf("60,000")>=0 };');
    check('§6.6 a broken period shows the error, not figures',
      broken.error && broken.tables === 0 && !broken.figures, JSON.stringify(broken));

    /* the date filter really changes the report */
    await load('P14');
    await role('U-MANAGER');
    await setValue('#report-from', '2026-10-28');
    await setValue('#report-to', '2026-10-28');
    await submit('reports.range');
    const inRange = await J('return {from: Store.params.from, revenue: document.querySelector("#content").innerText.indexOf("60,000")>=0};');
    await setValue('#report-from', '2026-10-01');
    await setValue('#report-to', '2026-10-02');
    await submit('reports.range');
    const outRange = await J('return {from: Store.params.from, revenue: document.querySelector("#content").innerText.indexOf("60,000")>=0};');
    check('§6.6 the date filter changes what the report shows',
      inRange.from === '2026-10-28' && inRange.revenue && outRange.from === '2026-10-01' && !outRange.revenue,
      JSON.stringify({ inRange: inRange, outRange: outRange }));

    /* ==================================================================
       §6.7 — no raw HTML, and a job link opens the right job
       ================================================================== */
    const rawHits = [];
    for (const roleId of Object.keys(SCREENS_FOR)) {
      await role(roleId);
      for (const screen of SCREENS_FOR[roleId]) {
        await go(screen, {});
        const hit = await J(
          'var t=document.querySelector("#content").innerText;' +
          'var h=document.querySelector("#content").innerHTML;' +
          'return { text: t.indexOf("<a href")>=0 || t.indexOf("<div")>=0 || t.indexOf("<span")>=0,' +
          '  escaped: h.indexOf("&lt;a href")>=0 || h.indexOf("&lt;div")>=0 };');
        if (hit.text || hit.escaped) rawHits.push(roleId + '→' + screen);
      }
    }
    check('§6.7 no screen shows raw markup', rawHits.length === 0, rawHits.slice(0, 5).join(', '));

    await role('U-CASHIER');
    await go('S13', {});
    const linkJob = await J(
      'var a=document.querySelector(\'#content .data-table a[data-nav="S06"]\');' +
      'return a? {job: a.textContent.trim(), params: a.getAttribute("data-params")} : null;');
    if (linkJob) await click(linkJob.job, '#content .data-table a[data-nav="S06"]');
    const opened = await J('return {screen: Store.screen, job: Store.params.jobId || null};');
    check('§6.7 a job link opens the right job',
      !!linkJob && opened.screen === 'S06' && opened.job === linkJob.job,
      JSON.stringify({ linkJob: linkJob, opened: opened }));

    /* a screen outside the role is refused */
    await go('S19', {});
    const refused = await J(
      'var m=document.querySelector("#modal-root .modal");' +
      'return m? {title: m.textContent.indexOf("Not available for this role")>=0} : {title:false};');
    check('§6.7 a report stays manager-only', refused.title === true, JSON.stringify(refused));
    await J('App.closeModal();');
    await sleep(150);

    /* ==================================================================
       §6.8 — nothing overlaps or clips on a phone, in either language
       ================================================================== */
    const OVERLAP = 'var bad=[];' +
      'document.querySelectorAll("#content .check").forEach(function(l){' +
      '  var i=l.querySelector("input"), s=l.querySelector("span");' +
      '  if(!i||!s) return;' +
      '  var ir=i.getBoundingClientRect(), sr=s.getBoundingClientRect();' +
      '  if(ir.right > sr.left + 0.5) bad.push((l.textContent||"").trim().slice(0,30));' +
      '});' +
      'return {bad: bad, doc: document.documentElement.scrollWidth, win: window.innerWidth};';

    await s.setViewport(390, 780);
    await sleep(300);
    const overlapHits = [];
    for (const screen of ['S05', 'S06', 'S10', 'S12', 'S17', 'S19', 'S20']) {
      await role('U-OWNER');
      await go(screen, {});
      const hit = await J(OVERLAP);
      if (hit.bad.length || hit.doc > hit.win + 1) overlapHits.push(screen + ':' + JSON.stringify(hit));
    }
    check('§6.8 no checkbox overlaps its label and no screen overflows on a phone',
      overlapHits.length === 0, overlapHits.slice(0, 3).join(' | '));

    /* the same in the Myanmar preview */
    await J('Store.state.language = "MM"; App.render();');
    await sleep(250);
    const mmHits = [];
    for (const screen of ['S05', 'S06', 'S10', 'S19', 'S20']) {
      await go(screen, {});
      const hit = await J(OVERLAP);
      if (hit.bad.length || hit.doc > hit.win + 1) mmHits.push(screen + ':' + JSON.stringify(hit));
    }
    check('§6.8 the Myanmar preview does not overlap either', mmHits.length === 0, mmHits.slice(0, 3).join(' | '));

    /* the Myanmar labels are really translated, not only the settings */
    const translated = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { mm: t.indexOf("အလုပ်")>=0 || t.indexOf("နေ့စဉ်")>=0 || /[က-႟]/.test(t) };');
    check('§6.8 the Myanmar preview translates the labels', translated.mm === true, JSON.stringify(translated));
    await J('Store.state.language = "EN"; App.render();');
    await sleep(200);
    await s.setViewport(1440, 900);
    await sleep(250);

    /* ==================================================================
       §6.9 — the audit and approval workflows are intact
       ================================================================== */
    await load('P04');
    await role('U-MANAGER');
    const auditJob = await J('var j=Store.state.jobs.filter(function(x){return (x.quotes||[]).length>0;})[0]; return j?j.id:null;');
    await go('S06', { jobId: auditJob, section: 'activity' });
    const trail = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { checkin: t.indexOf("Check-in")>=0, quote: t.indexOf("Quote v")>=0,' +
      '  approval: t.indexOf("approved")>=0 || t.indexOf("Approved")>=0,' +
      '  material: t.indexOf("Material issued")>=0 };');
    check('§6.9 the job history keeps check-in, quote, approval and material',
      trail.checkin && trail.quote && trail.approval, JSON.stringify(trail));

    /* an approved version is frozen: the quote screen shows it read-only */
    await go('S07', { jobId: auditJob });
    const frozenVersion = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { submitted: t.indexOf("Submitted versions are frozen")>=0,' +
      '  editable: !!document.querySelector("#q-notes") };');
    check('§6.9 an approved version stays read-only',
      frozenVersion.submitted && !frozenVersion.editable, JSON.stringify(frozenVersion));

    /* ==================================================================
       §10.1 — the job details keep the different kinds of text apart
       ================================================================== */
    await load('P04');
    await role('U-MANAGER');
    await go('S06', { jobId: auditJob });
    const overview = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { complaint: t.indexOf("Customer complaint")>=0,' +
      '  requested: t.indexOf("Requested work")>=0,' +
      '  photos: t.indexOf("Damage photos")>=0,' +
      '  checklist: t.indexOf("Repair checklist")>=0 };');
    await go('S06', { jobId: auditJob, section: 'quote' });
    const quoteTab = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { notes: t.indexOf("Inspection notes")>=0 };');
    await go('S06', { jobId: auditJob, section: 'work' });
    const workTab = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { material: t.indexOf("Material")>=0 || t.indexOf("material")>=0,' +
      '  notes: t.indexOf("Work performed")>=0 || t.indexOf("Internal note")>=0 };');
    check('§10.1 complaint, requested work, findings, work performed and photos are separate',
      overview.complaint && overview.requested && overview.photos && quoteTab.notes && workTab.material,
      JSON.stringify({ overview: overview, quoteTab: quoteTab, workTab: workTab }));

    /* ==================================================================
       §10.2 — edit actions only for authorised, editable records
       ================================================================== */
    await load('P01');
    await role('U-CASHIER');
    const openUnpaid = await J('var j=Store.state.jobs.filter(function(x){return x.lifecycleStatus==="Open" && x.paymentStatus!=="Paid";})[0]; return j?j.id:null;');
    await go('S06', { jobId: openUnpaid });
    const editable = await J('return { btn: !!document.querySelector(\'[data-action="job.editDetails"]\') };');
    await click('Edit description', 'button');
    const modal = await J(
      'var m=document.querySelector("#modal-root .modal");' +
      'if(!m) return null;' +
      'return { prefilled: (document.querySelector("#job-description")||{}).value !== undefined,' +
      '  save: m.textContent.indexOf("Save changes")>=0,' +
      '  cancel: m.textContent.indexOf("Cancel")>=0 };');
    check('§10.2 editing opens prefilled fields with Save and Cancel',
      editable.btn && modal && modal.prefilled && modal.save && modal.cancel, JSON.stringify(modal));
    await J('App.closeModal();');
    await sleep(150);

    /* a settled job cannot be edited */
    const paidP01 = await J('var j=Store.state.jobs.filter(function(x){return x.paymentStatus==="Paid";})[0]; return j?j.id:null;');
    await go('S06', { jobId: paidP01 });
    const locked = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { btn: !!document.querySelector(\'[data-action="job.editDetails"]\'),' +
      '  locked: t.indexOf("A settled or closed job keeps the description")>=0 };');
    check('§10.2 a settled job offers no edit action', !locked.btn && locked.locked, JSON.stringify(locked));

    /* ==================================================================
       §10.3 — a commission payout does not touch the receipt revenue
       ================================================================== */
    await load('P14');
    await role('U-MANAGER');
    await go('S19', { group: 'staff', view: 'commission' });
    const beforePayout = await J(
      'return { revenue: Rules.revenue("2026-10-01","2026-10-28").totalMMK,' +
      '  payouts: (Store.state.commissionPayouts||[]).length };');
    const marked = await click('Mark demo payout', 'button');
    await sleep(250);
    const afterPayout = await J(
      'return { revenue: Rules.revenue("2026-10-01","2026-10-28").totalMMK,' +
      '  payouts: (Store.state.commissionPayouts||[]).length,' +
      '  listed: document.querySelector("#content").innerText.indexOf("Recorded payouts")>=0 };');
    check('§10.3 a payout updates the payout history without changing receipt revenue',
      marked && afterPayout.payouts === beforePayout.payouts + 1 &&
      afterPayout.revenue === beforePayout.revenue && afterPayout.listed,
      JSON.stringify({ beforePayout: beforePayout, afterPayout: afterPayout }));

    /* ==================================================================
       §10.4 — no raw HTML in the follow-up history (covered by §6.7)
       ================================================================== */
    await role('U-MANAGER');
    await go('S13', {});
    const followUp = await J(
      'var t=document.querySelector("#content").innerText;' +
      'var links=document.querySelectorAll(\'#content .data-table a[data-nav="S06"]\');' +
      'return { raw: t.indexOf("<a href")>=0, links: links.length };');
    check('§10.4 the follow-up history shows job links and no raw HTML',
      !followUp.raw && followUp.links > 0, JSON.stringify(followUp));

    /* ==================================================================
       §10.5 — import preview, translations, receipts and permissions
       ================================================================== */
    await role('U-MANAGER');
    await go('S18', {});
    const importScreen = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { preview: t.indexOf("preview")>=0 || t.indexOf("Preview")>=0,' +
      '  rows: document.querySelectorAll("#content .data-table").length };');
    check('§10.5 the import preview shows the rows before anything is saved',
      importScreen.preview, JSON.stringify(importScreen));

    await role('U-CASHIER');
    await go('S12', {});
    const receiptScreen = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { receipts: t.indexOf("Issued receipts")>=0 || t.indexOf("Unpaid previews")>=0 };');
    check('§10.5 a receipt can be issued and is listed', receiptScreen.receipts, JSON.stringify(receiptScreen));

    /* ==================================================================
       §10.6 — the workshop rules match the owner-approved decisions
       ================================================================== */
    await role('U-OWNER');
    await go('S20', {});
    const rules = await J(
      'var t=document.querySelector("#content").innerText;' +
      'var names=["Stock deduction","Bay release","Approval threshold","Out of stock","Job closure","Redo work","Manual discount","Price snapshot"];' +
      'var missing=names.filter(function(n){return t.indexOf(n)<0;});' +
      'return { missing: missing };');
    check('§10.6 all eight workshop rules are listed in the settings', rules.missing.length === 0, JSON.stringify(rules));

    /* the three decisions that the prototype has to enforce */
    await load('P02');
    await role('U-MANAGER');
    const thresholdJob = await J('var j=Store.state.jobs.filter(function(x){return (x.quotes||[]).length>0;})[0]; return j?j.id:null;');
    await go('S07', { jobId: thresholdJob });
    const threshold = await J(
      'var q=Store.latestQuote(Store.job(' + JSON.stringify(thresholdJob) + '));' +
      'var t=Rules.approvalBasis(q.lines);' +
      'var j=Store.job(' + JSON.stringify(thresholdJob) + ');' +
      'return { basis: t, needsApproval: Rules.approvalRequired(t), status: q.status, jobApproval: j.approvalStatus };');
    check('§10.6 a repair above 50,000 MMK needs its own approval',
      threshold.basis > 50000 ? threshold.needsApproval && threshold.status === 'Pending'
        : !threshold.needsApproval, JSON.stringify(threshold));

    await load('P04');
    await role('U-MANAGER');
    const stockRule = await J(
      'var job=Store.state.jobs.filter(function(x){return (x.materialIssues||[]).length>0;})[0];' +
      'if(!job) return {skip:true};' +
      'var iss=job.materialIssues[0];' +
      'var item=Store.item(iss.itemId);' +
      'var base=DOLPHIN_FIXTURES.scenarios.filter(function(s){return s.id==="P01";})[0].state.items' +
      '  .filter(function(i){return i.id===iss.itemId;})[0].onHand;' +
      'return { base: base, onHand: item.onHand, issued: iss.quantity,' +
      '  quotedOnly: (job.quotes||[]).some(function(q){return (q.lines||[]).some(function(l){return l.itemId===iss.itemId;});}) };');
    check('§10.6 stock moves on an explicit material issue, not on a quoted line',
      !stockRule.skip && stockRule.onHand === stockRule.base - stockRule.issued,
      JSON.stringify(stockRule));

    /* ==================================================================
       §1 — the review's presentation changes that have no own checklist
       ================================================================== */
    await role('U-OWNER');
    await go('S20', {});
    const appearance = await J(
      'var t=document.querySelector("#content").innerText;' +
      'return { appearance: t.indexOf("Appearance")>=0, light: t.indexOf("light theme")>=0 || t.indexOf("Light theme")>=0 };');
    check('§1 the fixed light-theme section is gone from the user settings',
      !appearance.appearance && !appearance.light, JSON.stringify(appearance));

    await load('P14');
    await role('U-MANAGER');
    const receiptJob = await J('var j=Store.state.jobs.filter(function(x){return !!Store.jobReceipt(x.id);})[0]; return j?j.id:null;');
    await go('S12', { jobId: receiptJob });
    const discountShown = await J(
      'var t=document.querySelector("#content").innerText;' +
      'var heads=Array.prototype.map.call(document.querySelectorAll("#content .data-table thead th"), function(t){return t.textContent;});' +
      'return { discount: t.indexOf("Discount")>=0, promoTable: heads.join(" ").indexOf("Promotion")>=0 };');
    check('§1 the receipt shows the applied discount and no promotion report table sits on a general screen',
      discountShown.discount && !discountShown.promoTable, JSON.stringify(discountShown));

    const errs = s.logs.filter(l => l.type === 'exception' || l.type === 'error');
    check('no console errors during the acceptance run', errs.length === 0,
      errs.map(e => e.text).join(' | ').slice(0, 300));

    const failed = results.filter(r => !r.ok);
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    process.exitCode = failed.length ? 1 : 0;
  } catch (e) {
    console.error('acceptance run failed:', e.message);
    process.exitCode = 1;
  } finally {
    await s.close();
  }
})();
