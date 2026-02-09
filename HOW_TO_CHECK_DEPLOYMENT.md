# How to Check if Frontend Changes Are Deployed

## Quick Check Methods

### Method 1: Check File Versions API (Easiest)

**In Browser:**
1. Visit: `https://your-railway-domain.com/api/health/file-versions`
2. Look for the `main.*.js` file
3. Check the `hash` and `lastModified` timestamp
4. Compare with your local build hash

**Using PowerShell Script:**
```powershell
.\test-deployment.ps1
```
Enter your Railway domain when prompted. It will show:
- All file hashes
- Last modified times
- Whether "v2.0" is in the page source

### Method 2: Check Build Info

Visit: `https://your-railway-domain.com/build-info.txt`

Should show:
- Build timestamp (should be recent)
- Build hash
- Git commit

### Method 3: Check Page Source

1. Visit your Railway app
2. Right-click → View Page Source (or Ctrl+U)
3. Search for "v2.0" (Ctrl+F)
4. If found → deployment worked
5. If not found → old version deployed

### Method 4: Check Network Tab

1. Open DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Look for `main.*.js` file
5. Check the filename hash (e.g., `main.42b1652eeb1548d2.js`)
6. Compare with your local build hash

## What to Look For

### ✅ Good Signs:
- File versions API shows recent `lastModified` time
- Build info shows recent timestamp
- Main JS hash matches your local build
- "v2.0" appears in page source

### ❌ Bad Signs:
- File versions API shows old `lastModified` time
- Build info shows old timestamp
- Main JS hash doesn't match local build
- "v2.0" NOT in page source

## If Changes Aren't Showing

1. **Check Railway Build Logs:**
   - Railway Dashboard → Your Project → Deployments
   - Click latest deployment
   - Look for: `✅ Found 'v2.0' in login component source`
   - Look for: `✅ Found 'v2.0' in built files`

2. **Check if Build Actually Ran:**
   - Look for: `=== Starting Angular build ===`
   - Look for: `Build at: [timestamp]`
   - Compare timestamp with deployment time

3. **Force Rebuild:**
   - Railway Dashboard → Your Service → Settings
   - Enable "Clear build cache"
   - Trigger new deployment

## Expected Local Build Hash

After running `npm run build` locally, you should see:
```
main.42b1652eeb1548d2.js
```

Compare this with what's on Railway via the file-versions API.

