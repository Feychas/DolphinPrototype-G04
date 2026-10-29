/* Screen sweep: every screen for every role.
   - the view renders (no "Screen not available" placeholder)
   - no console errors while rendering
   - no horizontal page overflow at 1440 px and at 390 px
   - every form control has an accessible name
   - every button has a visible text label
   - visible focus on the first interactive element                     */
const { Session, sleep } = require('./drive');
const BASE = 'http://127.0.0.1:8080/index.html';
const SCREENS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10',
  'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20'];
const ROLES = ['U-OWNER', 'U-MANAGER', 'U-CASHIER', 'U-AUNG', 'U-MIN'];
const results = [];
let s;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) console.log('FAIL  ' + name + (detail ? '  — ' + detail : ''));
}
const J = expr => s.eval(expr);

async function audit(label) {
  /* overflow */
  const overflow = await J('return {doc: document.documentElement.scrollWidth, win: window.innerWidth};');
  check(label + ': no horizontal overflow', overflow.doc <= overflow.win + 1,
    'scrollWidth ' + overflow.doc + ' vs window ' + overflow.win);

  /* unlabelled controls */
  const unlabelled = await J(
    'var out=[];' +
    'document.querySelectorAll("#content input, #content select, #content textarea").forEach(function(el){' +
    '  if (el.type==="hidden") return;' +
    '  var id=el.getAttribute("id");' +
    '  var lab = id ? document.querySelector(\'label[for="\'+id+\'"]\') : null;' +
    '  if (lab) return;' +
    '  if (el.closest("label")) return;' +
    '  if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return;' +
    '  out.push((el.tagName||"")+"#"+(id||el.name||"?"));' +
    '}); return out;');
  check(label + ': every form control has a label', unlabelled.length === 0, unlabelled.slice(0, 6).join(', '));

  /* unnamed buttons */
  const nameless = await J(
    'var out=[];' +
    'document.querySelectorAll("#content button, .topbar button").forEach(function(b){' +
    '  var t=(b.textContent||"").trim();' +
    '  if (!t && !b.getAttribute("aria-label") && !b.getAttribute("title")) out.push(b.className||b.id||"button");' +
    '}); return out;');
  check(label + ': every button has a visible name', nameless.length === 0, nameless.slice(0, 6).join(', '));
}

(async () => {
  s = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    await sleep(600);
    await J('App.resetAll();');
    await sleep(300);

    for (const role of ROLES) {
      await J('App.switchRole(' + JSON.stringify(role) + ');');
      await sleep(200);
      for (const screen of SCREENS) {
        const allowed = await J('return App.canAccess(' + JSON.stringify(screen) + ');');
        const before = s.logs.length;
        await J('App.go(' + JSON.stringify(screen) + ',{},{force:true});');
        await sleep(140);
        const rendered = await J('return Store.screen;');
        const missing = await J('return document.querySelector("#content").innerHTML.indexOf("has not been implemented")>=0;');
        const newErrors = s.logs.slice(before).filter(l => l.type === 'exception' || l.type === 'error');
        check(role + ' → ' + screen + ' renders', !missing && newErrors.length === 0,
          missing ? 'view missing' : newErrors.map(e => e.text).join(' | ').slice(0, 160));
        if (allowed) {
          check(role + ' → ' + screen + ' is reachable', rendered === screen, 'landed on ' + rendered);
        }
      }
    }

    /* accessibility / layout sweep on the key screens as Manager */
    await J('App.switchRole("U-MANAGER");');
    await sleep(200);
    for (const screen of SCREENS) {
      await J('App.go(' + JSON.stringify(screen) + ',{},{force:true});');
      await sleep(140);
      await audit('desktop ' + screen);
    }
    await s.setViewport(390, 844);
    await sleep(300);
    for (const screen of SCREENS) {
      await J('App.go(' + JSON.stringify(screen) + ',{},{force:true});');
      await sleep(140);
      await audit('mobile ' + screen);
    }

    /* visible focus: tab through the shell and read the focused element's ring */
    await s.setViewport(1440, 900);
    await sleep(200);
    await J('App.go("S01",{},{force:true});');
    await sleep(200);
    await J('document.body.focus(); if(document.activeElement) document.activeElement.blur();');
    let ring = null;
    for (let i = 0; i < 12 && !ring; i++) {
      await s.press('Tab');
      ring = await J(
        'var el=document.activeElement; if(!el || el===document.body) return null;' +
        'var cs=getComputedStyle(el);' +
        'return {tag:el.tagName, cls:el.className, outline:cs.outlineStyle, width:cs.outlineWidth, color:cs.outlineColor, shadow:cs.boxShadow};');
    }
    check('keyboard focus shows a visible focus ring',
      !!(ring && (ring.outline !== 'none' || (ring.shadow && ring.shadow !== 'none'))),
      JSON.stringify(ring));

    /* body text size and control height (radios and checkboxes keep their own 20 px box) */
    const bodyFont = await J('return getComputedStyle(document.body).fontSize;');
    check('body text is 16 px', bodyFont === '16px', bodyFont);
    const small = await J(
      'var bad=[];' +
      'document.querySelectorAll("#content button, #content input, #content select, .nav-item").forEach(function(el){' +
      '  if (el.type==="radio" || el.type==="checkbox") return;' +
      '  var h=el.getBoundingClientRect().height;' +
      '  if (h>0 && h<32) bad.push((el.textContent||"").trim().slice(0,20)+":"+Math.round(h)+":"+el.id);' +
      '}); return bad;');
    check('controls are at least ~32 px tall', small.length === 0, small.slice(0, 6).join(', '));

    /* the drawer on narrow screens */
    await s.setViewport(390, 844);
    await sleep(250);
    const drawer = await J('return {btn: !!document.querySelector("#menu-btn"), hidden: getComputedStyle(document.querySelector("#sidebar")).transform};');
    check('narrow width has a menu button', drawer.btn, JSON.stringify(drawer));

    const errs = s.logs.filter(l => l.type === 'exception' || l.type === 'error');
    check('no console errors during the sweep', errs.length === 0, errs.map(e => e.text).join(' | ').slice(0, 300));
  } finally {
    await s.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) failed.forEach(f => console.log('  FAILED: ' + f.name + (f.detail ? ' — ' + f.detail : '')));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
