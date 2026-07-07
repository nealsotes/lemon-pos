---
name: angular
description: Use when building or changing Angular 20 UI — standalone components, services, routing, guards, interceptors, reactive forms, RxJS, signals, lazy loading, component communication, performance, and accessibility. For app state patterns use `state-management`; for tests use `testing`.
---

# Angular 20 — Standalone + RxJS

TRIGGER when: editing `.ts/.html/.scss` under `frontend/src/app/`, or working on components, services, routing, guards, interceptors, or forms.

DO NOT TRIGGER when: the work is backend, or purely about the state/BehaviorSubject pattern (`state-management`) or test structure (`testing`).

Naming/formatting live in `coding-standards`; folder layering in `architecture`.

## Components — standalone

- All components are `standalone: true`; **no NgModules**. External `templateUrl` + `styleUrls` (array form).
- `ChangeDetectionStrategy.OnPush` for performance-sensitive components; call `cdr.markForCheck()` after async state changes.
- Subscription cleanup is mandatory:

```typescript
private destroy$ = new Subject<void>();
this.products$.pipe(takeUntil(this.destroy$)).subscribe(...);
ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
```

## Services

- `@Injectable({ providedIn: 'root' })`; **constructor DI** (`private http: HttpClient`) — not the `inject()` function (house style).
- HTTP with typed responses; `.pipe(tap, map, catchError)`. On error, fall back to localStorage where offline support matters (see `state-management`).

## RxJS vs Signals

- The repo's established pattern is **RxJS + `BehaviorSubject`** for shared state (see `state-management`) — match it.
- **Signals** are appropriate for *local, synchronous* component view state (toggles, derived values) where they simplify templates. Don't rewrite existing observable flows into signals; don't mix a signal and an observable for the same piece of state.

## Routing, Guards, Interceptors

- Guards in `core/guards/`: `AuthGuard` (authenticated), `RoleGuard` (Owner/Admin), `AdminGuard` (Admin-only). Route protection map is in `CLAUDE.md`.
- `AuthInterceptor` (class-based `HttpInterceptor` in `core/interceptors/`) attaches `Authorization: Bearer <token>`, skips `/api/auth/*`, and on `401` logs out unless on a public route. Auth semantics: `authentication`.

## Reactive Forms

- Prefer `ReactiveFormsModule` (`FormGroup`/`FormControl`/`Validators`) over template-driven forms for anything with validation. Show field errors inline; surface submit errors via `MatSnackBar` (`['error-snackbar']`).

## Component Communication

- Parent→child `@Input()`, child→parent `@Output() EventEmitter`. For cross-feature/shared state use a `core/` service exposing an observable — never reach into another feature's component. Details: `state-management`.

## Lazy Loading

- Load feature routes with `loadComponent`/`loadChildren` so features split into separate bundles. Keep `core/` eager; lazy-load heavy admin/reporting screens.

## Performance

- `OnPush` + `async` pipe (avoids manual subscribe/leak). `trackBy` on `*ngFor`. Unsubscribe via `takeUntil`.
- Respect bundle budgets (3 MB initial warning / 10 MB error; 100 KB per component style).

## Accessibility

- Semantic elements; `aria-label` on icon-only controls; visible focus; full keyboard operability (POS is used on touch **and** keyboard). Sufficient color contrast in Material theming.

## Testing

Jasmine + Karma — see the `testing` skill for structure, spies, and coverage.

## Related skills

- `state-management` · `authentication` · `coding-standards` · `architecture` · `testing`

## Behavior

- Match existing components before inventing a pattern — read a neighbor in the same feature.
- Never leave a subscription without `takeUntil`/`async` pipe.
- Keep components thin: data/state belongs in services (`state-management`), not the component.
