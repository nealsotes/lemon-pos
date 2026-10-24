---
name: mysql
description: Use when designing or reviewing the MySQL 8 schema behind this app — table/column naming, indexes, constraints, normalization, data types, query performance, DB-level security, and transactions/isolation. Schema is EF code-first, so DDL changes go through `migrations`; query/LINQ shape lives in `entity-framework`.
---

# MySQL 8.0 (Pomelo, code-first)

TRIGGER when: reasoning about schema, indexes, constraints, column types, normalization, or DB-level performance/security/transactions.

DO NOT TRIGGER when: writing the migration itself (`migrations`), writing LINQ/EF config (`entity-framework`), or app-level API concerns (`aspnet-api`).

**The schema is owned by EF Core migrations.** You design it here; you apply it via `migrations`. Never hand-run DDL against the database.

## Naming

- Tables follow the entity names EF generates; some are pinned to singular to match the existing Railway DB (`TransactionItem`, `AddOn`) — respect existing table names, don't rename casually.
- Columns are the entity property names. Keep them descriptive; categories are stored as plain string columns (not lookup FKs).

## Data types (map from the entity)

| Kind | Type | Notes |
|------|------|-------|
| PK / ids | `varchar` GUID string | app generates `Guid.NewGuid().ToString()` |
| Money | `decimal(18,2)` | prices, totals, amounts |
| Recipe/lot qty | `decimal(18,4)` | finer precision |
| Short strings | `varchar(n)` with explicit length | always bound length |
| Large text/JSON | `mediumtext` / `longtext` | e.g. product image data URL, `AddOnsJson` |

## Indexes

- Index every **foreign key** and every **frequent filter/sort** column. Existing model indexes `StockMovement(IngredientId, CreatedAt, LotId)`, `IngredientLot(IngredientId, ReceivedAt)` and `(IngredientId, IsActive)`.
- Use **composite** indexes ordered by selectivity for multi-column filters (leftmost-prefix rule).
- **Unique** indexes enforce business identity: `User.Username`, `ApplicationSettings.Key`.
- Add an index when a query filters/sorts a column on a growing table; don't over-index write-heavy tables.

## Constraints & Integrity

- `NOT NULL` for required columns (`IsRequired()` in EF); `HasMaxLength` becomes column length.
- Composite primary keys where identity is compound (`ProductIngredient` = `ProductId+IngredientId`).
- Foreign-key delete behavior is deliberate: `Expense→ExpenseCategory` is `RESTRICT` so an in-use category can't be deleted. Choose `RESTRICT`/`CASCADE`/`SET NULL` intentionally per relationship.

## Normalization

- Normalize to ~3NF for transactional entities; the current design does this (ingredients, lots, movements, recipes as join table).
- **Deliberate denormalization** exists for POS history: `TransactionItem` snapshots name/price/category at sale time so historical receipts stay correct even if the product later changes. Preserve that — don't "normalize" snapshots back into FKs.

## Query Performance

- Let the DB filter/sort/page (indexes above); the EF query shapes this — see `entity-framework` for projections, `AsNoTracking`, and N+1 avoidance.
- Watch owned-collection loads (`TransactionItem`/`AddOn`) — project when you don't need the full graph.

## Stored Procedures

- **Not used** — this is a code-first EF app; business logic lives in services, not the DB. Don't introduce stored procedures without a proven, measured performance need. If ever required, define them **inside a migration** so they're versioned, and document why.

## Security (DB level)

- App connects with a least-privilege user over a connection string from env (`MYSQL_URL` / individual `MYSQL*` vars). Never commit credentials.
- EF parameterizes all queries — never build SQL by string concatenation, even in `FromSqlRaw`.
- Local dev runs MySQL on non-standard port `3307`; production is Railway MySQL 8.0.

## Transactions & Isolation

- Multi-table writes go through a transaction/`UnitOfWork` at the app layer (`entity-framework`); rely on the DB's default InnoDB isolation. Keep transactions short to avoid lock contention on hot tables (transactions, stock movements).

## Related skills

- `migrations` — how schema changes reach the database
- `entity-framework` — the Fluent config and queries that generate this schema
- `railway` — where the MySQL connection env vars live

## Behavior

- All schema changes flow through EF migrations — propose the model change, then a migration.
- Flag missing indexes on new FK/filter columns and unbounded string columns.
- Preserve historical snapshots and existing table names; don't refactor them away.
