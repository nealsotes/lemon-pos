# BACKEND_AGENT.md - QuickServe Backend Specialist

## Role & Responsibilities

The Backend Agent specializes in .NET 8 Web API development, focusing on:
- RESTful API design and implementation
- Entity Framework Core with MySQL (Pomelo)
- Repository and Service layer patterns
- JWT authentication and authorization
- Middleware development
- Database migrations and schema management

## Technology Stack

- **Framework**: .NET 8.0
- **ORM**: Entity Framework Core 8.0
- **Database Provider**: Pomelo.EntityFrameworkCore.MySql
- **Authentication**: JWT Bearer tokens
- **Logging**: ILogger<T> with structured logging
- **API**: ASP.NET Core Web API

## Project Structure

```
backend/PosSystem/PosSystem/
├── API/
│   ├── Controllers/          # REST API endpoints
│   └── Middleware/           # Custom middleware (exception handling, logging)
├── Core/
│   ├── Interfaces/           # Service and repository contracts
│   └── Models/               # Domain models and DTOs
├── Infrastructure/
│   ├── Data/                 # DbContext and seed data
│   ├── Repositories/         # Repository implementations
│   └── Services/             # Business logic services
├── Migrations/               # EF Core migrations
└── Program.cs                # Application entry point
```

## Code Patterns

### Controller Pattern

```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Employee")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    private readonly ILogger<ProductsController> _logger;

    public ProductsController(
        IProductService productService,
        ILogger<ProductsController> logger)
    {
        _productService = productService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Product>>> GetProducts()
    {
        var products = await _productService.GetAllProductsAsync();
        return Ok(products);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Product>> GetProduct(string id)
    {
        var product = await _productService.GetProductByIdAsync(id);
        if (product == null) return NotFound();
        return Ok(product);
    }

    [HttpPost]
    [Authorize(Roles = "Owner")]
    public async Task<ActionResult<Product>> CreateProduct(Product product)
    {
        try
        {
            var created = await _productService.CreateProductAsync(product);
            return CreatedAtAction(nameof(GetProduct), new { id = created.Id }, created);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid product data");
            return BadRequest(ex.Message);
        }
    }
}
```

### Service Pattern

```csharp
public class ProductService : IProductService
{
    private readonly IProductRepository _productRepository;
    private readonly ILogger<ProductService> _logger;

    public ProductService(
        IProductRepository productRepository,
        ILogger<ProductService> logger)
    {
        _productRepository = productRepository;
        _logger = logger;
    }

    public async Task<IEnumerable<Product>> GetAllProductsAsync()
    {
        return await _productRepository.GetAllAsync();
    }

    public async Task<Product?> GetProductByIdAsync(string id)
    {
        if (string.IsNullOrEmpty(id))
            throw new ArgumentException("Product ID cannot be null or empty", nameof(id));

        return await _productRepository.GetByIdAsync(id);
    }

    public async Task<Product> CreateProductAsync(Product product)
    {
        if (product == null)
            throw new ArgumentNullException(nameof(product));

        // Business logic validation
        if (string.IsNullOrWhiteSpace(product.Name))
            throw new ArgumentException("Product name is required", nameof(product));

        product.Id = Guid.NewGuid().ToString();
        product.CreatedAt = DateTime.UtcNow;
        product.UpdatedAt = DateTime.UtcNow;

        await _productRepository.AddAsync(product);
        await _productRepository.SaveChangesAsync();

        _logger.LogInformation("Created product {ProductId}: {ProductName}", 
            product.Id, product.Name);

        return product;
    }
}
```

### Repository Pattern

```csharp
public class ProductRepository : IProductRepository
{
    private readonly PosSystemDbContext _context;

    public ProductRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Product>> GetAllAsync()
    {
        return await _context.Products
            .Include(p => p.Category)
            .ToListAsync();
    }

    public async Task<Product?> GetByIdAsync(string id)
    {
        return await _context.Products
            .Include(p => p.Category)
            .FirstOrDefaultAsync(p => p.Id == id);
    }

    public async Task AddAsync(Product product)
    {
        await _context.Products.AddAsync(product);
    }

    public async Task<int> SaveChangesAsync()
    {
        return await _context.SaveChangesAsync();
    }
}
```

## Database Operations

### Migration Commands

```bash
# Create a new migration
cd backend/PosSystem/PosSystem
dotnet ef migrations add MigrationName --context PosSystemDbContext

# Apply migrations to database
dotnet ef database update --context PosSystemDbContext

# Remove last migration (if not applied)
dotnet ef migrations remove --context PosSystemDbContext
```

### DbContext Pattern

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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure entity relationships
        modelBuilder.Entity<Product>()
            .HasOne(p => p.Category)
            .WithMany(c => c.Products)
            .HasForeignKey(p => p.CategoryId);

        // Configure indexes
        modelBuilder.Entity<Product>()
            .HasIndex(p => p.Name);

        // Configure string lengths
        modelBuilder.Entity<Product>()
            .Property(p => p.Name)
            .HasMaxLength(200);
    }
}
```

## Authentication & Authorization

### JWT Configuration

```csharp
// In Program.cs
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("OwnerOnly", policy => policy.RequireRole("Owner"));
    options.AddPolicy("EmployeeOrOwner", policy => 
        policy.RequireRole("Owner", "Employee"));
});
```

### Role-Based Authorization

- **Owner**: Full access to all endpoints
- **Employee**: Limited access (read products, create transactions, cannot modify inventory)

## Error Handling

### Middleware Pattern

```csharp
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "An unhandled exception occurred");
            await HandleExceptionAsync(context, ex);
        }
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";
        
        var statusCode = exception switch
        {
            ArgumentException => StatusCodes.Status400BadRequest,
            KeyNotFoundException => StatusCodes.Status404NotFound,
            UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
            _ => StatusCodes.Status500InternalServerError
        };

        context.Response.StatusCode = statusCode;

        var response = new
        {
            status = statusCode,
            message = exception.Message,
            detail = exception.GetType().Name
        };

        return context.Response.WriteAsJsonAsync(response);
    }
}
```

## Best Practices

1. **Async/Await**: Always use async methods for I/O operations
2. **Dependency Injection**: Register all services in `Program.cs` with appropriate lifetime
3. **Logging**: Use structured logging with `ILogger<T>`
4. **Validation**: Validate input at service layer, not just controller
5. **Timestamps**: Always use `DateTime.UtcNow` for database timestamps
6. **IDs**: Use `Guid.NewGuid().ToString()` for string-based IDs
7. **Error Messages**: Return meaningful error messages, but don't expose internal details
8. **HTTP Status Codes**: Use appropriate status codes (200, 201, 400, 401, 404, 500)

## Common Tasks

### Adding a New Entity

1. Create model in `Core/Models/`
2. Add DbSet to `PosSystemDbContext`
3. Configure relationships in `OnModelCreating`
4. Create interface in `Core/Interfaces/`
5. Create repository in `Infrastructure/Repositories/`
6. Create service in `Infrastructure/Services/`
7. Create controller in `API/Controllers/`
8. Register services in `Program.cs`
9. Create and apply migration

### Adding a New Endpoint

1. Add method to service interface
2. Implement in service class
3. Add controller action with appropriate HTTP verb and route
4. Add authorization attributes if needed
5. Test with HTTP file or Postman

## Testing

### Unit Testing

```csharp
public class ProductServiceTests
{
    private readonly Mock<IProductRepository> _mockRepository;
    private readonly Mock<ILogger<ProductService>> _mockLogger;
    private readonly ProductService _service;

    public ProductServiceTests()
    {
        _mockRepository = new Mock<IProductRepository>();
        _mockLogger = new Mock<ILogger<ProductService>>();
        _service = new ProductService(_mockRepository.Object, _mockLogger.Object);
    }

    [Fact]
    public async Task GetProductByIdAsync_WithValidId_ReturnsProduct()
    {
        // Arrange
        var productId = "test-id";
        var expectedProduct = new Product { Id = productId, Name = "Test Product" };
        _mockRepository.Setup(r => r.GetByIdAsync(productId))
            .ReturnsAsync(expectedProduct);

        // Act
        var result = await _service.GetProductByIdAsync(productId);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(productId, result.Id);
    }
}
```

## Environment Variables

- `MYSQL_URL`: Full MySQL connection string
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`: Individual connection parts
- `JWT__KEY`: JWT signing key (use `__` for nested config)
- `JWT__ISSUER`: JWT issuer
- `JWT__AUDIENCE`: JWT audience
- `PORT`: Server port (defaults to 5001)

## References

- Main project guidelines: `docs/AGENTS.md` (if exists)
- Database operations: `docs/DATABASE_AGENT.md`
- Deployment: `docs/DEVOPS_AGENT.md`
