#!/usr/bin/env node
/*
 * SWI-6 harness - checks what TransactionService actually manages to persist.
 * Loads /reports, waits for the unbounded GET /api/transactions to finish, then
 * reports whether the localStorage mirror of the transaction list succeeded.
 */
const CDP_HOST = process.env.CDP_HOST || '127.0.0.1:9333';
const APP = process.env.APP_URL || 'http://127.0.0.1:4299';
const API = process.env.API_URL || 'http://127.0.0.1:5099';

function connect(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => res(ws));
    ws.addEventListener('error', (e) => rej(new Error(e.message || 'ws error')));
  });
}

(async () => {
  const tab = await fetch(`http://${CDP_HOST}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = await connect(tab.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

  await send('Page.enable'); await send('Runtime.enable');

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'admin123' })
  }).then((r) => r.json());

  await send('Page.navigate', { url: APP });
  await new Promise((r) => setTimeout(r, 4000));
  await evaluate(`(() => {
    localStorage.clear();
    localStorage.setItem('auth_token', ${JSON.stringify(login.token)});
    localStorage.setItem('auth_user', ${JSON.stringify(JSON.stringify({ id: '', username: 'owner', role: login.role, token: login.token, expiresAt: login.expiresAt }))});
    localStorage.setItem('auth_expires', ${JSON.stringify(String(login.expiresAt))});
    // Record any storage failure the app swallows.
    window.__quotaErrors = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      try { return orig.call(this, k, v); }
      catch (e) { window.__quotaErrors.push({ key: k, bytes: (v || '').length, error: e.name + ': ' + e.message }); throw e; }
    };
    return true;
  })()`);

  await send('Page.navigate', { url: `${APP}/reports` });

  // Wait generously for the unbounded transactions call to land.
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const done = await evaluate(`(() => { try { return !!localStorage.getItem('transactions') || (window.__quotaErrors||[]).length > 0; } catch(e){ return false; } })()`).catch(() => false);
    if (done) break;
  }

  const result = await evaluate(`(() => {
    const out = { quotaErrors: window.__quotaErrors || [], keys: {} };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out.keys[k] = (localStorage.getItem(k) || '').length;
    }
    out.transactionsPersisted = !!localStorage.getItem('transactions');
    out.transactionCountInMemory = (() => { try { return JSON.parse(localStorage.getItem('transactions')||'[]').length; } catch(e) { return 'unparseable'; } })();
    return out;
  })()`);

  console.log(JSON.stringify(result, null, 2));
  await fetch(`http://${CDP_HOST}/json/close/${tab.id}`).catch(() => {});
  ws.close(); process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
