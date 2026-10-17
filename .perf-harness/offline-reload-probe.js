// SWI-12 — browser verification of the central claim: with the service worker
// disabled, reloading the till while offline does not bring the app back.
//
// Drives a real Chrome over the DevTools protocol against a production build
// served single-origin (offline-serve.js). Synthetic data only.
//
//   $env:CDP_HOST="127.0.0.1:9333"
//   node offline-reload-probe.js --base http://127.0.0.1:4399 --shots shots
const fs = require('fs');
const path = require('path');
const http = require('http');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const CDP = process.env.CDP_HOST || '127.0.0.1:9333';
const BASE = arg('base', 'http://127.0.0.1:4399');
const SHOTS = path.resolve(arg('shots', 'shots'));
const WIDTH = parseInt(arg('width', '1440'), 10);
const HEIGHT = parseInt(arg('height', '900'), 10);

if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const getJson = url => new Promise((res, rej) => {
  http.get(url, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej);
});

// Minimal CDP client on Node's built-in WebSocket - no dependencies, same
// approach as the SWI-6 browser-probe.js in this directory.
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    sock.addEventListener('open', () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const msgId = ++id;
          pending.set(msgId, { res, rej, method });
          sock.send(JSON.stringify({ id: msgId, method, params }));
        });
      },
      on(fn) { listeners.push(fn); },
      close() { sock.close(); }
    }));
    sock.addEventListener('error', e => reject(new Error('websocket error: ' + (e.message || 'unknown'))));
    sock.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${method}: ${JSON.stringify(msg.error)}`));
        else res(msg.result);
      } else {
        listeners.forEach(fn => fn(msg));
      }
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const targets = await getJson(`http://${CDP}/json/list`);
  let page = targets.find(t => t.type === 'page');
  if (!page) { page = await getJson(`http://${CDP}/json/new?about:blank`); }
  const c = await connect(page.webSocketDebuggerUrl);

  const consoleLog = [];
  const failedRequests = [];
  c.on(m => {
    if (m.method === 'Runtime.consoleAPICalled') {
      consoleLog.push({ type: m.params.type, text: (m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ') });
    }
    if (m.method === 'Log.entryAdded') consoleLog.push({ type: 'log:' + m.params.entry.level, text: m.params.entry.text });
    if (m.method === 'Network.loadingFailed') failedRequests.push({ type: m.params.type, error: m.params.errorText });
  });

  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Log.enable');
  await c.send('Network.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });

  const evalJs = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text || String(r.exceptionDetails.exception && r.exceptionDetails.exception.description) };
    return r.result.value;
  };

  const shot = async name => {
    const r = await c.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
    return name + '.png';
  };

  // Snapshot of what the user would actually see and whether Angular booted.
  const appState = () => evalJs(`(() => {
    const root = document.querySelector('app-root');
    const loader = document.getElementById('initial-loader');
    const body = document.body ? (document.body.innerText || '').trim() : '';
    return {
      url: location.href,
      title: document.title,
      hasAppRoot: !!root,
      appRootChildren: root ? root.children.length : -1,
      appRootText: root ? (root.innerText || '').trim().slice(0, 400) : null,
      initialLoaderPresent: !!loader,
      bodyTextStart: body.slice(0, 400),
      bodyTextLength: body.length,
      scriptTags: Array.from(document.scripts).map(s => s.src.replace(location.origin, '')).filter(Boolean),
      swControlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      swRegistrations: 'pending'
    };
  })()`);

  const swCount = () => evalJs(`navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => r.length) : -1`);

  const out = { base: BASE, viewport: `${WIDTH}x${HEIGHT}`, steps: [] };
  const step = async (label, extra = {}) => {
    const st = await appState();
    st.swRegistrations = await swCount();
    const s = { label, ...extra, state: st, console: consoleLog.splice(0), failed: failedRequests.splice(0) };
    out.steps.push(s);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(s, null, 2).slice(0, 2600));
    return s;
  };

  const nav = async url => {
    await c.send('Page.navigate', { url });
    await sleep(2500);
  };

  // --- 1. online: load and sign in -----------------------------------------
  await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await nav(BASE + '/login');
  await sleep(2500);
  await step('1-online-login-page', { shot: await shot('1-online-login') });

  // Sign in through the real form.
  const loggedIn = await evalJs(`(async () => {
    const setVal = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      desc.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = Array.from(document.querySelectorAll('input'));
    const user = inputs.find(i => /user|name/i.test(i.name + i.id + i.placeholder + (i.getAttribute('formcontrolname')||''))) || inputs[0];
    const pass = inputs.find(i => i.type === 'password') || inputs[1];
    if (!user || !pass) return { ok: false, reason: 'inputs not found', count: inputs.length };
    setVal(user, 'owner'); setVal(pass, 'admin123');
    await new Promise(r => setTimeout(r, 300));
    const btn = Array.from(document.querySelectorAll('button')).find(b => !b.disabled && /sign|log/i.test(b.innerText));
    if (!btn) return { ok: false, reason: 'submit button not found' };
    btn.click();
    return { ok: true };
  })()`);
  console.log('login attempt:', JSON.stringify(loggedIn));
  await sleep(6000);
  await step('2-online-after-login', { shot: await shot('2-online-after-login'), login: loggedIn });

  // --- 2. online: the POS till ----------------------------------------------
  await nav(BASE + '/pos');
  await sleep(6000);
  const pos = await evalJs(`(() => {
    const cards = document.querySelectorAll('app-product-card, .product-card, .product-tile');
    // Material Icons render as ligatures; if the font is missing the glyph box is wide.
    const icon = document.querySelector('.material-icons, mat-icon');
    let iconInfo = null;
    if (icon) {
      const cs = getComputedStyle(icon);
      iconInfo = { text: icon.textContent.trim(), fontFamily: cs.fontFamily, width: icon.getBoundingClientRect().width };
    }
    return { productCards: cards.length, icon: iconInfo,
             fontsLoaded: document.fonts ? document.fonts.status : 'n/a',
             materialIconsLoaded: document.fonts ? document.fonts.check('24px "Material Icons"') : 'n/a' };
  })()`);
  console.log('POS online:', JSON.stringify(pos));
  await step('3-online-pos', { shot: await shot('3-online-pos'), pos });

  // --- 3. go offline, keep the tab open -------------------------------------
  await c.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await sleep(3000);
  await step('4-offline-same-tab', { shot: await shot('4-offline-same-tab'), note: 'offline, tab never reloaded' });

  // --- 4. THE CLAIM: reload while offline ------------------------------------
  await c.send('Page.reload', { ignoreCache: false });
  await sleep(9000);
  const reloaded = await step('5-offline-after-reload', { shot: await shot('5-offline-after-reload'), note: 'offline + reload - the claim under test' });

  // --- 5. and a cold navigation while offline (browser reopened) -------------
  await nav('about:blank');
  await sleep(1000);
  await nav(BASE + '/pos');
  await sleep(9000);
  await step('6-offline-cold-navigation', { shot: await shot('6-offline-cold-navigation'), note: 'offline, fresh navigation - device restarted' });

  // --- 6. back online, confirm recovery --------------------------------------
  await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await nav(BASE + '/pos');
  await sleep(8000);
  await step('7-back-online', { shot: await shot('7-back-online') });

  fs.writeFileSync(path.join(SHOTS, 'offline-reload-probe.json'), JSON.stringify(out, null, 2));
  console.log('\nwrote ' + path.join(SHOTS, 'offline-reload-probe.json'));
  c.close();
  process.exit(0);
})().catch(e => { console.error('PROBE FAILED:', e); process.exit(1); });
