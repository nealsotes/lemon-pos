# Reset Database and Test Image Functionality

Write-Host "Resetting database..." -ForegroundColor Yellow

# Stop the backend if running
Write-Host "Stopping backend..." -ForegroundColor Cyan
Get-Process -Name "dotnet" -ErrorAction SilentlyContinue | Stop-Process -Force

# Reset the database
Write-Host "Dropping and recreating database..." -ForegroundColor Cyan
docker exec mysql57 mysql -u neal -pnelsotes18 -e "DROP DATABASE IF EXISTS quickservedb; CREATE DATABASE quickservedb;"

Write-Host "Database reset complete!" -ForegroundColor Green
Write-Host "Now run: dotnet run" -ForegroundColor Cyan
Write-Host "This will recreate the database with proper image fields." -ForegroundColor Cyan 