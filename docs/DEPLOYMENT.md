# Deploying QuickServe POS

Two runbooks, side by side: **Railway** (~$8–12/mo, ~20 min) and **Oracle Cloud Always Free** ($0/mo, ~1–2 hrs).
Both assume no custom domain — each uses a free hostname with working HTTPS.

---

## 0. Security pre-flight — do this before either host

Two issues make this app unsafe to expose on the public internet as-is. `github.com/nealsotes/lemon-pos`
is a **public repository**, so both are readable by anyone.

### 0.1 The JWT signing key has a public fallback

`Program.cs:229` and `AuthService.cs:31` both fall back to a hardcoded key when no env var is set:

```
"YourSuperSecretKeyThatShouldBeAtLeast32CharactersLongForSecurity!"
```

If `JWT_SECRET_KEY` is unset the app starts anyway and signs tokens with that constant — anyone
who reads the repo can forge an Owner or Admin token. **Setting `JWT_SECRET_KEY` is mandatory, not optional.**

Generate one:

```bash
openssl rand -base64 48
```

### 0.2 Default users are seeded automatically

`SeedData.InitializeUsersAsync` runs on every startup (`Program.cs:734`) and creates:

| Username   | Password   | Role     |
| ---------- | ---------- | -------- |
| `owner`    | `admin123` | Owner    |
| `admin`    | `admin123` | Admin    |
| `employee` | `emp123`   | Employee |

These are in the public repo. Change all three passwords immediately after your first login,
before pointing anyone at the URL.

---

## What the app needs (identical on both hosts)

- **One Linux container** built from the repo-root `Dockerfile` (Angular + .NET in a single image).
  The .NET app serves the API *and* the SPA, so there is no separate frontend deploy.
- **Kestrel binds `0.0.0.0:$PORT`** (`Program.cs:269-270`), default `5001`.
- **An empty MySQL 8 database.** The schema creates itself on first boot — `Program.cs:401` calls
  `EnsureCreatedAsync()` followed by idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` patches.
  You do **not** run `dotnet ef database update` as part of deploying.
- **No persistent volume.** Product images are stored base64-inline in a `MEDIUMTEXT` column
  (`ProductsController.cs:121-135`), specifically so an ephemeral container filesystem is fine.
- **Health check:** `GET /api/health`.

### Environment variables

| Variable                 | Required | Notes                                                              |
| ------------------------ | -------- | ------------------------------------------------------------------ |
| `JWT_SECRET_KEY`         | **Yes**  | See §0.1. 32+ chars. Insecure public default if unset.              |
| `JWT_ISSUER`             | Yes      | Any stable string, e.g. `QuickServePOS`                             |
| `JWT_AUDIENCE`           | Yes      | Any stable string, e.g. `QuickServePOSUsers`                        |
| `ASPNETCORE_ENVIRONMENT` | Yes      | `Production`                                                        |
| `PORT`                   | Platform | Railway sets it; on Oracle set it yourself (or accept 5001)         |
| `MYSQL_URL`              | One of   | `mysql://user:pass@host:3306/dbname` — parsed at `Program.cs:74`    |
| `MYSQLHOST` / `MYSQLPORT` / `MYSQLDATABASE` / `MYSQLUSER` / `MYSQLPASSWORD` | One of | Individual vars, `Program.cs:159-169` |
| `CORS__AllowedOrigins`   | No       | SPA and API share an origin, so CORS is not in play. Only needed if you later split them. |

---

## Option A — Railway (~$8–12/mo)

The repo is already wired for this: `railway.toml`, `PORT` binding, and the `MYSQL_*` fallback chain
all exist because it was built for Railway.

1. **Create the project.** railway.app → New Project → Deploy from GitHub repo → `nealsotes/lemon-pos`.
   Railway auto-detects the root `Dockerfile`. (Note: `CLAUDE.md` claims RAILPACK, but `railway.toml`
   has no `[build]` section, so Dockerfile detection is what actually happens — which is what you want.)
2. **Set the region.** Service → Settings → Region → **Southeast Asia (Singapore)**. Do this before the
   first successful deploy; it's the closest region to PH.
3. **Add MySQL.** Project → New → Database → Add MySQL. Railway provisions it with its own `MYSQL_URL`.
4. **Wire the variables.** On the app service → Variables:
   ```
   MYSQL_URL=${{MySQL.MYSQL_URL}}
   JWT_SECRET_KEY=<output of openssl rand -base64 48>
   JWT_ISSUER=QuickServePOS
   JWT_AUDIENCE=QuickServePOSUsers
   ASPNETCORE_ENVIRONMENT=Production
   ```
   Leave `PORT` alone — Railway injects it.
5. **Generate the public URL.** Service → Settings → Networking → Generate Domain.
   You get `something.up.railway.app` with HTTPS already terminated. This is your free hostname.
6. **Verify.** `curl https://<your>.up.railway.app/api/health`, then log in and do §0.2.

**Cost mechanics.** The $5/mo Hobby subscription *includes* $5 of usage; you pay actual usage above
that, not $5 + usage. Two always-on services (app + MySQL) billed at $10/GB RAM and $20/vCPU per month
land around **$8–12/mo** in practice.

---

## Option B — Oracle Cloud Always Free ($0/mo)

### B.1 Account and region

Sign up at oracle.com/cloud/free. **Choose Singapore as your home region** — Always Free resources are
locked to the home region and it cannot be changed later.

### B.2 Create the database first

Create a **MySQL HeatWave DB system**, selecting the **Always Free** shape (50 GB data + 50 GB backup,
included at no cost). Put it in your VCN's private subnet — the default. Note its **private IP**.

The DB system has no public endpoint, which is the right posture: only your VM can reach it.

### B.3 Create the VM — deliberately small

Create a `VM.Standard.A1.Flex` instance, Ubuntu 24.04 (**arm64**), at **1 OCPU / 2 GB**.

This sizing is intentional. Oracle reclaims Always Free instances that, over 7 days, are *simultaneously*
under 20% CPU **and** under 20% network **and** under 20% memory. Since all three must hold, breaking one
is enough. A POS box running only the .NET container sits at ~500–700 MB; on 2 GB that's 25–35% memory —
above the floor. On the full 12 GB it would be ~5%, squarely in reclamation range. Taking the smaller
shape is what keeps the instance alive.

The margin is real but not generous — idle usage lands around 22–30% depending on traffic. After the
first week, check `MemoryUtilization` in OCI Monitoring and confirm it is genuinely above 20%. If it
sits below, the mitigation has failed silently and the first symptom will be a terminated instance.

### B.4 Open the ports — both layers

This is the classic Oracle trap: the VCN security list and the instance firewall are separate, and
Ubuntu OCI images ship with restrictive `iptables` rules.

VCN → Security List → add ingress: TCP 80 and 443 from `0.0.0.0/0`.

Then on the instance. The rules must land **above** the default `REJECT` line, so check the positions
first rather than assuming index 6:

```bash
sudo iptables -L INPUT --line-numbers      # find the REJECT line number, insert above it
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Index 6 is correct on stock Oracle Ubuntu images. If yours differs and you insert below `REJECT`,
the port will read as open in the console and still be unreachable.

### B.5 Free hostname + HTTPS

With no domain, use **DuckDNS**: register `yourshop.duckdns.org` and point it at the instance's public IP.
Let's Encrypt issues certificates for DuckDNS hostnames, so HTTPS works properly — which the PWA and
QZ Tray's secure WebSocket both need.

Install Docker, then run Caddy as the TLS terminator:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
```

`docker-compose.yml`:

```yaml
services:
  app:
    image: ghcr.io/nealsotes/lemon-pos:latest
    restart: always
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      PORT: "5001"
      MYSQLHOST: "10.0.1.x"        # HeatWave private IP
      MYSQLPORT: "3306"
      MYSQLDATABASE: "quickserve"
      MYSQLUSER: "admin"
      MYSQLPASSWORD: "<db password>"
      JWT_SECRET_KEY: "<openssl rand -base64 48>"
      JWT_ISSUER: "QuickServePOS"
      JWT_AUDIENCE: "QuickServePOSUsers"

  caddy:
    image: caddy:2
    restart: always
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  caddy_data:
```

`Caddyfile` — three lines, and Caddy handles certificate issuance and renewal itself:

```
yourshop.duckdns.org {
    reverse_proxy app:5001
}
```

### B.6 Build the image off-box

Do **not** build on a 2 GB VM — `npm ci` plus `ng build` will exhaust it. Build in GitHub Actions and
have the VM only pull the finished image. Because the repo is public, GitHub's free `ubuntu-24.04-arm`
runners build arm64 natively (no slow QEMU emulation), and GHCR storage is free for public images.

`.github/workflows/deploy.yml`:

```yaml
name: Build image
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-24.04-arm
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/nealsotes/lemon-pos:latest
```

Deploy on the VM:

```bash
docker compose pull && docker compose up -d
```

### B.7 The honest risks

- **Idle reclamation** is mitigated by §B.3 sizing, not eliminated. The heavier lever is upgrading to
  Pay As You Go (card + temporary $100 auth hold); Always Free resources stay free afterward, and it's
  widely reported to exempt you from reclamation — but **Oracle does not state that exemption in writing**,
  so treat it as community consensus.
- If the VM *is* reclaimed you lose the instance, not the data — HeatWave is a separate service. That's
  downtime and a rebuild, not losing the store's books.
- **A1 capacity**: "out of host capacity" is common in busy regions. Singapore is reported to provision
  in minutes, but it isn't guaranteed. PAYG also solves this.
- You own OS patching, backups verification, and deploys.

---

## Side by side

| | **Railway** | **Oracle Always Free** |
| --- | --- | --- |
| Monthly cost | ~$8–12 | $0 |
| Setup time | ~20 min | ~1–2 hrs |
| Credit card | Required | Only if you upgrade to PAYG |
| Region | Singapore | Singapore |
| Free hostname | `*.up.railway.app` | `*.duckdns.org` |
| TLS | Automatic | Caddy + Let's Encrypt |
| DB | Railway MySQL plugin | HeatWave, 50 GB |
| DB backups | Managed | Managed (50 GB) |
| Deploys | `git push` | `git push` → Actions → `docker compose pull` |
| You maintain | Nothing | OS, firewall, Docker, TLS renewal (automatic) |
| Main risk | Usage bill drifts up | Idle reclamation; A1 capacity |

---

## After either deploy

1. Log in as `owner` / `admin123` and **change all three seeded passwords** (§0.2).
2. `curl https://<host>/api/health` should return healthy.
3. Confirm the public menu route (`/menu`) loads — it's the only unauthenticated page.
4. Printing is client-side, so hosting choice does not affect it — but the two printer paths in
   `thermal-printer.service.ts` behave differently under HTTPS:
   - **Desktop / QZ Tray** — QZ runs on the counter PC and the browser connects over loopback.
     `qz.websocket.connect()` is called with no options (`thermal-printer.service.ts:112-113`), so it
     takes the library defaults: `usingSecure: true`, hosts `['localhost', 'localhost.qz.io']`,
     secure ports `[8181, 8282, 8383, 8484]`. HTTPS does not *enable* printing — it *forces* the
     secure socket, because an HTTPS page is not allowed to open a plain `ws://` connection. So if
     printing breaks after going live, look at QZ's certificate trust on the counter PC, not the host.
     (`localhost.qz.io` is QZ's workaround: a public DNS name resolving to 127.0.0.1, so a real
     CA-issued certificate can cover the loopback connection.)
   - **Android / Bluetooth** — this path uses Web Bluetooth (`navigator.bluetooth`), which is a
     secure-context-only API and genuinely *does* require HTTPS. Both hosting options provide it.

---

## Migrating Railway → Oracle

Railway stays running throughout. You cut over only after Oracle is verified, and you keep Railway
alive for a few days as a rollback. There is no downtime and no deadline pressure.

Because the database has products and setup but **no sales transactions yet**, there is no freeze
window to coordinate — nothing can be lost between the dump and the switch.

### M.1 Harden Railway first — the hardening migrates with the data

Do §0 on the *Railway* deploy before dumping, not after:

- Set `JWT_SECRET_KEY` in Railway → Variables (see §0.1).
- Log in and change the `owner`, `admin`, and `employee` passwords (§0.2).

Password hashes live in the `Users` table, so changing them now means the dump carries the fixed
credentials into Oracle automatically. `SeedData.InitializeUsersAsync` only inserts a user when that
username is absent (`SeedData.cs:122`), so your changed passwords will not be reverted on first boot
in the new environment.

### M.2 Dump from Railway

Get the public connection details from Railway → MySQL service → Connect (`MYSQL_PUBLIC_URL`), then
dump from your machine:

```bash
mysqldump --host=<proxy-host> --port=<proxy-port> \
  --user=root --password='<password>' \
  --single-transaction --routines --no-tablespaces \
  railway > quickserve-backup.sql
```

`--no-tablespaces` is required — Railway's MySQL user lacks the `PROCESS` privilege and the dump
fails without it.

### M.3 Restore into HeatWave

Two names must agree or you get a cleanly booting app with an empty product list: the **source**
database in M.2 (`railway` by default — confirm against `MYSQL_DATABASE` in Railway's variables) and
the **target** here, which must match `MYSQLDATABASE` in the compose file from §B.5 (`quickserve`).

HeatWave has no public endpoint, so restore from the Oracle VM rather than your laptop:

```bash
scp quickserve-backup.sql ubuntu@<vm-public-ip>:~
ssh ubuntu@<vm-public-ip>
sudo apt install -y mysql-client
mysql --host=<heatwave-private-ip> --user=admin --password -e "CREATE DATABASE quickserve;"
mysql --host=<heatwave-private-ip> --user=admin --password quickserve < quickserve-backup.sql
```

### M.4 Boot and verify

Bring up the stack (§B.5). On startup `EnsureCreatedAsync()` finds the tables already present and
skips creation, then the idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` patches run
harmlessly — a restored database is a supported starting state.

Verify before cutting over:

```bash
curl https://yourshop.duckdns.org/api/health
```

Then log in with your **changed** password, confirm the product list and ingredients match Railway,
and load `/menu`.

No CORS changes are needed. `Program.cs:35` appends a hardcoded Railway hostname and reads
`RAILWAY_PUBLIC_DOMAIN`, neither of which exists on Oracle — but it doesn't matter, because the .NET
app serves the SPA and the API from the same origin, so no cross-origin request is ever made.

### M.5 Cut over and decommission

1. Point staff and the counter PC at the DuckDNS URL.
2. Run on Oracle for a few days with Railway still up as a rollback.
3. Once you are confident, delete the Railway project to stop billing.
4. Re-check `MemoryUtilization` in OCI Monitoring after a week (§B.3) — this is the point where
   idle reclamation becomes a live concern rather than a hypothetical one.
