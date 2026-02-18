# DATABASE_AGENT.md - QuickServe Database Specialist

## Role & Responsibilities

The Database Agent specializes in MySQL database operations for QuickServe, focusing on:
- Entity Framework Core migrations
- Database schema design and optimization
- MySQL-specific features and constraints
- Seed data management
- Database connection configuration
- Query optimization
- Data integrity and relationships

## Technology Stack

- **Database**: MySQL 8.0
- **ORM**: Entity Framework Core 8.0
- **Provider**: Pomelo.EntityFrameworkCore.MySql
- **Migration Tool**: EF Core Migrations
- **Connection**: Via connection string or individual environment variables

## Database Configuration

### Connection String Format

```
Server=hostname;Port=3306;Database=quickserve;User=username;Password=password;CharSet=utf8mb4;
```

### Environment Variables

- `MYSQL_URL`: Full connection string (takes precedence)
- `MYSQL_HOST`: Database hostname
- `MYSQL_PORT`: Database port (default: 3306)
- `MYSQL_DATABASE`: Database name
- `MYSQL_USER`: Database username
- `MYSQL_PASSWORD`: Database password

### Connection Configuration in Program.cs

```csharp
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? Environment.GetEnvironmentVariable("MYSQL_URL")
    ?? BuildConnectionStringFromEnv();

builder.Services.AddDbContext<PosSystemDbContext>(options =>
    options.UseMySql(
        connectionString,
        ServerVersion.AutoDetect(connectionString),
        mySqlOptions => mySqlOptions
            .CharSetBehavior(CharSetBehavior.NeverAppend)
            .EnableStringComparisonTranslations()
    ));

static string BuildConnectionStringFromEnv()
{
    var host = Environment.GetEnvironmentVariable("MYSQL_HOST") ?? "localhost";
    var port = Environment.GetEnvironmentVariable("MYSQL_PORT") ?? "3306";
    var database = Environment.GetEnvironmentVariable("MYSQL_DATABASE") ?? "quickserve";
    var user = Environment.GetEnvironmentVariable("MYSQL_USER") ?? "root";
    var password = Environment.GetEnvironmentVariable("MYSQL_PASSWORD") ?? "";

    return $"Server={host};Port={port};Database={database};User={user};Password={password};CharSet=utf8mb4;";
}
```

## Entity Framework Patterns

### DbContext Configuration

### DbContext Configuration
```csharp
public class PosSystemDbContext : DbContext
{
    public PosSystemDbContext(DbContextOptions<PosSystemDbContext> options) : base(options)
    {
    }

    public DbSet<Product> Products { get; set; }
    public DbSet<Transaction> Transactions { get; set; } // Items and AddOns are owned entities
    public DbSet<Ingredient> Ingredients { get; set; }
    public DbSet<StockMovement> StockMovements { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<ApplicationSettings> ApplicationSettings { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Product configuration
        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Price).HasPrecision(18, 2);
            // Category is stored as a string
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50); 
            // ... other properties
        });

        // Transaction configuration (Aggregate Root)
        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.OwnsOne(e => e.CustomerInfo); // Embedded CustomerInfo
            
            entity.OwnsMany(e => e.Items, items =>
            {
                items.ToTable("TransactionItem");
                items.OwnsOne(i => i.Discount);
                
                items.OwnsMany(i => i.AddOns, addons => 
                {
                    addons.ToTable("AddOn");
                    addons.Property<int>("Id").ValueGeneratedOnAdd();
                    addons.HasKey("Id", "TransactionItemTransactionId", "TransactionItemId");
                });
            });
        });
        
        // ... other entities (Ingredient, StockMovement, User, ApplicationSettings)
    }
}
```

## Migration Management

### Creating Migrations

```bash
# Navigate to backend project
cd backend/PosSystem/PosSystem

# Create a new migration
dotnet ef migrations add AddNewColumnToProducts --context PosSystemDbContext

# Review the generated migration file before applying
```

### Migration File Structure

```csharp
public partial class AddNewColumnToProducts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "NewColumn",
            table: "Products",
            type: "varchar(200)",
            maxLength: 200,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "NewColumn",
            table: "Products");
    }
}
```

### Applying Migrations

```bash
# Apply all pending migrations
dotnet ef database update --context PosSystemDbContext

# Apply to specific migration
dotnet ef database update MigrationName --context PosSystemDbContext

# Rollback to previous migration
dotnet ef database update PreviousMigrationName --context PosSystemDbContext
```

### Manual Table Creation (Railway Compatibility)

For Railway deployment, tables may need to be created manually:

```csharp
// In Program.cs - after DbContext registration
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<PosSystemDbContext>();
    
    // Ensure database exists
    dbContext.Database.EnsureCreated();
    
    // Or apply migrations programmatically
    // dbContext.Database.Migrate();
}
```

## Seed Data

### Seed Data Pattern

### Seed Data Pattern
```csharp
public static class SeedData
{
    public static void Initialize(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<PosSystemDbContext>();

        // Ensure database is created
        context.Database.EnsureCreated();

        // Seed Application Settings
        if (!context.ApplicationSettings.Any())
        {
            context.ApplicationSettings.AddRange(
                new ApplicationSettings { Key = "StoreName", Value = "My Lemon POS" },
                new ApplicationSettings { Key = "TaxRate", Value = "0.10" }
            );
            context.SaveChanges();
        }

        // Seed products (with string categories)
        if (!context.Products.Any())
        {
            context.Products.AddRange(
                new Product
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = "Burger",
                    Price = 5.99m,
                    Category = "Food", // String property
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                }
            );
            context.SaveChanges();
        }

        // Seed default user
        if (!context.Users.Any())
        {
            // Hash password before storing
            var hashedPassword = BCrypt.Net.BCrypt.HashPassword("admin123");
            context.Users.Add(
                new User
                {
                    Id = Guid.NewGuid().ToString(),
                    Username = "admin",
                    PasswordHash = hashedPassword,
                    Role = "Owner",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                }
            );
            context.SaveChanges();
        }
    }
}
```

## Best Practices

### 1. String IDs
- Use `Guid.NewGuid().ToString()` for string-based primary keys
- Set appropriate `HasMaxLength()` constraints (typically 36 for GUIDs)

### 2. Timestamps
- Always use `DateTime.UtcNow` for `CreatedAt` and `UpdatedAt`
- Consider adding indexes on timestamp columns for query performance

### 3. Decimal Precision
- Use `HasPrecision(18, 2)` for monetary values
- Ensures consistent decimal handling across MySQL versions

### 4. String Lengths
- Always specify `HasMaxLength()` for string properties
- Prevents unexpected truncation and improves performance

### 5. Indexes
- Add indexes on frequently queried columns (foreign keys, names, timestamps)
- Use unique indexes where appropriate (e.g., usernames, category names)

### 6. Relationships
- Use appropriate `OnDelete` behaviors:
  - `Cascade`: Delete related records (TransactionItems when Transaction deleted)
  - `SetNull`: Set foreign key to null (Products when Category deleted)
  - `Restrict`: Prevent deletion if related records exist

### 7. CharSet
- Always use `utf8mb4` for full Unicode support (emojis, special characters)

## Common Database Operations

### Query Patterns

```csharp
// Include related entities
var products = await _context.Products
    .Include(p => p.Category)
    .ToListAsync();

// Filtered query
var activeProducts = await _context.Products
    .Where(p => p.IsActive)
    .ToListAsync();

// Pagination
var page = 1;
var pageSize = 20;
var products = await _context.Products
    .Skip((page - 1) * pageSize)
    .Take(pageSize)
    .ToListAsync();

// Aggregation
var totalSales = await _context.Transactions
    .Where(t => t.CreatedAt >= startDate && t.CreatedAt <= endDate)
    .SumAsync(t => t.TotalAmount);
```

### Transaction Management

```csharp
using var transaction = await _context.Database.BeginTransactionAsync();
try
{
    // Multiple operations
    await _context.Products.AddAsync(product);
    await _context.SaveChangesAsync();
    
    await _context.StockMovements.AddAsync(stockMovement);
    await _context.SaveChangesAsync();
    
    await transaction.CommitAsync();
}
catch
{
    await transaction.RollbackAsync();
    throw;
}
```

## Railway MySQL Access

### Accessing Railway MySQL Database

**Method 1: Railway Dashboard**
1. Go to Railway Dashboard
2. Select your project → MySQL service
3. Go to "Data" or "Connect" tab
4. Click "Query" or "Open MySQL Console"

**Method 2: Railway CLI**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link project
railway login
railway link

# Connect to MySQL
railway connect mysql
```

**Method 3: Direct Connection**
Use connection string from Railway environment variables:
```bash
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE
```

## Troubleshooting

### Connection Issues

```bash
# Test MySQL connection
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE

# Test from Railway
railway run mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE
```

### Migration Issues

```bash
# Remove last migration (if not applied)
dotnet ef migrations remove --context PosSystemDbContext

# Reset database (WARNING: Deletes all data)
dotnet ef database drop --context PosSystemDbContext
dotnet ef database update --context PosSystemDbContext
```

### Check Table Structure

```sql
-- List all tables
SHOW TABLES;

-- Describe table structure
DESCRIBE Products;

-- Show table creation SQL
SHOW CREATE TABLE Products;
```

## Performance Optimization

### Indexes

```csharp
// Add composite index
modelBuilder.Entity<Transaction>()
    .HasIndex(t => new { t.UserId, t.CreatedAt });

// Add full-text index (MySQL 5.6+)
modelBuilder.Entity<Product>()
    .HasIndex(p => p.Name)
    .HasDatabaseName("idx_product_name_fulltext")
    .IsFullText();
```

### Query Optimization

- Use `AsNoTracking()` for read-only queries
- Use `Select()` to project only needed fields
- Avoid N+1 queries by using `Include()` or `ThenInclude()`

```csharp
// Efficient: Single query with includes
var transactions = await _context.Transactions
    .Include(t => t.Items)
        .ThenInclude(ti => ti.Product)
    .AsNoTracking()
    .ToListAsync();
```

## References

- Main project guidelines: `docs/AGENTS.md` (if exists)
- Backend development: `docs/BACKEND_AGENT.md`
- EF Core documentation: https://learn.microsoft.com/en-us/ef/core/
- Pomelo MySQL provider: https://github.com/PomeloFoundation/Pomelo.EntityFrameworkCore.MySql
