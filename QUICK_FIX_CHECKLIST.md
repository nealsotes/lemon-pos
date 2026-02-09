# Quick Fix Checklist - Force Docker Build

## ✅ Step-by-Step Instructions

### 1. Go to Railway Dashboard
- Open Railway Dashboard
- Go to **Your Project → Your Service**
- Click **Settings** tab

### 2. Find Custom Build Command
- Scroll to **Build** section
- Look for **"Custom Build Command"** or **"Build Command"** field
- It should be visible even when builder is set to Railpack

### 3. Enter This Command
```bash
docker build --no-cache -f Dockerfile -t app .
```

**Important:** 
- `--no-cache` forces a fresh build (no cached layers)
- `-f Dockerfile` specifies your Dockerfile
- `-t app .` tags the image and uses current directory

### 4. Save Settings
- Click **Save** or **Update**
- Railway should automatically trigger a new deployment

### 5. Wait for Build
- Go to **Deployments** tab
- Watch the latest deployment
- Check the build logs

## ✅ What to Look For in Build Logs

### GOOD (Docker is working):
```
Step 1/XX : FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
Step 2/XX : WORKDIR /app
Step 3/XX : Install Node.js
Step 4/XX : Build Angular frontend
✅ FOUND 'v2.0' in login component source!
✅ Frontend build successful
Main JS file: main.42b1652eeb1548d2.js
```

### BAD (Still using Railpack):
```
╭─────────────────╮
│ Railpack 0.15.3 │
╰─────────────────╯
↳ Detected Dotnet
```

## ✅ After Build Completes

1. **Run test script:**
   ```powershell
   .\test-deployment.ps1
   ```

2. **Check for:**
   - New JS hash: `main.42b1652eeb1548d2.js` (not the old one)
   - Recent modified time
   - "v2.0" found in page source

## ❌ If Custom Build Command Doesn't Work

### Option A: Try Without --no-cache
Sometimes `--no-cache` causes issues. Try:
```bash
docker build -f Dockerfile -t app .
```

### Option B: Delete and Recreate Service
1. **Export environment variables:**
   - Railway Dashboard → Your Service → Variables
   - Copy all variable names and values

2. **Delete service:**
   - Settings → Delete Service

3. **Create new service:**
   - New → GitHub Repo
   - Select your repo
   - Railway should read `railway.toml` and use Dockerfile

4. **Restore environment variables:**
   - Add them back in Settings → Variables

## 🎯 Expected Result

After this fix:
- ✅ Frontend will be built (Angular)
- ✅ Backend will be built (.NET)
- ✅ Frontend copied to wwwroot
- ✅ "v2.0" will appear in deployed app
- ✅ New file hashes will be generated

