---
name: state-management
description: Use when designing or changing shared frontend state — the BehaviorSubject-in-a-service pattern, exposing read-only observables, localStorage/sessionStorage persistence, offline fallback, and when to use signals vs RxJS state. `angular` links here for anything state-related.
---

# State Management — BehaviorSubject Services (no NgRx)

TRIGGER when: adding/changing app-wide or feature state, persistence to storage, offline handling, or deciding where a piece of state should live.

DO NOT TRIGGER when: it's purely component view mechanics (`angular`) or a backend concern.

This repo uses **no NgRx**. State lives in `@Injectable({ providedIn: 'root' })` services built around `BehaviorSubject`.

## The canonical pattern

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();   // read-only out

  setUser(user: User) { this.currentUserSubject.next(user); }     // mutate via methods
}
```

Rules:
- Private `...Subject`; expose **only** the `...$` observable via `.asObservable()`. Components never call `.next()` — they call service methods.
- Read a one-off current value with `subject.value`; subscribe to `...$` for reactive updates.
- Keep each subject owned by exactly one service (single source of truth).

## Persistence (localStorage / sessionStorage)

- Persist what must survive reload: auth token/user (`auth_token`, `auth_user`, `auth_expires`), cart contents, settings. "Remember me" → `localStorage`; session-only → `sessionStorage` (mirrors `AuthService`).
- Rehydrate in the service constructor (e.g. `checkStoredToken()`), then push into the subject so the app boots with correct state.
- Clear all related keys on logout/reset — don't leave orphaned storage.

## Offline fallback

- On HTTP error in a data service, `catchError` and fall back to the last-known localStorage snapshot so the POS keeps working offline; reconcile when back online (see `OfflineService`, `OfflineDataService`).
- Never let an offline read throw into the component — degrade gracefully and show a non-blocking notice.

## Signals vs RxJS state

- **Shared/persisted/async state → RxJS `BehaviorSubject`** (this pattern). It integrates with the `async` pipe and offline flows.
- **Local, synchronous view state → a signal** may be cleaner. Do not model shared app state as signals here, and don't duplicate one piece of state across both a subject and a signal.

## Related skills

- `angular` — components that consume these observables (`async` pipe, `takeUntil`)
- `authentication` — token/user state produced by `AuthService`
- `coding-standards` — `$` suffix and naming

## Behavior

- One source of truth per piece of state; expose read-only, mutate through methods.
- Always plan persistence + clear-on-logout together.
- Don't introduce NgRx or a second state library — extend the existing service pattern.
