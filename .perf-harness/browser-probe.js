#!/usr/bin/env node
/*
 * SWI-6 reports harness - headless Chrome probe.
 *
 * Drives the real Angular app at /reports against the synthetic perf API and
 * reports, per viewport:
 *   - wall-clock to a settled reports view
 *   - network time vs scripting/rendering time (CDP Performance counters)
 *   - DOM node count
 *   - horizontal overflow and grid-row-wrap layout defects
 *
 * Usage: node browser-probe.js [--width 1440] [--preset today|7d|30d] [--tab pnl]
 * Requires Chrome already listening on --remote-debugging-port=9222.
 */

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

function httpJson(url) {
  return fetch(url).then((r) => r.json());
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description));
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
  // Fresh tab so each run is independent.
  const newTab = await fetch(`http://${CDP_HOST}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = await connect(newTab.webSocketDebuggerUrl);
  const cdp = new Cdp(ws);

  // Per-request timing keyed by CDP requestId.
  const reqs = new Map();
  let inFlight = 0;
  let lastActivity = Date.now();
  cdp.on('Network.requestWillBeSent', (p) => {
    if (!p.request.url.includes('/api/')) return;
    reqs.set(p.requestId, { url: p.request.url, start: Date.now(), bytes: 0, status: null, end: null });
    inFlight++; lastActivity = Date.now();
  });
  cdp.on('Network.responseReceived', (p) => { const r = reqs.get(p.requestId); if (r) { r.status = p.response.status; lastActivity = Date.now(); } });
  cdp.on('Network.loadingFinished', (p) => {
    const r = reqs.get(p.requestId);
    if (r) { r.end = Date.now(); r.bytes = p.encodedDataLength; inFlight--; lastActivity = Date.now(); }
  });
  cdp.on('Network.loadingFailed', (p) => { const r = reqs.get(p.requestId); if (r) { r.end = Date.now(); r.failed = true; inFlight--; lastActivity = Date.now(); } });

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 700 });

  // Seat an Owner token before the app boots so AuthGuard lets /reports through.
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

  // Two distinct milestones:
  //   firstContentMs - spinner replaced by the reports content (what the user first sees)
  //   networkIdleMs  - every /api/ request the page issued has actually finished
  let firstContentMs = null;
  let networkIdleMs = null;
  while (Date.now() - t0 < SETTLE_MS) {
    await new Promise((r) => setTimeout(r, 250));
    let state = null;
    try {
      state = await cdp.eval(`(() => ({
        spinner: !!document.querySelector('app-loading-spinner'),
        content: !!document.querySelector('.reports-content')
      }))()`);
    } catch (e) { continue; }
    if (firstContentMs === null && state && state.content && !state.spinner) firstContentMs = Date.now() - t0;
    if (firstContentMs !== null && inFlight <= 0 && Date.now() - lastActivity > 4000) { networkIdleMs = Date.now() - t0; break; }
  }
  const settleMs = networkIdleMs || (Date.now() - t0);

  // Wait for the page to go quiet again after an interaction that reloads data.
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
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (argv.expand) {
    await cdp.eval(`(() => { const hs=[...document.querySelectorAll('.collapsible-header, .collapsible-section > *')]; const h=hs.find(x=>/activity/i.test(x.textContent||'')); if(h) h.click(); return !!h; })()`);
    await reSettle(240000);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const perf = await cdp.send('Performance.getMetrics');
  const M = Object.fromEntries(perf.metrics.map((m) => [m.name, m.value]));

  // Layout defect probe.
  const layout = await cdp.eval(`(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('.reports-container *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 1) {
        offenders.push({ cls: (el.className || '').toString().slice(0, 60), tag: el.tagName, right: Math.round(r.right) });
      }
    }
    // Grid rows that wrapped: children occupying more than one row line.
    function gridRows(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
      const kids = [...el.children].filter(k => getComputedStyle(k).display !== 'none');
      const tops = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top)));
      return { selector: sel, declaredCols: cols, visibleChildren: kids.length, occupiedRows: tops.size };
    }
    return {
      overflowX,
      offenders: offenders.slice(0, 12),
      pnlHead: gridRows('.pnl-table-head'),
      pnlRow: gridRows('.pnl-table-row'),
      activityHead: gridRows('.activity-table-head'),
      domNodes: document.getElementsByTagName('*').length,
      visibleTab: (document.querySelector('.tab.active') || {}).textContent?.trim(),
      bodyScrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth
    };
  })()`);

  const apiCalls = [...reqs.values()].map((r) => ({
    url: r.url.replace(APP, ''),
    ms: r.end ? r.end - r.start : null,
    kb: +(r.bytes / 1024).toFixed(1),
    status: r.status,
    unfinished: !r.end
  })).sort((a, b) => (b.ms || 1e9) - (a.ms || 1e9));

  const out = {
    viewport: `${WIDTH}x${HEIGHT}`, preset: PRESET, tab: TAB,
    firstContentMs, networkIdleMs,
    settleMs,
    totalApiKb: +apiCalls.reduce((s, c) => s + c.kb, 0).toFixed(1),
    scriptDurationS: +(M.ScriptDuration || 0).toFixed(2),
    layoutDurationS: +(M.LayoutDuration || 0).toFixed(2),
    recalcStyleS: +(M.RecalcStyleDuration || 0).toFixed(2),
    taskDurationS: +(M.TaskDuration || 0).toFixed(2),
    jsHeapMB: +((M.JSHeapUsedSize || 0) / 1048576).toFixed(1),
    domNodes: layout.domNodes,
    apiRequestCount: apiCalls.length,
    slowestApiCalls: apiCalls.slice(0, 10),
    layout
  };
  console.log(JSON.stringify(out, null, 2));

  await fetch(`http://${CDP_HOST}/json/close/${newTab.id}`).catch(() => {});
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
