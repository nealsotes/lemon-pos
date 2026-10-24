#!/bin/bash
# Post-edit hook: auto-format files after Claude edits them

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Get file extension
EXT="${FILE_PATH##*.}"

case "$EXT" in
  ts|html|scss|css)
    # Format with Prettier for frontend files
    if command -v npx &>/dev/null; then
      npx prettier --write "$FILE_PATH" 2>/dev/null || true
    fi
    ;;
  cs)
    # Format with dotnet format for C# files
    if command -v dotnet &>/dev/null; then
      PROJECT_DIR="$CLAUDE_PROJECT_DIR/backend/PosSystem/PosSystem"
      if [ -f "$PROJECT_DIR/PosSystem.csproj" ]; then
        dotnet format "$PROJECT_DIR/PosSystem.csproj" --include "$FILE_PATH" 2>/dev/null || true
      fi
    fi
    ;;
esac

exit 0
