#!/usr/bin/env node
/*
 * SWI-6 - headline KPI race probe.
 *
 * loadRecentTransactions() reads TransactionService's in-memory list, which is
 * capped at 50 rows, and getTotalSales()/getTransactionCount() prefer that list
 * over the backend figure. Whether the Owner sees the real revenue therefore
 * depends on whether the app-wide transaction download has landed yet.
 *
 * This probe reads the Revenue / Transactions tiles on first paint, then clicks
 * Refresh (cache now warm) and reads them again. Synthetic data only.
 *
 * Usage: node kpi-race-probe.js
 */

const CDP_HOST = process.env.CDP_HOST || '127.0.0.1:9222';
const APP = process.env.APP_URL || 'http://127.0.0.1:4299';
const API = process.env.API_URL || 'http://127.0.0.1:5099';

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
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

const connect = (url) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => resolve(ws));
  ws.addEventListener('error', (e) => reject(new Error('ws error ' + (e.message || ''))));
});

const READ_KPIS = `(() => {
  const out = {};
  for (const c of document.querySelectorAll('app-kpi-card, .kpi-card')) {
    const label = (c.querySelector('.kpi-label') || {}).textContent;
    const value = (c.querySelector('.kpi-value') || {}).textContent;
    if (label) out[label.trim()] = (value || '').trim();
  }
  return out;
})()`;

(async () => {
  const tab = await fetch(`http://${CDP_HOST}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = await connect(tab.webSocketDebuggerUrl);
  const cdp = new Cdp(ws);

  const open = new Set();
  let inFlight = 0, lastActivity = Date.now();
  const seen = [];
  cdp.on('Network.requestWillBeSent', (p) => {
    if (!p.request.url.includes('/api/')) return;
    open.add(p.requestId); inFlight++; lastActivity = Date.now();
    seen.push({ url: p.request.url.replace(APP, ''), start: Date.now() });
  });
  const done = (p) => { if (open.delete(p.requestId)) { inFlight--; lastActivity = Date.now(); } };
  cdp.on('Network.loadingFinished', done);
  cdp.on('Network.loadingFailed', done);

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'admin123' })
  }).then((r) => r.json());

  await cdp.send('Page.navigate', { url: APP });
  await new Promise((r) => setTimeout(r, 4000));
  await cdp.eval(`(() => {
    localStorage.clear();
    localStorage.setItem('auth_token', ${JSON.stringify(login.token)});
    localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify({ id: '', username: login.username || 'owner', role: login.role, token: login.token, expiresAt: login.expiresAt }))});
    localStorage.setItem('auth_expires', ${JSON.stringify(String(login.expiresAt))});
    return true;
  })()`);

  async function settle(maxMs) {
    const t = Date.now(); lastActivity = Date.now();
    while (Date.now() - t < maxMs) {
      await new Promise((r) => setTimeout(r, 300));
      let busy = true;
      try { busy = await cdp.eval(`!!document.querySelector('app-loading-spinner')`); } catch (e) { continue; }
      if (!busy && inFlight <= 0 && Date.now() - lastActivity > 5000) return Date.now() - t;
    }
    return null;
  }

  // MODE=nav reproduces the ordinary staff path: use the POS first (which is
  // what warms the app-wide transaction list), then open Reports from the nav
  // rail without a page reload.
  const MODE = process.env.MODE || 'refresh';
  let first = null, firstSettle = null, second = null, secondSettle = null;

  if (MODE === 'nav') {
    await cdp.send('Page.navigate', { url: `${APP}/pos` });
    await settle(240000);
    await new Promise((r) => setTimeout(r, 3000));
    await cdp.eval(`(() => { const a=[...document.querySelectorAll('a')].find(x=>(x.getAttribute('href')||'')==='/reports'); if(a){a.click(); return true;} return false; })()`);
    secondSettle = await settle(240000);
    await new Promise((r) => setTimeout(r, 1500));
    second = await cdp.eval(READ_KPIS);
  } else {
    await cdp.send('Page.navigate', { url: `${APP}/reports` });
    firstSettle = await settle(240000);
    first = await cdp.eval(READ_KPIS);

    // Everything the page asked for has landed, including the app-wide
    // transaction list. Refresh re-runs loadAllData() against the warm cache.
    await cdp.eval(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.querySelector('svg path[d^="M1 4v6h6"]')); if(b){b.click(); return true;} return false; })()`);
    secondSettle = await settle(240000);
    await new Promise((r) => setTimeout(r, 1500));
    second = await cdp.eval(READ_KPIS);
  }

  console.log(JSON.stringify({ mode: MODE, firstSettleMs: firstSettle, afterFirstLoad: first, secondSettleMs: secondSettle, afterRefresh: second, apiCallCount: seen.length }, null, 2));

  await fetch(`http://${CDP_HOST}/json/close/${tab.id}`).catch(() => {});
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
