# Fix: Build Frontend with Railpack

## The Problem
Railway's Railpack builder doesn't have Docker, and the build script file might not be in the expected location.

## Solution: Inline Build Command

Since the script file might not be accessible, we'll build the frontend inline in the build command.

### Update Railway Custom Build Command

In Railway Dashboard → Settings → Custom Build Command, use this:

```bash
cd frontend && (command -v node >/dev/null 2>&1 || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)) && npm ci --no-audit && npm run build && cd .. && mkdir -p backend/PosSystem/PosSystem/wwwroot && rm -rf backend/PosSystem/PosSystem/wwwroot/* && cp -r frontend/dist/* backend/PosSystem/PosSystem/wwwroot/ && echo '✅ Frontend built' && cd backend/PosSystem/PosSystem && dotnet restore && dotnet publish -c Release -o /app/out
```

### What This Does

1. **Go to frontend directory**
2. **Install Node.js** (if not already installed)
3. **Install dependencies** (`npm ci`)
4. **Build Angular** (`npm run build`)
5. **Copy to wwwroot** (create directory, copy files)
6. **Build backend** (Railpack's normal process, which includes wwwroot)

### Simplified Version (if above is too long)

If Railway has character limits, use this shorter version:

```bash
cd frontend && npm ci && npm run build && cd .. && mkdir -p backend/PosSystem/PosSystem/wwwroot && cp -r frontend/dist/* backend/PosSystem/PosSystem/wwwroot/ && cd backend/PosSystem/PosSystem && dotnet publish -c Release -o /app/out
```

This assumes Node.js is already available in Railpack (it often is).

## After Updating

1. **Save** the settings
2. **Wait for deployment**
3. **Check build logs** - should see:
   ```
   Building Angular frontend...
   ✔ Browser application bundle generation complete.
   ✅ Frontend built
   ```

4. **Run test**: `.\test-deployment.ps1`
5. **Should see "v2.0"** in deployed app

