#!/usr/bin/env node
/*
 * SWI-6 harness - how much will localStorage actually accept on the app origin?
 *
 * TransactionService mirrors the entire transaction list into localStorage
 * (transaction.service.ts:474). At the seeded volume that payload is ~48.8 MB.
 * This measures the real quota rather than assuming the usual 5 MB figure.
 */
const CDP_HOST = process.env.CDP_HOST || '127.0.0.1:9333';
const APP = process.env.APP_URL || 'http://127.0.0.1:4299';

(async () => {
  const tab = await fetch(`http://${CDP_HOST}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); q(m); }
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: APP });
  await new Promise((r) => setTimeout(r, 5000));

  const expr = [
    '(() => {',
    '  localStorage.clear();',
    "  const chunk = 'x'.repeat(1024 * 1024);",
    '  let acceptedMb = 0;',
    '  let error = null;',
    '  try {',
    '    for (let i = 0; i < 120; i++) {',
    "      localStorage.setItem('probe' + i, chunk);",
    '      acceptedMb++;',
    '    }',
    '  } catch (e) {',
    "    error = e.name + ': ' + e.message;",
    '  }',
    '  localStorage.clear();',
    '  return JSON.stringify({ acceptedMb, error });',
    '})()'
  ].join('\n');

  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const value = r.result && r.result.result ? r.result.result.value : JSON.stringify(r.result);
  console.log('localStorage capacity on ' + APP + ': ' + value);
  console.log('TransactionService tries to store ~48.8 MB here at the seeded volume.');

  await fetch(`http://${CDP_HOST}/json/close/${tab.id}`).catch(() => {});
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
