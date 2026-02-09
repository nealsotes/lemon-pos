# Fix: Railway Directory Issue

## The Problem
Railway's Railpack builder runs from `/app` directory, but the build command was trying to `cd frontend` from the wrong location.

## Solution: Use Absolute Paths

Since Railway runs from `/app`, we need to use absolute paths or check where we are first.

### Updated Custom Build Command

Use this in Railway Dashboard → Settings → Custom Build Command:

```bash
pwd && ls -la && if [ -d frontend ]; then cd frontend; elif [ -d /app/frontend ]; then cd /app/frontend; else echo 'ERROR: frontend not found'; exit 1; fi && (command -v node >/dev/null 2>&1 || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)) && npm ci --no-audit && npm run build && if [ -d /app/backend/PosSystem/PosSystem ]; then mkdir -p /app/backend/PosSystem/PosSystem/wwwroot && rm -rf /app/backend/PosSystem/PosSystem/wwwroot/* && cp -r dist/* /app/backend/PosSystem/PosSystem/wwwroot/; elif [ -d backend/PosSystem/PosSystem ]; then mkdir -p backend/PosSystem/PosSystem/wwwroot && rm -rf backend/PosSystem/PosSystem/wwwroot/* && cp -r dist/* backend/PosSystem/PosSystem/wwwroot/; else echo 'ERROR: backend not found'; exit 1; fi && echo '✅ Frontend built' && cd /app/backend/PosSystem/PosSystem && dotnet restore && dotnet publish -c Release -o /app/out
```

### What This Does

1. **Check current directory** (`pwd && ls -la`) - shows where we are
2. **Find frontend** - tries current dir, then `/app/frontend`
3. **Build frontend** - installs Node.js if needed, builds Angular
4. **Copy to wwwroot** - uses absolute paths `/app/backend/...`
5. **Build backend** - uses absolute path `/app/backend/PosSystem/PosSystem`

## Alternative: Simpler Version

If the above is too complex, try this simpler version that assumes `/app`:

```bash
cd /app/frontend && (command -v node >/dev/null 2>&1 || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)) && npm ci --no-audit && npm run build && mkdir -p /app/backend/PosSystem/PosSystem/wwwroot && rm -rf /app/backend/PosSystem/PosSystem/wwwroot/* && cp -r /app/frontend/dist/* /app/backend/PosSystem/PosSystem/wwwroot/ && echo '✅ Frontend built' && cd /app/backend/PosSystem/PosSystem && dotnet restore && dotnet publish -c Release -o /app/out
```

This assumes Railway is always in `/app` (which it usually is).

## Try This First

Use the **simpler version** first - it's cleaner and should work if Railway runs from `/app`.

