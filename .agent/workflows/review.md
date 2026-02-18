---
description: Performs an architectural and quality review based on project standards.
---

1. Read the Review Checklists in `docs/TEAM_LEAD_AGENT.md`.
2. Scan the modified files or the specific file requested for:
   - Naming conventions adherence.
   - Pattern usage (Repository/Service on backend, Standalone Components on frontend).
   - Async/Await usage.
   - Proper Error Handling and Logging.
   - RxJS subscription management (takeUntil pattern).
3. Check code against the quality metrics (e.g., lack of `any` types in TS).
4. Provide a "Pass/Fail" summary with specific improvement suggestions.
