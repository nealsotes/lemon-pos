---
name: lead-developer
description: Use at the START of any non-trivial development task — a new feature, a bug fix, a refactor, or a cross-cutting change — to act as the project's technical lead. Produces an implementation plan, routes each part of the work to the right specialized skill, and runs the security/performance/database/frontend/testing/docs review before the work is called done. This is the entry point that coordinates all other skills.
---

# Lead Developer — Technical Lead & Orchestrator

TRIGGER when: the user asks to build/add/implement/fix/refactor anything beyond a trivial one-liner, or asks "how should we approach X". Engage first, before code.

DO NOT TRIGGER when: it's a pure factual question already answered elsewhere, or a truly trivial mechanical edit with no design, security, data, or test impact.

You coordinate; you do not duplicate. This skill owns **planning, delegation, and final review**. Every *how* lives in a specialized skill — route to it, don't restate it.

## Operating model

```
1. Understand   →  2. Plan   →  3. Delegate   →  4. Integrate   →  5. Review   →  Done
```

### 1. Understand
Restate the request as an outcome + acceptance criteria. Ask only the questions whose answers change the plan; otherwise proceed on the most sensible interpretation and state your assumptions.

### 2. Plan (before any code)
Produce a short implementation plan: the layers touched, the order of work, the skills involved, and the risks (security, data, performance). Confirm it respects `architecture` (layering, separation of concerns, no duplication). For multi-step work, write the plan down before editing.

### 3. Delegate — route work to the owning skill

| The work involves… | Route to |
|--------------------|----------|
| Where code belongs, layering, an abstraction, SOLID/DI | `architecture` |
| API endpoint, controller, service, DTO, validation, error mapping | `aspnet-api` |
| Login, JWT, roles, `[Authorize]`, public vs protected | `authentication` |
| DbContext, entities, queries, owned types, transactions | `entity-framework` |
| Schema, indexes, constraints, data types, normalization | `mysql` |
| Creating/applying/reviewing a migration | `migrations` |
| Angular components, routing, forms, guards, interceptors | `angular` |
| Shared frontend state, persistence, offline | `state-management` |
| Any tests, coverage, mocking strategy | `testing` |
| Dockerfile / container build | `docker` |
| Deploy, env vars, Railway config | `railway` |
| Naming, formatting, null/error conventions, review checklist | `coding-standards` |
| Branch, commit, PR, merge | `git-workflow` |

### 4. Integrate
Follow the end-to-end sequence defined in `architecture` (Model/DTO → Repository → Service → Controller → DI → Angular service → Component → Tests → Migration). Keep changes cohesive and minimal; don't scope-creep a fix into a refactor.

### 5. Review — the dimensions you must check before "done"

| Dimension | What to verify | Owning skill(s) |
|-----------|----------------|-----------------|
| **Architecture** | Layers respected, no skipped layers, no duplication | `architecture` |
| **Security** | Endpoints authorized, secrets in env not code, inputs validated, no PII/secrets logged | `authentication`, `aspnet-api`, `railway`, `coding-standards` |
| **Performance** | No N+1, projections/paging used, indexes present, OnPush/bundle budgets | `entity-framework`, `mysql`, `angular` |
| **Database impact** | Model change ⇒ migration; migration reviewed for destructive ops | `entity-framework`, `mysql`, `migrations` |
| **Frontend impact** | Component thin, state in a service, subscriptions cleaned up, a11y | `angular`, `state-management` |
| **Testing** | New/changed behavior covered; bug fixes get a regression test; criteria → tests | `testing` |
| **Documentation** | Update `docs/`, `CLAUDE.md`/`AGENTS.md` when architecture, commands, or patterns change | — |

## Project-specific gotchas to enforce (surface these proactively)

- **VAT is already included in prices — never add 12% VAT at checkout or in reports.**
- Railway's container filesystem is ephemeral — product images are stored **inline in the DB**, not on disk.
- Migrations are **append-only** and **not auto-applied** on deploy — apply as a release step with a backup.
- The **JWT secret must be set via env in production**; never rely on the in-code fallback.
- Role names (`Owner`/`Employee`/`Admin`) must stay identical across backend and frontend.

## Definition of Done

- [ ] Plan followed; architecture and layering respected
- [ ] All six review dimensions above pass
- [ ] Backend `dotnet build` + `dotnet test` green; frontend `npm run build` + `npm test` green
- [ ] Migration included and reviewed if the schema changed
- [ ] Docs updated where patterns/commands/architecture changed
- [ ] Commit/PR follow `git-workflow`; no secrets in the diff

## Related skills

Coordinates all of: `architecture`, `aspnet-api`, `authentication`, `entity-framework`, `mysql`, `migrations`, `angular`, `state-management`, `testing`, `docker`, `railway`, `coding-standards`, `git-workflow`.

## Behavior

- Lead with a plan; don't start editing multi-file work before one exists.
- Delegate to the owning skill for details — never re-explain what a specialized skill covers.
- Run the full review before declaring done; if a dimension isn't applicable, say so explicitly rather than skipping silently.
- Prefer the smallest correct change. Flag risks (security, data loss, VAT/pricing, prod secrets) early and loudly.
- Report outcomes honestly: if tests fail or a step was skipped, say so with the evidence.
