using PosSystem.Core.Interfaces;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Services;
using PosSystem.API.Middleware;
using Microsoft.EntityFrameworkCore;
using PosSystem.Infrastructure.Repositories;
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;
using Pomelo.EntityFrameworkCore.MySql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Data;
using System.Data.Common;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase));
        // Ignore unknown properties to handle extra fields from frontend (addOns, discount, etc.)
        options.JsonSerializerOptions.UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Skip;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Add CORS - Support both development and production origins
var allowedOrigins = builder.Configuration["CORS:AllowedOrigins"]?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) 
    ?? new[] { "http://localhost:4200" };

// Also allow the Railway domain if not already in the list
var railwayDomain = Environment.GetEnvironmentVariable("RAILWAY_PUBLIC_DOMAIN") 
    ?? "https://quickserve-production.up.railway.app";
if (!allowedOrigins.Contains(railwayDomain))
{
    var originsList = allowedOrigins.ToList();
    originsList.Add(railwayDomain);
    allowedOrigins = originsList.ToArray();
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngular", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Database Configuration - Use environment variable if available (Railway)
var connectionString = GetConnectionString(builder.Configuration);

if (string.IsNullOrEmpty(connectionString))
{
    throw new InvalidOperationException("Database connection string is not configured. Please set ConnectionStrings:DefaultConnection, MYSQL_URL, or individual MYSQL_* environment variables.");
}


// Helper function to get connection string from various sources
static string? GetConnectionString(IConfiguration configuration)
{
    // Try configuration first
    var configConnection = configuration.GetConnectionString("DefaultConnection");
    if (!string.IsNullOrEmpty(configConnection) && IsValidConnectionString(configConnection))
    {
        return configConnection;
    }
    
    // Try MYSQL_URL
    var mysqlUrl = Environment.GetEnvironmentVariable("MYSQL_URL");
    if (!string.IsNullOrEmpty(mysqlUrl))
    {
        var parsed = ParseRailwayMySqlUrl(mysqlUrl);
        if (!string.IsNullOrEmpty(parsed) && IsValidConnectionString(parsed))
        {
            return parsed;
        }
    }
    
    // Try DATABASE_URL
    var dbUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (!string.IsNullOrEmpty(dbUrl))
    {
        var parsed = ParseRailwayMySqlUrl(dbUrl);
        if (!string.IsNullOrEmpty(parsed) && IsValidConnectionString(parsed))
        {
            return parsed;
        }
    }
    
    // Try building from individual variables
    var built = BuildConnectionStringFromEnvVars();
    if (!string.IsNullOrEmpty(built) && IsValidConnectionString(built))
    {
        return built;
    }
    
    return null;
}

// Helper function to validate connection string format
static bool IsValidConnectionString(string? connectionString)
{
    if (string.IsNullOrWhiteSpace(connectionString)) return false;
    
    // Basic validation - should contain Server= or similar
    return connectionString.Contains("Server=", StringComparison.OrdinalIgnoreCase) ||
           connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase) ||
           connectionString.StartsWith("mysql://", StringComparison.OrdinalIgnoreCase);
}

// Helper function to parse Railway MySQL URL format (mysql://user:password@host:port/database)
static string? ParseRailwayMySqlUrl(string? url)
{
    if (string.IsNullOrWhiteSpace(url)) return null;
    
    try
    {
        // Handle mysql:// format
        if (url.StartsWith("mysql://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(url);
            var userInfo = uri.UserInfo.Split(':');
            var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "root";
            var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
            var host = uri.Host;
            var port = uri.Port > 0 ? uri.Port : 3306;
            var database = uri.AbsolutePath.TrimStart('/');
            
            if (string.IsNullOrEmpty(host) || string.IsNullOrEmpty(database))
            {
                return null;
            }
            
            return $"Server={host};Port={port};Database={database};Uid={username};Pwd={password};";
        }
        
        // If it's already in the correct format, return as-is
        if (url.Contains("Server=", StringComparison.OrdinalIgnoreCase))
        {
            return url;
        }
    }
    catch (Exception ex)
    {
        // Log error but don't throw - try other methods
    }
    
    return null;
}

// Helper function to build connection string from individual Railway MySQL environment variables
static string? BuildConnectionStringFromEnvVars()
{
    var host = Environment.GetEnvironmentVariable("MYSQLHOST") 
        ?? Environment.GetEnvironmentVariable("MYSQL_HOST");
    var port = Environment.GetEnvironmentVariable("MYSQLPORT") 
        ?? Environment.GetEnvironmentVariable("MYSQL_PORT") 
        ?? "3306";
    var database = Environment.GetEnvironmentVariable("MYSQLDATABASE") 
        ?? Environment.GetEnvironmentVariable("MYSQL_DATABASE");
    var user = Environment.GetEnvironmentVariable("MYSQLUSER") 
        ?? Environment.GetEnvironmentVariable("MYSQL_USER");
    var password = Environment.GetEnvironmentVariable("MYSQLPASSWORD") 
        ?? Environment.GetEnvironmentVariable("MYSQL_PASSWORD");
    
    if (string.IsNullOrEmpty(host) || string.IsNullOrEmpty(database) || 
        string.IsNullOrEmpty(user) || string.IsNullOrEmpty(password))
    {
        return null;
    }
    
    return $"Server={host};Port={port};Database={database};Uid={user};Pwd={password};";
}

builder.Services.AddDbContext<PosSystemDbContext>(options =>
{
    // Validate connection string before using it
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        throw new InvalidOperationException("Connection string is null or empty");
    }
    
    // Use a specific server version instead of AutoDetect to avoid connection during startup
    options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 21)));
});

// Register Application Services
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddScoped<ITransactionService, TransactionService>();
builder.Services.AddScoped<IInventoryService, InventoryService>();
builder.Services.AddScoped<IReportingService, ReportingService>();
builder.Services.AddScoped<IIngredientService, IngredientService>();
builder.Services.AddScoped<IStockMovementService, StockMovementService>();

// Register Repositories
builder.Services.AddScoped<IProductRepository, ProductRepository>();
builder.Services.AddScoped<ITransactionRepository, TransactionRepository>();
builder.Services.AddScoped<IIngredientRepository, IngredientRepository>();
builder.Services.AddScoped<IStockMovementRepository, StockMovementRepository>();
builder.Services.AddScoped<IUserRepository, UserRepository>();

// Register Infrastructure Services
builder.Services.AddScoped<IOfflineDataService, OfflineDataService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IFileService, FileService>();
builder.Services.AddScoped<IPrintService, PrintService>();
builder.Services.AddScoped<IAuthService, AuthService>();

// Configure JWT Authentication - Use environment variable if available (Railway)
// Try multiple environment variable formats for compatibility
var jwtSecretKey = builder.Configuration["Jwt:SecretKey"] 
    ?? Environment.GetEnvironmentVariable("JWT_SECRET_KEY")
    ?? Environment.GetEnvironmentVariable("JWT__SECRETKEY")  // ASP.NET Core format
    ?? Environment.GetEnvironmentVariable("Jwt__SecretKey")  // Alternative format
    ?? "YourSuperSecretKeyThatShouldBeAtLeast32CharactersLongForSecurity!";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] 
    ?? Environment.GetEnvironmentVariable("JWT_ISSUER")
    ?? Environment.GetEnvironmentVariable("JWT__ISSUER")
    ?? Environment.GetEnvironmentVariable("Jwt__Issuer")
    ?? "QuickServePOS";
var jwtAudience = builder.Configuration["Jwt:Audience"] 
    ?? Environment.GetEnvironmentVariable("JWT_AUDIENCE")
    ?? Environment.GetEnvironmentVariable("JWT__AUDIENCE")
    ?? Environment.GetEnvironmentVariable("Jwt__Audience")
    ?? "QuickServePOS";


builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretKey)),
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtAudience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("OwnerOnly", policy => policy.RequireRole("Owner"));
    options.AddPolicy("EmployeeOrOwner", policy => policy.RequireRole("Employee", "Owner"));
});

// Configure Kestrel to use PORT environment variable (Railway)
var port = Environment.GetEnvironmentVariable("PORT") ?? "5001";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Only use HTTPS redirection in production if not on Railway (Railway handles HTTPS)
if (!app.Environment.IsDevelopment() && string.IsNullOrEmpty(Environment.GetEnvironmentVariable("RAILWAY_ENVIRONMENT")))
{
app.UseHttpsRedirection();
}
// Ensure wwwroot directory exists for static files
// Try multiple possible locations for wwwroot
var contentRoot = app.Environment.ContentRootPath;
var possibleWwwrootPaths = new[]
{
    Path.Combine(contentRoot, "wwwroot"),
    Path.Combine(contentRoot, "out", "wwwroot"),  // Railway/NIXPACKS uses 'out' directory
    Path.Combine(contentRoot, "publish", "wwwroot"),
    Path.Combine("/app", "wwwroot"),
    Path.Combine("/app", "out", "wwwroot"),  // Railway/NIXPACKS uses 'out' directory
    Path.Combine("/app", "publish", "wwwroot"),
    Path.Combine("/app", "backend", "PosSystem", "PosSystem", "out", "wwwroot"),
    Path.Combine("/app", "backend", "PosSystem", "PosSystem", "publish", "wwwroot"),
    Path.Combine("/app", "backend", "PosSystem", "PosSystem", "wwwroot")
};

var wwwrootPath = possibleWwwrootPaths.FirstOrDefault(Directory.Exists);

if (wwwrootPath != null)
{
    var files = Directory.GetFiles(wwwrootPath, "*", SearchOption.AllDirectories);
    
    // Use WebHostEnvironment to set WebRootPath
    var webHostEnv = app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
    webHostEnv.WebRootPath = wwwrootPath;
}
else
{
    // Try to create wwwroot in the most likely location
    wwwrootPath = Path.Combine(contentRoot, "wwwroot");
    Directory.CreateDirectory(wwwrootPath);
    var webHostEnvForEmpty = app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
    webHostEnvForEmpty.WebRootPath = wwwrootPath;
}

// Get the final wwwroot path after search
var finalWwwrootPath = wwwrootPath ?? Path.Combine(contentRoot, "wwwroot");
var webHostEnvFinal = app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
webHostEnvFinal.WebRootPath = finalWwwrootPath;

// Create FileProvider for static files
var fileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(finalWwwrootPath);

// Enable default files (index.html) with explicit FileProvider
app.UseDefaultFiles(new DefaultFilesOptions
{
    DefaultFileNames = new List<string> { "index.html" },
    FileProvider = fileProvider
});

// Configure static files with explicit FileProvider
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = fileProvider,
    ServeUnknownFileTypes = true,
    DefaultContentType = "application/octet-stream",
    OnPrepareResponse = ctx =>
    {
        var path = ctx.File.Name;
        var extension = Path.GetExtension(path).ToLowerInvariant();
        
        // Don't cache HTML files - they need to be fresh for updates
        if (extension == ".html" || path == "index.html" || path.EndsWith("/index.html"))
        {
            ctx.Context.Response.Headers.Append("Cache-Control", "no-cache, no-store, must-revalidate");
            ctx.Context.Response.Headers.Append("Pragma", "no-cache");
            ctx.Context.Response.Headers.Append("Expires", "0");
        }
        // Cache hashed assets (JS/CSS with hash in filename) for 1 year
        // Angular adds hashes like main.507dde0c75bf1966.js, so these are safe to cache
        else if ((extension == ".js" || extension == ".css") && path.Contains("."))
        {
            // Check if filename has a hash (format: name.hash.ext)
            var fileName = Path.GetFileNameWithoutExtension(path);
            if (fileName.Contains(".") && fileName.Split('.').Length >= 2)
            {
                // Hashed file - safe to cache long-term
                ctx.Context.Response.Headers.Append("Cache-Control", "public,max-age=31536000,immutable");
            }
            else
            {
                // Non-hashed file - cache for shorter time
                ctx.Context.Response.Headers.Append("Cache-Control", "public,max-age=3600");
            }
        }
        // Cache other static assets (images, fonts, etc.) for 1 year
        else
        {
            ctx.Context.Response.Headers.Append("Cache-Control", "public,max-age=31536000");
        }
    }
});

app.UseCors("AllowAngular");
app.UseAuthentication();
app.UseAuthorization();

// Custom middleware - Request logging must come before exception handling
app.UseMiddleware<PosSystem.API.Middleware.RequestLoggingMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();

app.MapControllers();

// Serve frontend - fallback to index.html for Angular routing
// This must be last so API routes are checked first
var fallbackFile = Path.Combine(finalWwwrootPath, "index.html");
app.MapFallbackToFile("index.html", new StaticFileOptions
{
    FileProvider = fileProvider
});

// Ensure database is created (with categories only)
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<PosSystemDbContext>();
    await context.Database.EnsureCreatedAsync();
    
    // Ensure Ingredients table exists (for existing databases)
    // EnsureCreatedAsync only creates tables if database is new, so we need to create Ingredients table manually if it doesn't exist
    try
    {
        // Create table if it doesn't exist (with all columns including new ones)
        await context.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS `Ingredients` (
                `Id` VARCHAR(255) NOT NULL,
                `Name` VARCHAR(100) NOT NULL,
                `Quantity` DECIMAL(18,2) NOT NULL,
                `Unit` VARCHAR(20) NOT NULL,
                `Supplier` VARCHAR(100) NULL,
                `ExpirationDate` DATETIME(6) NULL,
                `LowStockThreshold` DECIMAL(18,2) NOT NULL,
                `UnitCost` DECIMAL(18,2) NULL,
                `LastPurchaseDate` DATETIME(6) NULL,
                `LastPurchaseCost` DECIMAL(18,2) NULL,
                `CreatedAt` DATETIME(6) NOT NULL,
                `UpdatedAt` DATETIME(6) NOT NULL,
                `IsActive` TINYINT(1) NOT NULL DEFAULT 1,
                PRIMARY KEY (`Id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
    }
    catch
    {
        // Table might already exist, ignore error
    }
    
    // Try to add new columns to existing table (if table was created before these columns were added)
    // These will fail silently if columns already exist, which is expected and harmless
    // Note: EF Core will log these errors, but they're expected when columns already exist
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Ingredients` ADD COLUMN `UnitCost` DECIMAL(18,2) NULL");
    }
    catch
    {
        // Column already exists - expected, ignore
    }
    
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Ingredients` ADD COLUMN `LastPurchaseDate` DATETIME(6) NULL");
    }
    catch
    {
        // Column already exists - expected, ignore
    }
    
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Ingredients` ADD COLUMN `LastPurchaseCost` DECIMAL(18,2) NULL");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    // Ensure StockMovements table exists
    try
    {
        await context.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS `StockMovements` (
                `Id` VARCHAR(255) NOT NULL,
                `IngredientId` VARCHAR(255) NOT NULL,
                `MovementType` INT NOT NULL,
                `Quantity` DECIMAL(18,2) NOT NULL,
                `UnitCost` DECIMAL(18,2) NULL,
                `Reason` VARCHAR(200) NULL,
                `Notes` VARCHAR(500) NULL,
                `CreatedBy` VARCHAR(100) NULL,
                `CreatedAt` DATETIME(6) NOT NULL,
                PRIMARY KEY (`Id`),
                INDEX `IX_StockMovements_IngredientId` (`IngredientId`),
                INDEX `IX_StockMovements_CreatedAt` (`CreatedAt`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
    }
    catch
    {
        // Table might already exist, ignore error
    }

    // Ensure Users table exists
    try
    {
        await context.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS `Users` (
                `Id` VARCHAR(255) NOT NULL,
                `Username` VARCHAR(50) NOT NULL,
                `PasswordHash` TEXT NOT NULL,
                `Role` INT NOT NULL,
                `CreatedAt` DATETIME(6) NOT NULL,
                `LastLoginAt` DATETIME(6) NULL,
                `IsActive` TINYINT(1) NOT NULL DEFAULT 1,
                PRIMARY KEY (`Id`),
                UNIQUE KEY `IX_Users_Username` (`Username`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
    }
    catch
    {
        // Table might already exist, ignore error
    }

    // Ensure ApplicationSettings table exists
    try
    {
        await context.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS `ApplicationSettings` (
                `Id` VARCHAR(255) NOT NULL,
                `Key` VARCHAR(100) NOT NULL,
                `Value` TEXT NOT NULL,
                `UpdatedAt` DATETIME(6) NOT NULL,
                `UpdatedBy` VARCHAR(100) NULL,
                PRIMARY KEY (`Id`),
                UNIQUE KEY `IX_ApplicationSettings_Key` (`Key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
    }
    catch
    {
        // Table might already exist, ignore error
    }

    // Add new columns to Products table (HotPrice, ColdPrice)
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Products` ADD COLUMN `HotPrice` DECIMAL(18,2) NULL");
    }
    catch
    {
        // Column already exists - expected, ignore
    }
    
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Products` ADD COLUMN `ColdPrice` DECIMAL(18,2) NULL");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    // Add new columns to Transactions table (ServiceType, ServiceFee)
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Transactions` ADD COLUMN `ServiceType` INT NOT NULL DEFAULT 0");
    }
    catch
    {
        // Column already exists - expected, ignore
    }
    
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Transactions` ADD COLUMN `ServiceFee` DECIMAL(18,2) NOT NULL DEFAULT 0");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    // Add new columns to TransactionItem table (BasePrice, Temperature)
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `BasePrice` DECIMAL(18,2) NOT NULL DEFAULT 0");
    }
    catch
    {
        // Column already exists - expected, ignore
    }
    
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `Temperature` INT NOT NULL DEFAULT 0");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `Category` VARCHAR(100) NOT NULL DEFAULT 'General'");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    // Add Discount columns to TransactionItem table
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `Discount_Type` VARCHAR(50) NULL");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `Discount_Percentage` DECIMAL(18,2) NOT NULL DEFAULT 0");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `Discount_Amount` DECIMAL(18,2) NOT NULL DEFAULT 0");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    // Add LowQuantityThreshold column to Products table
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Products` ADD COLUMN `LowQuantityThreshold` INT NOT NULL DEFAULT 10");
    }
    catch
    {
        // Column already exists - expected, ignore
    }
    
    await SeedData.InitializeAsync(context); // Seed full product list
    await SeedData.InitializeUsersAsync(context); // Seed default users

    // Add AmountReceived and Change columns to Transactions table (Manual migration for Railway)
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Transactions` ADD COLUMN `AmountReceived` DECIMAL(18,2) NOT NULL DEFAULT 0");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Transactions` ADD COLUMN `Change` DECIMAL(18,2) NOT NULL DEFAULT 0");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    // Add CustomerInfo Discount columns to Transactions table
    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Transactions` ADD COLUMN `CustomerInfo_DiscountType` VARCHAR(20) NULL");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    try
    {
        await context.Database.ExecuteSqlRawAsync("ALTER TABLE `Transactions` ADD COLUMN `CustomerInfo_DiscountId` VARCHAR(50) NULL");
    }
    catch
    {
        // Column already exists - expected, ignore
    }

    // Ensure TransactionItem table exists (Manual migration for Railway)
    // Railway database uses SINGULAR naming: TransactionItem (not TransactionItems)
    try 
    {
        await context.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS `TransactionItem` (
                `TransactionId` INT NOT NULL,
                `Id` INT NOT NULL AUTO_INCREMENT,
                `ProductId` VARCHAR(255) NOT NULL,
                `Name` VARCHAR(100) NOT NULL,
                `Category` VARCHAR(100) NOT NULL DEFAULT 'General',
                `Price` DECIMAL(18,2) NOT NULL,
                `BasePrice` DECIMAL(18,2) NOT NULL DEFAULT 0,
                `Temperature` INT NOT NULL DEFAULT 0,
                `Quantity` INT NOT NULL,
                `Discount_Type` VARCHAR(50) NULL,
                `Discount_Percentage` DECIMAL(18,2) NOT NULL DEFAULT 0,
                `Discount_Amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
                PRIMARY KEY (`TransactionId`, `Id`),
                KEY `Id` (`Id`),
                CONSTRAINT `FK_TransactionItem_Transactions_TransactionId` FOREIGN KEY (`TransactionId`) REFERENCES `Transactions` (`Id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
    }
    catch
    {
        // Table might already exist, ignore error
    }

    // Explicitly add columns if they don't exist (handling case where table exists but columns don't)
    try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `Discount_Type` VARCHAR(50) NULL"); } catch { }
    try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `Discount_Percentage` DECIMAL(18,2) NOT NULL DEFAULT 0"); } catch { }
    try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE `TransactionItem` ADD COLUMN `Discount_Amount` DECIMAL(18,2) NOT NULL DEFAULT 0"); } catch { }

    // Ensure AddOn table exists (Manual migration for Railway)
    // Railway database uses SINGULAR naming: AddOn (not AddOns)
    try 
    {
        await context.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS `AddOn` (
                `TransactionItemTransactionId` INT NOT NULL,
                `TransactionItemId` INT NOT NULL,
                `Id` INT NOT NULL AUTO_INCREMENT,
                `Name` VARCHAR(100) NOT NULL,
                `Price` DECIMAL(18,2) NOT NULL,
                `Quantity` INT NOT NULL DEFAULT 1,
                PRIMARY KEY (`TransactionItemTransactionId`, `TransactionItemId`, `Id`),
                CONSTRAINT `FK_AddOn_TransactionItem` FOREIGN KEY (`TransactionItemTransactionId`, `TransactionItemId`) 
                REFERENCES `TransactionItem` (`TransactionId`, `Id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
    }
    catch
    {
        // Table might already exist, ignore error
    }
}

app.Run();
