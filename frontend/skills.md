# Frontend Skills & Workflows

Quick reference for available Claude Code commands and common workflows when working in the frontend.

## Available Commands

| Command | What it does |
|---------|-------------|
| `/start` | Session briefing — git status, recent commits, orientation |
| `/test-frontend` | Run Angular Karma/Jasmine tests (headless) |
| `/test` | Run all tests (backend + frontend) |
| `/review` | Code review against project conventions |
| `/fix <description>` | Debug assistant — describe the bug, get a diagnosis |
| `/deploy-check` | Full build verification before deploying |

## Common Workflows

### Adding a New Component
1. Create file in `src/app/features/<feature>/components/` using kebab-case naming
2. Use standalone component pattern (no NgModules)
3. Add route in the feature's routes file if needed
4. Add nav entry if the component is a top-level page

### Adding a New Service
1. Create in `src/app/features/<feature>/services/` or `src/app/core/services/`
2. Use `@Injectable({ providedIn: 'root' })` for singletons
3. State via `BehaviorSubject`, exposed with `.asObservable()`
4. Always clean up subscriptions with `takeUntil(this.destroy$)`

### Adding a New Route
1. Add to the relevant `*.routes.ts` file
2. Apply guards: `AuthGuard` for auth-protected, `RoleGuard` for role-protected
3. Public routes: `/login`, `/menu`
4. Auth routes: `/pos`, `/cart`, `/checkout`, `/receipt`
5. Admin routes: `/reports`, `/products`, `/inventory`, `/printer-settings`, `/settings`

### Debugging Frontend Issues
1. Check browser console for errors
2. Verify proxy config (`proxy.conf.json`) — `/api` should hit `localhost:5001`
3. Check `AuthInterceptor` if getting 401s
4. Check `MatSnackBar` calls for user-facing error messages
5. Use `/fix` command for Claude-assisted diagnosis

## Deep Dive Documentation
- [Frontend Agent Guide](../docs/FRONTEND_AGENT.md) — full patterns, examples, architecture
- [Testing Agent Guide](../docs/TESTING_AGENT.md) — test patterns, coverage targets (60% frontend)
