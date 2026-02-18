---
description: Comprehensive pre-deployment check including builds and tests.
---

1. Run the build scripts to ensure compilation:
// turbo
2. `powershell scripts/start-backend.ps1` (to verify startup)
// turbo
3. `./scripts/build-frontend.sh`
4. Run all unit tests:
// turbo
5. `dotnet test` (Backend)
// turbo
6. `npm test` (Frontend)
7. Run the performance check:
// turbo
8. `powershell scripts/performance-check.ps1`
9. Provide a summary: ✅ Ready for Railway / ❌ Fix Required.
