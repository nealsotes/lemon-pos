---
description: Automatically updates agent documentation with new patterns discovered in the codebase.
---

1. Scan the recent commits or newly created files for architecture patterns.
2. Compare the implementation against existing patterns in the `docs/` folder.
3. If a new, better, or modified pattern is found:
   - Identify the correct sub-agent file (e.g., `docs/BACKEND_AGENT.md`).
   - Append or update the "Code Patterns" or "Common Tasks" section.
4. Notify the user of what documentation was updated and why.
