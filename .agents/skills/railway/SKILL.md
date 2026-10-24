---
name: railway
description: Use when deploying to or configuring Railway — railway.toml, environment variables (MySQL connection, JWT, PORT, CORS), how the app binds the port and serves the SPA, HTTPS handling, health checks, secrets, and logs/monitoring. Container build specifics live in `docker`.
---

# Railway Deployment

TRIGGER when: changing `railway.toml`, deploy/runtime env vars, port/HTTPS/health behavior, or diagnosing a deployed-app issue.

DO NOT TRIGGER when: the change is the container build (`docker`) or application code.

## How it deploys

- Railway builds the repo `Dockerfile` (`docker`) and runs the resulting single image (API + SPA).
- `railway.toml` sets the restart policy and `ASPNETCORE_ENVIRONMENT = Production`. Everything else is configured as Railway **service variables**.

## Runtime behavior the app expects (Program.cs)

| Concern | Behavior |
|---------|----------|
| Port | Binds `http://0.0.0.0:$PORT` (Railway injects `PORT`; default 5001 locally) — never hardcode a port |
| HTTPS | **Railway terminates TLS** — the app skips `UseHttpsRedirection` when `RAILWAY_ENVIRONMENT` is set. Don't force HTTPS redirect on Railway |
| SPA | Serves Angular from `wwwroot` (checks several publish paths); a blank site usually means `wwwroot` didn't ship (`docker`) |
| CORS | Allowed origins from `CORS:AllowedOrigins`, plus `RAILWAY_PUBLIC_DOMAIN` auto-added |
| Health | `HealthController` exposes a health endpoint for platform checks |

## Environment variables (set in Railway, never in git)

| Purpose | Variables (fallback chain the app accepts) |
|---------|--------------------------------------------|
| DB (URL form) | `MYSQL_URL` = `mysql://user:pass@host:port/db` (parsed to a connection string) |
| DB (discrete) | `MYSQLHOST`/`MYSQL_HOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD` |
| JWT secret | `JWT_SECRET_KEY` / `JWT__SECRETKEY` — **must be set in prod** (see `authentication`) |
| JWT issuer/audience | `JWT_ISSUER` / `JWT__ISSUER`, `JWT_AUDIENCE` / `JWT__AUDIENCE` |
| Env | `ASPNETCORE_ENVIRONMENT=Production` (in `railway.toml`) |
| Platform (auto) | `PORT`, `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_ENVIRONMENT` |

Double-underscore (`JWT__SECRETKEY`) is the ASP.NET Core config form; the app resolves several formats — prefer one consistently.

## Secrets

- All secrets live in Railway service variables — **never** commit them or bake them into the image (`docker`).
- The JWT secret has a hardcoded dev fallback in code; production must override it. Flag any deploy path relying on the fallback.

## Database migrations on deploy

- Migrations are **not** auto-applied. Apply EF migrations against the Railway MySQL DB as a release step (`migrations`), and back up before anything destructive.

## Logs & Monitoring

- Use Railway's deploy logs and runtime logs for diagnostics; the restart policy retries on failure (max 10). Watch startup logs for connection-string and `wwwroot` resolution messages the app emits.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| App won't start | Missing/invalid DB connection vars (`MYSQL_URL` or `MYSQL*`) |
| Blank page, API works | `wwwroot` not in image (`docker`) |
| 401s everywhere after deploy | JWT secret differs from token-issuing config, or fallback in use (`authentication`) |
| CORS errors | Frontend origin not in `CORS:AllowedOrigins` / public domain mismatch |
| Redirect loop | Forcing HTTPS redirect on Railway (TLS already terminated) |

## Related skills

- `docker` — the image Railway builds and runs
- `authentication` — JWT secret/issuer/audience that must be set here
- `migrations` — applying schema changes to the deployed DB

## Behavior

- Never commit secrets; configure them as Railway variables.
- Don't hardcode the port or force HTTPS redirect on Railway.
- Treat prod DB changes as release steps with a backup, not casual updates.
