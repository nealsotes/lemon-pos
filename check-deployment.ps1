# Quick deployment check script
# Helps verify if frontend changes are deployed

param(
    [string]$Domain = ""
)

Write-Host "=== QuickServe Deployment Checker ===" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrEmpty($Domain)) {
    $Domain = Read-Host "Enter your Railway domain (e.g., quickserve-production.up.railway.app)"
}

if (-not $Domain.StartsWith("http")) {
    $Domain = "https://$Domain"
}

Write-Host "Checking deployment at: $Domain" -ForegroundColor Yellow
Write-Host ""

# Check build info
Write-Host "1. Checking build-info.txt..." -ForegroundColor Cyan
try {
    $buildInfo = Invoke-WebRequest -Uri "$Domain/build-info.txt" -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ Build info found:" -ForegroundColor Green
    $buildInfo.Content | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} catch {
    Write-Host "❌ Build info not found or error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Check API health
Write-Host "2. Checking API health..." -ForegroundColor Cyan
try {
    $health = Invoke-WebRequest -Uri "$Domain/api/health" -UseBasicParsing -ErrorAction Stop
    $healthJson = $health.Content | ConvertFrom-Json
    Write-Host "✅ API is online" -ForegroundColor Green
    Write-Host "   Status: $($healthJson.status)" -ForegroundColor Gray
    Write-Host "   Timestamp: $($healthJson.timestamp)" -ForegroundColor Gray
} catch {
    Write-Host "❌ API health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Check build info API
Write-Host "3. Checking build info API..." -ForegroundColor Cyan
try {
    $buildInfoApi = Invoke-WebRequest -Uri "$Domain/api/health/build-info" -UseBasicParsing -ErrorAction Stop
    $buildInfoJson = $buildInfoApi.Content | ConvertFrom-Json
    Write-Host "✅ Build info API response:" -ForegroundColor Green
    Write-Host "   Build info exists: $($buildInfoJson.buildInfoExists)" -ForegroundColor Gray
    if ($buildInfoJson.buildInfoExists) {
        Write-Host "   Build info:" -ForegroundColor Gray
        $buildInfoJson.buildInfo -split "`n" | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
    }
} catch {
    Write-Host "❌ Build info API failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Check main page
Write-Host "4. Checking main page..." -ForegroundColor Cyan
try {
    $mainPage = Invoke-WebRequest -Uri "$Domain/" -UseBasicParsing -ErrorAction Stop
    if ($mainPage.Content -match 'main\.([a-f0-9]+)\.js') {
        $jsHash = $matches[1]
        Write-Host "✅ Main page loaded" -ForegroundColor Green
        Write-Host "   Main JS hash: $jsHash" -ForegroundColor Gray
        Write-Host "   File: main.$jsHash.js" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Main page loaded but couldn't find JS hash" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Main page check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Check Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Compare the build timestamp with your deployment time" -ForegroundColor White
Write-Host "2. Check if the JS hash matches your latest local build" -ForegroundColor White
Write-Host "3. If hashes don't match, clear browser cache and service worker" -ForegroundColor White
Write-Host "4. Check Railway build logs for any errors" -ForegroundColor White

