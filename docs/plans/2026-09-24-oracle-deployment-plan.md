# Oracle Cloud Deployment — Execution Plan

**Runbook:** `docs/DEPLOYMENT.md` §0, §B, §M — this plan sequences that runbook, it does not restate it.
**Goal:** move QuickServe POS from Railway to Oracle Cloud Always Free, with Railway live as rollback throughout.
**Assumption:** Railway is currently the live deploy and holds the real product/ingredient data. If Railway
was never deployed, skip Phase 4 entirely and let the app create a fresh schema on first boot.

Each phase ends in a **gate**. A gate is a thing you verify, not a thing you do — if it fails, stop and fix
before continuing, because every later phase assumes it passed.

---

## Findings that change the runbook

Five things surfaced while checking `docs/DEPLOYMENT.md` against the repo and against Oracle's current docs.
Two are gaps in §B, one is a doc correction, two are clearances.

### F1 — §B.4 never opens port 3306 to HeatWave (gap, blocking)

§B.4 opens TCP 80 and 443 for inbound web traffic. It never opens **3306 from the VM to the HeatWave
private subnet**, and OCI does **not** create that rule when the DB system is provisioned — it must be added
to the private subnet's security list (or an NSG) by hand.

This matters more than its size suggests. The failure mode is a container that boots cleanly, passes its own
startup, and then times out on the first query — which looks identical to a wrong password or a wrong private
IP. Budget an hour of misdiagnosis if this is missed. It is folded into the plan as Step 2.3.

### F2 — HeatWave Always Free keeps backups for 1 day, not configurable (gap, not blocking)

The §"Side by side" table lists Oracle's DB backups as "Managed (50 GB)", level with Railway's "Managed".
The 50 GB is the storage allocation, not the retention. Always Free DB systems take an automatic daily
backup with a **1-day retention that cannot be changed or disabled**.

For a system holding a store's books, a 24-hour window means a Tuesday mistake noticed on Thursday is
unrecoverable. This does not block the migration, but it should not be discovered later — Phase 6 adds an
off-box dump.

### F3 — §B.3's "full 12 GB" is correct, and it is newly correct

Worth recording because it reads like a typo against most Oracle guides written before mid-2026: the Always
Free A1 allotment was **halved on 2026-06-15**, from 4 OCPU / 24 GB to **2 OCPU / 12 GB**. §B.3's figure is
current — don't "correct" it against an older guide.

This changes nothing about §B.3's sizing argument. Reclamation is assessed on **the instance's own
utilization**, not on what fraction of your tenancy allotment it uses: a 2 GB instance running a ~600 MB app
sits at 25–35% memory regardless of whether the allotment is 12 GB or 24 GB. Take 1 OCPU / 2 GB for exactly
the reason §B.3 gives.

One knock-on: PAYG accounts are reported to retain the old 4 OCPU / 24 GB, which is a second reason to
consider the PAYG lever in §B.7 (Step 6.3).

### F4 — arm64 `npm ci` risk: cleared

The concern was that `frontend/package-lock.json` was generated on Windows and might record only the host
platform's native binaries, which would break `npm ci` inside an arm64 build. Checked directly — it records
every platform:

| Package | linux-arm64 entry present |
| --- | --- |
| `@esbuild/linux-arm64` | yes |
| `@rollup/rollup-linux-arm64-gnu` | yes (all 22 rollup variants present) |
| `@napi-rs/nice-linux-arm64-gnu` | yes |
| `@parcel/watcher-linux-arm64-glibc` | yes |
| `@msgpackr-extract/msgpackr-extract-linux-arm64` | yes |

The `Dockerfile` is also already architecture-agnostic: the `mcr.microsoft.com/dotnet` images are multi-arch,
NodeSource ships arm64, and `dotnet publish` without `-r` emits portable IL. **No Dockerfile change is
predicted.** Phase 1 still builds once for arm64 to confirm it empirically — cheap, and it is the only
assumption in this plan that nothing else can compensate for.

### F5 — three files in the runbook do not exist in the repo

`.github/workflows/deploy.yml`, `docker-compose.yml`, and `Caddyfile` appear as code blocks in §B.5 and §B.6.
There is no `.github/` directory at all. They are specified in Phase 1 and Phase 3 with target paths; see
**Open question** at the end.

---

## Phase 0 — Decide and harden (no Oracle account needed yet)

Do this first because §M.1's hardening travels *into* Oracle with the data. Doing it after the dump means
doing it twice.

### Step 0.1 — Confirm the no-freeze-window assumption

§M's claim that there is no cutover freeze rests on the database having no sales transactions. Confirm it is
still true against **Railway**, using the public connection string from Railway → MySQL service → Connect
(`MYSQL_PUBLIC_URL`) — the same source §M.2 dumps from:

```bash
mysql --host=<proxy-host> --port=<proxy-port> --user=root --password='<password>' \
  railway -e "SELECT COUNT(*) FROM Transactions;"
```

(`Transactions` is the right table name — confirmed against `PosSystemDbContext.cs:13`; the entity has no
`ToTable` override.)

**If non-zero:** this plan's Phase 4 changes shape — you need a freeze window between dump and cutover, or an
accept-writes-on-Railway-until-cutover approach. Stop and revisit before going further.

### Step 0.2 — Harden Railway (§0.1, §0.2 applied to the live deploy)

- Set `JWT_SECRET_KEY` in Railway → Variables — `openssl rand -base64 48`.
- Log in, change the `owner`, `admin`, and `employee` passwords.

Hashes live in the `Users` table, so the dump carries the corrected credentials to Oracle, and
`SeedData.InitializeUsersAsync` will not revert them (it only inserts absent usernames,
`SeedData.cs:122`).

> **GATE 0** — `JWT_SECRET_KEY` is set on Railway, all three seeded passwords are changed, and you have
> verified login still works with the new ones. Do not dump before this passes.

---

## Phase 1 — Prove the arm64 build before provisioning anything

The cheapest possible ordering: if the image cannot be built for arm64, you want to know now, not after an
OCI account, a VCN, a DB system and a VM exist.

### Step 1.1 — *(optional)* Local arm64 build

```bash
docker buildx build --platform linux/arm64 -t quickserve-pos:arm64-test .
```

**Skippable.** Step 1.2 builds arm64 natively on a GitHub runner, also before Phase 2, and is more
representative than this. Locally this runs under QEMU at roughly 3–5x — `npm ci` + `ng build` +
`dotnet publish` easily exceeds 30 minutes on your critical path for no signal Gate 1 doesn't already give
you. Worth it only if you'd rather fail fast without pushing a commit.

Either way: **expected to succeed unchanged**, per F4. If `npm ci` does fail on a missing optional native
binary, the fix is to regenerate the lock with `npm install --os=linux --cpu=arm64` — not to edit the
Dockerfile.

### Step 1.2 — Create the build workflow

**Files:** CREATE `.github/workflows/deploy.yml`

Per §B.6 — `ubuntu-24.04-arm` runner, push to `ghcr.io/nealsotes/lemon-pos:latest`. Native arm64 runner, so
no QEMU and no emulation penalty; GHCR is free for public repos.

Add one thing §B.6 omits: also tag with `${{ github.sha }}`, not only `:latest`. Without an immutable tag
there is no way to roll the container back to a known-good image — and on Oracle, unlike Railway, nothing
else keeps that history for you.

### Step 1.3 — Make the GHCR package public

After the first workflow run, GitHub → Packages → `lemon-pos` → Package settings → change visibility to
public. Otherwise `docker compose pull` on the VM needs a registry login, which §B.5's compose file does not
configure.

> **GATE 1** — a green Actions run, and `docker pull ghcr.io/nealsotes/lemon-pos:latest` succeeds from a
> machine that has never authenticated to GHCR.

---

## Phase 2 — Provision Oracle (console work)

Follow §B.1 → §B.4. Ordering and additions only:

### Step 2.1 — Account, home region Singapore (§B.1)

Irreversible. Always Free resources are pinned to the home region.

### Step 2.2 — HeatWave DB system, Always Free shape (§B.2)

Private subnet. **Record the private IP** — it is `MYSQLHOST` in Phase 3.

### Step 2.3 — Open 3306 on the private subnet ⚠️ *not in the runbook — see F1*

Private subnet → Security List → add ingress: **TCP 3306**, source = the **VM's subnet CIDR**
(e.g. `10.0.0.0/24`), not `0.0.0.0/0`. The DB has no public endpoint; scoping the source to the app subnet is
what keeps that true.

Add **33060** alongside it only if you later want MySQL X Protocol — the app does not use it.

### Step 2.4 — VM: `VM.Standard.A1.Flex`, Ubuntu 24.04 arm64, 1 OCPU / 2 GB (§B.3)

The small shape is deliberate anti-reclamation sizing. Read §B.3 before overriding it — bigger is worse here.

### Step 2.5 — Open 80/443, both layers (§B.4)

VCN security list **and** the instance firewall. Check `iptables -L INPUT --line-numbers` for the real
`REJECT` position rather than trusting index 6.

One caveat §B.4 does not mention: once Caddy runs as a **container** with published ports, its traffic
traverses Docker's `FORWARD`/`DOCKER` chains and largely bypasses `INPUT`. So the `INPUT` rules may not be
what actually admits your traffic, and `iptables -L` will not tell you whether the path works. Harmless to
add; just do not treat rule inspection as verification — Gate 3 uses an off-box request instead.

> **GATE 2** — from an SSH session on the VM:
> `nc -zv <heatwave-private-ip> 3306` connects. This is F1's gate; everything downstream misdiagnoses
> without it.

---

## Phase 3 — Deploy the stack

### Step 3.1 — Register the DuckDNS hostname (§B.5)

Point `yourshop.duckdns.org` at the VM's public IP. Do this *before* starting Caddy — Caddy attempts
certificate issuance on boot, and Let's Encrypt must already resolve the name. Repeated failures can hit rate
limits.

### Step 3.2 — Create the deploy files

**Files:**
- CREATE `deploy/oracle/docker-compose.yml` — from §B.5
- CREATE `deploy/oracle/Caddyfile` — from §B.5

Two changes to §B.5's compose block:

1. **Secrets do not belong in the file.** §B.5 inlines `MYSQLPASSWORD` and `JWT_SECRET_KEY`. Replace with
   `${MYSQLPASSWORD}` / `${JWT_SECRET_KEY}` and put real values in a `.env` beside the compose file,
   `chmod 600`. `lemon-pos` is a public repo — the same reasoning as §0.1. (No `.gitignore` change needed:
   the root file already ignores a bare `.env` at line 423, which matches at any depth.)
2. **Pin the image tag** to the SHA from Step 1.2 for deploys, keeping `:latest` only for convenience.

Optionally add a healthcheck against `/api/health` — but know what it buys. In plain `docker compose`, a
healthcheck only sets health *status*; `restart: always` fires on container **exit**, not on unhealthy, so an
app that is wedged-but-running is never restarted. The healthcheck is worth having for observability
(`docker ps` shows real state) and for `depends_on: condition: service_healthy`. If you actually want
restart-on-unhealthy, that needs an autoheal sidecar — decide deliberately rather than assuming the
healthcheck gives it to you.

### Step 3.3 — Get the files onto the VM and bring it up

The files from Step 3.2 live in the repo; `docker compose` runs on the VM. Close that gap explicitly —
clone the public repo, then create the `.env` (which is git-ignored, so it never arrives with the clone and
must be written by hand on the box):

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
git clone https://github.com/nealsotes/lemon-pos.git && cd lemon-pos/deploy/oracle

nano .env          # MYSQLPASSWORD=... and JWT_SECRET_KEY=... — same dir as docker-compose.yml
chmod 600 .env

docker compose pull && docker compose up -d
```

`docker compose` reads `.env` from its working directory automatically, so it must sit beside
`docker-compose.yml`, not at the repo root. To update later: `git pull && docker compose pull &&
docker compose up -d` — `.env` is untracked and survives the pull.

> **GATE 3** — `curl https://yourshop.duckdns.org/api/health` from **your laptop, not the VM**, returns
> healthy over HTTPS with a valid certificate. Off-box is the point: it exercises the VCN list, the host
> firewall, Docker's port publishing, and Caddy's certificate in one request.

At this gate the app is running against an **empty** database. Railway is still live and authoritative.

---

## Phase 4 — Migrate the data

Follow §M.2 → §M.4. Gate 0 has already covered §M.1.

### Step 4.1 — Dump from Railway (§M.2)

`--no-tablespaces` is required; Railway's user lacks `PROCESS`.

### Step 4.2 — Restore via the VM (§M.3)

HeatWave has no public endpoint, so `scp` the dump up and restore from the VM.

Watch the two database names: the **source** is Railway's (`railway` by default — confirm against Railway's
`MYSQL_DATABASE`) and the **target** must equal `MYSQLDATABASE` in your compose file (`quickserve`). A
mismatch yields a cleanly booting app with an empty product list — no error, just no data.

### Step 4.3 — Restart and verify (§M.4)

`EnsureCreatedAsync()` finds the tables present and skips creation; the idempotent patches then run
harmlessly. A restored database is a supported starting state.

> **GATE 4** — logged in with your **changed** password; product list, ingredients, and settings match
> Railway; `/menu` loads unauthenticated.

---

## Phase 5 — Cut over

Per §M.5:

1. Point staff and the counter PC at the DuckDNS URL.
2. Run both for several days. Railway stays up as rollback — there is no deadline.
3. Delete the Railway project only once you are confident.

**Printing check on day one.** Hosting does not change printing, but HTTPS does change *how* it connects, and
this is the first thing staff will notice if it breaks. Per §"After either deploy": QZ Tray on desktop is
forced onto its secure WebSocket (an HTTPS page cannot open `ws://`), so a failure there is QZ certificate
trust on the counter PC, not Oracle. Android Bluetooth printing needs HTTPS and now has it.

---

## Phase 6 — Post-cutover hardening

### Step 6.1 — Own your backups *(F2)*

1-day retention is not enough for a system of record. Add a nightly `mysqldump` from the VM to OCI Object
Storage (Always Free includes 20 GB) or off-cloud. Test a restore once — an untested backup is a belief, not
a backup.

### Step 6.2 — Check the reclamation margin after 7 days (§B.3)

OCI Monitoring → `MemoryUtilization`. It must sit **above 20%**. Below, the §B.3 mitigation has failed
silently and the first symptom is a terminated instance.

### Step 6.3 — Decide on Pay As You Go (§B.7, F3)

PAYG is the heavier lever against both reclamation and A1 capacity errors, and per F3 it is *reported* to
also restore the 4 OCPU / 24 GB allotment. Costs a card and a temporary hold; Always Free resources stay
free.

Both benefits are community consensus rather than written Oracle policy — §B.7 is careful to mark the
reclamation exemption that way, and the 4/24 restoration is the same class of claim. Treat neither as a
guarantee.

---

## Doc corrections to fold back into `DEPLOYMENT.md`

Not applied — listed so they are not lost:

1. **§B.4** — add the 3306 private-subnet ingress rule (F1).
2. **Side-by-side table** — change Oracle's "DB backups: Managed (50 GB)" to "Managed, **1-day retention**"
   (F2). As written it implies parity with Railway.
3. **§B.3** — note that 2 OCPU / 12 GB is the *current, halved* allotment as of 2026-06-15 (so the figure is
   not stale), and that PAYG is reported to restore 4 OCPU / 24 GB (F3). The sizing advice itself is
   unchanged.
4. **§B.6** — tag images with the commit SHA, not only `:latest`, so rollback is possible.
5. **§B.5** — move secrets out of the compose file into a git-ignored `.env`.

---

## Open question

Phases 1 and 3 call for three files that do not exist yet: `.github/workflows/deploy.yml`,
`deploy/oracle/docker-compose.yml`, and `deploy/oracle/Caddyfile`. This document is a plan, so they have been
specified rather than written. Say the word and I will create all three.

**Sources for F2/F3:**
[Oracle: Always Free resource reference](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) ·
[Oracle: MySQL HeatWave backups overview](https://docs.oracle.com/en-us/iaas/mysql-database/doc/overview-backups.html) ·
[Oracle blog: HeatWave Always Free](https://blogs.oracle.com/mysql/heatwave-mysql-always-free-tier) ·
[InfoQ: Oracle halves free-tier A1 limits](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
