# Claude Code Productivity Stack — Design Spec

**Date:** 2026-03-28
**Project:** QuickServe POS (lemon-pos)
**Scope:** Slash commands, hooks, per-folder CLAUDE.md/skills.md, and permissions

## Goal

Eliminate repetitive prompting, automate quality gates, reduce approval friction, and give Claude project-scoped context — so each session starts fast and stays consistent with project conventions.

## Approach

**Commands + Hooks** — slash commands for on-demand workflows, hooks for passive automation, per-folder files for scoped context, and tuned permissions to reduce friction. The existing CLAUDE.md and docs/ agent guides remain the source of truth for conventions; this stack wires them into Claude Code's automation layer.

---

## 1. Slash Commands

Located in `.claude/commands/`. Each is a markdown file that becomes an invocable `/command-name`.

### `/start` — Session Briefing
Displays current branch, git status, recent commits (last 5), any uncommitted work, and a summary of where the user left off. Orients each session in seconds.

**Reads:** git status, git log, git diff --stat

### `/test` — Run All Tests
Runs backend (`dotnet test` from `backend/PosSystem/`) and frontend (`npx ng test --browsers=ChromeHeadless --watch=false` from `frontend/`) tests. Summarizes pass/fail counts and surfaces any failures with context.

### `/test-backend` — Backend Tests Only
Runs `dotnet test` from `backend/PosSystem/`. Reports pass/fail counts, lists failing test names and error messages.

### `/test-frontend` — Frontend Tests Only
Runs `npx ng test --browsers=ChromeHeadless --watch=false` from `frontend/`. Reports pass/fail counts, lists failing specs.

### `/review` — Code Review
Reviews staged and modified files against CLAUDE.md conventions:
- Naming: kebab-case files (TS), PascalCase classes (TS/C#), Allman braces (C#), 2-space indent (TS), 4-space indent (C#)
- Patterns: standalone components, BehaviorSubject state, takeUntil cleanup, service/repository separation
- Error handling: MatSnackBar usage (frontend), exception types (backend)
- Import order compliance

Outputs a pass/fail checklist with specific file:line references.

### `/deploy-check` — Pre-Deploy Verification
Runs the full build pipeline locally:
1. `dotnet build` (backend)
2. `npm run build` (frontend production build)
3. Checks bundle size against budgets (3MB warning, 10MB error)
4. Verifies Docker build would succeed (dry-run analysis, not actual build)

Reports go/no-go status.

### `/fix` — Debug Assistant
Accepts a bug description. Then:
1. Checks recent git changes for likely culprits
2. Reads relevant log output
3. Cross-references with error handling patterns from docs/
4. Proposes root cause and a specific fix

### `/db-migrate` — Database Migration Helper
Interactive guide for EF Core migrations:
1. Reviews pending model changes
2. Suggests a migration name
3. Runs `dotnet ef migrations add <Name> --context PosSystemDbContext`
4. Shows the generated migration for review
5. Applies with `dotnet ef database update --context PosSystemDbContext` on user approval

---

## 2. Per-Folder Files

### `frontend/CLAUDE.md` — Auto-Loaded Angular Context

Distilled from docs/FRONTEND_AGENT.md into machine-critical rules Claude reads automatically:

- Angular 20 standalone components (no NgModules)
- 2-space indent, single quotes, semicolons required
- File naming: `kebab-case.component.ts`, selectors: `app-kebab-case`
- Observable suffix: `$`, subscription cleanup: `destroy$` + `takeUntil`
- State: `BehaviorSubject` exposed via `.asObservable()`, cart persists to localStorage
- Services: `@Injectable({ providedIn: 'root' })`, constructor DI
- Error display: `MatSnackBar` with `panelClass`
- Import order: `@angular/core` -> `@angular/common,forms,router` -> `@angular/material/*` -> local
- Common commands: `npm ci`, `npm start`, `npm run build`, `npx ng test`
- Proxy: `/api` and `/uploads` -> localhost:5001 via `proxy.conf.json`
- Bundle budgets: 3MB initial warning, 10MB error; 100KB per component style

### `backend/CLAUDE.md` — Auto-Loaded .NET Context

Distilled from docs/BACKEND_AGENT.md into machine-critical rules Claude reads automatically:

- .NET 8 Clean Architecture: Controller -> Service -> Repository -> DbContext
- 4-space indent, Allman braces, file-scoped namespaces
- Interfaces: `I` prefix. DTOs: `Dto` suffix. Private fields: `_camelCase`
- Async methods: `Async` suffix. Controllers plural, services singular
- String IDs: `Guid.NewGuid().ToString()`. Timestamps: `DateTime.UtcNow`
- Exceptions: `ArgumentException` (not found), `InvalidOperationException` (business rule)
- Import order: `Microsoft.*` -> `PosSystem.*` -> `System.*`
- EF Core: Pomelo MySQL, `OwnsOne`/`OwnsMany` for nested entities, composite keys
- Decimal precision: prices `decimal(18,2)`, recipes `decimal(18,4)`
- Common commands: `dotnet run` (port 5001), `dotnet build`, `dotnet test`
- Migrations: always include `--context PosSystemDbContext`

### `frontend/skills.md` — Human Reference

Available slash commands for frontend work:
- `/test-frontend` — run Angular tests
- `/review` — convention check
- `/fix` — debug with frontend context
- `/start` — session orientation

Common workflows:
- Adding a component: create file, register route, add to nav if needed
- Adding a service: BehaviorSubject pattern, provide in root
- Debugging: check browser console, proxy config, Angular error handler

Links: `docs/FRONTEND_AGENT.md`, `docs/TESTING_AGENT.md`

### `backend/skills.md` — Human Reference

Available slash commands for backend work:
- `/test-backend` — run .NET tests
- `/review` — convention check
- `/deploy-check` — build verification
- `/db-migrate` — migration helper
- `/fix` — debug with backend context

Common workflows:
- Adding an endpoint: controller + service + repository + register in Program.cs
- Creating a migration: model change -> migration add -> review -> apply
- Debugging: check logs, exception middleware, service layer

Links: `docs/BACKEND_AGENT.md`, `docs/DATABASE_AGENT.md`, `docs/TESTING_AGENT.md`

---

## 3. Hooks

Configured in project-level settings. Shell commands triggered by Claude Code tool events.

### Post-Edit: Auto-Format

**Trigger:** After Claude edits any file (Edit or Write tool)

**Logic:**
- If file matches `*.ts`, `*.html`, `*.scss` -> run `npx prettier --write <file>` from `frontend/`
- If file matches `*.cs` -> run `dotnet format --include <file>` from `backend/PosSystem/PosSystem/` (uses `--include` to scope formatting to the changed file)
- Other files -> no action

**Behavior:** Silent on success, surfaces errors if formatter fails.

### Post-Write: Naming Convention Check

**Trigger:** After Claude creates a new file (Write tool)

**Logic:**
- Angular files in `frontend/src/`: verify kebab-case with appropriate suffix (`.component.ts`, `.service.ts`, `.guard.ts`, `.interceptor.ts`, `.pipe.ts`)
- C# files in `backend/`: verify PascalCase with appropriate suffix (`Controller.cs`, `Service.cs`, `Repository.cs`, `Dto.cs`)
- Warn (do not block) if naming doesn't match

**Behavior:** Prints a warning message. Does not prevent the write.

### Pre-Commit: Build Verification

**Trigger:** Before Claude creates a git commit

**Logic:**
1. Run `dotnet build` from `backend/PosSystem/PosSystem/`
2. Run `npx ng build` from `frontend/`
3. If either fails, block the commit and surface the error

**Behavior:** Blocking. Commit does not proceed if builds fail. Adds ~30-60s to each commit.

---

## 4. Permissions

Configured in `.claude/settings.json` at the project level.

### Auto-Allowed (No Approval Prompt)
- Read, Glob, Grep — file inspection
- Edit, Write — file modifications within the project
- Bash commands:
  - `dotnet build`, `dotnet test`, `dotnet format`
  - `npm ci`, `npm run build`, `npx ng test`, `npx ng build`, `npx prettier`
  - `git status`, `git diff`, `git log`, `git branch`

### Require Approval
- `git commit`, `git push`, `git checkout`, `git reset`
- `dotnet ef migrations add`, `dotnet ef database update`
- `docker build`, `docker run`
- Any command referencing `scripts/` or deployment configs
- `npm install` (prefer `npm ci`)

---

## File Tree (New Files)

```
lemon-pos/
  .claude/
    commands/
      start.md
      test.md
      test-backend.md
      test-frontend.md
      review.md
      deploy-check.md
      fix.md
      db-migrate.md
    settings.json          # project-level hooks + permissions
  frontend/
    CLAUDE.md              # auto-loaded Angular conventions
    skills.md              # human reference for frontend workflows
  backend/
    CLAUDE.md              # auto-loaded .NET conventions
    skills.md              # human reference for backend workflows
```

## Out of Scope

- Custom skills (`.claude/skills/`) — deferred; CLAUDE.md + docs/ cover conventions adequately for now
- Memory system seeding — can be added incrementally through normal usage
- CI/CD hooks — this spec covers local development only
- Modifying existing `.agent/workflows/` or `docs/` files — they remain as-is
