#!/bin/sh
# Keeps personal data out of this public repo.
#   sh scripts/scan.sh           checks every file git would publish (tracked + untracked, minus ignored)
#   sh scripts/scan.sh --staged  checks only what is staged (the pre-commit hook runs this)
# Optional: list private words (names, account numbers) one per line in scripts/denylist.local.txt (gitignored).
set -u
root=$(git rev-parse --show-toplevel) || exit 2
cd "$root" || exit 2
mode=${1:-}
if [ "$mode" = "--staged" ]; then
  files=$(git diff --cached --name-only --diff-filter=ACMR)
else
  files=$(git ls-files --cached --others --exclude-standard)
fi
deny=""
[ -s scripts/denylist.local.txt ] && deny=scripts/denylist.local.txt
fail=0
bad() { echo "BLOCKED: $1"; fail=1; }
body() { if [ "$mode" = "--staged" ]; then git show ":$1" 2>/dev/null; else cat "$1" 2>/dev/null; fi; }

while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ "$mode" != "--staged" ] && [ ! -f "$f" ] && continue
  case "$f" in
    *.xlsx|*.xls|*.xlsm|*.ods|*.numbers|*.csv|data/*|spreadsheet/*|*money-plan-backup*|*.local.md|*.local.txt|.env|.env.*)
      bad "$f is a personal data file type"; continue ;;
  esac
  if body "$f" | grep -IEq 'script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}'; then bad "$f contains a Google Sheet web app link"; fi
  if body "$f" | grep -IEq "PASSCODE[[:space:]]*[=:][[:space:]]*[\"']?[^\"'[:space:],)]{6,}"; then bad "$f looks like it contains a passcode"; fi
  if body "$f" | grep -IEq '"token"[[:space:]]*:[[:space:]]*"[0-9a-f]{64}"'; then bad "$f contains a device token"; fi
  case "$f" in
    *.json) if body "$f" | grep -IEq '"periods"[[:space:]]*:[[:space:]]*\{'; then bad "$f looks like a Money Plan data export"; fi ;;
  esac
  if [ -n "$deny" ] && [ "$f" != "$deny" ] && body "$f" | grep -IiFq -f "$deny"; then bad "$f contains a word from scripts/denylist.local.txt"; fi
done <<EOF
$files
EOF

if [ "$fail" -ne 0 ]; then echo "scan failed: remove the data above (or gitignore the file) before publishing"; exit 1; fi
echo "scan passed"
