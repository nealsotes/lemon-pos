---
name: aspnet-api
description: Use when building or changing .NET 8 Web API endpoints — controllers, services, DTOs, validation, error-to-HTTP mapping, DI registration, logging, config, async, pagination/filtering, API versioning, and API-level security/performance. For auth specifics use `authentication`; for data access use `entity-framework`.
---

# ASP.NET Web API — .NET 8

TRIGGER when: adding/changing an endpoint, controller, service, DTO, validator, or middleware in `backend/PosSystem/PosSystem/`.

DO NOT TRIGGER when: the change is auth (`authentication`), EF/query (`entity-framework`), schema/migration (`migrations`), or pure naming/style (`coding-standards`).

Layer rules and DI *rationale* live in `architecture`; naming lives in `coding-standards`. This skill is the .NET API surface.

## Controllers — thin

Model: `ProductsController`. Decorate, delegate, map. No business logic.

```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Employee,Admin")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    public ProductsController(IProductService productService) => _productService = productService;

    [HttpGet("{id}")]
    public async Task<ActionResult<Product>> GetProduct(string id)
    {
        var product = await _productService.GetProductByIdAsync(id);
        return product is null ? NotFound() : Ok(product);
    }
}
```

- Return `Task<ActionResult<T>>` for GET; `Task<IActionResult>` for POST/PUT/DELETE.
- Success: `Ok(result)`, `CreatedAtAction(nameof(GetX), new { id }, x)`, `NoContent()`.
- Per-action authorization tightens the class default: `[Authorize(Roles = "Owner,Admin")]` on writes, `[AllowAnonymous]` on public reads.

## Services — business logic

- One service per aggregate, contract in `Core/Interfaces/`, impl in `Infrastructure/Services/`.
- Services **throw** (never return error flags):

| Situation | Throw | Controller maps to |
|-----------|-------|--------------------|
| Entity not found / invalid input | `ArgumentException` | `NotFound()` / `BadRequest(...)` |
| Business-rule violation | `InvalidOperationException` | `BadRequest(new { message })` |
| Unexpected | (let bubble) | `ExceptionHandlingMiddleware` → 500 |

Controllers `catch (ArgumentException ex) => NotFound(ex.Message)` for the known cases; everything else is caught centrally.

## DTOs & Validation

- Separate `...Dto` for the API contract; never expose EF entities directly. AutoMapper maps Model ⇄ DTO.
- Validate inputs with **FluentValidation** (`FluentValidation.AspNetCore`); keep validators next to the DTO. Business validation (cross-entity, stock, etc.) stays in the service.

## Dependency Injection (registration)

Register every service/repository in `Program.cs`, `Scoped` by default:

```csharp
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddScoped<IProductRepository, ProductRepository>();
```

## Async

- Async all the way down for I/O; `Async` suffix; return `Task<T>`. Don't block with `.Result`/`.Wait()`.

## Pagination & Filtering

Query params with sensible defaults (real pattern):

```csharp
[HttpGet]
public async Task<ActionResult<IEnumerable<Product>>> GetProducts(
    [FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] bool? isActive = true)
    => Ok(await _productService.GetProductsPaginatedAsync(page, pageSize, isActive));
```

Push paging/filtering into the repository query (see `entity-framework`) — never fetch-all-then-filter-in-memory.

## API Versioning

Current convention is **unversioned** `api/[controller]`. If a breaking contract change is unavoidable, introduce a URL segment (`api/v1/[controller]`) rather than mutating an existing endpoint's shape. Don't add versioning infrastructure preemptively.

## Configuration

- Read config via `IConfiguration` / `builder.Configuration[...]`, with env-var fallbacks (see `railway` for the variable map). Never hardcode secrets or connection strings.

## Logging

- Inject `ILogger<T>`; log at service boundaries and on caught exceptions with ids for context. Never log tokens/passwords/PII. (Details in `coding-standards`.)

## Security (API level)

- Every endpoint has an explicit `[Authorize(...)]` or `[AllowAnonymous]` — never rely on the default. Auth mechanics: `authentication`.
- EF parameterizes queries (no SQL injection) — never string-concatenate SQL.
- Validate/limit uploads (e.g. the 5 MB image cap in `ProductsController`). Configure CORS to known origins only.

## Performance (API level)

- Keep controllers non-blocking; do heavy work in services.
- Return only what the client needs — project to DTOs, page large sets.
- N+1 and include/projection concerns: `entity-framework`.

## Testing

Covered by the `testing` skill (xUnit + Moq): mock the service in controller tests, mock repositories in service tests.

## Related skills

- `authentication` · `entity-framework` · `migrations` · `architecture` · `coding-standards` · `testing` · `railway`

## Behavior

- Keep controllers thin; if you're writing an `if` about business state in a controller, move it to the service.
- Match the surrounding controller's patterns (there are 13 controllers — read a neighbor first).
