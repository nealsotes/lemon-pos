# Offline mode — what "the till must keep working offline" requires

**Task:** SWI-12 · **Author:** EngLead · **Date:** 2026-10-17
**Status:** For board review. **No production code was changed by this task.**
**Baseline:** `main` at `8387174`.

---

## 0. Headline

**Today the till does not work offline. It only survives being offline.**

If the browser tab stays open, the POS screen keeps working and a sale can be
rung up and queued. The moment the page is reloaded, the browser is reopened, or
the device restarts, the app does not load at all. This was put on screen in a
real browser: offline, a reload produces Chrome's "no internet" dinosaur page
and `ERR_INTERNET_DISCONNECTED` — not a degraded till, **no till**. The cause is
one line: `frontend/src/main.ts:32` registers the service worker with
`enabled: false`, so nothing caches the application itself.

The second finding is the size of the gap between what the till *needs* and what
it *downloads*:

| | Measured |
| --- | ---: |
| What the till must cache to ring up a sale | **12,832 B — 12.5 KB** |
| What it downloads on every startup instead | **48.81 MB** (SWI-6) |
| Ratio | **≈ 4,000×** |
| …and how much of it is kept | **nothing** |

The entire application — every byte needed to boot the till with no network —
is **405 KB gzipped**. That is one eighth of one percent of the download it
would replace.

**Three corrections to the brief's premises**, each of which changes the plan:

1. **The sequencing constraint is already satisfied.** The brief states the
   Today-KPI fix is "sitting on the unmerged branch `fix/reports-today-revenue-kpi`
   (`edf2105`)" and must land first. It landed: `edf2105` is an ancestor of `main`
   via merge `f297358`. There is nothing to sequence *there* — but removing the
   startup download still breaks something else on the reports page, and §9 says
   what and why.
2. **There is no history of the "cache issues".** The service worker was already
   disabled, with that same comment, **in the repository's first commit**
   (`7a347fa`, 2026-02-09). Only two commits have ever touched `main.ts`. No
   commit message, issue or document in this repo describes what went wrong. The
   question in the brief has an answer, and the answer is "the record does not
   exist". §6 says what to do about that.
3. **`ngsw-config.json` as written is substantially dead.** Two of its three API
   cache rules can never run, and the one that does run would cache the
   online/offline health check itself. Re-enabling the service worker against
   this config is not a one-line change. §6.

Finally: the brief asks whether a till that can sell but not print is acceptable.
It is probably moot — **printing already has local fallbacks** (QZ Tray over a
localhost socket, Web Bluetooth, RawBT) and does not need the server. §3.

---

## 1. Scope and method

### What this document is

A specification. **No production code was written.** The only files added are
this document and three throwaway measurement scripts in `.perf-harness/`
(§12). The discount, service-fee and VAT arithmetic was not touched, and no
change proposed below touches it — see §10.

### What was measured, and against what

Reused the SWI-6 harness and its still-running synthetic database so every
number here is directly comparable with that spec: a throwaway MySQL 8 container
(`swi6-perf-mysql`, port 3399, database `quickserve_perf`) holding **64,662
fabricated transactions, 40 products, 60 ingredients** — one year of invented
cafe trading. The backend ran against it on `127.0.0.1:5099`.

**No production data was read, copied, exported or displayed.** The seed is
entirely fabricated; the dev MySQL instance on port 3307 and the `tb-prodcopy`
container were not touched.

For the browser work a **production build** was served single-origin, the way
Railway serves it — static files first, SPA fallback to `index.html`, `/api`
proxied to the backend (`.perf-harness/offline-serve.js`) — and driven in real
headless Chrome 155 over the DevTools protocol.

### One thing I got wrong and corrected

I expected the SPA fallback to return `index.html` with HTTP 200 for a missing
hashed asset, which is the classic way a stale service-worker cache becomes
unrecoverable. **It does not.** `MapFallbackToFile` (`Program.cs:392`) routes
`{*path:nonfile}`, so a path that looks like a file is excluded. Verified
against the running backend: `GET /main.deadbeef.js` → **404**. That failure
mode is not available here, and the throwaway server was corrected to match
before any browser measurement was taken. It is recorded because a reviewer
might otherwise assume it.

---

## 2. Verified on screen — the central claim

The board asked for browser verification before anything is proposed for `main`.
Run at 1440×900 against the production build, signed in as Owner.

| Step | What the till does |
| --- | --- |
| Online, `/pos` | Works. 40 products, categories, cart. |
| **Go offline, tab left open** | **Still works.** Full product grid, prices, stock counts, cart. |
| **Offline + reload** | **`chrome-error://chromewebdata/` — `ERR_INTERNET_DISCONNECTED`.** No `app-root`, no application, Chrome's offline dinosaur game. |
| **Offline + fresh navigation** (device restarted) | Identical. No application. |
| Back online | Recovers normally. |

Captured at `.perf-harness/shots/` (not committed — synthetic, but large and of
no long-term value). `swRegistrations: 0` and `swControlled: false` at every
step, confirming nothing registers a worker in a production build.

**State this plainly to the board: if the shop's internet drops overnight and
the till is switched on in the morning, the till does not start.** Everything
else in this document is secondary to that.

### Two further things the screen showed

- **There is no offline indicator anywhere in the UI.** Offline with the tab
  open, the POS screen is visually identical to the online one. `OfflineService`
  is injected into `AppComponent` as a `public` member (`app.component.ts:41`)
  and then **never referenced in `app.component.html`**. The cashier has no way
  to know the till is offline, and therefore no way to know a sale is queued
  rather than banked.
- **`checkBuildVersion()` is dead code.** `app.component.ts:125-142` fetches
  `/build-info.txt` and calls `registration.update()` on the service worker when
  the build changes. With no worker registered there is never a registration.
  This is a surviving workaround from the era the brief is asking about, and it
  is the only trace of it left in the codebase.

---

## 3. Which operations must work offline

**This section is a recommendation, not a finding. The board must confirm it.**
Engineering can say what each capability costs; it cannot say what the shop can
trade without.

### Recommended: must work offline (Tier 1)

| Capability | Why it is cheap | Evidence |
| --- | --- | --- |
| Look up a product, price, category | 12.5 KB of cache | §4 |
| Ring up a sale, add-ons, hot/cold | Pure client-side arithmetic | — |
| Apply a discount | Client-side; `DiscountInfo` travels with the sale | — |
| Take cash, compute change | Client-side | — |
| **Print a receipt** | **Already works offline** | below |
| Queue the sale and sync it later | Exists; being fixed on SWI-11 | §7 |
| Open a cash drawer | Same local print path | — |

**Printing is the answer to the board's hardest question in this section, and it
is good news.** `thermal-printer.service.ts:367-451` tries the backend first and
then falls back to QZ Tray (a localhost websocket), Web Bluetooth, or RawBT on
Android. None of those need the internet. A till that can sell offline can
print offline, provided the shop's printer is on one of those local paths. The
one cost is that `useBackendPrinting` defaults to `true`
(`thermal-printer.service.ts:18`), so offline every receipt makes a doomed
server request first and waits for it to fail before falling back. That is a
latency bug, not a capability gap — **R7**.

### Recommended: may degrade offline (Tier 2)

Reports, the P&L, inventory valuation, stock movements, ingredient lots, expense
entry, product administration, settings administration, user administration.

These read or write data the till cannot reconcile offline, and none of them is
needed to serve a customer. The recommendation is that they show an explicit
"not available offline" state — **not** an empty table, and **not** a plausible
wrong number. §9 explains why that distinction has teeth.

### The one that is neither, and needs a decision

**Stock levels.** The POS grid shows "35 left" per product and
`d45452b` added a guard preventing a cashier adding more to the cart than the
stock on hand. Offline, that number is a snapshot that gets staler with every
sale, and two tills offline at once cannot see each other's deductions. The
backend deducts ingredients by FIFO lot on sync (`TransactionService.cs:122-137`)
and **throws `Insufficient ingredient` if the stock has gone**. A queued offline
sale can therefore be rejected at sync time, after the customer has paid and
walked out. That is open question **Q3** and it is the one the board most needs
to answer, because it is the only place in this spec where offline operation can
lose money rather than merely inconvenience someone.

### Also needs a decision: who can even open the till offline

Login is server-only (`auth.service.ts:28-41`); there is no offline
authentication path and there should not be one. The session survives offline
because `checkStoredToken()` validates expiry locally against `auth_expires`.
But:

- Tokens last **24 hours**, or **30 days** if "Remember me" is ticked
  (`AuthService.cs:66`).
- **Without "Remember me" the token is written to `sessionStorage`**
  (`auth.service.ts:214-216`), which the browser discards when it closes.

So even with a cached app shell, a till whose cashier did not tick "Remember me"
is locked out the first time the browser restarts offline — the app loads, and
shows a login form that cannot submit. Any offline capability therefore depends
on a token policy. That is **Q4**.

---

## 4. What actually has to be cached — measured

Measured against the synthetic catalogue on 2026-10-17, uncompressed UTF-8
bytes, via `.perf-harness/offline-payload-probe.ps1`.

| Payload | Endpoint | Bytes | Rows | Time | Needed to sell? |
| --- | --- | ---: | ---: | ---: | --- |
| Product catalogue | `GET /api/products?page=1&pageSize=100` | **12,197** | 40 | 94 ms | **yes** |
| Categories | `GET /api/products/categories` | **34** | 3 | 126 ms | **yes** |
| Page settings | `GET /api/settings/pages` | **601** | 8 | 94 ms | **yes** |
| **Tier-1 total** | | **12,832 B = 12.5 KB** | | | |
| Recipes, all products | `GET /api/recipes/product/{id}` **× 40** | 16,488 | 152 lines | **28,081 ms** | no (see below) |
| Ingredients | `GET /api/ingredients` | 20,085 | 60 | 46 ms | no |
| Expense categories | `GET /api/expense-categories` | 503 | 8 | 139 ms | no |
| **Everything above** | | **49,908 B = 48.7 KB** | | | |

And the application itself, from a real production build:

| | Raw | Gzipped |
| --- | ---: | ---: |
| App shell — the 6 files `ngsw.json` prefetches | 1,712,799 B (1.63 MB) | **414,625 B — 405 KB** |
| `assets/` (icons, logo, screenshots), lazy | 1,049,005 B over 11 files | — |
| Whole build output | 2,889,419 B over 22 files | — |

**Recipes are not needed to sell.** The till does not compute ingredient
consumption; the backend does that on sync. They are listed because the brief
asked, and because measuring them turned up a defect worth fixing anyway:
**there is no bulk recipe endpoint.** `RecipesController` exposes only
`GET /api/recipes/product/{productId}` (`:20`), so caching every recipe means 40
sequential round trips taking **28.1 seconds** for 16 KB of data. If recipes are
ever needed client-side, add a bulk endpoint first — **R8**.

### The one number here that could be wrong, and by a lot

**The 12,197-byte catalogue figure assumes products have no images.** Product
images are stored base64-inline in the `Products.Image` column (`5fd5bf8`),
which is `MEDIUMTEXT`, and `ProductsController` accepts up to **5 MB of raw
image data per product** (`:127-129`) — roughly 6.7 MB of base64. The synthetic
catalogue has a maximum `Image` length of **4 bytes**, so these measurements
exclude images entirely.

`GET /api/products` returns the `Image` field inline. With real photography the
catalogue payload is not 12 KB; at a modest 200 KB per product across 40
products it is **~10.7 MB** — more than twice what `localStorage` will accept,
before anything else is stored. **This is the single strongest argument in the
document for not using `localStorage`**, and it is also open question **Q2**:
somebody needs to measure the client's real catalogue.

---

## 5. The storage substrate

Measured in real Chrome on the app's own origin
(`.perf-harness/storage-substrate-probe.js`).

| | `localStorage` (today) | IndexedDB (proposed) |
| --- | --- | --- |
| Accepted before refusing | **4,864 KB — 4.75 MB**, then `QuotaExceededError` | **50 MB accepted, no error** |
| Origin quota (`navigator.storage.estimate()`) | not available to it | **10,240 MB** |
| API | **synchronous — blocks the cashier's UI** | asynchronous |
| Write cost, 1 MB | 3.4 ms blocking | 1.7 ms off-thread |
| Write cost, 3 MB | 10.1 ms blocking | 7.7 ms off-thread |
| Write cost, 50 MB | impossible | 88.6 ms off-thread |
| Values | strings only — everything is `JSON.stringify`d | structured clone; **Blobs**, so images need no base64 |
| Eviction | silent on quota | quota errors are catchable per transaction |

**Recommendation: IndexedDB, for three reasons, in order of importance.**

1. **Capacity.** 4.75 MB is not a budget, it is a cliff, and §4 shows the
   product catalogue alone can exceed it once images are real. IndexedDB took a
   50 MB record on this origin without complaint against a 10 GB quota.
2. **It is synchronous.** `localStorage` blocks the main thread. SWI-6 measured
   the pathological case — a ~48.8 MB `JSON.stringify` froze the tab for minutes,
   to the point that DevTools could not evaluate against the page. On a till,
   main-thread blocking is the cashier's screen not responding to a tap.
3. **Blobs.** Product images can be stored as binary rather than base64, which
   removes the ~33 % base64 overhead and the string-conversion cost entirely.

**But note what `localStorage` is not guilty of.** The swallowed failure at
`transaction.service.ts:508-514` is an empty `catch`, not a storage-engine
problem. IndexedDB would have rejected that write too — just asynchronously, and
just as silently if the rejection were ignored. SWI-11 has already fixed the
swallowing (`c01de58`). **Moving to IndexedDB without that fix would reproduce
the same bug on a different engine.** Sequencing, §9.

### Migration path for what is already persisted

Complete inventory of the app's browser-storage keys, all currently in
`localStorage` unless noted:

| Key | Owner | Recommendation |
| --- | --- | --- |
| `auth_token`, `auth_user`, `auth_expires` | `auth.service.ts` (**`sessionStorage`** unless "Remember me") | **Leave in `localStorage`/`sessionStorage`.** Synchronous reads at bootstrap and in the HTTP interceptor; moving a credential to an async store means the interceptor must await a database. Not worth it, and it is ~1 KB. Decide the policy instead (**Q4**). |
| `pos_cart`, `pos_open_orders` | `cart.service.ts:12,16` | Move. An open order with many lines is unbounded in principle and it is the one thing a cashier cannot re-key from memory. |
| `pendingTransactions` | `transaction.service.ts:502` | **Move first.** This is unsynced money. It is the only key whose loss costs the shop revenue. |
| `transactions` | `transaction.service.ts:474` | **Delete.** §8. |
| `dailyReport` | `transaction.service.ts:198` | Move or delete with the reports decision. |
| `products`, `categories` | `product.service.ts:260,282` | Move — this is the Tier-1 cache and the one that grows with images. |
| `checkout_form_data` | `checkout-sidebar.component.ts:505` | Leave. Small, transient. |
| `receiptNumberData` | `receipt-number.service.ts:7` | Leave, but see **Q5** — offline receipt numbering is a correctness question, not a storage one. |
| `theme`, `pwa-install-prompt-shown` | `app.component.ts:145`, `pwa-install.component.ts:206` | Leave. Preferences. |
| `mobilePrintMethod`, `thermalPrinterName`, `thermalPrinterType` | `thermal-printer.service.ts` | Leave. Device settings, tiny. |

The rule that falls out: **anything that is money or that grows without bound
goes to IndexedDB; everything else stays where it is.** A wholesale migration is
not justified and would touch the authentication path for no benefit.

---

## 6. The service worker

### What were the "cache issues"? The record does not exist.

`main.ts:29-34` reads:

```ts
// TEMPORARILY DISABLED FOR TESTING - Service worker causing cache issues
// TODO: Re-enable once cache issues are resolved
ServiceWorkerModule.register('ngsw-worker.js', {
  enabled: false, // Temporarily disabled: !isDevMode(),
```

Searched exhaustively:

- Exactly **two** commits have ever touched `frontend/src/main.ts`: `7a347fa`
  (initial commit, 2026-02-09) and `a715bcd` (a structural refactor).
- The comment and `enabled: false` are present **in `7a347fa` itself**. The
  repository's history begins with the service worker already off.
- No commit message across all 89 commits on `main` describes a service-worker
  or cache problem. No document under `docs/` does either.

**The honest answer is that the cause was never written down, and this repository
does not contain it.** The board should ask whoever ran the original deployment
whether they remember; absent that, the issues must be treated as unknown and
re-enablement must be gated on evidence rather than on a theory about history.

### What re-enabling requires

The artefacts already ship. `angular.json` sets `serviceWorker: true` and
`ngswConfigPath` at the **options** level, so every production build already
emits `ngsw-worker.js` (83,353 B) and `ngsw.json` (3,911 B). Both were also
present in the `wwwroot` the local backend was serving from, i.e. they survive
the deployment pipeline as well as the build. Only the registration is off; the
client-side change is one line. *(Not checked against the live Railway
deployment — this sandbox has no network access to it.)*

**The configuration, however, is substantially broken**, and re-enabling it
unchanged is the likeliest way to recreate whatever happened the first time.

**SW1 — two of the three API cache rules are dead.** `ngsw-config.json`
declares `api-cache` (`/api/**`), then `api-performance`
(`/api/products`, `/api/categories`, `/api/transactions`) and then `api-offline`
(`/api/products`, `/api/categories`). Angular's worker selects the **first**
matching data group and stops: in the shipped `ngsw-worker.js`,
`this.dataGroups.reduce(...)` returns as soon as a group yields a non-null
response. `api-cache` matches `\/api\/.*`, which is everything. **`api-performance`
and `api-offline` can never handle a request.** Every API call would be served by
`api-cache` — freshness, 1-hour age, 100 entries — including the two groups'
intended 6-hour and 24-hour offline rules. The config expresses an intent that
the worker will not carry out.

**SW2 — `/api/health` would be cached, and that breaks offline detection.**
`OfflineService` decides whether the till is online by `GET`ting `/api/health`
every 30 seconds (`offline.service.ts:11,41`). That URL is matched by
`api-cache`, which caches `GET` responses for an hour. Offline, the worker can
serve a stale `200 {"status":"online"}` from cache, and the till will conclude it
is **online while it is offline**. Given there is no offline indicator anyway
(§2) the visible symptom is small today, but it makes the one signal the app has
about its own connectivity untrustworthy. `/api/health` must be excluded from
service-worker caching, or given `ngsw-bypass`.

**SW3 — what re-enabling does *not* break.** Worth stating because it is the
obvious fear. A `POST` while offline still fails to the network: `DataGroup`'s
`handleFetch` sends any non-`GET`/`HEAD` method straight to `safeFetch`, and the
rejection propagates rather than becoming a synthetic `504`. So the offline-sale
branch in `transaction.service.ts:98` — which keys on `!error.status ||
error.status === 0` — still fires. **Enabling the worker does not break offline
sales.** This was read out of the shipped `ngsw-worker.js`, not assumed, but it
should still be covered by a test (**R4**).

**SW4 — the icon font is cross-origin and cached by nobody.**
`index.html:10-11` loads Roboto and **Material Icons** from
`fonts.googleapis.com`. Neither asset group in `ngsw-config.json` covers another
origin — `assets` matches `/assets/**` and same-origin font extensions only. So
even with a perfect service worker, Material Icons cannot load offline, and the
UI renders ligature text (`shopping_cart`, `delete`) where icons should be.
*This is reasoned from the config and `index.html`, not measured: this sandbox
blocks `fonts.googleapis.com`, so the online case could not be contrasted
against the offline one.* The remedy is to self-host both fonts — **R5**.

**SW5 — the update path needs a deliberate decision.**
`navigationRequestStrategy: "performance"` serves navigations from cache without
consulting the network. Combined with `registrationStrategy: 'registerImmediately'`
that is the standard recipe for "the shop is running yesterday's build and a
reload does not help". The deployment already returns **404** rather than
`index.html` for a missing hashed asset (§1), which removes the worst version of
this, and Angular's worker recovers from a hash mismatch by reloading its
manifest. But the app needs an explicit update story — `SwUpdate.versionUpdates`
and a visible "new version, reload" prompt — before the worker goes on, not
after. The vestigial `checkBuildVersion()` (§2) should be deleted or completed,
not left as it is.

---

## 7. The sync contract

### 7.1 Sale-time preservation

The frontend sends `timestamp` on create (`transaction.service.ts:51`). The
backend discards it — **twice**:

- `TransactionService.cs:158` — `transaction.Timestamp = DateTime.UtcNow;`
- `TransactionRepository.AddAsync` — `transaction.Timestamp = DateTime.UtcNow;`
  again, immediately before `SaveChangesAsync`.

A sale rung up at 14:05 and synced at 18:40 is therefore booked at 18:40. Every
daily report, Z-reading and hourly breakdown is wrong for any day the shop traded
offline, and the error is invisible — the figures look perfectly plausible. A
failing test pins this today (left deliberately for this spec, per the brief).

**Any fix must change both sites.** A fix that only changes
`TransactionService.cs:158` will be silently undone by the repository.

**Proposed contract change.** Add an explicit, optional, client-supplied
`occurredAt` to the create payload — *not* a reuse of `Timestamp`:

- When absent (every online sale, today's behaviour): the server stamps
  `DateTime.UtcNow`. Unchanged.
- When present: the server uses it as `Timestamp`, after validating it is **not
  in the future** and **not more than N days in the past** (N from config,
  suggest 7). Outside that window: reject with 400 rather than silently clamp —
  a till with a wrong clock should be a loud failure, not a quiet one.
- Record the sync time separately so the two are distinguishable. The
  `Transactions` table has no such column today; this needs a migration.

Two notes for whoever implements it. `TransactionsController.CreateTransaction`
binds the **domain model** directly (`[FromBody] Transaction`), so `Timestamp` —
and `Id` — are already bindable from JSON; a DTO with an explicit contract is
the better shape. And SWI-6 found `Transactions` has **no index on `Timestamp`**;
back-dating inserts makes that worse, so **R1 of the SWI-6 spec should land
first**.

### 7.2 Duplicate protection

**There is no idempotency key, and the current design cannot produce one.**

- `Transaction.Id` is an `int` identity assigned by MySQL. The client never
  supplies it.
- The offline id is `Date.now()` (`transaction.service.ts:132`) — a local
  display handle only. It is never sent. SWI-11's own code comment notes it is
  not even locally unique: two sales in the same millisecond collide.

The exposure is specific and real. After SWI-11 (`c01de58`), a queued sale is
removed from the queue only when its `POST` returns successfully, and stays
queued on any error. That is correct for a request that never reached the server
— and **wrong for a request that reached it, committed, and whose response was
lost**. The till retries; the shop books the sale twice; the ingredients are
deducted twice. Flaky connectivity is exactly the condition under which the
offline queue is used at all, so this is not a remote scenario.

**Proposed.** The client mints a UUID per sale at the moment it is rung up —
online or offline, so there is one code path — and sends it as `clientSaleId`.
The server stores it in a new column with a **`UNIQUE` index**. On insert:

- No existing row → create, return 201.
- Existing row with that `clientSaleId` → **return the existing transaction with
  200**, do not create, do not deduct stock again.

A unique index rather than a read-then-write check, so two concurrent retries
cannot both pass. The duplicate-insert violation must be caught and converted to
the 200 path inside the existing transaction scope in
`TransactionService.CreateTransactionAsync`.

This is a migration plus a contract change, which is why it belongs in a spec
rather than in SWI-11.

### 7.3 Out of scope here, flagged

Two tills offline simultaneously both deduct from the same FIFO lots on sync.
Nothing in this spec makes that safe; see **Q3**.

---

## 8. What replaces the 48.8 MB download

`TransactionService`'s constructor calls `loadTransactions()`
(`transaction.service.ts:22` → `:459`), an unbounded `GET /api/transactions`.
SWI-6 measured it at **48.81 MB / 223 s**, mirrored into a ~4.75 MB store that
cannot hold it, with the failure swallowed. It is `providedIn: 'root'`, so it
fires on every page, for every role, including the till.

**The till needs none of it.** Selling requires the catalogue (12.5 KB), not the
history. The replacement for the till is: *nothing*. Delete the call.

**One consumer survives, and it is on the reports page.** After `edf2105`
merged, the only remaining reader of that array is
`reports.component.ts:677` — `getRecentTransactions(50)` — which populates the
"Recent Transactions" card. The headline KPIs no longer touch it.

Measured replacement for that card:

| | Payload | Time | Rows |
| --- | ---: | ---: | ---: |
| `GET /api/transactions` (today) | **48.81 MB** | **223,329 ms** | 64,662 |
| `GET /api/transactions/date/{today}` | **151,623 B — 148.1 KB** | **385 ms** | 188 |

**338× smaller and 580× faster**, and the endpoint already exists
(`TransactionsController:102`). The card should fetch it on demand when the
reports page opens, not have it pushed into an app-wide service at startup.

Recommended shape:

- Delete `loadTransactions()` from the constructor and the `transactions`
  `localStorage` mirror with it.
- Reports fetches `GET /api/transactions/date/{date}` (or `/range`) for the
  selected period, scoped to the card that needs it.
- Cap the unbounded `GET /api/transactions` at the controller so it cannot be
  reached again by accident — SWI-6's **R3**.
- The till's `transactionsSubject` keeps only what the device itself rang up:
  the pending queue plus confirmed sales from this session. That is what
  `generateOfflineDailyReport()` (`:372`) actually wants — an offline Z-reading
  for *this till*, which is both correct and achievable, where "today's takings
  across the shop" is not.

---

## 9. Sequencing — what must land before a bootstrap change ships

**The brief's stated constraint is already met.** `fix/reports-today-revenue-kpi`
(`edf2105`) is an ancestor of `main` (merge `f297358`, confirmed with
`git merge-base --is-ancestor`). The Today KPI getters now read
`salesReportData` unconditionally and no longer sum `recentTransactions`. The
race the brief warns about — a fast bootstrap flipping a latent miscount into an
active one — **cannot occur on `main` today.** Any plan written around that
constraint should be updated.

Three sequencing requirements remain, and the first is a direct descendant of
the same bug.

**SEQ-1 — removing the download empties the Recent Transactions card, silently.**
`reports.component.ts:677` reads a `BehaviorSubject` seeded `[]`. Delete the
bootstrap fetch and it stays `[]` forever: `recentTransactions = []`, and the
template renders its genuine empty state, **"No transactions"**
(`reports.component.html:348`). On a trading day. With no error.

This is the same failure *shape* the KPI bug had — a plausible, wrong,
uninstrumented answer on the Owner's page — relocated one card down. It is
milder, because an empty list reads as suspicious where a wrong peso figure does
not, and because the page does not flip to a global empty state (`:1087` still
sees a non-zero backend transaction count). It is not milder enough to ship
blind.

**Therefore: the on-demand fetch (§8) must land in the same change as the
removal of the bootstrap download, not after it.** Not a footnote — the two are
one piece of work, and splitting them puts a wrong screen in front of the Owner
for however long the gap is.

**SEQ-2 — SWI-11 must merge before anything touches the storage substrate.**
`fix/offline-sync-data-loss` (`c01de58`) is **one commit ahead of `main` and not
merged**. It fixes the dropped service fee, the queue that emptied before
confirmation, and the swallowed `localStorage` failures. Migrating the queue to
IndexedDB (§5) on top of the current code would rebuild the same swallowed-error
bug on a new engine and make SWI-11 un-mergeable by conflict.

**SEQ-3 — SWI-6's `R1` (index `Transactions.Timestamp`) before back-dating.**
§7.1 inserts rows out of timestamp order into a table with no index on
`Timestamp`. Do the index first.

---

## 10. Arithmetic guard

The board's instruction — *"Leave the arithmetic alone entirely for now"* —
stands, and **nothing proposed in this document changes a discount, service-fee
or VAT expression.** Specifically:

- §7.1 changes *which timestamp* is stored, not any monetary value.
- §7.2 adds an idempotency key and a unique index. Its purpose is to stop a
  total being counted twice; it does not compute one.
- §8 changes *where* transaction rows are fetched from.
- §5 changes *where bytes are stored*.

One observation, recorded and **not** proposed as a change: **`serviceFee` is
hard-coded to `0`** in the checkout component (`checkout-sidebar.component.ts:471,
579, 599, 665`) and there are no other writes to it anywhere in the frontend. The
brief's "fee configuration" does not exist as server-side config; there is
nothing to cache. SWI-11's fix for the fee dropped on sync is still correct and
still necessary — it protects the value for when a fee is configured — but a
reader should not expect to find a fee-configuration endpoint, because there
isn't one. Whether there *should* be is **Q6**, and it is a product question.

---

## 11. Proposed changes, each with one pass/fail criterion

| # | Change | Pass/fail criterion |
| --- | --- | --- |
| **R1** | Re-enable the service worker in `main.ts` for production builds only. **Gated on R2 and R3.** | With the app loaded once online and then taken offline, a reload renders the POS screen. The probe in §12 reports `hasAppRoot: true` and `swControlled: true` at step 5, where it reports `chrome-error://chromewebdata/` today. |
| **R2** | Collapse `ngsw-config.json` to data groups that can actually match (**SW1**), and exclude `/api/health` (**SW2**). | In the generated `ngsw.json`, no data-group pattern is fully shadowed by an earlier one, and no group's patterns match `/api/health`. A unit check over `ngsw.json` asserts both. |
| **R3** | Add an explicit update flow — `SwUpdate.versionUpdates`, a visible reload prompt — and delete or complete `checkBuildVersion()` (**SW5**). | Deploying a new build while a client is open surfaces a prompt; accepting it loads the new build. No orphaned `registration.update()` call remains. |
| **R4** | Regression test: a sale rung up offline is still queued with the worker **enabled** (**SW3**). | With the service worker active and the network offline, `createTransaction` results in exactly one entry in the pending queue and no thrown error to the component. |
| **R5** | Self-host Roboto and Material Icons; drop the `fonts.googleapis.com` links (**SW4**). | `index.html` references no external origin, and offline the POS screen renders icon glyphs rather than ligature text. |
| **R6** | Add a visible offline indicator, bound to `OfflineService.isOnline$`, and a queued-sale count. | Offline, the till shows an unambiguous offline state and the number of unsynced sales; online it shows neither. |
| **R7** | Skip the backend print attempt when `OfflineService` reports offline (§3). | Offline, printing a receipt issues **zero** requests to `/api/print/receipt` and reaches the local path immediately. |
| **R8** | Add a bulk recipe endpoint (§4). | One request returns every product's recipe lines; caching all recipes takes ≤ 500 ms, against 28,081 ms over 40 calls today. |
| **R9** | Move `pendingTransactions`, `pos_cart`, `pos_open_orders`, `products`, `categories` to IndexedDB behind one small storage service. **Gated on SEQ-2.** | Each key is written to and read from IndexedDB; a write failure is surfaced, not swallowed; a payload of 10 MB is stored successfully where `localStorage` raises `QuotaExceededError` at 4.75 MB. |
| **R10** | Delete the bootstrap `loadTransactions()` call and the `transactions` mirror; fetch the Recent Transactions card on demand. **Must ship with R11 — SEQ-1.** | Loading `/pos` issues **zero** `GET /api/transactions`; `/reports` issues exactly one `GET /api/transactions/date/{date}`; total till startup API payload ≤ 64 KB. |
| **R11** | Point `reports.component.ts:677` at the bounded endpoint (**SEQ-1**). | With 188 seeded transactions today, the Recent Transactions card shows the same rows it shows on `main` — asserted by a test that fails if the card is empty. |
| **R12** | Cap the unbounded `GET /api/transactions` at the controller. | A request with no filter returns at most one page (≤ 200 rows) and responds in ≤ 500 ms at the seeded volume. |
| **R13** | Preserve sale time: optional `occurredAt`, honoured at **both** stamping sites, validated, with sync time recorded separately (§7.1). **Gated on SEQ-3.** | The pinned failing test passes: a sale created with `occurredAt` of yesterday 14:05 is stored at yesterday 14:05 and appears in yesterday's daily report. An `occurredAt` in the future returns 400. A create **without** `occurredAt` is stamped `UtcNow` exactly as today. |
| **R14** | Idempotency: client-minted `clientSaleId`, `UNIQUE` column, retry returns the existing sale (§7.2). | Posting the same `clientSaleId` twice creates **one** `Transactions` row, deducts stock once, and returns the same transaction both times with 200 on the second. Concurrent duplicate posts also yield one row. |
| **R15** | Decide and implement offline stock behaviour (**Q3**). | Per the board's answer to Q3. Not specifiable by engineering. |

---

## 12. Task breakdown

Sized so an engineer can pick one up without re-reading this document.

### Wave 0 — unblock (do first)

- **W1. Merge SWI-11** (`fix/offline-sync-data-loss`, `c01de58`). **SEQ-2.**
  Nothing else in this spec should start first.

### Wave 1 — make the till survive a reload (the actual requirement)

- **W2. Fix `ngsw-config.json`.** R2. Config and a check over the generated
  `ngsw.json`. No runtime behaviour changes until W4.
- **W3. Self-host the fonts.** R5. Independent of everything else; also removes
  the build's dependency on reaching Google at build time, which is how this
  task's first production build failed.
- **W4. Re-enable the service worker, with an update flow.** R1 + R3 + R4.
  **Do not start before W2.** This is the change that makes the till an offline
  till; it is also the riskiest change in the document, because the reason it
  was turned off was never recorded (§6). Stage it: a build with the worker on,
  verified against §12's probe, before it reaches the shop.
- **W5. Offline indicator and queued-sale count.** R6. Small, and it is what
  lets the shop *trust* the rest of this work.

### Wave 2 — stop the 48.8 MB download

- **W6. Remove the bootstrap download; fetch Recent Transactions on demand.**
  R10 + R11 + R12. **One commit — SEQ-1.** Biggest single performance win
  available, and it was already SWI-6's W3.

### Wave 3 — storage substrate

- **W7. IndexedDB storage service, and migrate the five keys.** R9. After W1.
  Leave the auth keys alone (§5).

### Wave 4 — the sync contract (needs a migration and a contract change)

- **W8. Index `Transactions.Timestamp`** — SWI-6 R1. **SEQ-3.**
- **W9. Sale-time preservation.** R13. After W8. Turns the pinned failing test
  green.
- **W10. Idempotency key.** R14. Migration + unique index + controller/service
  change.

### Wave 5 — blocked on the board

- **W11. Offline stock policy.** R15. Blocked on **Q3**.
- **W12. Token policy for tills.** Blocked on **Q4**.

**Suggested order:** W1 → (W2, W3, W5 in parallel) → W4 → W6 → W7 →
W8 → W9 → W10. W11 and W12 whenever the board answers.

**If the board wants the smallest change that honours "the till must keep
working offline", it is W2 + W4 + W5.** That is the service-worker config, the
one-line registration, and an offline indicator. Everything else in this
document improves the till; only those three make it start.

---

## 13. Open questions for the board

Phrased so they can be answered without reading any code.

- **Q1 — When the shop is offline, which of these must still work, and which
  can wait until the connection is back?** Our recommendation: *selling, pricing,
  discounts, taking cash and printing receipts must work; reports, inventory,
  expenses and settings can wait.* Please confirm or correct. Good news on the
  hardest part: **a receipt can be printed with no internet**, so you are not
  being asked to choose between selling and printing.

- **Q2 — Do your products have photographs attached, and roughly how large are
  they?** This is the one question that changes the engineering. Without photos
  the whole catalogue is 12 KB and fits anywhere. With photos it can be 10 MB or
  more, which does not fit in the browser storage the app uses today and forces
  a bigger change. If you can send us an export of the live product list, we can
  measure it rather than guess.

- **Q3 — If two sales are rung up offline and there is only enough stock for
  one, what should happen?** Today, when the connection returns, the second sale
  is **rejected** — after the customer has paid and left. The options are: (a)
  accept it anyway and let stock go negative, flagged for the owner to correct;
  (b) hold it for manual review; (c) stop a cashier selling an item offline once
  the last known stock reaches zero. **This is the only place where working
  offline can actually lose you money, so it is the most important question
  here.**

- **Q4 — Should a till stay signed in indefinitely?** At present a cashier who
  does not tick "Remember me" is signed out when the browser closes, and
  **cannot sign back in while offline** — the till would be unusable until the
  connection returns. The alternative is that tills stay signed in for a long
  period (30 days today), which is more convenient and less secure if a device
  is lost. How long do you want, and should "Remember me" be forced on for
  shop tills?

- **Q5 — What receipt number should an offline sale carry?** Receipt numbers are
  currently generated on the device. Two tills offline at once will generate the
  same numbers. If your bookkeeper or BIR filing needs receipt numbers to be
  unique and unbroken, tell us and we will design for it; if they are only a
  customer convenience, we will leave it alone.

- **Q6 — Should there be a service fee at all?** We found the service fee is
  fixed at zero everywhere in the app, with no way to configure one. We have
  changed nothing. If you expect to charge a dine-in service fee, that is a
  separate piece of work and we should scope it deliberately.

- **Q7 — Does anyone remember what went wrong with offline mode the first
  time?** The code says offline support was switched off because it was "causing
  cache issues", but no record of what those issues were exists anywhere in the
  project. If whoever set the system up remembers — the shop seeing an old
  version, the app not updating, a blank screen after a deploy — that would tell
  us precisely what to guard against. **Without it we will re-enable it carefully
  and stage the rollout, which is slower.**

---

## 14. Reproducing these numbers

Added to the existing `.perf-harness/` (SWI-6), on branch `spec/offline-mode`.
All three are throwaway measurement scripts; none is application code.

| Claim | Reproduce with |
| --- | --- |
| Offline reload shows no app (§2) | `node offline-reload-probe.js --base http://127.0.0.1:4399` |
| Payload sizes, Tier-1 total, recipe round trips (§4) | `powershell -File offline-payload-probe.ps1` |
| `localStorage` 4.75 MB ceiling; IndexedDB at 50 MB (§5) | `node storage-substrate-probe.js` |
| App shell 405 KB gzipped (§4) | `ng build --configuration production`, then size the six files listed in the generated `ngsw.json` `assetGroups[0]` |
| Data-group shadowing (**SW1**) | Read `dataGroups` in the generated `ngsw.json`; `api-cache`'s pattern `\/api\/.*` precedes and subsumes the other two |
| `/api/transactions/date/{today}` at 148.1 KB / 385 ms (§8) | `offline-payload-probe.ps1`, or curl it against the perf API |
| SPA fallback 404s a missing asset (§1) | `GET http://127.0.0.1:5099/main.deadbeef.js` → 404 |

Serve a production build single-origin with
`node offline-serve.js --root <dist> --port 4399 --api 127.0.0.1:5099`.
Backend and Chrome come up with the existing `run-api.ps1` and `run-chrome.ps1`.

Two notes for whoever reproduces this:

- The production build **fails in a sandbox without internet access**, because
  Angular inlines Google Fonts at build time
  (`Inlining of fonts failed … ECONNRESET`). The measurement here was taken with
  font inlining disabled via a temporary edit to `angular.json`, which was
  reverted; `git status` on `frontend/angular.json` is clean. **R5 removes this
  problem permanently.**
- `GET /api/transactions` is deliberately **not** re-measured by
  `offline-payload-probe.ps1`. SWI-6 measured it at 48.81 MB / 223 s, the brief
  says not to re-derive it, and `ConvertFrom-Json` over 48 MB in Windows
  PowerShell takes longer than the request does.
