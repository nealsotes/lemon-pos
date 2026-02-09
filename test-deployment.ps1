# Test deployment and check file versions
param(
    [string]$Domain = ""
)

Write-Host "=== Testing Deployment ===" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrEmpty($Domain)) {
    $Domain = Read-Host "Enter your Railway domain (e.g., quickserve-production.up.railway.app)"
}

if (-not $Domain.StartsWith("http")) {
    $Domain = "https://$Domain"
}

Write-Host "Testing: $Domain" -ForegroundColor Yellow
Write-Host ""

# Check file versions endpoint
Write-Host "1. Checking file versions..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$Domain/api/health/file-versions" -UseBasicParsing -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    
    Write-Host "✅ File versions endpoint working" -ForegroundColor Green
    Write-Host "   wwwroot path: $($data.wwwrootPath)" -ForegroundColor Gray
    Write-Host "   File count: $($data.fileCount)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Files:" -ForegroundColor Yellow
    
    $data.files.PSObject.Properties | ForEach-Object {
        $file = $_.Name
        $info = $_.Value
        Write-Host "   - $file" -ForegroundColor White
        Write-Host "     Size: $($info.size) bytes" -ForegroundColor Gray
        Write-Host "     Modified: $($info.lastModified)" -ForegroundColor Gray
        Write-Host "     Hash: $($info.hash)" -ForegroundColor Gray
        Write-Host ""
    }
    
    # Check for main.js
    $mainJs = $data.files.PSObject.Properties | Where-Object { $_.Name -like "main.*.js" } | Select-Object -First 1
    if ($mainJs) {
        Write-Host "   Main JS file found: $($mainJs.Name)" -ForegroundColor Green
        Write-Host "   Hash: $($mainJs.Value.hash)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Main JS file not found!" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Full error: $($_.Exception)" -ForegroundColor Gray
}

Write-Host ""

# Check build info
Write-Host "2. Checking build info..." -ForegroundColor Cyan
try {
    $buildInfo = Invoke-WebRequest -Uri "$Domain/build-info.txt" -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ Build info found:" -ForegroundColor Green
    $buildInfo.Content -split "`n" | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} catch {
    Write-Host "❌ Build info not found: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Check main page source
Write-Host "3. Checking main page for 'v2.0'..." -ForegroundColor Cyan
try {
    $mainPage = Invoke-WebRequest -Uri "$Domain/" -UseBasicParsing -ErrorAction Stop
    if ($mainPage.Content -match "Welcome Back - v2\.0") {
        Write-Host "✅ Found 'v2.0' in page source!" -ForegroundColor Green
    } elseif ($mainPage.Content -match "Welcome Back") {
        Write-Host "❌ Found 'Welcome Back' but NOT 'v2.0' - old version deployed" -ForegroundColor Red
    } else {
        Write-Host "⚠️  Could not find login text in page source" -ForegroundColor Yellow
    }
    
    # Check for main.js in source
    if ($mainPage.Content -match 'main\.([a-f0-9]+)\.js') {
        $jsHash = $matches[1]
        Write-Host "   Main JS hash in HTML: $jsHash" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Error checking main page: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "If 'v2.0' is not showing, the build is not including your changes." -ForegroundColor Yellow
Write-Host "Check Railway build logs for errors during frontend build." -ForegroundColor Yellow

