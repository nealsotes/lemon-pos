---
name: "source-command-test-backend"
description: "Migrated source command `test-backend`"
---

# source-command-test-backend

Use this skill when the user asks to run the migrated source command `test-backend`.

## Command Template

# Run Backend Tests

Run .NET xUnit tests and report results.

1. Run from the solution directory:
   ```bash
   cd backend/PosSystem && dotnet test --verbosity normal 2>&1
   ```

2. Report:
   - Total passed, failed, skipped
   - For any failures: test name, expected vs actual, and the relevant code location
   - Suggest fixes for failing tests if the cause is obvious
