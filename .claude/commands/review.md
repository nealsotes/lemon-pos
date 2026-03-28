# Code Review

Review modified files against project conventions from CLAUDE.md.

1. Run `git diff --name-only` and `git diff --cached --name-only` to identify changed files.
2. Read each changed file and check against these conventions:

**TypeScript / Angular files:**
- 2-space indent, single quotes, semicolons
- File naming: `kebab-case.component.ts` / `kebab-case.service.ts`
- Class naming: PascalCase with suffix (`XxxComponent`, `XxxService`)
- Selectors: `app-kebab-case`
- Observables suffixed with `$`
- Subscription cleanup: `destroy$` + `takeUntil` + `ngOnDestroy`
- Services: `@Injectable({ providedIn: 'root' })`, constructor DI (not `inject()`)
- State: BehaviorSubject exposed via `.asObservable()`
- Error display: `MatSnackBar` with correct `panelClass`
- Import order: `@angular/core` -> `@angular/common,forms,router` -> `@angular/material/*` -> local models -> services -> components -> shared -> RxJS
- Standalone components (no NgModules)

**C# / .NET files:**
- 4-space indent, Allman braces, file-scoped namespaces
- Interfaces: `I` prefix. DTOs: `Dto` suffix. Private fields: `_camelCase`
- Async methods: `Async` suffix
- Controllers plural, services singular
- String IDs: `Guid.NewGuid().ToString()`. Timestamps: `DateTime.UtcNow`
- Services throw `ArgumentException` / `InvalidOperationException`, not HTTP exceptions
- Import order: `Microsoft.*` -> `PosSystem.*` -> `System.*`
- Controllers are thin — business logic in services only

3. Output a checklist:
   - For each file: PASS or FAIL with specific issues at file:line
   - Overall verdict: PASS (all clean) or NEEDS FIXES (with summary)
