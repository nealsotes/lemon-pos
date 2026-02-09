# How to Force Railway to Rebuild Without Cache

## The Problem
Railway is using cached Docker layers, so your frontend changes aren't being built.

**Evidence:**
- Old JS hash: `main.507dde0c75bf1966.js` (should be `main.42b1652eeb1548d2.js`)
- Old modified time: 2025-12-20T15:01:14Z
- "v2.0" not found in deployed files

## Solution 1: Force Rebuild in Railway Dashboard

1. Go to Railway Dashboard → Your Project
2. Click on your service
3. Go to **Settings** tab
4. Scroll to **Build** section
5. Look for **"Clear build cache"** or **"Rebuild from scratch"**
6. Enable it and trigger a new deployment

## Solution 2: Make a Dummy Change to Force Rebuild

Since Railway caches Docker layers, make a small change to force a rebuild:

```powershell
# Add a comment to force cache invalidation
echo "# Force rebuild $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" >> Dockerfile
git add Dockerfile
git commit -m "chore: force Railway rebuild"
git push origin main
```

## Solution 3: Check Railway Build Logs

After triggering a rebuild, check the logs for:

**✅ Good signs:**
```
✅ Found 'v2.0' in login component source
✅ Found 'v2.0' in built files
Build at: [recent timestamp]
Main JS file: main.42b1652eeb1548d2.js
```

**❌ Bad signs:**
```
❌ ERROR: 'v2.0' NOT found in login component!
Main JS file: main.507dde0c75bf1966.js (old hash)
```

## Solution 4: Use Railway CLI to Force Rebuild

If you have Railway CLI installed:

```bash
railway up --detach
```

Or redeploy with:

```bash
railway redeploy
```

## What to Do Now

1. **Check Railway Dashboard** for "Clear build cache" option
2. **Trigger a new deployment** after enabling cache clear
3. **Wait for build to complete**
4. **Run test script again**: `.\test-deployment.ps1`
5. **Check for new hash**: Should see `main.42b1652eeb1548d2.js` instead of `main.507dde0c75bf1966.js`

## Expected Results After Rebuild

- Main JS hash: `42b1652eeb1548d2` (new)
- Modified time: Recent (within last few minutes)
- "v2.0" found in page source
- build-info.txt exists and shows recent timestamp

