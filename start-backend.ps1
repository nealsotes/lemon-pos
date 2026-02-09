# Start Backend Server Script
Write-Host "Starting QuickServe Backend..." -ForegroundColor Green

# Navigate to backend directory
Set-Location "backend\PosSystem\PosSystem"

# Check if .NET is installed
try {
    $dotnetVersion = dotnet --version
    Write-Host "Using .NET version: $dotnetVersion" -ForegroundColor Yellow
} catch {
    Write-Host "Error: .NET is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Build the project
Write-Host "Building project..." -ForegroundColor Yellow
dotnet build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build successful!" -ForegroundColor Green

# Start the server
Write-Host "Starting server on http://localhost:5000..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Cyan

dotnet run 