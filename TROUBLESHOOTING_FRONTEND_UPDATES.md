# Troubleshooting: Frontend Changes Not Updating

## Quick Fixes

### 1. **Clear Browser Cache & Service Worker** (Most Common Issue)

**Chrome/Edge:**
1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Clear storage** → **Clear site data**
4. Or manually:
   - **Service Workers** → Click **Unregister** on any registered workers
   - **Storage** → Click **Clear site data**
5. Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)

**Firefox:**
1. Open DevTools (F12)
2. Go to **Storage** tab
3. Right-click your domain → **Delete All**
4. Hard refresh: `Ctrl + F5`

### 2. **Check if New Build is Deployed**

Visit: `https://your-railway-domain.com/build-info.txt`

This file contains the build timestamp. If it shows an old date, the deployment didn't work.

### 3. **Verify Files Are Updated**

1. Open DevTools → **Network** tab
2. Refresh the page
3. Check the **main.*.js** file:
   - Look at the filename hash (e.g., `main.507dde0c75bf1966.js`)
   - If it's the same as before, the build didn't create new files
   - If it's different, files are updated but cached

4. Check **Response Headers** for `index.html`:
   - Should have: `Cache-Control: no-cache, no-store, must-revalidate`
   - If it shows `max-age=31536000`, the cache fix didn't deploy

### 4. **Check Railway Build Logs**

1. Go to Railway Dashboard → Your Project → Deployments
2. Click on the latest deployment
3. Look for these messages:

**✅ Success:**
```
✅ Frontend build successful - dist directory found
✅ index.html verified in wwwroot
✅ wwwroot verified in publish
```

**❌ Failure:**
```
❌ Frontend build failed!
❌ ERROR: dist directory not found
❌ ERROR: index.html not found in wwwroot
```

### 5. **Force Service Worker Update**

If service worker is still caching:

1. Open DevTools → **Application** tab
2. Go to **Service Workers**
3. Check **"Update on reload"** checkbox
4. Click **Unregister** on any active workers
5. Refresh the page

Or add this to browser console:
```javascript
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
  location.reload();
});
```

## Root Causes

### Issue 1: Aggressive Caching (FIXED)
- **Problem**: HTML files were cached for 1 year
- **Fix**: Updated `Program.cs` to not cache HTML files
- **Status**: ✅ Fixed in latest commit

### Issue 2: Service Worker Cache
- **Problem**: Angular service worker caches app files
- **Solution**: Unregister service worker or wait for automatic update (can take time)

### Issue 3: Build Not Running
- **Problem**: Frontend build fails silently
- **Solution**: Check Railway build logs for errors

### Issue 4: Files Not Copied to wwwroot
- **Problem**: Build succeeds but files aren't copied
- **Solution**: Dockerfile now verifies copy operation

## Testing After Deployment

1. **Check build timestamp:**
   ```
   curl https://your-railway-domain.com/build-info.txt
   ```

2. **Check file hashes:**
   - Visit your app
   - View page source
   - Check the script tag: `<script src="main.XXXXX.js">`
   - Compare with previous deployment

3. **Test in incognito mode:**
   - Open incognito/private window
   - Visit your app
   - This bypasses all cache

## Still Not Working?

1. **Check Railway deployment status:**
   - Is the deployment marked as "Success"?
   - Are there any warnings in the logs?

2. **Verify git push:**
   ```powershell
   git log -1 --oneline
   git remote -v
   ```

3. **Check if Railway detected the push:**
   - Railway Dashboard → Deployments
   - Should show a new deployment after your push

4. **Manual redeploy:**
   - Railway Dashboard → Your Service
   - Click "Redeploy" on latest deployment
   - Or trigger a new deployment manually

## Prevention

To avoid this issue in the future:

1. **Always test in incognito mode** after deployment
2. **Check build-info.txt** to verify deployment
3. **Monitor Railway logs** for build errors
4. **Use version numbers** in your app to track deployments

