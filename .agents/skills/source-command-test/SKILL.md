---
name: "source-command-test"
description: "Migrated source command `test`"
---

# source-command-test

Use this skill when the user asks to run the migrated source command `test`.

## Command Template

# Run All Tests

Run both backend and frontend tests and provide a unified summary.

1. Run backend tests:
   ```bash
   cd backend/PosSystem && dotnet test --verbosity normal 2>&1
   ```

2. Run frontend tests:
   ```bash
   cd frontend && npx ng test --browsers=ChromeHeadless --watch=false 2>&1
   ```

3. Summarize results:
   - **Backend:** X passed, Y failed, Z skipped
   - **Frontend:** X passed, Y failed, Z skipped
   - List any failing tests with their error messages
   - If all pass, confirm with a clean summary

Run both test suites in parallel for speed.
