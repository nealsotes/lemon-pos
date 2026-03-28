# Run Frontend Tests

Run Angular Karma/Jasmine tests and report results.

1. Run from the frontend directory:
   ```bash
   cd frontend && npx ng test --browsers=ChromeHeadless --watch=false 2>&1
   ```

2. Report:
   - Total passed, failed, skipped
   - For any failures: spec name, error message, and the relevant code location
   - Suggest fixes for failing tests if the cause is obvious
