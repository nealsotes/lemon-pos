---
name: coding-standards
description: Use when writing or reviewing ANY code in this repo. The canonical source for naming, formatting, null handling, comments, logging, error-handling conventions, and the code-review checklist across C#/.NET and TypeScript/Angular. Other skills link here instead of restating these rules.
---

# Coding Standards — C#/.NET + TypeScript/Angular

TRIGGER when: writing or reviewing any code, or a question is about naming, formatting, comments, null handling, logging, or general readability.

DO NOT TRIGGER when: the question is purely architectural (use `architecture`) or purely about a single stack's API surface (use `aspnet-api`, `angular`, `entity-framework`).

This is the single home for cross-cutting conventions. If a rule is here, other skills reference it — they never restate it.

## C# / .NET

| Concern | Rule |
|---------|------|
| Indent / braces | 4-space, Allman braces (opening brace on new line) |
| Namespaces | File-scoped with semicolon: `namespace PosSystem.API.Controllers;` |
| Classes/files | PascalCase. Controllers **plural** (`ProductsController`), services **singular** (`ProductService`) |
| Interfaces | `I` prefix — `IProductService`, `IProductRepository` |
| DTOs | `Dto` suffix — `ProductDto` |
| Private fields | `_camelCase` — `private readonly IProductService _productService;` |
| Public properties | PascalCase, initialized — `public string Name { get; set; } = string.Empty;` |
| Async methods | `Async` suffix — `GetAllProductsAsync()` |
| Locals / params | `camelCase` |
| IDs | `Guid.NewGuid().ToString()` (string keys) |
| Timestamps | always `DateTime.UtcNow` |
| Strings | interpolation over `string.Format`; target-typed `new()` for init |
| Nullability | Nullable reference types are ON — honor `?`, avoid `!` unless provably safe |
| Imports | order: `Microsoft.*` → `PosSystem.*` → `System.*` |

## TypeScript / Angular

| Concern | Rule |
|---------|------|
| Indent / quotes | 2-space, single quotes, semicolons required, K&R braces |
| Files | `kebab-case.component.ts`, `kebab-case.service.ts`, `kebab-case.model.ts` |
| Classes | PascalCase + suffix — `ProductGridComponent`, `CartService` |
| Selectors | `app-kebab-case` prefix |
| Methods / vars | `camelCase` — `loadProducts()`, `isLoading` |
| Class constants | `UPPER_SNAKE_CASE` — `private readonly ITEMS_PER_PAGE = 20` |
| Observables | `$` suffix — `products$`, `destroy$` |
| Data shapes | `interface`, never `class`; **no `I` prefix**; `enum` for finite sets, not union types |
| Imports | `@angular/core` → `@angular/common,forms,router` → `@angular/material/*` → models → services → components → shared → RxJS |

## Null Handling

- **C#**: return `null` from a "get by id" that may miss; the *caller* (service) decides whether missing is an error and throws `ArgumentException`. Never return `null` from collection getters — return an empty list.
- **TypeScript**: use `?.` and `??`. Frontend error extraction pattern: `error.error?.message ?? error.error?.errors?.join(', ') ?? error.message`.

## Error Handling (general principle — API mapping lives in `aspnet-api`)

- Services **throw**, they don't return error flags: `ArgumentException` (not found / invalid input), `InvalidOperationException` (business-rule violation).
- Never swallow exceptions silently. Let `ExceptionHandlingMiddleware` handle the unexpected; catch only what you can map meaningfully.
- Frontend: object-form subscribe `subscribe({ next, error })`; surface via `MatSnackBar` with `panelClass: ['error-snackbar']` / `['success-snackbar']`.

## Comments & Readability

- Comment the **why**, not the **what**. The `ProductsController.FixImageUrl` / inline-image comments are the model: they explain Railway's ephemeral FS, not the syntax.
- Prefer clear names over clever code. No abbreviations that aren't already in the codebase.
- Match the density and idiom of surrounding code. Read the neighbors before adding.

## Logging

- Backend: structured logging via `ILogger<T>`; log at service boundaries and on caught exceptions with context (ids, not PII/secrets). Never log JWTs, passwords, or connection strings.
- Do not use `Console.WriteLine` in shipped code.

## Review Checklist (quick gate before "done")

- [ ] Names follow the tables above; no `any`, no `I`-prefixed TS interfaces
- [ ] Null/error handling matches the rules; services throw, controllers map
- [ ] No secrets, PII, or tokens in code or logs
- [ ] Comments explain intent; dead code removed
- [ ] New behavior has tests (see `testing`)
- [ ] Domain rule respected: **prices already include 12% VAT — never add VAT at checkout or in reports**

## Related skills

- `architecture` — where code belongs (layers, SOLID, DI)
- `aspnet-api` / `angular` — stack-specific API surface
- `testing` — test naming and coverage
- `git-workflow` — commit and PR conventions

## Behavior

- These conventions are settled. Apply them; don't offer alternatives.
- When editing a file, match the file's existing style even if it predates a rule — consistency within a file wins; flag the drift, don't rewrite unrelated lines.
