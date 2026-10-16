# SWI-6 reports performance harness

Reproduces the measurements behind the SWI-6 reports spec. **Everything here is
synthetic.** No production database, export or customer record is read or
written. The generator fabricates customers as `Walk-in` / `Counter Guest` style
placeholders and never produces Senior Citizen / PWD identifiers.

## What it does

| File | Purpose |
| --- | --- |
| `seed-gen.js` | Generates `seed.sql` — one year of fabricated cafe POS trading |
| `bench.ps1` | Times every `/api/reports` endpoint the page calls, plus payload size |
| `browser-probe.js` | Drives real headless Chrome at `/reports`; splits network vs script vs layout time and detects grid-wrap and overflow defects |
| `layout-probe.js` | Static layout reproduction — reads the component's own `.css`/`.html` from disk and measures the P&L grid at 11 viewport widths, with no backend needed |
| `localstorage-probe.js` | Reports whether `TransactionService`'s `localStorage` mirror of the full transaction list actually persists |
| `run-api.ps1` | Starts the backend against the isolated perf database |
| `run-web.ps1` | Starts `ng serve` proxied at the perf backend |
| `run-chrome.ps1` | Starts headless Chrome with the DevTools protocol on :9333 |

## Volume model

170 transactions/day, weekday/weekend shaped, 1–4 lines each, ~6 distinct
ingredients consumed per sale. Over 365 days that is:

| Table | Rows |
| --- | --- |
| Transactions | 64,662 |
| TransactionItem | 161,789 |
| AddOn | 73,155 |
| StockMovements | 580,941 |
| IngredientLots | 3,120 |
| Expenses | 391 |

A 30-day window contains **5,569 transactions** and **50,083 stock movements**,
which is the volume the SWI-6 brief names as the acceptance target.

## Running it

```powershell
# 1. Isolated MySQL (never the dev or production instance)
docker run -d --name swi6-perf-mysql -e MYSQL_ROOT_PASSWORD=perftest123 `
  -e MYSQL_DATABASE=quickserve_perf -p 3399:3306 mysql:8.0 --max_allowed_packet=256M

# 2. Backend creates the schema on first start
powershell -File run-api.ps1          # binds 127.0.0.1:5099

# 3. Seed
node seed-gen.js seed.sql
docker cp seed.sql swi6-perf-mysql:/tmp/seed.sql
docker exec swi6-perf-mysql sh -c "mysql -uroot -pperftest123 -D quickserve_perf < /tmp/seed.sql"

# 4. Endpoint timings
powershell -File bench.ps1 -Days 30 -Runs 3 -OutJson bench-30d.json

# 5. Real-browser timings and layout probe
powershell -File run-web.ps1          # binds 127.0.0.1:4299
powershell -File run-chrome.ps1       # DevTools on 127.0.0.1:9333
$env:CDP_HOST="127.0.0.1:9333"
node browser-probe.js --width 1440 --preset today --tab dashboard --settle 240000
node browser-probe.js --width 1920 --preset today --tab pnl

# 6. Layout only — no backend or dev server needed, runs in seconds
node layout-probe.js
```

`layout-probe.js` is the fast gate for the P&L grid fix (R13/R14): every one of
its 11 widths must read `ok`. It is the one check worth running on every edit to
`reports.component.css`.

## Teardown

```powershell
docker rm -f swi6-perf-mysql
```

The perf database lives only inside that container. Removing it removes the data.

## Notes for whoever picks up the implementation task

- On this machine the sandbox strips `ProgramFiles`, `ProgramFiles(x86)` and
  `ProgramData`, which makes NuGet restore fail with
  `Value cannot be null. (Parameter 'path1')`. `run-api.ps1` sets them back.
- `bench.ps1` reports a **sequential total**, because `loadAllData()` awaits its
  requests strictly in series — that total is what the page actually costs, not
  the max of the individual timings.
- `browser-probe.js` reports `firstContentMs` and `networkIdleMs` separately.
  They differ a lot today because a 10-second `setTimeout` in `loadAllData()`
  reveals the page before its data has arrived.
