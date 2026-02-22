#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_FILE="$ROOT_DIR/test_coverage.report"
TMP_OUTPUT="$(mktemp)"
trap 'rm -f "$TMP_OUTPUT"' EXIT

cd "$ROOT_DIR"
npx vitest run tests/errorHelpers.test.ts \
  --coverage.enabled=true \
  --coverage.provider=v8 \
  --coverage.reporter=text \
  --coverage.include=src/helpers/common/invariant.ts \
  --coverage.include=src/helpers/error/convert.ts \
  --coverage.include=src/helpers/error/handleable.ts \
  --coverage.include=src/helpers/error/handleableAsync.ts > "$TMP_OUTPUT" 2>&1

cat "$TMP_OUTPUT" > "$REPORT_FILE"

read -r BRANCH_COVERAGE LINE_COVERAGE < <(
  grep -E "All files" "$TMP_OUTPUT" | tail -n 1 | awk -F'\\|' '{
    branch=$3; line=$5;
    gsub(/[%[:space:]]/, "", branch);
    gsub(/[%[:space:]]/, "", line);
    print branch, line;
  }'
)

if [[ -z "${BRANCH_COVERAGE:-}" || -z "${LINE_COVERAGE:-}" ]]; then
  echo "Failed to parse coverage output." | tee -a "$REPORT_FILE"
  exit 1
fi

awk -v line="$LINE_COVERAGE" -v branch="$BRANCH_COVERAGE" 'BEGIN {
  if (line + 0 < 90 || branch + 0 < 90) exit 1;
}' || {
  echo "Coverage threshold not met (line=${LINE_COVERAGE}%, branch=${BRANCH_COVERAGE}%)." | tee -a "$REPORT_FILE"
  exit 1
}

echo "Coverage threshold met (line=${LINE_COVERAGE}%, branch=${BRANCH_COVERAGE}%)." | tee -a "$REPORT_FILE"
