# Frontend — Angular 20 Conventions

## Architecture
- **Standalone components only** — no NgModules
- Feature-based organization: `features/<name>/components/`, `features/<name>/services/`
- Core services are singletons: `@Injectable({ providedIn: 'root' })`
- Shared components go in `shared/components/`

## Code Style
- 2-space indent, single quotes, semicolons required
- Files: `kebab-case.component.ts` — Classes: `PascalCase` with suffix (`XxxComponent`, `XxxService`)
- Selectors: `app-kebab-case`
- No `I` prefix on interfaces. Use `interface` not `class` for data shapes. Use `enum` for finite sets.

## State Management
- `BehaviorSubject` exposed via `.asObservable()` — no NgRx
- Cart state persists to `localStorage`
- Constructor DI (not `inject()` function)

## RxJS
- Suffix observables with `$`: `products$`, `destroy$`
- Subscription cleanup: `destroy$ = new Subject<void>()` + `takeUntil(this.destroy$)` + complete in `ngOnDestroy`
- Never subscribe without cleanup

## Error Handling
- Use `MatSnackBar` with `panelClass: ['error-snackbar']` or `['success-snackbar']`

## Import Order
```
@angular/core
@angular/common, @angular/forms, @angular/router
@angular/material/*
local models
services
components
shared
rxjs
```

## Common Commands
```bash
npm ci                 # Install (always ci, not install)
npm start              # Dev server :4200, proxies /api -> localhost:5001
npm run build          # Production build
npx ng test --browsers=ChromeHeadless --watch=false   # Run tests headless
npx ng test --include='**/file.spec.ts'               # Single test file
```

## Key Config
- Proxy: `/api` and `/uploads` -> `localhost:5001` via `proxy.conf.json`
- Bundle budgets: 3MB initial warning, 10MB error; 100KB per component style
- PWA: service worker configured but currently disabled in `main.ts`
