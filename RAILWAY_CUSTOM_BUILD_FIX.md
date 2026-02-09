# Fix: Railway Locked to Railpack - Use Custom Build Command

## The Problem
Railway Dashboard won't let you change from Railpack to Dockerfile. The builder is locked.

## Solution: Use Custom Build Command

Since Railway is stuck on Railpack, we'll override its build process using a Custom Build Command.

### Step 1: In Railway Dashboard

1. Go to **Railway Dashboard → Your Service → Settings**
2. Find **"Custom Build Command"** section (in the Build area)
3. Enter this command:
   ```bash
   docker build --no-cache -f Dockerfile -t app .
   ```
4. **Save** the settings
5. Railway should trigger a new deployment

### Step 2: Verify It's Working

After deployment, check build logs. You should see:
```
Step 1/XX : FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
Step 2/XX : Install Node.js
Step 3/XX : Build Angular frontend
✅ FOUND 'v2.0' in login component source!
```

NOT:
```
╭─────────────────╮
│ Railpack 0.15.3 │
╰─────────────────╯
```

### Alternative: If Custom Build Command Doesn't Work

If Railway still uses Railpack even with custom build command:

1. **Delete and recreate the service:**
   - Note all environment variables first!
   - Delete the service
   - Create new service
   - Connect to same GitHub repo
   - Railway should read `railway.toml` and use Dockerfile

2. **Or use Railway CLI:**
   ```bash
   railway link
   railway up --dockerfile Dockerfile
   ```

## Why This Works

The Custom Build Command overrides Railpack's default build process and forces it to use your Dockerfile instead. This way:
- Railway still thinks it's using Railpack (so no errors)
- But actually uses your Dockerfile (which builds frontend + backend)

## What to Do Now

1. **Go to Railway Dashboard → Settings**
2. **Find "Custom Build Command"**
3. **Enter:** `docker build --no-cache -f Dockerfile -t app .`
4. **Save and wait for deployment**
5. **Check build logs** - should show Docker build steps, not Railpack

