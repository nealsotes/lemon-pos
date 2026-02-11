# QuickServe Network Testing Tool
# Tests connectivity between server and iPad

param(
    [Parameter(Mandatory=$false)]
    [string]$TestFromIP = ""
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "QuickServe Network Testing Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get server information
Write-Host "SERVER INFORMATION:" -ForegroundColor Yellow
Write-Host ""

# Get all network adapters
$adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike "169.*" -and 
    $_.IPAddress -ne "127.0.0.1"
}

if ($adapters.Count -eq 0) {
    Write-Host "  ERROR: No network adapters found!" -ForegroundColor Red
    exit 1
}

Write-Host "  Available Network Interfaces:" -ForegroundColor White
foreach ($adapter in $adapters) {
    $interfaceAlias = (Get-NetAdapter -InterfaceIndex $adapter.InterfaceIndex).Name
    Write-Host "    - $interfaceAlias : $($adapter.IPAddress)" -ForegroundColor Cyan
}

# Select primary interface (first non-loopback)
$primaryIP = $adapters[0].IPAddress
Write-Host ""
Write-Host "  Primary Server IP: $primaryIP" -ForegroundColor Green
Write-Host ""

# Get subnet mask
$subnet = (Get-NetIPAddress -IPAddress $primaryIP).PrefixLength
$subnetMask = switch ($subnet) {
    24 { "255.255.255.0" }
    16 { "255.255.0.0" }
    8 { "255.0.0.0" }
    default { "255.255.255.0" }
}
Write-Host "  Subnet Mask: $subnetMask" -ForegroundColor White

# Calculate network range
$ipParts = $primaryIP.Split('.')
$networkAddress = "$($ipParts[0]).$($ipParts[1]).$($ipParts[2]).1"
$broadcastAddress = "$($ipParts[0]).$($ipParts[1]).$($ipParts[2]).254"
Write-Host "  Network Range: $networkAddress - $broadcastAddress" -ForegroundColor White
Write-Host ""

# Test if backend is running
Write-Host "BACKEND STATUS:" -ForegroundColor Yellow
Write-Host ""

$backendProcess = Get-Process -Name "PosSystem" -ErrorAction SilentlyContinue
if ($backendProcess) {
    Write-Host "  ✓ Backend process is running (PID: $($backendProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  ✗ Backend process is NOT running" -ForegroundColor Red
    Write-Host "    Start backend: C:\QuickServe\start-backend.ps1" -ForegroundColor Yellow
}

# Test API endpoint
Write-Host ""
Write-Host "  Testing API endpoints..." -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5001/api/products" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "  ✓ API responding on localhost:5001" -ForegroundColor Green
    
    # Parse response
    $products = $response.Content | ConvertFrom-Json
    Write-Host "  ✓ Database connected ($($products.Count) products found)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ API not responding on localhost:5001" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Test static files
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5001/" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($response.Content -match "QuickServe" -or $response.Content -match "<!DOCTYPE html>") {
        Write-Host "  ✓ Frontend is being served" -ForegroundColor Green
    } else {
        Write-Host "  ! Frontend may not be configured correctly" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ Frontend not accessible" -ForegroundColor Red
}

Write-Host ""

# Check firewall
Write-Host "FIREWALL STATUS:" -ForegroundColor Yellow
Write-Host ""

$firewallRule = Get-NetFirewallRule -DisplayName "QuickServe API" -ErrorAction SilentlyContinue
if ($firewallRule) {
    $enabled = $firewallRule.Enabled
    if ($enabled) {
        Write-Host "  ✓ Firewall rule exists and is ENABLED" -ForegroundColor Green
    } else {
        Write-Host "  ! Firewall rule exists but is DISABLED" -ForegroundColor Yellow
        Write-Host "    Enable: Enable-NetFirewallRule -DisplayName 'QuickServe API'" -ForegroundColor Cyan
    }
} else {
    Write-Host "  ✗ Firewall rule not found" -ForegroundColor Red
    Write-Host "    Create: New-NetFirewallRule -DisplayName 'QuickServe API' -Direction Inbound -Protocol TCP -LocalPort 5001 -Action Allow" -ForegroundColor Cyan
}

Write-Host ""

# Port listening check
Write-Host "PORT STATUS:" -ForegroundColor Yellow
Write-Host ""

$port5001 = Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue
if ($port5001) {
    Write-Host "  ✓ Port 5001 is LISTENING" -ForegroundColor Green
    Write-Host "    Process: $($port5001.OwningProcess)" -ForegroundColor White
} else {
    Write-Host "  ✗ Port 5001 is NOT listening" -ForegroundColor Red
    Write-Host "    Backend may not be running or bound to wrong address" -ForegroundColor Yellow
}

Write-Host ""

# Network accessibility test
Write-Host "NETWORK ACCESSIBILITY:" -ForegroundColor Yellow
Write-Host ""

Write-Host "  iPad should access server at:" -ForegroundColor White
Write-Host "    http://$primaryIP" -ForegroundColor Cyan
Write-Host "    http://$primaryIP:5001" -ForegroundColor Cyan
Write-Host ""

# If test IP provided, ping it
if ($TestFromIP -ne "") {
    Write-Host "  Testing connection to iPad at $TestFromIP..." -ForegroundColor White
    $pingResult = Test-Connection -ComputerName $TestFromIP -Count 2 -Quiet
    if ($pingResult) {
        Write-Host "  ✓ Can reach iPad at $TestFromIP" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Cannot reach iPad at $TestFromIP" -ForegroundColor Red
        Write-Host "    - Check if iPad is on same network" -ForegroundColor Yellow
        Write-Host "    - Check if iPad WiFi is enabled" -ForegroundColor Yellow
    }
}

Write-Host ""

# Scan for devices on network (optional)
Write-Host "NETWORK SCAN (Optional):" -ForegroundColor Yellow
Write-Host ""
$scan = Read-Host "Scan network for active devices? This may take 1-2 minutes (y/n)"

if ($scan -eq "y" -or $scan -eq "Y") {
    Write-Host ""
    Write-Host "  Scanning network $($ipParts[0]).$($ipParts[1]).$($ipParts[2]).0/24..." -ForegroundColor White
    Write-Host "  This may take a moment..." -ForegroundColor Gray
    Write-Host ""
    
    $activeDevices = @()
    1..254 | ForEach-Object -ThrottleLimit 50 -Parallel {
        $ip = "$($using:ipParts[0]).$($using:ipParts[1]).$($using:ipParts[2]).$_"
        if (Test-Connection -ComputerName $ip -Count 1 -TimeoutSeconds 1 -Quiet) {
            $ip
        }
    } | ForEach-Object {
        $activeDevices += $_
        Write-Host "    Found: $_" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "  Total active devices: $($activeDevices.Count)" -ForegroundColor Cyan
    Write-Host ""
    
    if ($activeDevices.Count -gt 0) {
        Write-Host "  Potential iPad IP addresses:" -ForegroundColor White
        foreach ($ip in $activeDevices) {
            if ($ip -ne $primaryIP) {
                Write-Host "    - $ip (test in Safari: http://$ip:5001)" -ForegroundColor Cyan
            }
        }
    }
}

Write-Host ""

# Summary and next steps
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SUMMARY & NEXT STEPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Determine overall status
$allGood = $true
if (-not $backendProcess) { $allGood = $false }
if (-not $port5001) { $allGood = $false }

if ($allGood) {
    Write-Host "✅ SERVER IS READY!" -ForegroundColor Green
    Write-Host ""
    Write-Host "iPad Setup Instructions:" -ForegroundColor Yellow
    Write-Host "  1. Connect iPad to same WiFi network" -ForegroundColor White
    Write-Host "  2. Open Safari on iPad" -ForegroundColor White
    Write-Host "  3. Navigate to: http://$primaryIP" -ForegroundColor Cyan
    Write-Host "  4. Tap Share → Add to Home Screen" -ForegroundColor White
    Write-Host ""
    Write-Host "If iPad can't connect:" -ForegroundColor Yellow
    Write-Host "  - Verify iPad WiFi is connected to same network" -ForegroundColor White
    Write-Host "  - Try accessing: http://$primaryIP:5001/api/products" -ForegroundColor Cyan
    Write-Host "  - Check router firewall settings" -ForegroundColor White
} else {
    Write-Host "⚠️  SERVER NOT READY" -ForegroundColor Red
    Write-Host ""
    Write-Host "Issues found:" -ForegroundColor Yellow
    if (-not $backendProcess) {
        Write-Host "  ✗ Backend not running" -ForegroundColor Red
        Write-Host "    Fix: Run C:\QuickServe\start-backend.ps1" -ForegroundColor Cyan
    }
    if (-not $port5001) {
        Write-Host "  ✗ Port 5001 not listening" -ForegroundColor Red
        Write-Host "    Fix: Check backend configuration" -ForegroundColor Cyan
    }
    if (-not $firewallRule) {
        Write-Host "  ✗ Firewall not configured" -ForegroundColor Red
        Write-Host "    Fix: Run deployment script again" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Testing commands:" -ForegroundColor Yellow
Write-Host "  Test from another PC: " -ForegroundColor White -NoNewline
Write-Host "Test-Connection $primaryIP" -ForegroundColor Cyan
Write-Host "  Test API directly: " -ForegroundColor White -NoNewline
Write-Host "Invoke-WebRequest http://$primaryIP:5001/api/products" -ForegroundColor Cyan
Write-Host ""

# Save configuration
$config = @{
    ServerIP = $primaryIP
    TestDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    BackendRunning = ($null -ne $backendProcess)
    PortListening = ($null -ne $port5001)
    FirewallConfigured = ($null -ne $firewallRule)
}

$config | ConvertTo-Json | Out-File "network-test-results.json"
Write-Host "Results saved to: network-test-results.json" -ForegroundColor Gray
Write-Host ""


