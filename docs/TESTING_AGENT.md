# TESTING_AGENT.md - QuickServe Testing Specialist

## Role & Responsibilities

The Testing Agent specializes in testing strategies for QuickServe, focusing on:
- Unit testing for backend (.NET) and frontend (Angular)
- Integration testing for API endpoints
- End-to-end testing workflows
- Test coverage and quality metrics
- Mocking and test data management
- Continuous testing in CI/CD

## Technology Stack

### Backend Testing
- **Framework**: xUnit
- **Mocking**: Moq
- **Assertions**: FluentAssertions (optional)
- **Test Runner**: dotnet test

### Frontend Testing
- **Framework**: Jasmine/Karma
- **Test Runner**: Angular CLI (ng test)
- **Mocking**: Jasmine spies
- **E2E**: Protractor or Cypress (if configured)

## Backend Testing

### Project Structure

```
backend/PosSystem/PosSystem.Tests/
├── Controllers/
│   └── ProductsControllerTests.cs
├── Services/
│   └── ProductServiceTests.cs
├── Repositories/
│   └── ProductRepositoryTests.cs
└── PosSystem.Tests.csproj
```

### Test Project Setup

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />
    <PackageReference Include="xunit" Version="2.6.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.5.3" />
    <PackageReference Include="Moq" Version="4.20.69" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.InMemory" Version="8.0.0" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\PosSystem\PosSystem.csproj" />
  </ItemGroup>
</Project>
```

### Service Unit Tests

```csharp
using Xunit;
using Moq;
using Microsoft.Extensions.Logging;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests.Services;

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
    public async Task GetAllProductsAsync_ReturnsAllProducts()
    {
        // Arrange
        var expectedProducts = new List<Product>
        {
            new Product { Id = "1", Name = "Product 1", Price = 10.00m },
            new Product { Id = "2", Name = "Product 2", Price = 20.00m }
        };

        _mockRepository.Setup(r => r.GetAllAsync())
            .ReturnsAsync(expectedProducts);

        // Act
        var result = await _service.GetAllProductsAsync();

        // Assert
        Assert.NotNull(result);
        Assert.Equal(2, result.Count());
        _mockRepository.Verify(r => r.GetAllAsync(), Times.Once);
    }

    [Fact]
    public async Task GetProductByIdAsync_WithValidId_ReturnsProduct()
    {
        // Arrange
        var productId = "test-id";
        var expectedProduct = new Product 
        { 
            Id = productId, 
            Name = "Test Product", 
            Price = 15.99m 
        };

        _mockRepository.Setup(r => r.GetByIdAsync(productId))
            .ReturnsAsync(expectedProduct);

        // Act
        var result = await _service.GetProductByIdAsync(productId);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(productId, result.Id);
        Assert.Equal("Test Product", result.Name);
    }

    [Fact]
    public async Task GetProductByIdAsync_WithInvalidId_ThrowsArgumentException()
    {
        // Arrange
        string? nullId = null;

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => _service.GetProductByIdAsync(nullId!));
    }

    [Fact]
    public async Task CreateProductAsync_WithValidProduct_CreatesAndReturnsProduct()
    {
        // Arrange
        var newProduct = new Product
        {
            Name = "New Product",
            Price = 25.00m,
            IsActive = true
        };

        _mockRepository.Setup(r => r.AddAsync(It.IsAny<Product>()));
        _mockRepository.Setup(r => r.SaveChangesAsync())
            .ReturnsAsync(1);

        // Act
        var result = await _service.CreateProductAsync(newProduct);

        // Assert
        Assert.NotNull(result);
        Assert.NotNull(result.Id);
        Assert.Equal("New Product", result.Name);
        Assert.NotNull(result.CreatedAt);
        _mockRepository.Verify(r => r.AddAsync(It.IsAny<Product>()), Times.Once);
        _mockRepository.Verify(r => r.SaveChangesAsync(), Times.Once);
    }
}
```

### Controller Unit Tests

```csharp
using Xunit;
using Moq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using PosSystem.API.Controllers;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Tests.Controllers;

public class ProductsControllerTests
{
    private readonly Mock<IProductService> _mockService;
    private readonly Mock<ILogger<ProductsController>> _mockLogger;
    private readonly ProductsController _controller;

    public ProductsControllerTests()
    {
        _mockService = new Mock<IProductService>();
        _mockLogger = new Mock<ILogger<ProductsController>>();
        _controller = new ProductsController(_mockService.Object, _mockLogger.Object);
    }

    [Fact]
    public async Task GetProducts_ReturnsOkResultWithProducts()
    {
        // Arrange
        var products = new List<Product>
        {
            new Product { Id = "1", Name = "Product 1" }
        };

        _mockService.Setup(s => s.GetAllProductsAsync())
            .ReturnsAsync(products);

        // Act
        var result = await _controller.GetProducts();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var returnValue = Assert.IsType<List<Product>>(okResult.Value);
        Assert.Single(returnValue);
    }

    [Fact]
    public async Task GetProduct_WithValidId_ReturnsProduct()
    {
        // Arrange
        var productId = "test-id";
        var product = new Product { Id = productId, Name = "Test Product" };

        _mockService.Setup(s => s.GetProductByIdAsync(productId))
            .ReturnsAsync(product);

        // Act
        var result = await _controller.GetProduct(productId);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var returnValue = Assert.IsType<Product>(okResult.Value);
        Assert.Equal(productId, returnValue.Id);
    }

    [Fact]
    public async Task GetProduct_WithInvalidId_ReturnsNotFound()
    {
        // Arrange
        var productId = "non-existent";
        _mockService.Setup(s => s.GetProductByIdAsync(productId))
            .ReturnsAsync((Product?)null);

        // Act
        var result = await _controller.GetProduct(productId);

        // Assert
        Assert.IsType<NotFoundResult>(result.Result);
    }
}
```

### Integration Tests with In-Memory Database

```csharp
using Microsoft.EntityFrameworkCore;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Repositories;
using PosSystem.Core.Models;

namespace PosSystem.Tests.Integration;

public class ProductRepositoryIntegrationTests : IDisposable
{
    private readonly PosSystemDbContext _context;
    private readonly ProductRepository _repository;

    public ProductRepositoryIntegrationTests()
    {
        var options = new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new PosSystemDbContext(options);
        _repository = new ProductRepository(_context);
    }

    [Fact]
    public async Task AddAsync_AddsProductToDatabase()
    {
        // Arrange
        var product = new Product
        {
            Id = Guid.NewGuid().ToString(),
            Name = "Test Product",
            Price = 10.00m,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        // Act
        await _repository.AddAsync(product);
        await _repository.SaveChangesAsync();

        // Assert
        var savedProduct = await _context.Products.FindAsync(product.Id);
        Assert.NotNull(savedProduct);
        Assert.Equal("Test Product", savedProduct.Name);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }
}
```

## Frontend Testing

### Component Tests

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductGridComponent } from './product-grid.component';
import { ProductService } from '../services/product.service';
import { of, throwError } from 'rxjs';
import { Product } from '../models/product.model';

describe('ProductGridComponent', () => {
  let component: ProductGridComponent;
  let fixture: ComponentFixture<ProductGridComponent>;
  let mockProductService: jasmine.SpyObj<ProductService>;

  const mockProducts: Product[] = [
    { id: '1', name: 'Product 1', price: 10.00, isActive: true, createdAt: '', updatedAt: '' },
    { id: '2', name: 'Product 2', price: 20.00, isActive: true, createdAt: '', updatedAt: '' }
  ];

  beforeEach(async () => {
    mockProductService = jasmine.createSpyObj('ProductService', ['loadProducts', 'getProducts']);
    mockProductService.getProducts.and.returnValue(of(mockProducts));
    mockProductService.loadProducts.and.returnValue(of(mockProducts));

    await TestBed.configureTestingModule({
      imports: [ProductGridComponent],
      providers: [
        { provide: ProductService, useValue: mockProductService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProductGridComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load products on init', () => {
    component.ngOnInit();
    expect(mockProductService.loadProducts).toHaveBeenCalled();
  });

  it('should display products', (done) => {
    component.ngOnInit();
    component.products$.subscribe(products => {
      expect(products.length).toBe(2);
      expect(products[0].name).toBe('Product 1');
      done();
    });
  });
});
```

### Service Tests

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ProductService } from './product.service';
import { Product } from '../models/product.model';

describe('ProductService', () => {
  let service: ProductService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ProductService]
    });

    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load products from API', () => {
    const mockProducts: Product[] = [
      { id: '1', name: 'Product 1', price: 10.00, isActive: true, createdAt: '', updatedAt: '' }
    ];

    service.loadProducts().subscribe(products => {
      expect(products.length).toBe(1);
      expect(products[0].name).toBe('Product 1');
    });

    const req = httpMock.expectOne('/api/products');
    expect(req.request.method).toBe('GET');
    req.flush(mockProducts);
  });

  it('should handle errors gracefully', () => {
    service.loadProducts().subscribe({
      next: () => fail('should have failed'),
      error: (error) => {
        expect(error).toBeTruthy();
      }
    });

    const req = httpMock.expectOne('/api/products');
    req.error(new ErrorEvent('Network error'));
  });
});
```

## Running Tests

### Backend Tests

```bash
# Run all tests
cd backend/PosSystem
dotnet test

# Run specific test project
dotnet test PosSystem.Tests/PosSystem.Tests.csproj

# Run with coverage
dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=opencover

# Run specific test class
dotnet test --filter "FullyQualifiedName~ProductServiceTests"

# Run specific test method
dotnet test --filter "FullyQualifiedName~ProductServiceTests.GetAllProductsAsync"
```

### Frontend Tests

```bash
# Run all tests
cd frontend
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npx ng test --include='**/product.service.spec.ts'

# Run with coverage
npm test -- --code-coverage

# Run in headless mode
npx ng test --browsers=ChromeHeadless --watch=false
```

## Test Coverage Goals

- **Backend**: Minimum 70% code coverage
- **Frontend**: Minimum 60% code coverage
- **Critical Paths**: 90%+ coverage (authentication, transactions, payments)

## Best Practices

### 1. Test Naming
- Use descriptive test names: `MethodName_Scenario_ExpectedBehavior`
- Example: `GetProductByIdAsync_WithInvalidId_ThrowsArgumentException`

### 2. Arrange-Act-Assert Pattern
```csharp
[Fact]
public async Task TestMethod()
{
    // Arrange - Set up test data and mocks
    var product = new Product { Id = "1", Name = "Test" };
    
    // Act - Execute the method being tested
    var result = await _service.GetProductByIdAsync("1");
    
    // Assert - Verify the results
    Assert.NotNull(result);
    Assert.Equal("1", result.Id);
}
```

### 3. One Assertion Per Test (when possible)
- Makes it clear what failed
- Easier to debug

### 4. Use Test Data Builders
```csharp
public class ProductBuilder
{
    private Product _product = new Product
    {
        Id = Guid.NewGuid().ToString(),
        Name = "Default Product",
        Price = 10.00m,
        IsActive = true
    };

    public ProductBuilder WithName(string name)
    {
        _product.Name = name;
        return this;
    }

    public ProductBuilder WithPrice(decimal price)
    {
        _product.Price = price;
        return this;
    }

    public Product Build() => _product;
}

// Usage
var product = new ProductBuilder()
    .WithName("Custom Product")
    .WithPrice(25.00m)
    .Build();
```

### 5. Mock External Dependencies
- Mock repositories, services, HTTP clients
- Use in-memory database for integration tests

### 6. Test Edge Cases
- Null values
- Empty collections
- Invalid input
- Boundary conditions

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-dotnet@v3
        with:
          dotnet-version: '8.0.x'
      - run: dotnet restore
      - run: dotnet build
      - run: dotnet test --no-build --verbosity normal

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd frontend && npm ci
      - run: cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```

## References

- Main project guidelines: `docs/AGENTS.md` (if exists)
- Backend development: `docs/BACKEND_AGENT.md`
- Frontend development: `docs/FRONTEND_AGENT.md`
- xUnit documentation: https://xunit.net/
- Angular Testing: https://angular.io/guide/testing
