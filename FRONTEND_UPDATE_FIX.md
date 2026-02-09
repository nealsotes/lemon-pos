# Frontend Updates Not Applying - Fix Guide

## Root Cause
The Angular Service Worker is caching files aggressively, preventing new deployments from being visible immediately.

## Quick Fix (For Users)

### Method 1: Clear Service Worker Cache (Recommended)

**Chrome/Edge:**
1. Open DevTools (F12)
2. Go to **Application** tab
3. In **Service Workers** section, click **Unregister** on any active workers
4. In **Storage** section, click **Clear site data**
5. Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)

**Firefox:**
1. Open DevTools (F12)
2. Go to **Storage** tab
3. Right-click your domain → **Delete All**
4. Hard refresh: `Ctrl + F5`

**Or use Browser Console:**
```javascript
// Unregister all service workers
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
  location.reload();
});
```

### Method 2: Test in Incognito Mode
Open the app in an incognito/private window to bypass all cache.

## Verify Deployment Worked

1. **Check build timestamp:**
   - Visit: `https://your-domain.com/build-info.txt`
   - Should show recent timestamp

2. **Check file hashes in Network tab:**
   - Open DevTools → Network tab
   - Refresh page
   - Look at `main.*.js` filename
   - If hash changed (e.g., `main.OLD.js` → `main.NEW.js`), deployment worked but is cached

3. **Check Railway build logs:**
   - Railway Dashboard → Your Project → Deployments
   - Look for: `✅ Frontend build successful`

## For Developers: Make Service Worker Update Faster

The service worker is configured to check for updates, but it may take time. You can force immediate updates by modifying the service worker registration strategy.

### Option 1: Update Service Worker Registration (Recommended for Development)

Update `frontend/src/main.ts`:

```typescript
ServiceWorkerModule.register('ngsw-worker.js', {
  enabled: !isDevMode(), // Disable in dev, enable in production
  registrationStrategy: 'registerImmediately' // Immediate registration
})
```

### Option 2: Add Update Check on App Load

Add to `frontend/src/app/app.component.ts`:

```typescript
ngOnInit() {
  // ... existing code ...
  
  // Check for service worker updates
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration) {
        registration.update(); // Force update check
      }
    });
  }
}
```

### Option 3: Update Service Worker Configuration

Update `frontend/ngsw-config.json` to use freshness strategy for app files:

```json
{
  "assetGroups": [
    {
      "name": "app",
      "installMode": "lazy", // Changed from "prefetch"
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/favicon.ico",
          "/index.html",
          "/manifest.json",
          "/*.css",
          "/*.js"
        ]
      }
    }
  ]
}
```

## Deployment Checklist

Before pushing changes:

1. ✅ **Build locally to verify:**
   ```powershell
   cd frontend
   npm run build
   ```

2. ✅ **Check for TypeScript errors:**
   ```powershell
   npm run build --verbose
   ```

3. ✅ **Verify dist folder exists:**
   ```powershell
   Test-Path frontend/dist/index.html
   ```

4. ✅ **Commit and push:**
   ```powershell
   git add .
   git commit -m "Your commit message"
   git push
   ```

5. ✅ **Monitor Railway deployment:**
   - Check build logs for errors
   - Wait for deployment to complete
   - Verify build-info.txt timestamp

6. ✅ **Test deployment:**
   - Clear service worker cache
   - Hard refresh browser
   - Test in incognito mode

## Troubleshooting

### Build Succeeds But Changes Don't Show

**Issue:** Service worker cache
**Solution:** Clear service worker (see Method 1 above)

### Build Fails in Railway

**Issue:** Build errors
**Solution:**
1. Check Railway build logs
2. Look for TypeScript errors
3. Verify `package-lock.json` is committed
4. Check for missing dependencies

### Files Not Updated After Clearing Cache

**Issue:** Deployment didn't actually update files
**Solution:**
1. Check Railway build logs for `✅ Frontend build successful`
2. Verify `build-info.txt` shows new timestamp
3. Check file hashes in Network tab - should be different

### Service Worker Won't Unregister

**Solution:**
1. Close all tabs with your app open
2. Clear browser data for your domain
3. Restart browser
4. Open app in new tab

## Prevention

To avoid this issue:

1. **Always test in incognito mode** after deployment
2. **Check build-info.txt** to verify deployment
3. **Monitor Railway logs** for build errors
4. **Use version numbers** in your app to track deployments
5. **Consider disabling service worker** during active development

## Current Service Worker Configuration

The service worker is currently configured with:
- **App files:** `prefetch` mode (caches aggressively)
- **Assets:** `lazy` mode with `prefetch` updates
- **Navigation:** `performance` strategy

This means files are cached for offline use, which is great for users but can cause update delays during development.

