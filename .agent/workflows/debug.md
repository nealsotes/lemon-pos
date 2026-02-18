---
description: Combined diagnostic workflow for troubleshooting infrastructure and code issues.
---

1. Read the Troubleshooting section in `docs/DEVOPS_AGENT.md`.
2. Check the logs for both Backend and Frontend.
3. If the issue is related to environment/network, suggest running:
   - `powershell scripts/test-network.ps1`
   - `powershell scripts/test-deployment.ps1`
4. If it's a runtime error, cross-reference with `docs/BACKEND_AGENT.md` or `docs/FRONTEND_AGENT.md` error handling patterns.
5. Provide a root cause analysis and a proposed fix.
