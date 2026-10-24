#!/bin/bash
# Pre-commit hook: verify builds pass before allowing git commit
# Only triggers on git commit commands — all other bash commands pass through

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept git commit commands
if ! echo "$COMMAND" | grep -q "^git commit"; then
  exit 0
fi

echo "Build verification before commit..." >&2

BUILD_FAILED=0

# Backend build check
if [ -f "$CLAUDE_PROJECT_DIR/backend/PosSystem/PosSystem/PosSystem.csproj" ]; then
  echo "  Checking backend build..." >&2
  if ! dotnet build "$CLAUDE_PROJECT_DIR/backend/PosSystem/PosSystem/" --verbosity quiet 2>&1 >&2; then
    echo "  FAILED: Backend build failed" >&2
    BUILD_FAILED=1
  else
    echo "  Backend: OK" >&2
  fi
fi

# Frontend build check
if [ -f "$CLAUDE_PROJECT_DIR/frontend/package.json" ]; then
  echo "  Checking frontend build..." >&2
  if ! (cd "$CLAUDE_PROJECT_DIR/frontend" && npx ng build --configuration production 2>&1 >&2); then
    echo "  FAILED: Frontend build failed" >&2
    BUILD_FAILED=1
  else
    echo "  Frontend: OK" >&2
  fi
fi

if [ $BUILD_FAILED -eq 1 ]; then
  echo "Build verification FAILED. Commit blocked." >&2
  exit 2
fi

echo "Build verification passed." >&2
exit 0
