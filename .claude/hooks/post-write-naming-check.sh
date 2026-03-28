#!/bin/bash
# Post-write hook: warn if new files don't follow naming conventions

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

BASENAME=$(basename "$FILE_PATH")
EXT="${BASENAME##*.}"

case "$EXT" in
  ts)
    # TypeScript files should be kebab-case
    # Strip known suffixes to check the base name
    NAME="${BASENAME%.ts}"
    NAME="${NAME%.component}"
    NAME="${NAME%.service}"
    NAME="${NAME%.guard}"
    NAME="${NAME%.interceptor}"
    NAME="${NAME%.pipe}"
    NAME="${NAME%.directive}"
    NAME="${NAME%.module}"
    NAME="${NAME%.spec}"
    NAME="${NAME%.routes}"

    if [[ "$NAME" =~ [A-Z] ]]; then
      echo "WARNING: TypeScript files should use kebab-case: $BASENAME" >&2
      echo "  Expected pattern: kebab-case.component.ts, kebab-case.service.ts, etc." >&2
    fi
    ;;
  cs)
    # C# files should be PascalCase
    NAME="${BASENAME%.cs}"

    # Skip config files
    if [[ "$NAME" =~ ^appsettings ]]; then
      exit 0
    fi

    if ! [[ "$NAME" =~ ^[A-Z] ]]; then
      echo "WARNING: C# files should use PascalCase: $BASENAME" >&2
      echo "  Expected pattern: ProductService.cs, ProductsController.cs, etc." >&2
    fi
    ;;
esac

exit 0
