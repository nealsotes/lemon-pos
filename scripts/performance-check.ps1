# Performance Check Script for QuickServe
Write-Host "QuickServe Performance Check" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green

# Check if backend is running
Write-Host "`n1. Checking Backend Status..." -ForegroundColor Yellow
$backendProcesses = Get-Process | Where-Object {$_.ProcessName -like "*dotnet*" -or $_.ProcessName -like "*PosSystem*"}
if ($backendProcesses) {
    Write-Host "✓ Backend processes found:" -ForegroundColor Green
    $backendProcesses | ForEach-Object { Write-Host "  - $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Cyan }
} else {
    Write-Host "✗ No backend processes found" -ForegroundColor Red
}

# Check ports
Write-Host "`n2. Checking Ports..." -ForegroundColor Yellow
$ports = @(5000, 5001, 4200)
foreach ($port in $ports) {
    $connection = Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($connection) {
        Write-Host "✓ Port $port is open" -ForegroundColor Green
    } else {
        Write-Host "✗ Port $port is closed" -ForegroundColor Red
    }
}

# Check API endpoints
Write-Host "`n3. Testing API Endpoints..." -ForegroundColor Yellow
$endpoints = @(
    "http://localhost:5000/api/reports/daily",
    "http://localhost:5001/api/reports/daily",
    "http://localhost:5000/api/products",
    "http://localhost:5001/api/products"
)

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-WebRequest -Uri $endpoint -Method GET -TimeoutSec 3 -ErrorAction Stop
        Write-Host "✓ $endpoint - Status: $($response.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "✗ $endpoint - Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Check frontend
Write-Host "`n4. Checking Frontend..." -ForegroundColor Yellow
$frontendProcesses = Get-Process | Where-Object {$_.ProcessName -like "*node*" -or $_.ProcessName -like "*ng*"}
if ($frontendProcesses) {
    Write-Host "✓ Frontend processes found:" -ForegroundColor Green
    $frontendProcesses | ForEach-Object { Write-Host "  - $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Cyan }
} else {
    Write-Host "✗ No frontend processes found" -ForegroundColor Red
}

# Check system resources
Write-Host "`n5. System Resources..." -ForegroundColor Yellow
$cpu = Get-Counter -Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 1
$memory = Get-Counter -Counter "\Memory\Available MBytes" -SampleInterval 1 -MaxSamples 1
$disk = Get-Counter -Counter "\PhysicalDisk(_Total)\% Disk Time" -SampleInterval 1 -MaxSamples 1

Write-Host "CPU Usage: $([math]::Round($cpu.CounterSamples[0].CookedValue, 1))%" -ForegroundColor Cyan
Write-Host "Available Memory: $([math]::Round($memory.CounterSamples[0].CookedValue, 0)) MB" -ForegroundColor Cyan
Write-Host "Disk Usage: $([math]::Round($disk.CounterSamples[0].CookedValue, 1))%" -ForegroundColor Cyan

Write-Host "`nPerformance Check Complete!" -ForegroundColor Green 