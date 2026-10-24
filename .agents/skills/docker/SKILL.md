---
name: docker
description: Use when changing the Dockerfile, the container build, .dockerignore, or local containerized runs. Covers the multi-stage Angular+.NET build, build-time vs runtime concerns, environment variables, and production image considerations. Deploy/runtime platform specifics live in `railway`.
---

# Docker — Multi-stage Angular + .NET 8

TRIGGER when: editing `Dockerfile`, `.dockerignore`, or reasoning about the container build/image.

DO NOT TRIGGER when: the concern is the deploy platform/runtime env vars (`railway`) or app code.

## The build (single Dockerfile, three logical stages)

```
sdk:8.0 + Node 20 ──► build Angular (npm ci → npm run build → dist/)
                 └──► restore + publish .NET, copy dist/* into wwwroot/
aspnet:8.0 (runtime) ◄── copy /app/out ; EXPOSE 8080 ; dotnet PosSystem.dll
```

Key facts to preserve:
- **One image serves both** frontend and API: Angular build output is copied into the backend `wwwroot/`, and .NET serves it as static files.
- `npm ci` (not `install`) for reproducible frontend builds; the build **asserts** `dist/index.html` exists and fails loudly if not.
- Runtime stage is `aspnet:8.0` (no SDK/Node) — keeps the image small. Don't add build tools to the runtime stage.

## Dockerfile guidance

- Copy `*.csproj` / `package*.json` and restore **before** copying source, so layer caching skips re-restore when only source changes.
- Keep frontend and backend restores in their own layers.
- Don't bake secrets or connection strings into the image — they're injected at runtime (`railway`).
- Change the exposed port only alongside the runtime `PORT` handling (the app binds `PORT`, default 8080 in-container).

## .dockerignore

- Keep `node_modules`, `bin`, `obj`, `.git`, and local env files out of the build context (already configured). A lean context = faster builds and no leaked local artifacts.

## Local runs

- Everyday local dev does **not** containerize the app — run backend `dotnet run` (:5001) + frontend `npm start` (:4200). Use Docker to reproduce the production image:

```bash
docker build -t quickserve-pos .
docker run -p 8080:8080 --env-file .env.local quickserve-pos
```

- There is **no `docker-compose.yml`** in the repo. If you want a local MySQL 8 on the documented port 3307, an optional compose file is reasonable (mark it clearly as local-only and gitignore any credentials):

```yaml
services:
  mysql:
    image: mysql:8.0
    ports: ["3307:3306"]
    environment:
      MYSQL_DATABASE: quickserve
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
```

## Production considerations

- Pin base images to major versions (`dotnet/aspnet:8.0`) already done; rebuild to pick up patch updates.
- Provide all config via environment at `docker run`/platform level, never in the image.
- Verify `wwwroot/index.html` is present in the final image (the build already asserts this) — a missing SPA means a blank site.

## Related skills

- `railway` — the platform that builds this Dockerfile and injects env vars
- `aspnet-api` — the app the image runs; static-file serving is configured in `Program.cs`

## Behavior

- Preserve restore-before-copy layer caching and the single-image (API + SPA) model.
- Never add secrets to the image or the Dockerfile.
- Match the existing stage structure; don't split into multiple images without a reason.
