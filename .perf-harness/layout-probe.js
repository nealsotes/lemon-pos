#!/usr/bin/env node
/*
 * SWI-6 harness - static layout reproduction.
 *
 * Isolates the layout question from the data question. Builds a page from the
 * component's REAL stylesheet (reports.component.css, read from disk) and the
 * REAL markup of the P&L breakdown table (reports.component.html:512-523),
 * then measures, per viewport, how many grid rows each table row occupies.
 *
 * A correctly specified grid puts one record on one row. Anything else means
 * the declared `grid-template-columns` does not match the number of visible
 * children, which is the defect this probe exists to confirm.
 *
 * Usage: node layout-probe.js            (requires Chrome on CDP_HOST)
 */

const fs = require('fs');
const path = require('path');

const CDP_HOST = process.env.CDP_HOST || '127.0.0.1:9333';
const REPO = path.resolve(__dirname, '..');
const CSS_PATH = path.join(REPO, 'frontend/src/app/features/admin/components/reports/reports.component.css');
const HTML_PATH = path.join(REPO, 'frontend/src/app/features/admin/components/reports/reports.component.html');

const css = fs.readFileSync(CSS_PATH, 'utf8');
const componentHtml = fs.readFileSync(HTML_PATH, 'utf8');

// Pull the real head row out of the component template so this probe cannot
// drift from the source. Falls back loudly rather than inventing markup.
const headMatch = componentHtml.match(/<div class="pnl-table-head">\s*([\s\S]*?)\s*<\/div>/);
if (!headMatch) { console.error('could not locate .pnl-table-head in the component template'); process.exit(1); }
const headSpans = headMatch[1].trim();
const headSpanCount = (headSpans.match(/<span/g) || []).length;

// One data row with the same span count as the template emits (7 bindings).
const dataRow = `
  <span class="pnl-period">Oct 17</span>
  <span>&#8369;18,420.00</span>
  <span class="cogs">&#8369;6,110.00</span>
  <span class="profit">&#8369;12,310.00</span>
  <span class="cogs">&#8369;2,400.00</span>
  <span class="profit">&#8369;9,910.00</span>
  <span class="margin-good">53.8%</span>`;

const page = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --spacing-sm:8px; --spacing-md:12px; --spacing-lg:16px; --border:rgba(128,128,128,0.15);
          --text-primary:#111; --text-muted:#666; --accent:#3b82f6; --bg-muted:#f3f4f6; --bg-surface:#fff; }
  body { margin:0; font-family:system-ui,sans-serif; }
${css}
</style></head><body>
<div class="reports-container"><div class="reports-body"><div class="reports-content">
  <div class="card">
    <div class="pnl-table-head">${headSpans}</div>
    <div class="pnl-table-row">${dataRow}</div>
    <div class="pnl-table-row">${dataRow}</div>
  </div>
</div></div></div>
</body></html>`;

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
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.setDocumentContent', { frameId: (await send('Page.getFrameTree')).frameTree.frame.id, html: page });
  await new Promise((r) => setTimeout(r, 400));

  const widths = [1920, 1440, 1280, 1024, 900, 768, 640, 540, 414, 390, 360];
  const rows = [];
  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 });
    await new Promise((r) => setTimeout(r, 180));
    const m = await evaluate(`(() => {
      function probe(sel) {
        const el = document.querySelector(sel);
        const cs = getComputedStyle(el);
        const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
        const kids = [...el.children].filter(k => getComputedStyle(k).display !== 'none');
        const tops = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top)));
        return { cols, visible: kids.length, rows: tops.size };
      }
      return { head: probe('.pnl-table-head'), row: probe('.pnl-table-row') };
    })()`);
    rows.push({ width: w, headCols: m.head.cols, headVisible: m.head.visible, headRows: m.head.rows,
                rowCols: m.row.cols, rowVisible: m.row.visible, rowRows: m.row.rows,
                ok: m.head.rows === 1 && m.row.rows === 1 && m.head.visible === m.head.cols });
  }

  console.log(`Template emits ${headSpanCount} spans per P&L header row (read from reports.component.html).\n`);
  console.log('width  declaredCols  visibleSpans  gridRowsUsed   verdict');
  console.log('-----  ------------  ------------  ------------   -------');
  for (const r of rows) {
    console.log(
      String(r.width).padStart(5) +
      String(r.rowCols).padStart(14) +
      String(r.rowVisible).padStart(14) +
      String(r.rowRows).padStart(14) +
      '   ' + (r.ok ? 'ok' : 'BROKEN — row wraps onto ' + r.rowRows + ' lines')
    );
  }

  await fetch(`http://${CDP_HOST}/json/close/${tab.id}`).catch(() => {});
  ws.close(); process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
