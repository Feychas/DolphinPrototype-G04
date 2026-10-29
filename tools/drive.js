/* Minimal Chrome DevTools Protocol driver for the prototype.
   Uses Node's built-in WebSocket (Node 22+) so no package install is needed.
   Usage:  node tools/drive.js <script-file.js>            */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/* Each session picks a free debugging port. A fixed port lets a Chrome left
   over from an earlier run answer for a new session, which silently drives
   the wrong page. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', function () {
      const port = srv.address().port;
      srv.close(function () { resolve(port); });
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.logs = []; this.requests = []; }

  static async open(url, opts) {
    opts = opts || {};
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dolphin-chrome-'));
    const PORT = await freePort();
    const args = [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', '--hide-scrollbars',
      '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
      '--window-size=' + (opts.width || 1440) + ',' + (opts.height || 900),
      'about:blank'
    ];
    const proc = spawn(CHROME, args, { stdio: 'ignore' });
    let version = null;
    for (let i = 0; i < 60; i++) {
      try { version = await getJSON('http://127.0.0.1:' + PORT + '/json/version'); break; }
      catch (e) { await sleep(250); }
    }
    if (!version) { proc.kill(); throw new Error('Chrome did not start'); }
    const targets = await getJSON('http://127.0.0.1:' + PORT + '/json/list');
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    s.proc = proc;
    s.userDir = userDir;
    ws.onmessage = function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && s.pending.has(msg.id)) {
        const p = s.pending.get(msg.id);
        s.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        s.logs.push({ type: msg.params.type, text: msg.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ') });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        s.logs.push({ type: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
      } else if (msg.method === 'Network.requestWillBeSent') {
        s.requests.push(msg.params.request.url);
      }
    };
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    await s.send('Log.enable');
    if (opts.watchNetwork) await s.send('Network.enable');
    if (url) {
      await s.send('Page.navigate', { url });
      await s.waitForLoad();
    }
    return s;
  }

  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  async waitForLoad() {
    for (let i = 0; i < 80; i++) {
      const r = await this.eval('document.readyState');
      if (r === 'complete') return true;
      await sleep(100);
    }
    return false;
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: '(function(){' + expression + '})()',
      returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('eval failed: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
    }
    return r.result.value;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 700
    });
  }

  /** Click the first element matching the selector (via a real DOM click). */
  async click(selector, index) {
    const ok = await this.eval(
      'var els=document.querySelectorAll(' + JSON.stringify(selector) + ');' +
      'var el=els[' + (index || 0) + '];' +
      'if(!el) return false; el.scrollIntoView({block:"center"}); el.click(); return true;');
    if (!ok) throw new Error('click target not found: ' + selector);
    await sleep(160);
    return true;
  }

  /** Click an element whose visible text contains `text`. */
  async clickText(text, selector) {
    const ok = await this.eval(
      'var sel=' + JSON.stringify(selector || 'button, a, .btn, .nav-item, .tab') + ';' +
      'var els=document.querySelectorAll(sel);' +
      'for (var i=0;i<els.length;i++){ var t=(els[i].textContent||"").trim();' +
      ' if (t.indexOf(' + JSON.stringify(text) + ')!==-1 && !els[i].disabled){ els[i].scrollIntoView({block:"center"}); els[i].click(); return true; } }' +
      ' return false;');
    if (!ok) throw new Error('no clickable text: ' + text);
    await sleep(200);
    return true;
  }

  async setValue(selector, value) {
    const ok = await this.eval(
      'var el=document.querySelector(' + JSON.stringify(selector) + ');' +
      'if(!el) return false;' +
      'el.value=' + JSON.stringify(String(value)) + ';' +
      'el.dispatchEvent(new Event("input",{bubbles:true}));' +
      'el.dispatchEvent(new Event("change",{bubbles:true}));' +
      'return true;');
    if (!ok) throw new Error('no field: ' + selector);
    await sleep(120);
    return true;
  }

  async text(selector) {
    return this.eval('var el=document.querySelector(' + JSON.stringify(selector) + '); return el? el.textContent.trim() : null;');
  }

  async bodyText() {
    return this.eval('return document.body.innerText;');
  }

  /** Press a key (Tab, Enter, Escape …) in the page. */
  async press(key, code) {
    const map = { Tab: 9, Enter: 13, Escape: 27, Space: 32, ArrowDown: 40, ArrowUp: 38 };
    const vk = map[key] || 0;
    await this.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key: key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
    });
    await sleep(120);
  }

  async screenshot(file, fullPage) {
    const params = { format: 'png' };
    if (fullPage) params.captureBeyondViewport = true;
    const r = await this.send('Page.captureScreenshot', params);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }

  async close() {
    try { this.ws.close(); } catch (e) { }
    try { this.proc.kill(); } catch (e) { }
    await sleep(200);
    try { fs.rmSync(this.userDir, { recursive: true, force: true }); } catch (e) { }
  }
}

module.exports = { Session, sleep };
