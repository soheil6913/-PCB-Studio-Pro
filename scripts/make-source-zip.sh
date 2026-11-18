#!/usr/bin/env bash
set -euo pipefail
out="${1:-pcb-studio-pro-source.zip}"
rm -f "$out"
zip -qr "$out" . \
  -x 'node_modules/*' 'dist/*' '.git/*' '.manus-logs/*' '.env' '.env.*' '*.zip'
printf 'Created %s\n' "$out"
