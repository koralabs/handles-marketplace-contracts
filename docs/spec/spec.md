# Technical Spec

## Architecture

### Package Surfaces
- API exports (`src/index.ts`):
  - `list`, `buy`, `buyWithAuth`, `update`, `withdraw`,
  - datum/redeemer helpers,
  - deployed-script helpers and shared types.
- CLI entrypoint:
  - `CLI/entrypoint.ts` with command modules in `CLI/commands/*`.
- Validator source:
  - `validators/marketplace.ak` (Aiken).

### Core Build Modules
- `src/list.ts`
  - builds listing tx and listing datum output.
- `src/buy.ts`
  - builds buy tx with payout and fee outputs.
- `src/update.ts`
  - rebuilds listing with new payouts.
- `src/withdraw.ts`
  - consumes listing and returns handle.
- `src/deploy.ts`
  - compiles parameterized scripts and deploy tx output metadata.

### Shared Helpers
- `src/helpers/common/invariant.ts`: assertion helper.
- `src/helpers/error/*`: Result wrappers (`mayFail`, `mayFailAsync`, tx wrappers) and error conversion.
- `src/utils/*`: deployed-script fetch, network parameter fetch, API helpers, tx input conversion.

## Transaction Assembly Rules
- All flows decode and validate deployed script details before tx construction.
- Change address must use `PubKeyHash` spending credential for owner-authorized flows.
- Listing/buy/update/withdraw flows verify target listing input contains expected handle asset.
- Collateral UTxO is optional input when supplied by caller.

## Deploy Path
- Applies smart-contract parameters (`marketplaceAddress`, `authorizers`) to compiled UPLC.
- Writes script ref output with datum at locker script address.
- Optionally signs/submits tx and persists `ScriptDetails` JSON artifact.

## Errors and Result Semantics
- Public builders return `Result<SuccessResult, Error | BuildTxError>`.
- Recoverable conversion and decode issues are surfaced as explicit `Err`.
- Transaction build failures pass through `mayFailTransaction` to preserve validation diagnostics.

## Testing and Coverage
- Integration coverage:
  - `tests/marketplace.test.ts`.
- Helper unit coverage:
  - `tests/errorHelpers.test.ts`.
  - `tests/datum.test.ts`.
- Guardrail:
  - `./test_coverage.sh` runs standard entrypoints (`npm test`, `npm run test:aiken`) and writes `./test_coverage.report`.
  - Measured Node coverage scope enforces >=90% lines/branches across:
    - `src/datum.ts`, `src/redeemer.ts`
    - `src/helpers/common/invariant.ts`
    - `src/helpers/error/{convert.ts,handleable.ts,handleableAsync.ts,tx.ts,index.ts}`
    - `src/helpers/index.ts`
    - `src/contracts/plutus-v2/contract.ts`
    - `src/utils/index.ts`
  - Aiken metrics are recorded as `NA` when local toolchain incompatibility prevents deterministic `aiken check` execution.
