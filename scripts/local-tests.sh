#!/usr/bin/env bash
# Local test run recorded by adahandle-deployments/common/test-evidence.sh (replaces the old Actions tests).
set -euo pipefail
( set -e; pnpm install --frozen-lockfile )
( set -e; npm run lint )
( set -e; npm run test:aiken )
( set -e; npm run test )
