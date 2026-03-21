# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuickServe POS — a full-stack point-of-sale system with an Angular 20 frontend and .NET 8 backend, deployed on Railway with a MySQL database.

## Build & Run Commands

### Frontend (`frontend/`)
```bash
npm ci                 # Install dependencies (use ci, not install)
npm start              # Dev server on :4200, proxies /api → localhost:5001
npm run build          # Production build
npm test               # Jasmine/Karma tests
npx ng test --include='**/file.spec.ts'           # Single test file
npx ng test --browsers=ChromeHeadless --watch=false  # Headless (CI)
npm test -- --code-coverage                        # Coverage report
```

### Backend (`backend/PosSystem/PosSystem/`)
```bash
dotnet run             # Starts API on port 5001
dotnet build           # Build only
dotnet test            # Run xUnit tests (from backend/PosSystem/)
dotnet test --filter "FullyQualifiedName~TestClassName"              # Single test class
dotnet test --filter "FullyQualifiedName~TestClassName.MethodName"   # Single test method
dotnet ef migrations add <Name> --context PosSystemDbContext         # Add migration
dotnet ef database update --context PosSystemDbContext               # Apply migrations
```

Both must run simultaneously for local development. The frontend proxies `/api` requests to the backend via `proxy.conf.json`.

## Architecture

### Backend — Clean Architecture (.NET 8)
```
API/Controllers/     → REST endpoints (Auth, Products, Transactions, Ingredients, StockMovements, Reports, Settings, Recipes, Print, Health)
API/Middleware/       → Exception handling, request logging
Core/Models/         → Domain models and DTOs
Core/Interfaces/     → Service and repository contracts (IXxxService, IXxxRepository)
Infrastructure/
  Data/              → EF Core DbContext (MySQL via Pomelo), seed data
  Repositories/      → Data access implementations
  Services/          → Business logic implementations
Migrations/          → EF Core migrations
```

Request flow: Controller → Service → Repository → DbContext. Controllers are thin — business logic belongs in services only.

Authentication: JWT Bearer tokens with role-based authorization (Owner, Employee, Admin). Public endpoints: Auth login, public menu.

### Frontend — Feature-Based Architecture (Angular 20)
```
core/
  guards/            → AuthGuard, RoleGuard, AdminGuard
  interceptors/      → AuthInterceptor (injects JWT on all requests)
  services/          → AuthService, OfflineService, PwaService, SettingsService
features/
  auth/              → Login
  pos/               → Product grid, public menu, ingredient selection
  checkout/          → Cart, payment (cash/QR), receipt, printer settings
  admin/             → Product management, reports, settings
  inventory/         → Ingredients, stock movements, product recipes
shared/
  components/        → PageHeaderComponent, PwaInstallComponent
  models/            → Shared types (UserRole, etc.)
```

All components are **standalone** (no NgModules). State management uses BehaviorSubject-based services, not NgRx. Cart state persists to localStorage.

### Routing
- Public: `/login`, `/menu`
- Auth-protected: `/pos`, `/cart`, `/checkout`, `/receipt`
- Role-protected (Owner/Admin): `/reports`, `/products`, `/inventory`, `/printer-settings`
- Admin-only: `/settings`
- Default redirect: `/pos`

## Code Style

### TypeScript / Angular
- 2-space indent, K&R braces, single quotes, semicolons required
- Files: `kebab-case.component.ts` — Classes: `PascalCase` with suffix — Selectors: `app-kebab-case`
- Observables: suffix with `$` — `products$`, `destroy$`
- Services: `@Injectable({ providedIn: 'root' })`, constructor DI (not `inject()`)
- State: `BehaviorSubject` exposed via `.asObservable()`
- Subscription cleanup: `destroy$ = new Subject<void>()` + `takeUntil` + complete in `ngOnDestroy`
- Error display: `MatSnackBar` with `panelClass: ['error-snackbar']` or `['success-snackbar']`
- No `I` prefix on TypeScript interfaces. Use `interface` not `class` for data shapes. Use `enum` for finite sets.
- Import order: `@angular/core` → `@angular/common,forms,router` → `@angular/material/*` → local models → services → components → shared → RxJS

### C# / .NET
- 4-space indent, Allman braces, file-scoped namespaces
- Interfaces: `I` prefix — `IProductService`. DTOs: `Dto` suffix — `ProductDto`
- Private fields: `_camelCase`. Async methods: `Async` suffix — `GetAllProductsAsync()`
- Controllers plural (`ProductsController`), services singular (`ProductService`)
- String IDs: `Guid.NewGuid().ToString()`. Timestamps: always `DateTime.UtcNow`
- Services throw `ArgumentException` (not found) or `InvalidOperationException` (business rule). Controllers catch and map to HTTP status.
- Import order: `Microsoft.*` → `PosSystem.*` → `System.*`

## Key Patterns

- **DTOs**: Backend uses separate DTOs for API contracts; AutoMapper handles mapping
- **Validation**: FluentValidation on backend inputs
- **Owned types**: EF Core `OwnsOne`/`OwnsMany` for nested entities (CustomerInfo, AddOns within TransactionItems)
- **Composite keys**: TransactionItem and AddOn use composite keys (TransactionId + ItemId)
- **Decimal precision**: Prices use `decimal(18,2)`, recipe quantities use `decimal(18,4)`
- **Categories**: Stored as strings in DB (not enums, not foreign keys)
- **PWA**: Service worker configured but currently disabled in `main.ts`; offline sync capability exists
- **Thermal printing**: QZ Tray integration for receipt printing

## Testing Conventions

### Backend (xUnit + Moq)
- Naming: `MethodName_Scenario_ExpectedBehavior` (e.g., `GetProductByIdAsync_WithInvalidId_ThrowsArgumentException`)
- Arrange-Act-Assert with section comments
- Mock dependencies via interfaces. Use `InMemoryDatabase` for integration tests.
- Coverage: 70% backend, 90%+ for auth/transactions

### Frontend (Jasmine + Karma)
- `describe` per component/service, `beforeEach` with `TestBed.configureTestingModule`
- Mock with `jasmine.createSpyObj` and `{ provide: X, useValue: mockX }`
- Coverage target: 60%

## Environment

Backend config is environment-variable driven in production (Railway):
- `MYSQL_URL` / `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD`
- `JWT_SECRET_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE`
- `PORT` (default 5001)

Local dev uses `appsettings.json` with MySQL on `localhost:3307` (non-standard port).

## Deployment

- **Docker**: Multi-stage build (SDK 8.0 + Node 20 for Angular → aspnet 8.0 runtime)
- **Railway**: `railway.toml` with RAILPACK builder. Frontend build output goes to `backend/.../wwwroot/`
- Scripts in `scripts/`: build, deploy, test, and performance check utilities

## Additional Documentation

- Detailed agent guides in `docs/` (backend, frontend, database, testing, devops, team-lead)
- Workflow definitions in `.agent/workflows/` (feature, backend, frontend, database, debug, review, testing, etc.)
