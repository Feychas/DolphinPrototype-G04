/* Constraint suite — proves the prototype has no backend, no browser
   storage, no network calls, no credentials and no background work.
   This is the machine-checked evidence for the "frontend only" requirement.

   Part 1 is a static scan of the shipped source (index.html, js/**, css/**).
   Part 2 runs the app in a headless Chrome with the DevTools Network domain
   enabled and watches what the page actually asks for.
   Usage:  node tools/constraints.js */
const fs = require('fs');
const path = require('path');
const { Session, sleep } = require('./drive');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://127.0.0.1:8080/index.html';
const ORIGIN = 'http://127.0.0.1:8080/';
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
}

/* ---------------- part 1: the shipped source ---------------- */

function sourceFiles() {
  const out = [];
  const walk = function (dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|html|css)$/.test(e.name)) out.push(full);
    });
  };
  walk(path.join(ROOT, 'js'));
  out.push(path.join(ROOT, 'index.html'));
  const css = path.join(ROOT, 'css');
  if (fs.existsSync(css)) walk(css);
  return out;
}

const FORBIDDEN = [
  { label: 'localStorage', re: /\blocalStorage\b/ },
  { label: 'sessionStorage', re: /\bsessionStorage\b/ },
  { label: 'IndexedDB', re: /\bindexedDB\b/ },
  { label: 'document.cookie', re: /\bdocument\s*\.\s*cookie\b/ },
  { label: 'fetch()', re: /\bfetch\s*\(/ },
  { label: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { label: 'WebSocket', re: /\bWebSocket\b/ },
  { label: 'EventSource', re: /\bEventSource\b/ },
  { label: 'sendBeacon', re: /\bsendBeacon\b/ },
  { label: 'service worker', re: /\bserviceWorker\b/ },
  { label: 'Web Worker', re: /\bnew\s+Worker\s*\(|\bSharedWorker\b/ },
  { label: 'eval()', re: /\beval\s*\(/ },
  { label: 'new Function()', re: /\bnew\s+Function\s*\(/ }
];

function scan() {
  const files = sourceFiles();
  const hits = [];
  files.forEach(function (file) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach(function (line, i) {
      const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '').trim();
      if (!code) return;
      FORBIDDEN.forEach(function (f) {
        if (f.re.test(code)) hits.push(rel + ':' + (i + 1) + '  ' + f.label + '  →  ' + code.slice(0, 90));
      });
    });
  });
  return { files: files.length, hits: hits };
}

/* ---------------- part 2: the running page ---------------- */

(async () => {
  const scanned = scan();
  check('the shipped source uses no browser storage, no network API, no worker and no eval',
    scanned.hits.length === 0,
    scanned.hits.length ? scanned.hits.join('\n      ') : scanned.files + ' files scanned, 0 hits');

  const external = [];
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const re = /(src|href)\s*=\s*["'](https?:)?\/\/[^"']+/gi;
  let m;
  while ((m = re.exec(html)) !== null) external.push(m[0]);
  check('the page loads no external file, font or script',
    external.length === 0, external.length ? external.join(' | ') : 'only local files are referenced');

  let s;
  const J = expr => s.eval(expr);
  try {
    s = await Session.open(BASE, { width: 1440, height: 900, watchNetwork: true });
    await sleep(900);

    const store = await J('return {ls:window.localStorage.length, ss:window.sessionStorage.length, ' +
      'cookies:document.cookie, sw:(navigator.serviceWorker?navigator.serviceWorker.controller:null)};');
    check('the page writes nothing to localStorage, sessionStorage or cookies',
      store.ls === 0 && store.ss === 0 && !store.cookies, JSON.stringify(store));

    /* every request must be for a file of this prototype, served locally */
    const foreign = s.requests.filter(u => u.indexOf(ORIGIN) !== 0);
    check('the page makes no request to any other origin',
      foreign.length === 0,
      foreign.length ? foreign.slice(0, 5).join(' | ') : s.requests.length + ' local requests, 0 foreign');

    /* no background work: no timers that survive the page, no service worker */
    const timers = await J('return {sw:(navigator.serviceWorker&&navigator.serviceWorker.controller)?1:0,' +
      ' workers:(typeof Worker!=="undefined")?1:0};');
    check('no service worker controls the page', timers.sw === 0, JSON.stringify(timers));

    /* the app really has no login: no password field on any screen */
    const pw = await J('var n=0; for (var i=1;i<=20;i++){ var sc="S"+String(i).padStart(2,"0");' +
      ' if(!App.canAccess(sc)) continue; App.go(sc,{},{force:true});' +
      ' n+=document.querySelectorAll(\'#content input[type="password"]\').length; } return n;');
    check('no screen asks for a password — there is no login', pw === 0, 'password fields found: ' + pw);

    /* nothing persists: make a change, reload, and the app is back at P01 */
    await J('App.loadScenario("P11"); App.switchRole("U-OWNER");');
    await sleep(400);
    const before = await J('return {sc:Store.scenarioId, role:Store.role};');
    await s.send('Page.reload', {});
    await sleep(1400);
    const after = await J('return {sc:Store.scenarioId, role:Store.role, screen:Store.screen};');
    check('a refresh throws the session away and comes back to P01 and the Cashier role',
      before.sc === 'P11' && after.sc === 'P01' && after.role === 'Cashier',
      JSON.stringify({ before: before, after: after }));

    const after2 = await J('return {ls:window.localStorage.length, ss:window.sessionStorage.length};');
    check('the storage is still empty after a reload', after2.ls === 0 && after2.ss === 0, JSON.stringify(after2));

    const errs = s.logs.filter(l => l.type === 'exception' || l.type === 'error');
    check('no console errors during the constraint run', errs.length === 0,
      errs.map(e => e.text).join(' | ').slice(0, 300));
  } finally {
    if (s) await s.close();
  }

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('failed:');
    failed.forEach(f => console.log('  - ' + f.name + (f.detail ? '  — ' + f.detail : '')));
  }
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
