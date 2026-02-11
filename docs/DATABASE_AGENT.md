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

```csharp
public class PosSystemDbContext : DbContext
{
    public PosSystemDbContext(DbContextOptions<PosSystemDbContext> options)
        : base(options)
    {
    }

    public DbSet<Product> Products { get; set; }
    public DbSet<Category> Categories { get; set; }
    public DbSet<Transaction> Transactions { get; set; }
    public DbSet<TransactionItem> TransactionItems { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<Ingredient> Ingredients { get; set; }
    public DbSet<StockMovement> StockMovements { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure Product entity
        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(36);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.Price).HasPrecision(18, 2);
            entity.Property(e => e.HotPrice).HasPrecision(18, 2);
            entity.Property(e => e.ImageUrl).HasMaxLength(500);
            entity.HasIndex(e => e.Name);
            entity.HasIndex(e => e.CategoryId);
        });

        // Configure Category entity
        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(36);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.HasIndex(e => e.Name).IsUnique();
        });

        // Configure Transaction entity
        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(36);
            entity.Property(e => e.TotalAmount).HasPrecision(18, 2);
            entity.Property(e => e.PaymentMethod).HasMaxLength(50);
            entity.HasIndex(e => e.CreatedAt);
            entity.HasIndex(e => e.UserId);
        });

        // Configure TransactionItem entity
        modelBuilder.Entity<TransactionItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasMaxLength(36);
            entity.Property(e => e.Quantity).IsRequired();
            entity.Property(e => e.Price).HasPrecision(18, 2);
            entity.Property(e => e.TotalPrice).HasPrecision(18, 2);
        });

        // Configure relationships
        modelBuilder.Entity<Product>()
            .HasOne(p => p.Category)
            .WithMany(c => c.Products)
            .HasForeignKey(p => p.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<TransactionItem>()
            .HasOne(ti => ti.Transaction)
            .WithMany(t => t.Items)
            .HasForeignKey(ti => ti.TransactionId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<TransactionItem>()
            .HasOne(ti => ti.Product)
            .WithMany()
            .HasForeignKey(ti => ti.ProductId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Transaction>()
            .HasOne(t => t.User)
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.SetNull);
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

```csharp
public static class SeedData
{
    public static void Initialize(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<PosSystemDbContext>();

        // Ensure database is created
        context.Database.EnsureCreated();

        // Seed categories
        if (!context.Categories.Any())
        {
            context.Categories.AddRange(
                new Category { Id = Guid.NewGuid().ToString(), Name = "Food" },
                new Category { Id = Guid.NewGuid().ToString(), Name = "Beverages" },
                new Category { Id = Guid.NewGuid().ToString(), Name = "Desserts" }
            );
            context.SaveChanges();
        }

        // Seed products
        if (!context.Products.Any())
        {
            var foodCategory = context.Categories.First(c => c.Name == "Food");
            context.Products.AddRange(
                new Product
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = "Burger",
                    Price = 5.99m,
                    CategoryId = foodCategory.Id,
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
