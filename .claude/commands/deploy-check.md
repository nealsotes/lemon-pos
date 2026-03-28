# Pre-Deploy Verification

Run the full local build pipeline to verify deployment readiness.

1. **Backend build:**
   ```bash
   cd backend/PosSystem/PosSystem && dotnet build --configuration Release 2>&1
   ```

2. **Frontend production build:**
   ```bash
   cd frontend && npm run build 2>&1
   ```

3. **Check results:**
   - Backend: compiled successfully? Any warnings?
   - Frontend: built successfully? Any bundle budget warnings/errors?
   - Bundle sizes: check against 3MB initial warning, 10MB error threshold

4. **Report go/no-go:**
   - GREEN: Both builds pass, no budget violations
   - YELLOW: Builds pass but there are warnings (list them)
   - RED: One or more builds failed (show errors)

Run backend and frontend builds in parallel for speed.
