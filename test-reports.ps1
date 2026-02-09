# Test Reports API Script
Write-Host "Testing QuickServe Reports API..." -ForegroundColor Green

# Base URL
$baseUrl = "http://localhost:5000"

# Test endpoints
$endpoints = @(
    "/api/reports/daily",
    "/api/reports/top-products",
    "/api/products",
    "/api/transactions"
)

Write-Host "Testing endpoints on $baseUrl" -ForegroundColor Yellow
Write-Host ""

foreach ($endpoint in $endpoints) {
    $url = "$baseUrl$endpoint"
    Write-Host "Testing: $endpoint" -ForegroundColor Cyan
    
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10
        Write-Host "  Status: $($response.StatusCode) $($response.StatusDescription)" -ForegroundColor Green
        
        if ($response.Content) {
            $content = $response.Content | ConvertFrom-Json
            Write-Host "  Response: $($content | ConvertTo-Json -Depth 2)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "Testing completed!" -ForegroundColor Green 