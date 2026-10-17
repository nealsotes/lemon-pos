# SWI-6 reports performance harness - endpoint benchmark.
#
# Measures, per /api/reports endpoint, server time-to-last-byte and response
# payload size at a fixed date range, against the synthetic perf database only.
#
# Usage: pwsh -File bench.ps1 [-Api http://127.0.0.1:5099] [-Days 30] [-Runs 5]

param(
  [string]$Api = 'http://127.0.0.1:5099',
  [int]$Days = 30,
  [int]$Runs = 5,
  [string]$OutJson = ''
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---- auth ----------------------------------------------------------------
$login = Invoke-RestMethod -Uri "$Api/api/auth/login" -Method Post `
  -ContentType 'application/json' `
  -Body (@{ username = 'owner'; password = 'admin123' } | ConvertTo-Json)
$token = $login.token
if (-not $token) { throw "login failed: $($login | ConvertTo-Json -Depth 4)" }
$headers = @{ Authorization = "Bearer $token" }

$end = (Get-Date).Date
$start = $end.AddDays(-($Days - 1))
$s = $start.ToString('yyyy-MM-dd')
$e = $end.ToString('yyyy-MM-dd')
$range = "startDate=$s&endDate=$e"

# The exact set the reports page requests on one load of /reports.
$endpoints = [ordered]@{
  'sales (daily report)'      = "/api/reports/sales?$range"
  'top-products'              = "/api/reports/top-products?$range&count=10"
  'sales (trend 7d)'          = "/api/reports/sales?startDate=$($end.AddDays(-6).ToString('yyyy-MM-dd'))&endDate=$e"
  'all-time-sales'            = "/api/reports/all-time-sales"
  'profit-loss'               = "/api/reports/profit-loss?$range"
  'inventory-valuation'       = "/api/reports/inventory-valuation?$range"
  'accountant-summary'        = "/api/reports/accountant-summary?$range"
  'period-comparison'         = "/api/reports/period-comparison?$range"
  'category'                  = "/api/reports/category?$range"
  'supplier-breakdown'        = "/api/reports/supplier-breakdown?$range"
  'consumption'               = "/api/reports/consumption?$range"
}
# Non-/reports calls the page also makes on the same load.
$companion = [ordered]@{
  'products (list)'           = "/api/products"
  'transactions/recent?count=50' = "/api/transactions/recent?count=50"
  'ingredients'               = "/api/ingredients"
  'stock-movements (range)'   = "/api/stockmovements?startDate=$s&endDate=$e"
}

function Measure-Endpoint($name, $path) {
  $times = @()
  $bytes = 0
  $status = 0
  for ($i = 0; $i -lt $Runs; $i++) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
      $r = Invoke-WebRequest -Uri "$Api$path" -Headers $headers -UseBasicParsing -TimeoutSec 600
      $sw.Stop()
      $status = [int]$r.StatusCode
      $bytes = $r.RawContentLength
      if ($bytes -le 0) { $bytes = [Text.Encoding]::UTF8.GetByteCount($r.Content) }
    } catch {
      $sw.Stop()
      $status = -1
      $bytes = 0
    }
    $times += $sw.Elapsed.TotalMilliseconds
  }
  $sorted = $times | Sort-Object
  [pscustomobject]@{
    endpoint = $name
    path     = $path
    status   = $status
    runs     = $Runs
    min_ms   = [math]::Round($sorted[0], 1)
    median_ms= [math]::Round($sorted[[int][math]::Floor($sorted.Count / 2)], 1)
    max_ms   = [math]::Round($sorted[-1], 1)
    kb       = [math]::Round($bytes / 1KB, 1)
  }
}

Write-Host "=== /api/reports endpoints  (range $s .. $e, $Days days, $Runs runs each) ==="
$results = @()
foreach ($k in $endpoints.Keys) { $row = Measure-Endpoint $k $endpoints[$k]; $results += $row; Write-Host ("{0,-30} {1,8} ms  {2,9} KB  [{3}]" -f $row.endpoint, $row.median_ms, $row.kb, $row.status) }

Write-Host ""
Write-Host "=== companion endpoints the same page load issues ==="
foreach ($k in $companion.Keys) { $row = Measure-Endpoint $k $companion[$k]; $results += $row; Write-Host ("{0,-30} {1,8} ms  {2,9} KB  [{3}]" -f $row.endpoint, $row.median_ms, $row.kb, $row.status) }

$sumMs = ($results | Measure-Object -Property median_ms -Sum).Sum
$sumKb = ($results | Measure-Object -Property kb -Sum).Sum
Write-Host ""
Write-Host ("SEQUENTIAL TOTAL (what loadAllData() actually costs): {0} ms, {1} KB over {2} requests" -f [math]::Round($sumMs, 0), [math]::Round($sumKb, 1), $results.Count)

if ($OutJson) {
  @{ range = @{ start = $s; end = $e; days = $Days }; runs = $Runs; results = $results; sequentialTotalMs = $sumMs; totalPayloadKb = $sumKb } |
    ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $OutJson
  Write-Host "wrote $OutJson"
}
