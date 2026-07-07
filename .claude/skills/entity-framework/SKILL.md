---
name: entity-framework
description: Use when working with EF Core — the DbContext, Fluent API config, relationships, owned types, composite keys, LINQ queries, includes vs projections, transactions/UnitOfWork, soft deletes, and concurrency. For the migration workflow use `migrations`; for MySQL schema/index design use `mysql`.
---

# Entity Framework Core — .NET 8 + Pomelo/MySQL

TRIGGER when: editing `PosSystemDbContext`, entity/Fluent configuration, or writing LINQ queries in repositories.

DO NOT TRIGGER when: creating/applying a migration (`migrations`), designing indexes/constraints at the DB level (`mysql`), or in controllers/services above the repository layer (`aspnet-api`).

## DbContext & Fluent API

- Single context `PosSystemDbContext`; one `DbSet<T>` per aggregate. All config in `OnModelCreating` (data annotations are not used).
- Provider is **Pomelo MySQL** with a pinned server version — never `AutoDetect` (it connects at startup):

```csharp
options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 21)));
```

## Conventions (enforced in this model)

| Concern | Rule | Example |
|---------|------|---------|
| Keys | string `Guid` PKs | `entity.HasKey(e => e.Id)` |
| Money | `HasPrecision(18, 2)` | `Price`, `Total`, `Amount` |
| Recipe/lot quantities | `HasPrecision(18, 4)` | `QuantityPerUnit`, `RemainingQuantity` |
| Strings | always `HasMaxLength(...)`, `IsRequired()` where non-null | `Name` (100), `Category` (50) |
| Large text | explicit column type | `Image` → `mediumtext`, `AddOnsJson` → `longtext` |
| Categories | plain strings, not FKs/enums | `Category` |
| Uniqueness | unique index | `HasIndex(e => e.Username).IsUnique()` |

## Relationships

- **Owned types** for nested value objects (no identity of their own): `OwnsOne(e => e.CustomerInfo)`, `OwnsOne(i => i.Discount)`.
- **Owned collections**: `OwnsMany(e => e.Items)` → table `TransactionItem`; nested `OwnsMany(i => i.AddOns)` → table `AddOn`. Table names are mapped explicitly to match the existing DB.
- **Composite keys**: `ProductIngredient` uses `HasKey(pi => new { pi.ProductId, pi.IngredientId })`; `AddOn` uses `("Id", "TransactionItemTransactionId", "TransactionItemId")` with `Id` auto-increment first (MySQL requirement).
- **FK delete behavior**: choose deliberately — `Expense → ExpenseCategory` uses `OnDelete(DeleteBehavior.Restrict)` to block deleting a category in use.
- **JSON-backed property pattern**: `AddOns` is `Ignore`d and persisted via an `AddOnsJson` `longtext` column — mutate through the backing property, not the ignored one.

## LINQ Best Practices

- **Async** queries (`ToListAsync`, `FirstOrDefaultAsync`, `AnyAsync`) — never sync in request paths.
- **Projections over includes** when you only need some columns: `Select(p => new ProductDto { ... })` beats loading full graphs.
- Use `Include`/`ThenInclude` only when you need the related entities; avoid loading owned collections you won't use.
- **Avoid N+1**: never query inside a `foreach`; batch with a single `Where(... Contains ...)` or a join/projection.
- Filter and page **in the query** (`Where`, `Skip`, `Take`, `OrderBy`) so the DB does the work — see the paginated products query.
- Use `AsNoTracking()` for read-only reads to skip change-tracking overhead.

## Transactions & UnitOfWork

- A single `SaveChangesAsync()` is already atomic for one context.
- For writes spanning multiple repositories, inject `IUnitOfWork` and commit once so the operation is all-or-nothing.
- For explicit multi-step transactions, use `context.Database.BeginTransactionAsync()` and honor the Pomelo execution strategy.

## Soft Deletes

- Deactivation uses an `IsActive` flag, not physical deletes (products can be reactivated). Default reads filter `IsActive == true`; pass an `includeInactive` option to bypass (as `GetProductByIdAsync(id, includeInactive: true)` does). Prefer this pattern over `Remove` for user-facing records.

## Optimistic Concurrency

- Not currently used. If a record needs concurrency protection, add a `rowversion`/concurrency token in the Fluent config and handle `DbUpdateConcurrencyException` in the service — don't silently overwrite.

## Related skills

- `migrations` — turn model changes into `dotnet ef` migrations
- `mysql` — index/constraint/schema design behind these entities
- `aspnet-api` — the repositories/services that call these queries
- `testing` — `InMemoryDatabase` for repository/integration tests

## Behavior

- Any change to an entity or `OnModelCreating` needs a migration (`migrations`) — never hand-edit the DB.
- Match precision/max-length conventions above; don't leave strings unbounded.
- Prefer projections; reach for `Include` only when the graph is actually needed.
