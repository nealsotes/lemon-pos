#!/usr/bin/env node
/*
 * SWI-12 - compares the two candidate offline stores on the app's own origin:
 * localStorage (what the app uses today) and IndexedDB (the proposal).
 *
 * Measures, for each: how much it accepts before it refuses, and how long a
 * write of a realistic size blocks the main thread. The second number is the
 * one that matters for a till - localStorage is synchronous, so the cashier's
 * UI is frozen for the whole write.
 */
const CDP_HOST = process.env.CDP_HOST || '127.0.0.1:9333';
const APP = process.env.APP_URL || 'http://127.0.0.1:4399';

(async () => {
  const tab = await fetch(`http://${CDP_HOST}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); q(m); }
  });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 600000 });
    const res = r.result || {};
    if (res.exceptionDetails) return { __error: JSON.stringify(res.exceptionDetails).slice(0, 400) };
    return res.result ? res.result.value : null;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: APP });
  await new Promise(r => setTimeout(r, 6000));

  console.log('origin under test:', await evaluate('location.origin'));

  // --- 1. quota reported by the browser ------------------------------------
  console.log('\n--- navigator.storage.estimate() ---');
  console.log(JSON.stringify(await evaluate(`
    navigator.storage && navigator.storage.estimate
      ? navigator.storage.estimate().then(e => ({ quotaMB: +(e.quota/1048576).toFixed(1), usageMB: +(e.usage/1048576).toFixed(2) }))
      : 'unavailable'
  `), null, 2));

  // --- 2. localStorage ceiling ---------------------------------------------
  console.log('\n--- localStorage: how much does it accept? ---');
  console.log(JSON.stringify(await evaluate(`(() => {
    const saved = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); saved[k] = localStorage.getItem(k); }
    localStorage.clear();
    const chunk = 'x'.repeat(256 * 1024);   // 256 KB per step for a finer ceiling
    let acceptedKB = 0, error = null;
    try { for (let i = 0; i < 400; i++) { localStorage.setItem('probe' + i, chunk); acceptedKB += 256; } }
    catch (e) { error = e.name + ': ' + e.message; }
    localStorage.clear();
    for (const k in saved) { try { localStorage.setItem(k, saved[k]); } catch (e) {} }
    return JSON.stringify({ acceptedKB, acceptedMB: +(acceptedKB/1024).toFixed(2), error });
  })()`), null, 2));

  // --- 3. localStorage write cost (synchronous = frozen UI) ----------------
  console.log('\n--- localStorage: main-thread cost of one write ---');
  console.log(JSON.stringify(await evaluate(`(() => {
    const out = [];
    for (const sizeKB of [16, 256, 1024, 3072]) {
      const payload = JSON.stringify({ d: 'x'.repeat(sizeKB * 1024) });
      let t0 = performance.now(), err = null;
      try { localStorage.setItem('__probe_write', payload); } catch (e) { err = e.name; }
      const writeMs = +(performance.now() - t0).toFixed(1);
      t0 = performance.now();
      try { JSON.parse(localStorage.getItem('__probe_write') || '{}'); } catch (e) {}
      const readMs = +(performance.now() - t0).toFixed(1);
      localStorage.removeItem('__probe_write');
      out.push({ sizeKB, writeMs, readMs, err });
    }
    return JSON.stringify(out);
  })()`), null, 2));

  // --- 4. IndexedDB: does it take what localStorage refused? ---------------
  console.log('\n--- IndexedDB: same payloads, asynchronous ---');
  console.log(JSON.stringify(await evaluate(`(async () => {
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open('swi12_probe', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const put = (db, key, val) => new Promise((res, rej) => {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put(val, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
    const db = await open();
    const out = [];
    for (const sizeKB of [16, 256, 1024, 3072, 10240, 51200]) {
      const payload = { d: 'x'.repeat(sizeKB * 1024) };
      const t0 = performance.now();
      let err = null;
      try { await put(db, 'k' + sizeKB, payload); } catch (e) { err = (e && e.name) || String(e); }
      out.push({ sizeKB, ms: +(performance.now() - t0).toFixed(1), err });
    }
    db.close();
    await new Promise(res => { const r = indexedDB.deleteDatabase('swi12_probe'); r.onsuccess = res; r.onerror = res; r.onblocked = res; });
    return JSON.stringify(out);
  })()`), null, 2));

  await fetch(`http://${CDP_HOST}/json/close/${tab.id}`).catch(() => {});
  process.exit(0);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
