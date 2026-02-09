# Database Management Script for QuickServe POS System

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("start", "stop", "status", "logs", "connect", "reset")]
    [string]$Action = "status"
)

function Start-MySQL {
    Write-Host "Starting MySQL container..." -ForegroundColor Green
    docker start mysql57
    if ($LASTEXITCODE -eq 0) {
        Write-Host "MySQL container started successfully!" -ForegroundColor Green
    } else {
        Write-Host "Failed to start MySQL container. It might not exist." -ForegroundColor Red
        Write-Host "Run the following command to create it:" -ForegroundColor Yellow
        Write-Host "docker run -d --name mysql57 -e MYSQL_ROOT_PASSWORD=my-secret-pw -e MYSQL_DATABASE=quickservedb -e MYSQL_USER=neal -e MYSQL_PASSWORD=nelsotes18 -p 3307:3306 mysql/mysql-server:5.7" -ForegroundColor Cyan
    }
}

function Stop-MySQL {
    Write-Host "Stopping MySQL container..." -ForegroundColor Yellow
    docker stop mysql57
    if ($LASTEXITCODE -eq 0) {
        Write-Host "MySQL container stopped successfully!" -ForegroundColor Green
    } else {
        Write-Host "Failed to stop MySQL container." -ForegroundColor Red
    }
}

function Get-MySQLStatus {
    Write-Host "MySQL Container Status:" -ForegroundColor Cyan
    docker ps -a --filter "name=mysql57" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

function Get-MySQLLogs {
    Write-Host "MySQL Container Logs:" -ForegroundColor Cyan
    docker logs mysql57 --tail 20
}

function Connect-MySQL {
    Write-Host "Connecting to MySQL database..." -ForegroundColor Green
    docker exec -it mysql57 mysql -u neal -p quickservedb
}

function Reset-Database {
    Write-Host "Resetting database..." -ForegroundColor Yellow
    Write-Host "This will drop and recreate the database. Are you sure? (y/N)" -ForegroundColor Red
    $confirm = Read-Host
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        docker exec mysql57 mysql -u neal -pnelsotes18 -e "DROP DATABASE IF EXISTS quickservedb; CREATE DATABASE quickservedb;"
        Write-Host "Database reset successfully!" -ForegroundColor Green
        Write-Host "Run 'dotnet run' to recreate tables and seed data." -ForegroundColor Cyan
    } else {
        Write-Host "Database reset cancelled." -ForegroundColor Yellow
    }
}

# Main execution
switch ($Action) {
    "start" { Start-MySQL }
    "stop" { Stop-MySQL }
    "status" { Get-MySQLStatus }
    "logs" { Get-MySQLLogs }
    "connect" { Connect-MySQL }
    "reset" { Reset-Database }
    default { 
        Write-Host "Usage: .\database-commands.ps1 [start|stop|status|logs|connect|reset]" -ForegroundColor Cyan
        Write-Host "Default action: status" -ForegroundColor Yellow
        Get-MySQLStatus
    }
} 