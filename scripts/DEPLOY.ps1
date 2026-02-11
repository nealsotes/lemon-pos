# QuickServe POS Deployment Script
# This script builds the frontend and prepares the backend for deployment

Write-Host "Starting deployment preparation..." -ForegroundColor Green

# Step 1: Build Angular frontend
Write-Host "`n[1/3] Building Angular frontend..." -ForegroundColor Yellow
Set-Location frontend

if (Test-Path "node_modules") {
    Write-Host "Node modules found, skipping npm install..." -ForegroundColor Gray
} else {
    Write-Host "Installing npm dependencies..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: npm install failed!" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
}

Write-Host "Building production bundle..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Angular build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..

# Step 2: Copy frontend build to backend wwwroot
Write-Host "`n[2/3] Copying frontend build to backend wwwroot..." -ForegroundColor Yellow

$frontendDist = "frontend/dist"
$backendWwwroot = "backend/PosSystem/PosSystem/wwwroot"

# Remove existing wwwroot contents (except uploads directory)
if (Test-Path $backendWwwroot) {
    Write-Host "Cleaning wwwroot (preserving uploads directory)..." -ForegroundColor Gray
    Get-ChildItem -Path $backendWwwroot -Exclude "uploads" | Remove-Item -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $backendWwwroot -Force | Out-Null
}

# Copy frontend dist files to wwwroot
if (Test-Path $frontendDist) {
    Write-Host "Copying files from dist to wwwroot..." -ForegroundColor Gray
    Copy-Item -Path "$frontendDist/*" -Destination $backendWwwroot -Recurse -Force
    Write-Host "Frontend files copied successfully!" -ForegroundColor Green
} else {
    Write-Host "Error: Frontend dist directory not found!" -ForegroundColor Red
    exit 1
}

# Step 3: Build backend (optional, for local testing)
Write-Host "`n[3/3] Building backend..." -ForegroundColor Yellow
Set-Location "backend/PosSystem/PosSystem"

Write-Host "Restoring NuGet packages..." -ForegroundColor Gray
dotnet restore
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: dotnet restore failed, but continuing..." -ForegroundColor Yellow
}

Write-Host "Building backend..." -ForegroundColor Gray
dotnet build -c Release
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: dotnet build failed, but continuing..." -ForegroundColor Yellow
}

Set-Location ../../..

Write-Host "`nDeployment preparation complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Commit and push your changes to GitHub" -ForegroundColor White
Write-Host "2. Connect your repository to Railway" -ForegroundColor White
Write-Host "3. Add MySQL database service in Railway" -ForegroundColor White
Write-Host "4. Set environment variables in Railway dashboard:" -ForegroundColor White
Write-Host "   - ConnectionStrings__DefaultConnection (from MySQL service)" -ForegroundColor Gray
Write-Host "   - Jwt__SecretKey (generate a secure key)" -ForegroundColor Gray
Write-Host "   - CORS__AllowedOrigins (your Railway domain)" -ForegroundColor Gray
Write-Host "5. Deploy!" -ForegroundColor White
