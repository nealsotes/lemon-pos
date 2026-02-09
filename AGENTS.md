# AGENTS.md - QuickServe POS System

## Project Overview

QuickServe is a Point of Sale (POS) system with:
- **Backend**: .NET 8 Web API with Entity Framework Core, MySQL (Pomelo), JWT authentication
- **Frontend**: Angular 20 standalone components with Angular Material, RxJS, PWA support
- **Deployment**: Docker-based deployment to Railway

## Directory Structure

```
QuickServe/
├── backend/PosSystem/PosSystem/    # .NET 8 Web API
│   ├── API/Controllers/            # REST API controllers
│   ├── API/Middleware/             # Custom middleware (exception handling, logging)
│   ├── Core/Interfaces/            # Service and repository interfaces
│   ├── Core/Models/                # Domain models and DTOs
│   ├── Infrastructure/Data/        # DbContext and seed data
│   ├── Infrastructure/Repositories/ # Repository implementations
│   ├── Infrastructure/Services/    # Service implementations
│   └── Program.cs                  # Application entry point
├── frontend/                       # Angular 20 application
│   ├── src/app/components/         # Angular components
│   ├── src/app/services/           # Angular services
│   ├── src/app/models/             # TypeScript interfaces
│   ├── src/app/guards/             # Route guards
│   └── src/app/interceptors/       # HTTP interceptors
└── Dockerfile                      # Multi-stage Docker build
```

## Build Commands

### Backend (.NET 8)
```bash
# Navigate to backend project
cd backend/PosSystem/PosSystem

# Restore dependencies
dotnet restore

# Build
dotnet build

# Run (uses PORT env var, defaults to 5001)
dotnet run

# Publish for production
dotnet publish -c Release -o ./out
```

### Frontend (Angular 20)
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm ci

# Development server (port 4200, proxies API to backend)
npm start

# Production build
npm run build

# Run tests
npm test

# Run single test file (Karma)
npx ng test --include='**/product.service.spec.ts'

# Run tests with specific pattern
npx ng test --include='**/*.spec.ts' --browsers=ChromeHeadless
```

### Docker Build
```bash
docker build -t quickserve .
docker run -p 8080:8080 quickserve
```

## Code Style Guidelines

### Backend (C#/.NET)

**Naming Conventions:**
- Classes: PascalCase (`ProductService`, `TransactionController`)
- Methods: PascalCase (`GetProductByIdAsync`, `CreateProductAsync`)
- Interfaces: IPascalCase (`IProductService`, `IProductRepository`)
- Private fields: _camelCase (`_productRepository`, `_logger`)
- Properties: PascalCase (`public string Name { get; set; }`)
- Async methods: Suffix with `Async` (`GetAllProductsAsync`)

**File Organization:**
- One class per file
- Controllers in `API/Controllers/` with suffix `Controller`
- Services in `Infrastructure/Services/` with suffix `Service`
- Repositories in `Infrastructure/Repositories/` with suffix `Repository`
- Interfaces in `Core/Interfaces/` with prefix `I`
- Models in `Core/Models/`

**Imports (usings):**
```csharp
using Microsoft.AspNetCore.Authorization;   // Framework first
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;            // Project namespaces
using PosSystem.Core.Models;
using System.Text.RegularExpressions;       // System namespaces last
```

**Controller Pattern:**
```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Employee")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;

    public ProductsController(IProductService productService)
    {
        _productService = productService;
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Product>> GetProduct(string id)
    {
        var product = await _productService.GetProductByIdAsync(id);
        if (product == null) return NotFound();
        return Ok(product);
    }
}
```

**Error Handling:**
- Use middleware for global exception handling (`ExceptionHandlingMiddleware`)
- Return appropriate HTTP status codes (400 BadRequest, 404 NotFound, 500 InternalServerError)
- Log errors with `ILogger<T>`
- Use `ArgumentException` for bad input, caught as 400

### Frontend (TypeScript/Angular)

**Naming Conventions:**
- Components: kebab-case files, PascalCase class (`product-grid.component.ts`, `ProductGridComponent`)
- Services: kebab-case files with `.service.ts` suffix (`product.service.ts`, `ProductService`)
- Models: kebab-case files with `.model.ts` suffix, PascalCase interfaces
- Guards: kebab-case with `.guard.ts` suffix
- Variables/properties: camelCase (`cartItems`, `isLoading`)
- Private members: no prefix, just `private` modifier

**Imports Order:**
```typescript
import { Component, OnInit } from '@angular/core';        // Angular core
import { CommonModule } from '@angular/common';           // Angular modules
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';       // Third-party
import { Product } from '../models/product.model';        // Project imports
import { ProductService } from '../services/product.service';
```

**Component Pattern (Standalone):**
```typescript
@Component({
  selector: 'app-product-grid',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './product-grid.component.html',
  styleUrls: ['./product-grid.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductGridComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(private productService: ProductService) {}

  ngOnInit(): void { /* initialization */ }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

**Service Pattern:**
```typescript
@Injectable({ providedIn: 'root' })
export class ProductService {
  private apiUrl = '/api';
  private productsSubject = new BehaviorSubject<Product[]>([]);

  constructor(private http: HttpClient) {}

  getProducts(): Observable<Product[]> {
    return this.productsSubject.asObservable();
  }
}
```

**Types:**
- Always define interfaces for models in `models/` directory
- Use strict TypeScript (`strict: true` in tsconfig.json)
- Nullable types with `?` suffix (`hotPrice?: number`)
- Use `Observable<T>` for async data streams

**Error Handling:**
- Use RxJS `catchError` operator in services
- Provide fallback to localStorage for offline support
- Use HTTP interceptors for auth token injection

## Key Patterns

**Dependency Injection:**
- Backend: Register services in `Program.cs` with `builder.Services.AddScoped<T>()`
- Frontend: Use `providedIn: 'root'` for singleton services

**Repository Pattern (Backend):**
- Interfaces define contracts in `Core/Interfaces/`
- Implementations in `Infrastructure/Repositories/`
- Services depend on repository interfaces, not implementations

**State Management (Frontend):**
- Use `BehaviorSubject<T>` for reactive state
- Expose as `Observable<T>` via getter methods
- Update state with `.next()` method

**Authentication:**
- JWT tokens stored in localStorage
- HTTP interceptor adds `Authorization: Bearer <token>` header
- Role-based authorization: `Owner`, `Employee`

## Database

- MySQL 8.0 with Pomelo EF Core provider
- Connection via `MYSQL_URL` env var or individual `MYSQL_*` vars
- Manual table creation in `Program.cs` for Railway compatibility
- Use `DateTime.UtcNow` for all timestamps
