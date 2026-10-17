#!/usr/bin/env node
/*
 * SWI-6 reports harness - visual verification probe.
 *
 * Same driving logic as browser-probe.js, but captures PNG screenshots of the
 * rendered /reports page so a human can see the defects rather than read
 * geometry numbers. All data on screen is synthetic (see seed-gen.js).
 *
 * Usage: node screenshot-probe.js --width 1440 --preset today --tab pnl --out shots/pnl-1440.png
 * Requires Chrome listening on $CDP_HOST (default 127.0.0.1:9222).
 */

const fs = require('fs');
const path = require('path');

const CDP_HOST = process.env.CDP_HOST || '127.0.0.1:9222';
const APP = process.env.APP_URL || 'http://127.0.0.1:4299';
const API = process.env.API_URL || 'http://127.0.0.1:5099';

const args = process.argv.slice(2);
const argv = {};
for (let i = 0; i < args.length; i += 2) argv[args[i].replace(/^--/, '')] = args[i + 1];
const WIDTH = Number(argv.width || 1440);
const HEIGHT = Number(argv.height || 900);
const PRESET = argv.preset || 'today';
const TAB = argv.tab || 'dashboard';
const SETTLE_MS = Number(argv.settle || 180000);
const OUT = argv.out || `shots/${TAB}-${WIDTH}.png`;
const FULLPAGE = argv.fullpage !== 'false';

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) {
        (this.handlers.get(m.method) || []).forEach((h) => h(m.params));
      }
    });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(new Error('ws error ' + (e.message || ''))));
  });
}

(async () => {
  const newTab = await fetch(`http://${CDP_HOST}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = await connect(newTab.webSocketDebuggerUrl);
  const cdp = new Cdp(ws);

  // Count only /api/ requests, and only ones we saw start - otherwise the
  // counter goes negative on asset loads and the page looks idle too early.
  const open = new Set();
  let inFlight = 0;
  let lastActivity = Date.now();
  cdp.on('Network.requestWillBeSent', (p) => { if (p.request.url.includes('/api/')) { open.add(p.requestId); inFlight++; lastActivity = Date.now(); } });
  const done = (p) => { if (open.delete(p.requestId)) { inFlight--; lastActivity = Date.now(); } };
  cdp.on('Network.loadingFinished', done);
  cdp.on('Network.loadingFailed', done);

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 700 });

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'admin123' })
  }).then((r) => r.json());

  await cdp.send('Page.navigate', { url: APP });
  await new Promise((r) => setTimeout(r, 4000));
  const authUser = JSON.stringify({
    id: '', username: login.username || 'owner', role: login.role,
    token: login.token, expiresAt: login.expiresAt
  });
  await cdp.eval(`(() => {
    localStorage.clear();
    localStorage.setItem('auth_token', ${JSON.stringify(login.token)});
    localStorage.setItem('auth_user', ${JSON.stringify(authUser)});
    localStorage.setItem('auth_expires', ${JSON.stringify(String(login.expiresAt))});
    return true;
  })()`);

  const t0 = Date.now();
  await cdp.send('Page.navigate', { url: `${APP}/reports` });

  // Optional mid-load capture: what the Owner is looking at N ms in.
  if (argv.at) {
    const at = Number(argv.at);
    while (Date.now() - t0 < at) await new Promise((r) => setTimeout(r, 100));
    await shoot(`${OUT.replace(/\.png$/, '')}-at${at}ms.png`, false);
  }

  let firstContentMs = null;
  let networkIdleMs = null;
  while (Date.now() - t0 < SETTLE_MS) {
    await new Promise((r) => setTimeout(r, 250));
    let state = null;
    try {
      state = await cdp.eval(`(() => ({ spinner: !!document.querySelector('app-loading-spinner'), content: !!document.querySelector('.reports-content') }))()`);
    } catch (e) { continue; }
    if (firstContentMs === null && state && state.content && !state.spinner) firstContentMs = Date.now() - t0;
    if (firstContentMs !== null && inFlight <= 0 && Date.now() - lastActivity > 4000) { networkIdleMs = Date.now() - t0; break; }
  }

  async function reSettle(maxMs = 240000) {
    const t = Date.now();
    lastActivity = Date.now();
    while (Date.now() - t < maxMs) {
      await new Promise((r) => setTimeout(r, 250));
      let busy = true;
      try { busy = await cdp.eval(`!!document.querySelector('app-loading-spinner')`); } catch (e) { continue; }
      if (!busy && inFlight <= 0 && Date.now() - lastActivity > 4000) return Date.now() - t;
    }
    return null;
  }

  if (PRESET !== 'today') {
    const token = PRESET === '7d' ? '7' : '30';
    await cdp.eval(`(() => { const b=[...document.querySelectorAll('.preset-btn')].find(x=>x.textContent.trim().toLowerCase().startsWith(${JSON.stringify(token)})); if(b) b.click(); return !!b; })()`);
    await reSettle();
  }
  if (TAB !== 'dashboard') {
    const label = TAB === 'pnl' ? 'profit' : TAB;
    await cdp.eval(`(() => { const b=[...document.querySelectorAll('.tab')].find(x=>x.textContent.trim().toLowerCase().includes(${JSON.stringify(label)})); if(b) b.click(); return !!b; })()`);
    await reSettle(20000);
    await new Promise((r) => setTimeout(r, 1500));
  }

  async function shoot(file, fullPage) {
    const params = { format: 'png', captureBeyondViewport: !!fullPage };
    if (fullPage) {
      const m = await cdp.send('Page.getLayoutMetrics');
      const h = Math.min(Math.ceil(m.contentSize.height), 12000);
      params.clip = { x: 0, y: 0, width: WIDTH, height: h, scale: 1 };
    }
    const shot = await cdp.send('Page.captureScreenshot', params);
    const abs = path.isAbsolute(file) ? file : path.join(__dirname, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(shot.data, 'base64'));
    return abs;
  }

  // The reports view scrolls inside its own container, not the document, so a
  // "full page" capture only ever sees the first screen. --scrolly scrolls the
  // tallest scrollable element before shooting.
  if (argv.scrolly) {
    await cdp.eval(`(() => {
      const els = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && ['auto','scroll'].includes(getComputedStyle(e).overflowY));
      const el = els.sort((a,b) => b.scrollHeight - a.scrollHeight)[0] || document.scrollingElement;
      el.scrollTop = ${Number(argv.scrolly)};
      return el.scrollTop;
    })()`);
    await new Promise((r) => setTimeout(r, 800));
  }

  const written = await shoot(OUT, FULLPAGE);

  // Geometry alongside the picture, so the two can be cross-checked.
  const geom = await cdp.eval(`(() => {
    const doc = document.documentElement;
    function grid(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const kids = [...el.children].filter(k => getComputedStyle(k).display !== 'none');
      const tops = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top)));
      return { cols: cs.gridTemplateColumns.split(' ').filter(Boolean).length, visibleChildren: kids.length, occupiedRows: tops.size };
    }
    const off = [];
    for (const el of document.querySelectorAll('.reports-container *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 1) off.push({ cls: (el.className||'').toString().slice(0,50), px: Math.round(r.right - doc.clientWidth) });
    }
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      offenders: off.slice(0, 8),
      pnlHead: grid('.pnl-table-head'),
      pnlRow: grid('.pnl-table-row'),
      activeTab: (document.querySelector('.tab.active')||{}).textContent?.trim()
    };
  })()`);

  console.log(JSON.stringify({ file: written, viewport: `${WIDTH}x${HEIGHT}`, preset: PRESET, tab: TAB, firstContentMs, networkIdleMs, geom }, null, 2));

  await fetch(`http://${CDP_HOST}/json/close/${newTab.id}`).catch(() => {});
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('SHOT FAILED:', e.message); process.exit(1); });
