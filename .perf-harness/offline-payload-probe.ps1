# SWI-12 — measures the byte size of every payload a till would have to cache to
# sell offline, against the SWI-6 synthetic perf database. Throwaway measurement
# only; reads nothing from production.
param(
  [string]$Api = 'http://127.0.0.1:5099',
  [string]$OutJson = ''
)
$ErrorActionPreference = 'Stop'

$login = Invoke-RestMethod -Uri "$Api/api/auth/login" -Method Post `
  -ContentType 'application/json' `
  -Body (@{ username = 'owner'; password = 'admin123' } | ConvertTo-Json)
$token = $login.token
if (-not $token) { throw "login failed" }
$headers = @{ Authorization = "Bearer $token" }

# Each entry: label, url, and whether the POS till needs it to ring up a sale.
$targets = @(
  @{ key = 'products';        url = '/api/products?page=1&pageSize=100'; need = 'required' }
  @{ key = 'categories';      url = '/api/products/categories';          need = 'required' }
  @{ key = 'settings-pages';  url = '/api/settings/pages';               need = 'required' }
  @{ key = 'ingredients';     url = '/api/ingredients';                  need = 'indirect' }
  @{ key = 'expense-categories'; url = '/api/expense-categories';        need = 'no' }
)
# NOTE: GET /api/transactions (unbounded) is deliberately NOT measured here. It was
# already measured for SWI-6 at 48.81 MB / 223 s and the SWI-12 brief says not to
# re-derive it. It is also ~20 min of ConvertFrom-Json in Windows PowerShell.

$results = @()
foreach ($t in $targets) {
  $uri = "$Api$($t.url)"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $bytes = -1; $status = 0; $count = $null; $err = $null
  try {
    $resp = Invoke-WebRequest -Uri $uri -Headers $headers -UseBasicParsing -TimeoutSec 900
    $sw.Stop()
    $status = [int]$resp.StatusCode
    # Content is the raw body; measure it as UTF-8 bytes, which is what crosses
    # the wire uncompressed and what JSON.stringify would put in a store.
    $body = $resp.Content
    if ($body -is [byte[]]) { $bytes = $body.Length; $body = [Text.Encoding]::UTF8.GetString($body) }
    else { $bytes = [Text.Encoding]::UTF8.GetByteCount($body) }
    try { $parsed = $body | ConvertFrom-Json; if ($parsed -is [Array]) { $count = $parsed.Count } } catch {}
  } catch {
    $sw.Stop()
    $err = $_.Exception.Message
  }
  $results += [pscustomobject]@{
    key = $t.key; url = $t.url; need = $t.need
    status = $status; bytes = $bytes; kb = [math]::Round($bytes/1KB, 1)
    mb = [math]::Round($bytes/1MB, 2); ms = [int]$sw.ElapsedMilliseconds
    rows = $count; error = $err
  }
  "{0,-20} {1,10} B  {2,9} KB  {3,8} ms  rows={4}" -f $t.key, $bytes, [math]::Round($bytes/1KB,1), [int]$sw.ElapsedMilliseconds, $count
}

# Recipes have no bulk endpoint - only /api/recipes/product/{id}. Measure the real
# cost of caching every product's recipe: one request per product.
"";"--- recipes: per-product only, no bulk endpoint ---"
$products = Invoke-RestMethod -Uri "$Api/api/products?page=1&pageSize=100" -Headers $headers
$recipeBytes = 0; $recipeCalls = 0; $recipeLines = 0
$swr = [System.Diagnostics.Stopwatch]::StartNew()
foreach ($p in $products) {
  try {
    $r = Invoke-WebRequest -Uri "$Api/api/recipes/product/$($p.id)" -Headers $headers -UseBasicParsing -TimeoutSec 120
    $recipeBytes += [Text.Encoding]::UTF8.GetByteCount($r.Content)
    $recipeCalls++
    try { $rp = $r.Content | ConvertFrom-Json; if ($rp -is [Array]) { $recipeLines += $rp.Count } } catch {}
  } catch {}
}
$swr.Stop()
"recipes(all {0} products): {1} B ({2} KB) over {3} calls, {4} lines, {5} ms" -f `
  $products.Count, $recipeBytes, [math]::Round($recipeBytes/1KB,1), $recipeCalls, $recipeLines, [int]$swr.ElapsedMilliseconds
$results += [pscustomobject]@{
  key = 'recipes-all-products'; url = '/api/recipes/product/{id} x N'; need = 'indirect'
  status = 200; bytes = $recipeBytes; kb = [math]::Round($recipeBytes/1KB,1)
  mb = [math]::Round($recipeBytes/1MB,2); ms = [int]$swr.ElapsedMilliseconds
  rows = $recipeLines; error = "$recipeCalls round trips - no bulk endpoint exists"
}

$req = $results | Where-Object { $_.need -eq 'required' } | Measure-Object -Property bytes -Sum
"";("REQUIRED-TO-SELL TOTAL: {0} B = {1} KB" -f $req.Sum, [math]::Round($req.Sum/1KB,1))

if ($OutJson) { $results | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 $OutJson }
