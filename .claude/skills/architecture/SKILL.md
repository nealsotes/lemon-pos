---
name: architecture
description: Use when deciding where new code belongs, adding a feature or layer, introducing an abstraction, or reviewing structural soundness. The canonical source for Clean Architecture layering, separation of concerns, SOLID, dependency injection rationale, folder organization, reusable components, and avoiding duplication.
---

# Architecture — Clean Architecture (.NET 8 + Angular 20)

TRIGGER when: deciding which layer/folder code belongs in, adding a new feature end-to-end, introducing an interface or abstraction, or reviewing whether a change respects separation of concerns.

DO NOT TRIGGER when: the detail is stack-specific implementation (use `aspnet-api`, `angular`, `entity-framework`) or naming/formatting (use `coding-standards`).

This is the home for *structure* decisions. Stack skills own *how*; this skill owns *where* and *why*.

## Backend layering (ENFORCED — flow is one direction, downward)

```
Controller  ->  Service  ->  Repository  ->  DbContext
 (API)          (business)   (data access)   (EF Core)
```

| Layer | Location | MUST | MUST NOT |
|-------|----------|------|----------|
| Controller | `API/Controllers/` | Parse/validate input, call one service, map result to HTTP | Contain business logic, touch a repository or DbContext directly |
| Service | `Infrastructure/Services/` (contract in `Core/Interfaces/`) | Hold business rules, orchestrate repositories, throw on failure | Build HTTP responses, know about `HttpContext` |
| Repository | `Infrastructure/Repositories/` (contract in `Core/Interfaces/`) | Encapsulate queries/persistence, return models/DTOs | Contain business rules |
| DbContext | `Infrastructure/Data/` | Own EF configuration and change tracking | Be referenced above the repository layer |

Cross-cutting `UnitOfWork` coordinates multi-repository writes in one transaction — inject `IUnitOfWork` in services that mutate several aggregates.

## Frontend layering

```
core/       -> app-wide singletons: guards, interceptors, root services
features/   -> screen-scoped components (pos, checkout, admin, inventory, auth)
shared/     -> reusable components + models used across features
```

- A feature never imports another feature's internal component; share via `shared/` or a `core/` service.
- State lives in services (see `state-management`), not in components.

## Separation of Concerns

- One reason to change per unit. A controller changes when the HTTP contract changes; a service when a business rule changes; a repository when storage changes.
- Keep DTOs (API contract) separate from domain models and EF entities. Map with AutoMapper.

## SOLID (applied, not abstract)

| Principle | In this codebase |
|-----------|------------------|
| **S**ingle responsibility | One service per aggregate (`ProductService`, `TransactionService`); split when a class grows two reasons to change |
| **O**pen/closed | Extend behavior via new services/strategies, not by editing switch-blocks in controllers |
| **L**iskov | Any `IProductRepository` implementation must honor the contract (incl. null-on-miss semantics) |
| **I**nterface segregation | Narrow interfaces — `IExportService`, `IFileService` are separate, not one god-service |
| **D**ependency inversion | Depend on `Core/Interfaces` abstractions; concrete types wired in `Program.cs` |

## Dependency Injection (rationale here; registration syntax in `aspnet-api`)

- Constructor injection only, both stacks. No service locator, no `inject()` in Angular (constructor DI per house style).
- Depend on interfaces so layers are testable in isolation (mock the layer below).
- Lifetimes: repositories/services are typically `Scoped` (per request); stateless helpers can be `Singleton`. Never inject a `Scoped` into a `Singleton`.

## Folder Organization & Reuse

- New backend capability = interface in `Core/Interfaces/` + implementation in the matching `Infrastructure/` folder + DI registration.
- Before writing a helper, search for an existing one (`ExportService`, `FileService`, `NotificationService`). **Avoid duplication** — extract a shared method/service rather than copy-paste.
- Reusable UI goes in `shared/components/`; reusable types in `shared/models/`.

## Adding a feature end-to-end (the canonical path)

1. Model/DTO (`Core/Models/`) → 2. Repository contract + impl → 3. Service contract + impl (business rules) → 4. Controller (thin) → 5. DI registration → 6. Angular service → 7. Component(s) → 8. Tests at each layer → 9. Migration if schema changed.

The `lead-developer` skill drives this sequence and delegates each step.

## Related skills

- `aspnet-api`, `entity-framework`, `angular`, `state-management` — implementation of each layer
- `coding-standards` — naming and style within a layer
- `testing` — how to test each layer in isolation
- `lead-developer` — orchestrates the end-to-end path above

## Behavior

- If the layer rules already dictate where code goes, put it there — don't present options.
- Reject shortcuts that skip a layer (controller → DbContext, component holding state). Explain the correct placement.
- Prefer the smallest abstraction that removes real duplication; don't add interfaces "just in case."
