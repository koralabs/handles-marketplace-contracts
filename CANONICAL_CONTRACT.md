# handles-marketplace-contracts canonical contract

**Status: proposal (ecosystem-ownership-plan row 5.3). Operator review pending.**

Handles marketplace contract (Aiken) and its list/buy/update/withdraw tx builders. The code that holds the rules below is listed in [`.enclave`](./.enclave);
K.O.R.A.'s `merge_pr` asks the operator before a change to it merges into `master`.

## Source requirements

- Ecosystem `AGENTS.md` (koralabs root): "Critical Correctness" (addresses 100% correct, never
  double-mint, chain-accurate properties) and "Merging" (double-mint, contract/settings edits and
  automated burns need operator approval).
- kora-bot `v3/docs/ecosystem-ownership-plan.md` §6 decision 2 (enclave = key/security material,
  prompt files, and the files that define, support or enforce this contract) and Phase 5 row 5.3
  ("every remaining repo, even if the enclave is empty; each AGENTS.md points at both").
- kora-bot `v3/docs/tool-surface.md` (`merge_pr`): cards enclave paths merged into
  `master`/`main`/`mainnet`/`preprod`, reading a root `.enclave`.

## Must never be violated

1. **A listed handle can only leave the contract by a buy that pays the seller and fees as listed, or by the seller.**
2. **Validator and settings changes need operator approval**; K.O.R.A. may sign preview only.

## Where it is enforced today

| # | Code |
|---|---|
| 1 | `validators/mkpl.ak`, `lib/marketplace/` |
| 2 | `deploy/<network>/` |

## Refactor needed for enforcement

- None found.
