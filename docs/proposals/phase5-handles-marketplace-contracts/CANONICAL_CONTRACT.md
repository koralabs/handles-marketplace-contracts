# handles-marketplace-contracts canonical contract

**Status: DRAFT proposal (ecosystem-ownership-plan Phase 5, row 5.3). NOT ACTIVE.** Re-drafted 2026-10-28 from the closed proposal #36. It lives under `docs/proposals/phase5-handles-marketplace-contracts/`, where `merge_pr` does not read it. The operator adopts it by moving this file and `.enclave` to the repo root in a separate change; paths below are repo-root-relative. Operator review of what must never be violated is pending.

Handles marketplace contract (Aiken) and its list/buy/update/withdraw tx builders. Protected production source is listed in [`.enclave`](./.enclave);
other enforcement references below are not automatically enclave paths.

## Review scope and unchanged authority

Decision 2 clarification (2026-10-13): the human-review enclave is actual Aiken/Helios
on-chain source, listed as exact files in [`.enclave`](./.enclave), plus this contract
and the manifest's self-protection. Test-only sources, npm/package files, JS/TS,
builders, configuration, generated artifacts and workflows follow ordinary automated
tests and independent agent review; their location in a contract repository alone
never requires human approval. Existing unrelated holds remain in force.

Separately identifiable embedded Aiken `test` blocks and test-only helpers are testing
code, not protected on-chain behavior. Test-only edits to those blocks follow ordinary
agent review. Mixed files remain listed for their production definitions: the current
path-only merge gate cannot distinguish such hunks and may still request approval.
This is an enforcement limitation, not expanded human-review policy; no source was
split or changed in this documentation-only proposal.

This narrows code-review scope only. Actual on-chain validator or settings changes
(settings handles, policy roots, `pers*@handle_settings` and handlecontract datums),
anything that could double-mint, and automated burns or other irreversible on-chain
actions retain explicit operator authorization. Routine builder/package/test repairs
are not such actions merely because of their repository or filename. K.O.R.A. may
sign for preview only within existing authorization; preprod and mainnet always need
humans on the multisig. No signing, secret access or spending is authorized here.
Independent review pending; this proposal is not accepted and must not be merged.

## Source requirements

- Ecosystem `AGENTS.md` (koralabs root): "Critical Correctness" (addresses 100% correct, never
  double-mint, chain-accurate properties) and "Merging" (double-mint, contract/settings edits and
  automated burns need operator approval).
- kora-bot `v3/docs/ecosystem-ownership-plan.md` §6 decision 2 (contract-repo clarification: enclave = Aiken/Helios on-chain source, not npm/package or testing code) and Phase 5 row 5.3
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
