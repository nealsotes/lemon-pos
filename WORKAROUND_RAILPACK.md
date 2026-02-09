# Workaround: Railway Won't Let You Change Builder

## Problem
Railway Dashboard won't let you change from Railpack to Dockerfile. The builder is locked.

## Solution: Use Custom Build Command

Since Railway won't let you change the builder, we can override the build command to force Docker.

### Option 1: Custom Build Command in Railway Dashboard

1. Go to **Railway Dashboard → Your Service → Settings**
2. Find **"Custom Build Command"** section
3. Enter this command:
   ```bash
   docker build -f Dockerfile -t railway-app . && docker save railway-app | docker load
   ```
4. Save settings
5. Trigger new deployment

### Option 2: Alternative - Build Frontend Separately

If Docker build command doesn't work, we can modify the approach:

1. Build frontend in a GitHub Action or separate step
2. Commit built files to a branch
3. Have Railway deploy from that branch

### Option 3: Use Railway CLI

If you have Railway CLI:
```bash
railway link
railway up --dockerfile Dockerfile
```

### Option 4: Delete and Recreate Service

Sometimes Railway locks settings. Try:
1. Note all environment variables
2. Delete the service
3. Create new service
4. Connect to same repo
5. Railway should read `railway.toml` and use Dockerfile

## What to Try First

Try **Option 1** (Custom Build Command) first - it's the easiest and doesn't require deleting anything.

