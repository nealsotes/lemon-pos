# Backend — .NET 8 Conventions

## Architecture
- **Clean Architecture:** Controller -> Service -> Repository -> DbContext
- Controllers are thin — all business logic belongs in services
- Interfaces define contracts: `IXxxService`, `IXxxRepository`
- Register services in `Program.cs`

## Code Style
- 4-space indent, Allman braces, file-scoped namespaces
- Interfaces: `I` prefix — `IProductService`
- DTOs: `Dto` suffix — `ProductDto`
- Private fields: `_camelCase`
- Async methods: `Async` suffix — `GetAllProductsAsync()`
- Controllers plural (`ProductsController`), services singular (`ProductService`)
- Import order: `Microsoft.*` -> `PosSystem.*` -> `System.*`

## Data & IDs
- String IDs: `Guid.NewGuid().ToString()`
- Timestamps: always `DateTime.UtcNow`
- Decimal precision: prices `decimal(18,2)`, recipe quantities `decimal(18,4)`
- Categories stored as strings (not enums, not foreign keys)

## EF Core
- MySQL via Pomelo provider
- `OwnsOne`/`OwnsMany` for nested entities (CustomerInfo, AddOns)
- Composite keys for TransactionItem and AddOn (TransactionId + ItemId)
- AutoMapper for Model <-> DTO mapping
- FluentValidation on inputs

## Error Handling
- `ArgumentException` — entity not found
- `InvalidOperationException` — business rule violation
- Controllers catch and map to HTTP status codes
- Exception middleware handles unhandled errors

## Authentication
- JWT Bearer tokens with role-based authorization
- Roles: Owner, Employee, Admin
- Public endpoints: Auth login, public menu

## Common Commands
```bash
dotnet run             # API on port 5001
dotnet build           # Build only
dotnet test            # Run xUnit tests (from backend/PosSystem/)
dotnet ef migrations add <Name> --context PosSystemDbContext
dotnet ef database update --context PosSystemDbContext
```

## Project Structure
```
API/Controllers/       -> REST endpoints
API/Middleware/         -> Exception handling, request logging
Core/Models/           -> Domain models and DTOs
Core/Interfaces/       -> Service and repository contracts
Infrastructure/Data/   -> EF Core DbContext, seed data
Infrastructure/Repositories/ -> Data access
Infrastructure/Services/     -> Business logic
Migrations/            -> EF Core migrations
```
