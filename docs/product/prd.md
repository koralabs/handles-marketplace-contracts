# Handles Marketplace Contracts PRD

## Summary
`@koralabs/handles-marketplace-contracts` provides smart-contract build artifacts and transaction builders for listing, buying, updating, and withdrawing handle listings in the Handles marketplace.

## Problem
Marketplace transactions need deterministic contract-aware assembly that:
- Enforces payout rules and ownership checks.
- Preserves listing datum integrity between list/buy/update/withdraw flows.
- Supports authorizer-assisted buys and deploy-time parameterization.
- Works across preview/preprod/mainnet with consistent interfaces.

## Users
- Marketplace operators and backend services building marketplace transactions.
- Engineers and scripts deploying marketplace script references.
- CLI users executing list/buy/update/withdraw/deploy operations.

## Goals
- Expose strongly-typed transaction builder APIs for all marketplace actions.
- Support script deployment and persistence of deployed script metadata.
- Provide safe error handling wrappers that return structured results.
- Keep tests and coverage guardrails for helper and integration paths.

## Non-Goals
- Marketplace frontend/UI implementation.
- Wallet signing UX.
- On-chain indexer or analytics stack ownership.

## Functional Requirements

### Transaction Builders
- `list`:
  - consume handle from owner wallet,
  - create listing output at marketplace script address with listing datum.
- `buy`:
  - consume listing output with buy redeemer,
  - produce marketplace fee + payout outputs,
  - transfer handle to buyer.
- `buyWithAuth`:
  - allow authorizer-assisted buy path without marketplace fee output.
- `update`:
  - allow listing owner to replace payout schedule.
- `withdraw`:
  - allow listing owner to reclaim listed handle.

### Deployment
- Build parameterized optimized/unoptimized script variants.
- Lock deployed reference script output and write deployed script metadata file.

### Operational Interfaces
- Export programmatic APIs from `src/index.ts`.
- Provide CLI command surface for deploy/list/buy/update/withdraw.
- Support network selection and deployed-script fetch fallback utilities.

## Success Criteria
- Integration test suite (`tests/marketplace.test.ts`) passes.
- Coverage guardrail (`test_coverage.sh`) reports >=90% lines/branches.
- Docs remain linked from README and docs index.
