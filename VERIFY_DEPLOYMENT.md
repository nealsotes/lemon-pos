# Verify Railway Deployment - Step by Step

## Step 1: Verify Railway Actually Deployed New Build

1. **Check Railway Dashboard:**
   - Go to Railway Dashboard → Your Project
   - Click on "Deployments" tab
   - Look at the latest deployment:
     - **Status:** Should be "Success" (green)
     - **Time:** Should be recent (after your last git push)
     - **Commit:** Should match your latest commit hash

2. **Check if deployment was triggered:**
   - Railway should show a new deployment after `git push`
   - If no new deployment shows, Railway didn't detect the push

## Step 2: Check Build Logs in Railway

Click on the latest deployment and look for these messages:

**✅ Good signs:**
```
✅ ngsw-config.json found
✔ Browser application bundle generation complete.
✔ Copying assets complete.
✔ Service worker generation complete.
✅ Frontend build successful - dist directory found
✅ Frontend copied to wwwroot
✅ index.html verified in wwwroot
✅ wwwroot verified in publish
```

**❌ Bad signs (build failed):**
```
❌ Frontend build failed!
❌ ERROR: dist directory not found
❌ ERROR: index.html not found in wwwroot
```

## Step 3: Check File Hashes on Deployed Site

**Method 1: View Page Source**
1. Visit your Railway app URL
2. Right-click → "View Page Source" (or Ctrl+U)
3. Look for script tags like:
   ```html
   <script src="main.3411ebd7af1c5e8c.js"></script>
   ```
4. Compare this hash with your local build hash:
   - Local: `main.3411ebd7af1c5e8c.js` (from your latest build)
   - Deployed: Should match if deployment worked

**Method 2: Network Tab**
1. Open DevTools (F12) → Network tab
2. Refresh page
3. Find `main.*.js` file
4. Check the filename hash
5. Compare with local build

**If hashes match but changes don't show:**
- Service worker is caching old JavaScript code
- Need to unregister service worker completely

**If hashes don't match:**
- Old files are still being served
- Deployment might not have completed
- Or Railway is serving from cache

## Step 4: Force Railway to Rebuild

If you suspect Railway isn't deploying:

1. **Manual Redeploy:**
   - Railway Dashboard → Your Service
   - Click "..." menu → "Redeploy"
   - Or click "Deploy" → "Deploy latest commit"

2. **Trigger new deployment:**
   ```powershell
   # Make a small change to trigger deployment
   echo "# Deployment trigger" >> README.md
   git add README.md
   git commit -m "Trigger deployment"
   git push
   ```

## Step 5: Verify Build Timestamp

Check if Railway actually built with your changes:

1. Visit: `https://your-railway-domain.com/build-info.txt`
2. Should show recent timestamp
3. Compare with your local build time

## Step 6: Complete Cache Clear (Nuclear Option)

If nothing else works:

1. **In Browser:**
   - Close ALL tabs with your app
   - Clear ALL browser data for your domain:
     - Chrome: Settings → Privacy → Clear browsing data → All time → Clear data
   - Restart browser
   - Open app in new tab

2. **Unregister Service Worker (via Console):**
   ```javascript
   // Open browser console (F12) and run:
   navigator.serviceWorker.getRegistrations().then(function(registrations) {
     for(let registration of registrations) {
       registration.unregister();
       console.log('Service worker unregistered');
     }
     // Clear all caches
     caches.keys().then(function(names) {
       for (let name of names) {
         caches.delete(name);
         console.log('Cache deleted:', name);
       }
       location.reload(true);
     });
   });
   ```

## Step 7: Check Railway Service Configuration

1. Railway Dashboard → Your Service → Settings
2. Check:
   - **Build Command:** Should be empty (uses Dockerfile)
   - **Root Directory:** Should be empty or "/"
   - **Dockerfile Path:** Should be "Dockerfile"
   - **Watch Paths:** Should include your files

## Common Issues

### Issue: Railway shows "Success" but old files serve
**Cause:** Railway might be caching the Docker image
**Solution:** 
- Redeploy from Railway dashboard
- Or push a new commit to trigger fresh build

### Issue: Files deploy but service worker won't update
**Cause:** Service worker update strategy is slow
**Solution:**
- Unregister service worker (see Step 6)
- Or wait 24 hours for automatic update

### Issue: Build succeeds but wwwroot is empty
**Cause:** Copy step failed silently
**Solution:**
- Check Railway logs for copy errors
- Verify Dockerfile copy command

## Quick Test

Run this in browser console to see what's cached:
```javascript
// Check service worker
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Service Worker:', reg ? 'Active' : 'None');
  if (reg) console.log('SW State:', reg.active?.state);
});

// Check caches
caches.keys().then(keys => {
  console.log('Caches:', keys);
  keys.forEach(key => {
    caches.open(key).then(cache => {
      cache.keys().then(reqs => {
        console.log(`Cache "${key}" has ${reqs.length} files`);
        reqs.slice(0, 5).forEach(req => console.log('  -', req.url));
      });
    });
  });
});
```

