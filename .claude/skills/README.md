# Skill System — Lemon POS (QuickServe)

A reusable AI workflow for this Angular 20 + .NET 8 + MySQL/Railway POS. A **Lead Developer** skill orchestrates every non-trivial task and delegates the details to focused, single-responsibility skills.

## Entry point

Start non-trivial work with **`lead-developer`** — it plans, routes each part to the owning skill below, and runs the security / performance / database / frontend / testing / docs review before calling the work done. (Claude auto-invokes a skill when its `description` matches the task; you can also request one explicitly.)

## Map

All skills live **flat** at `.claude/skills/<name>/SKILL.md`. Claude Code discovers skills exactly one directory deep — category subfolders (`backend/…`) are **not** registered — so the skills are flat and grouped here by role for readability only:

```
Orchestration
  lead-developer      ← plan → delegate → integrate → review (entry point)

Cross-cutting
  architecture        ← where code belongs: layering, SOLID, DI, no duplication
  coding-standards    ← naming, formatting, null/error conventions, review gate
  git-workflow        ← branches, Conventional Commits, PR checklist, merge

Backend (.NET 8)
  aspnet-api          ← controllers, services, DTOs, validation, error→HTTP
  authentication      ← JWT, roles, [Authorize], secrets, public endpoints
  entity-framework    ← DbContext, Fluent API, owned types, LINQ, transactions
  testing             ← test strategy for BOTH stacks (xUnit/Moq + Jasmine/Karma)

Frontend (Angular 20)
  angular             ← standalone components, routing, guards, forms, RxJS
  state-management    ← BehaviorSubject services, persistence, offline (no NgRx)

Database (MySQL 8)
  mysql               ← schema, indexes, constraints, data types, DB security
  migrations          ← dotnet ef workflow, append-only, destructive-op review

DevOps (Docker + Railway)
  docker              ← multi-stage Angular+.NET image
  railway             ← deploy, env vars, port/HTTPS, health, secrets
```

## Design principles

- **Single responsibility** — each skill owns one area. `coding-standards` owns conventions; `architecture` owns structure; every other skill links to them instead of restating.
- **No duplication** — shared rules have exactly one home; skills cross-reference by name (e.g. "see `entity-framework`").
- **Grounded in this repo** — patterns cite real code (Pomelo/MySQL, JWT config, owned types, Railway build), not generic advice.
- **Format** — each `SKILL.md` has YAML frontmatter (`name` + `description` drive auto-invocation) and a `TRIGGER` / `DO NOT TRIGGER` body.

## Extending

Add a new skill as `.claude/skills/<name>/SKILL.md` (flat — one directory deep; nested category folders are not discovered). Use the same frontmatter + trigger format, give it one responsibility, cross-link related skills by bare name, and add its row to the `lead-developer` routing and review tables.
