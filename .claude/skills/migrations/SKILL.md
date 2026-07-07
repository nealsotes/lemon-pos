---
name: migrations
description: Use when creating, applying, reviewing, or troubleshooting EF Core database migrations — the `dotnet ef` workflow, append-only discipline, destructive-operation review, the model snapshot, and seed data. Model/Fluent config lives in `entity-framework`; schema/index design in `mysql`.
---

# EF Core Migrations — MySQL

TRIGGER when: an entity or `OnModelCreating` changed, or the task is to add/apply/review a migration.

DO NOT TRIGGER when: writing entity/Fluent config or queries (`entity-framework`), or designing indexes/constraints conceptually (`mysql`).

## Workflow

Run from `backend/PosSystem/PosSystem/`, always specifying the context:

```bash
dotnet ef migrations add <DescriptiveName> --context PosSystemDbContext
dotnet ef database update --context PosSystemDbContext          # apply
dotnet ef migrations remove --context PosSystemDbContext        # ONLY if not yet applied/shared
```

1. Change the entity + Fluent config (`entity-framework`).
2. `migrations add` — review the generated `Up`/`Down` before committing.
3. `database update` locally; verify the app runs.
4. Commit the migration **and** the updated `PosSystemDbContextModelSnapshot.cs` together.

## Naming

Generated timestamp prefix + PascalCase intent, matching history:

```
20260403123116_AddExpenseSystem
20260408043630_FixAddOnPrimaryKey
```

Name for **what it does**, not "update1".

## Append-only discipline

- **Never edit a migration that has been applied or shared/merged.** To change course, add a new migration.
- The `ModelSnapshot` is the source of truth for the current model — never hand-edit it; let `dotnet ef` regenerate it.
- Keep migrations ordered; don't reorder timestamps.

## Review every migration for destructive ops

- Flag and double-check any `DropColumn`, `DropTable`, `DELETE`, `TRUNCATE`, `AlterColumn` that narrows a type or drops data.
- A rename generated as drop+add **loses data** — rewrite it as a real `RenameColumn`/`RenameTable`.
- Ensure a sensible `Down` so the migration is reversible.
- Adding a `NOT NULL` column to a populated table needs a default or a backfill step — don't ship a migration that fails on existing rows.

## Seed data

- Seed via migrations so it's versioned and repeatable. Precedent: `AddExpenseSystem` applies seed rows through raw SQL inside the migration. Prefer idempotent seed SQL (guard against duplicates).

## Deployment note

- Migrations must be applied against the Railway MySQL database as part of release (see `railway`). Back up before applying anything destructive to production.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| "model changed" warning at runtime | pending model change with no migration — add one |
| update fails on existing data | new non-nullable column w/o default, or narrowing type — add default/backfill |
| snapshot conflict on merge | regenerate: re-add the migration after taking `main`'s snapshot |
| composite-key/MySQL PK error | auto-increment column must be first in the key (see `AddOn` in `entity-framework`) |

## Related skills

- `entity-framework` — the model change that a migration captures
- `mysql` — the schema/index/constraint design being applied
- `railway` — applying migrations to the deployed database
- `git-workflow` — migrations are part of the PR review gate

## Behavior

- Every model change ⇒ a migration. Never patch the DB by hand.
- Migrations are append-only; if one is already applied, add another.
- Always read the generated SQL and flag destructive operations before committing.
