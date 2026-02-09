# Railway Deployment Guide

## Quick Steps to Deploy Changes to Railway

### 1. **Verify Your Current Branch**
```powershell
git branch
# Make sure you're on the branch Railway is watching (usually 'main' or 'master')
```

### 2. **Commit Your Changes**
```powershell
git add .
git commit -m "Your commit message describing the changes"
```

### 3. **Push to the Correct Branch**
```powershell
# If Railway is watching 'main' branch:
git push origin main

# If Railway is watching 'master' branch:
git push origin master

# If you're on a different branch and need to push to main:
git push origin HEAD:main
```

### 4. **Verify Railway Detected the Push**
- Go to your Railway dashboard
- Check the "Deployments" tab
- You should see a new deployment triggered automatically

## Troubleshooting: Build Succeeds But Changes Don't Appear

### Issue 1: Railway is Watching the Wrong Branch

**Solution:**
1. Go to Railway Dashboard → Your Project → Settings
2. Check the "Source" section
3. Verify which branch is connected (usually `main` or `master`)
4. Make sure you're pushing to that branch

### Issue 2: Docker Cache Issue

**Solution: Force a Clean Build**
1. In Railway Dashboard → Your Service → Settings
2. Go to "Deploy" section
3. Enable "Clear build cache" or "Rebuild from scratch"
4. Trigger a new deployment

Or add this to your `railway.toml`:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"
# Force no cache (adds --no-cache flag)
```

### Issue 3: Service Worker Cache (PWA)

Your Angular app uses a service worker, which caches the app. Even after deployment, users might see the old version.

**Solution:**
1. **Hard refresh** in browser: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
2. **Clear browser cache** for your Railway domain
3. **Unregister service worker**:
   - Open DevTools (F12)
   - Go to Application tab → Service Workers
   - Click "Unregister"
   - Refresh the page

### Issue 4: Browser Cache

**Solution:**
- Clear browser cache for your Railway domain
- Use incognito/private mode to test
- Hard refresh: `Ctrl + F5` or `Ctrl + Shift + R`

### Issue 5: Changes Not Committed/Pushed

**Verify:**
```powershell
# Check what files have changed
git status

# Check if you've pushed your commits
git log origin/main..HEAD  # Shows commits not yet pushed
```

## Manual Deployment Trigger

If automatic deployment isn't working:

1. Go to Railway Dashboard → Your Project
2. Click on your service
3. Go to "Deployments" tab
4. Click "Redeploy" on the latest deployment
5. Or click "Deploy" → "Deploy Latest Commit"

## Verify Deployment

1. **Check Railway Logs:**
   - Railway Dashboard → Your Service → Deployments
   - Click on the latest deployment
   - Check the build logs for errors

2. **Check Application Logs:**
   - Railway Dashboard → Your Service → Metrics/Logs
   - Look for runtime errors

3. **Test the Deployed App:**
   - Visit your Railway domain
   - Open DevTools → Network tab
   - Check if new files are being loaded (look at timestamps)

## Common Commands

```powershell
# Check current branch
git branch

# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Push to main
git push origin main

# Force push (use with caution)
git push origin main --force
```

## Railway Configuration Check

Your `railway.toml` should have:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "cd /app/out && dotnet PosSystem.dll"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[env]
ASPNETCORE_ENVIRONMENT = "Production"
```

## Still Not Working?

1. **Check Railway Status**: Visit status.railway.app
2. **Verify Repository Connection**: Railway Dashboard → Settings → Source
3. **Check Environment Variables**: Make sure all required env vars are set
4. **Review Build Logs**: Look for warnings or errors during build
5. **Check Service Worker Version**: The service worker might need a version bump in `ngsw-config.json`

