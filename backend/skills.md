# Backend Skills & Workflows

Quick reference for available Claude Code commands and common workflows when working in the backend.

## Available Commands

| Command | What it does |
|---------|-------------|
| `/start` | Session briefing — git status, recent commits, orientation |
| `/test-backend` | Run .NET xUnit tests |
| `/test` | Run all tests (backend + frontend) |
| `/review` | Code review against project conventions |
| `/fix <description>` | Debug assistant — describe the bug, get a diagnosis |
| `/deploy-check` | Full build verification before deploying |
| `/db-migrate` | Database migration helper (create, review, apply) |

## Common Workflows

### Adding a New API Endpoint
1. Define interface in `Core/Interfaces/` — `IXxxService`, `IXxxRepository`
2. Create model/DTOs in `Core/Models/`
3. Implement repository in `Infrastructure/Repositories/`
4. Implement service in `Infrastructure/Services/`
5. Create controller in `API/Controllers/` (plural name)
6. Register services in `Program.cs`
7. Write tests following `MethodName_Scenario_ExpectedBehavior` naming

### Creating a Database Migration
1. Modify model in `Core/Models/`
2. Update `PosSystemDbContext` if needed (new DbSet, configuration)
3. Use `/db-migrate` command — it walks you through the full flow
4. Or manually:
   ```bash
   dotnet ef migrations add <Name> --context PosSystemDbContext
   dotnet ef database update --context PosSystemDbContext
   ```
5. Always review the generated migration before applying

### Adding a New Service
1. Define interface in `Core/Interfaces/IXxxService.cs`
2. Implement in `Infrastructure/Services/XxxService.cs`
3. Throw `ArgumentException` for not-found, `InvalidOperationException` for business rules
4. Use `Async` suffix on all async methods
5. Register in `Program.cs`: `builder.Services.AddScoped<IXxxService, XxxService>()`

### Debugging Backend Issues
1. Check exception middleware logs
2. Verify JWT token and roles if getting 401/403
3. Check EF Core query generation for data issues
4. Verify `appsettings.json` for local DB connection (`localhost:3307`)
5. Use `/fix` command for Claude-assisted diagnosis

## Deep Dive Documentation
- [Backend Agent Guide](../docs/BACKEND_AGENT.md) — full patterns, examples, architecture
- [Database Agent Guide](../docs/DATABASE_AGENT.md) — schema, migrations, seed data
- [Testing Agent Guide](../docs/TESTING_AGENT.md) — test patterns, coverage targets (70% backend)
