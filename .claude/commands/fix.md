# Debug Assistant

Help diagnose and fix a bug. Describe the issue after invoking this command: `/fix <description>`

$ARGUMENTS

1. **Gather context:**
   - Run `git log --oneline -10` to check recent changes
   - Run `git diff` to see current modifications
   - Identify which layer the bug likely lives in (frontend, backend, database)

2. **Investigate:**
   - Read the relevant source files based on the bug description
   - Check error handling patterns from the project docs
   - Look for common culprits: missing null checks, async issues, incorrect API contracts, subscription leaks

3. **Diagnose:**
   - Identify the root cause
   - Trace the data flow from the point of failure back to the source

4. **Propose fix:**
   - Show the specific code change needed with file:line references
   - Explain why this fixes the issue
   - Flag any related code that might have the same problem
   - Ask before applying the fix
