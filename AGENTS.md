# AGENTS.md — Lemon POS (QuickServe)

Full-stack POS application: Angular 20 frontend + .NET 8 Web API backend + MySQL 8.0.

## Build & Run Commands

### Frontend (working directory: `frontend/`)

| Task | Command |
|------|---------|
| Install deps | `npm ci` |
| Dev server | `npm start` (serves on `localhost:4200` with API proxy) |
| Production build | `npm run build` |
| Dev build | `npm run build:dev` |
| Run all tests | `npm test` |
| Run single test file | `npx ng test --include='**/product.service.spec.ts'` |
| Tests headless (CI) | `npx ng test --browsers=ChromeHeadless --watch=false` |
| Tests with coverage | `npm test -- --code-coverage` |

### Backend (working directory: `backend/PosSystem/PosSystem/`)

| Task | Command |
|------|---------|
| Restore packages | `dotnet restore` |
| Build | `dotnet build` |
| Run | `dotnet run` |
| Publish | `dotnet publish -c Release -o out` |
| Run all tests | `dotnet test` (from `backend/PosSystem/`) |
| Run single test class | `dotnet test --filter "FullyQualifiedName~ProductServiceTests"` |
| Run single test method | `dotnet test --filter "FullyQualifiedName~ProductServiceTests.GetAllProductsAsync"` |
| Add EF migration | `dotnet ef migrations add <Name> --context PosSystemDbContext` |
| Apply migrations | `dotnet ef database update --context PosSystemDbContext` |

## Project Structure

```
backend/PosSystem/PosSystem/
  API/Controllers/          # REST endpoints — thin, delegate to services
  API/Middleware/            # Exception handling, request logging
  Core/Interfaces/          # Service + repository contracts (IXxxService, IXxxRepository)
  Core/Models/              # Domain models and DTOs
  Infrastructure/Services/  # Business logic
  Infrastructure/Repositories/  # Data access
  Infrastructure/Data/      # DbContext, SeedData
  Migrations/               # EF Core migrations

frontend/src/app/
  core/guards/              # AuthGuard, RoleGuard, AdminGuard
  core/interceptors/        # AuthInterceptor (JWT bearer)
  core/services/            # Singleton services (Auth, Settings, Offline, Pwa)
  features/pos/             # POS screen components
  features/checkout/        # Cart, checkout, receipt, printer
  features/admin/           # Reports, product management, settings
  features/auth/            # Login
  features/inventory/       # Stock management
  shared/components/        # Reusable UI components
  shared/models/            # Shared TypeScript interfaces
```

## Code Style — TypeScript / Angular

### Formatting
- **2-space** indentation. Single quotes. Always use semicolons.
- K&R brace style (opening brace on same line).
- Blank line between methods. No trailing commas required.

### Naming
- Files: `kebab-case.component.ts`, `kebab-case.service.ts`, `kebab-case.model.ts`
- Classes: `PascalCase` with suffix — `ProductGridComponent`, `CartService`
- Selectors: `app-kebab-case` prefix (enforced in angular.json)
- Methods/variables: `camelCase` — `loadProducts()`, `isLoading`
- Constants (class fields): `UPPER_SNAKE_CASE` — `private readonly ITEMS_PER_PAGE = 20`
- Observables: suffix with `$` — `products$`, `destroy$`

### Components
- All components are **standalone** (`standalone: true`). No NgModules.
- Use external templates (`templateUrl`) and styles (`styleUrls` array form).
- Use `ChangeDetectionStrategy.OnPush` for performance-sensitive components; call `cdr.markForCheck()` for manual triggers.
- Subscription cleanup: `private destroy$ = new Subject<void>()` + `takeUntil(this.destroy$)` + complete in `ngOnDestroy`.

### Types
- Use `interface` for all data shapes (never `class` for models). No `I` prefix on TS interfaces.
- Use `enum` for finite sets (e.g., `UserRole`), not union types.
- Type aliases (`type X = ...`) are not used — prefer interfaces or inline unions.
- Utility types `Omit<T>` and `Partial<T>` are acceptable in service signatures.

### Services
- `@Injectable({ providedIn: 'root' })` for all core services.
- State management via `BehaviorSubject` — expose as `observable$` via `.asObservable()`.
- Constructor DI only (`private someService: SomeService`) — not the `inject()` function.
- HTTP errors: use `catchError` in RxJS pipes; fall back to localStorage for offline support.

### Error Handling (Frontend)
- Use object-form subscribe: `subscribe({ next: ..., error: ... })`.
- Extract message: `error.error?.message ?? error.error?.errors?.join(', ') ?? error.message`.
- Show errors via `MatSnackBar` with `panelClass: ['error-snackbar']`; success with `['success-snackbar']`.

### Imports (order)
1. `@angular/core`
2. `@angular/common`, `@angular/forms`, `@angular/router`
3. `@angular/material/*`
4. Local models, then cross-feature models
5. Local services, then cross-feature services
6. Sibling/child components
7. Shared components
8. RxJS / third-party

## Code Style — C# / .NET

### Formatting
- **4-space** indentation. Allman brace style (opening brace on new line).
- **File-scoped namespaces** with semicolon: `namespace PosSystem.API.Controllers;`
- Nullable reference types enabled. String interpolation preferred over `string.Format`.
- Target-typed `new()` for collection init: `= new()` not `= new List<T>()`.

### Naming
- Files/classes: `PascalCase` — `ProductsController.cs` (controllers plural), `ProductService.cs` (services singular)
- Interfaces: `I` prefix — `IProductService`, `IProductRepository`
- DTOs: `PascalCase` + `Dto` suffix — `ProductDto`
- Private fields: `_camelCase` — `private readonly IProductService _productService;`
- Public properties: `PascalCase` with `{ get; set; }` — `public string Name { get; set; } = string.Empty;`
- Async methods: `PascalCase` + `Async` suffix — `GetAllProductsAsync()`
- Locals: `camelCase` — `var existingProduct = ...`

### Architecture
- **Controllers** → **Services** → **Repositories** → **DbContext**
- Controllers are thin: validate input, call service, return HTTP response.
- Business logic belongs in services only. Services throw exceptions on failure.
- Repository interfaces in `Core/Interfaces/`, implementations in `Infrastructure/Repositories/`.
- Register all services in `Program.cs` with appropriate DI lifetime.

### Controllers
- Decorators: `[ApiController]`, `[Route("api/[controller]")]`, `[Authorize(Roles = "...")]`
- Return `Task<ActionResult<T>>` for GET; `Task<IActionResult>` for PUT/DELETE.
- Success: `Ok(result)`, `CreatedAtAction(...)`, `NoContent()`.
- Errors: `NotFound()`, `BadRequest(new { message = "..." })`, `StatusCode(500, ...)`.

### Error Handling (Backend)
- Services throw: `ArgumentException` (not found/invalid input), `InvalidOperationException` (business rule violation).
- Controllers catch specific exceptions → map to HTTP status codes.
- Global `ExceptionHandlingMiddleware` catches unhandled exceptions.

### Entity Framework
- String IDs: `Guid.NewGuid().ToString()`.
- Timestamps: always `DateTime.UtcNow`.
- Monetary values: `HasPrecision(18, 2)`.
- Always specify `HasMaxLength()` for string properties.
- Categories stored as strings (not enums, not foreign keys).

### Imports (order)
1. `Microsoft.*` namespaces
2. Project namespaces (`PosSystem.Core.*`, `PosSystem.Infrastructure.*`)
3. `System.*` namespaces

## Testing Conventions

### Backend (xUnit + Moq)
- Test naming: `MethodName_Scenario_ExpectedBehavior` — e.g., `GetProductByIdAsync_WithInvalidId_ThrowsArgumentException`
- Arrange-Act-Assert pattern with comments marking each section.
- Mock all dependencies via interfaces. Use `InMemoryDatabase` for integration tests.
- Coverage targets: 70% backend, 90%+ for auth/transactions.

### Frontend (Jasmine + Karma)
- `describe` block per component/service. `beforeEach` with `TestBed.configureTestingModule`.
- Provide mocks via `jasmine.createSpyObj` and `{ provide: X, useValue: mockX }`.
- Coverage target: 60% frontend.

## Environment & Deployment

- **Docker**: multi-stage build (SDK:8.0 → aspnet:8.0 runtime, Node 20 for Angular build)
- **Railway**: deployment via `railway.toml` with RAILPACK builder
- Frontend build output goes to `backend/.../wwwroot/` for serving from .NET
- Environment variables: `MYSQL_URL` (or individual `MYSQL_HOST`, etc.), `JWT__KEY`, `JWT__ISSUER`, `JWT__AUDIENCE`, `PORT`
- PWA enabled with Angular service worker (`ngsw-config.json`)

## Additional Agent Documentation

Detailed role-specific guides in `docs/`:
- `BACKEND_AGENT.md` — .NET patterns, auth, middleware
- `FRONTEND_AGENT.md` — Angular patterns, Material, PWA
- `DATABASE_AGENT.md` — EF Core, migrations, seed data
- `TESTING_AGENT.md` — xUnit, Jasmine, test examples
- `DEVOPS_AGENT.md` — Docker, Railway deployment
- `TEAM_LEAD_AGENT.md` — Code review, sprint planning

Workflow definitions in `.agent/workflows/` (backend, frontend, database, debug, feature, review, testing, etc.).
