# Deployment Workflow - Building Frontend Locally

## The Problem
Railway's Railpack builder can't access the `frontend` directory during build, so we need to build the frontend locally and commit the built files.

## Solution: Build Locally, Commit, Deploy

### Step 1: Make Your Frontend Changes
Edit files in `frontend/src/` as needed.

### Step 2: Build Frontend Locally
```powershell
cd frontend
npm run build
cd ..
```

### Step 3: Copy to wwwroot
```powershell
# Remove old files (preserve uploads)
Get-ChildItem -Path "backend/PosSystem/PosSystem/wwwroot" -Exclude "uploads" | Remove-Item -Recurse -Force

# Copy new build
Copy-Item -Path "frontend/dist/*" -Destination "backend/PosSystem/PosSystem/wwwroot" -Recurse -Force
```

Or use the deployment script:
```powershell
.\DEPLOY.ps1
```

### Step 4: Commit and Push
```powershell
git add backend/PosSystem/PosSystem/wwwroot/
git commit -m "Update frontend build"
git push origin main
```

### Step 5: Railway Deploys
Railway will automatically detect the push and deploy. Railpack will build the backend and include the `wwwroot` files.

## Quick Script

You can create a simple script to do steps 2-4:

```powershell
# build-and-deploy.ps1
Write-Host "Building frontend..." -ForegroundColor Yellow
cd frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
cd ..

Write-Host "Copying to wwwroot..." -ForegroundColor Yellow
Get-ChildItem -Path "backend/PosSystem/PosSystem/wwwroot" -Exclude "uploads" | Remove-Item -Recurse -Force
Copy-Item -Path "frontend/dist/*" -Destination "backend/PosSystem/PosSystem/wwwroot" -Recurse -Force

Write-Host "Committing changes..." -ForegroundColor Yellow
git add backend/PosSystem/PosSystem/wwwroot/
git commit -m "Update frontend build - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push origin main

Write-Host "✅ Frontend built and pushed! Railway will deploy automatically." -ForegroundColor Green
```

## Why This Works

- Railway Railpack builds the .NET backend
- `wwwroot` is part of the backend project
- Railpack automatically includes `wwwroot` in the publish output
- Since we commit built files to `wwwroot`, Railway deploys them

## Future: GitHub Actions (Optional)

You could set up a GitHub Action to automatically build the frontend on push, but for now, building locally works fine.


