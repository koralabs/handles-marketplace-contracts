# handles-marketplace-contracts canonical contract

## Purpose and authority

I am the on-chain Handle marketplace: one Aiken spending validator (`validators/mkpl.ak`) that holds a listed Handle and lets it leave only by a buy that pays the seller, or by the seller. I also carry the TypeScript builders (`src/list.ts`, `buy.ts`, `update.ts`, `withdraw.ts`) and the deploy plan that publish me. The chain is the authority: a green unit test, a built transaction or a deployed file proves nothing about what the validator accepts. I grant no authority to sign, spend, deploy, change settings or burn. Preview signing is only what existing authorization already allows; preprod and mainnet always need humans.

## Invariants (must never be violated)

1. **A buy pays every seller payout.** Each payout in the datum (address and amount, amount > 0) must appear as an output, in datum order, with at least the listed lovelace and only lovelace. (`check_payouts`; tests in `lib/marketplace/utils.test.ak` cover wrong address, wrong amount, mixed and leading outputs.)
2. **Without an authorizer signature, the marketplace fee is paid.** The first payout output goes to the hardcoded `marketplace_address` for at least `payouts_sum * 50 / 49 / 50`. (`check_marketplace_payout`; tested: wrong address, wrong amount.)
3. **Payout outputs are tagged to the listing.** Each payout output's inline datum must equal the tag built from the spent listing's output reference, so one payout cannot satisfy two listings. Not yet tested at validator level (only inside `check_payouts`).
4. **Only the datum owner can withdraw or update.** `WithdrawOrUpdate` requires the owner's key hash in the signatories. Not covered by an Aiken test today.
5. **Only the listed authorizers skip the fee check,** and the seller payouts are still enforced when they do. The authorizer list is a deploy parameter in `deploy/<network>/marketplace.yaml`; changing it or `marketplace_address` changes the script hash and needs operator approval.
6. **A Handle is never listed or bought through a changed script silently.** Validator source, parameters, compiler version (`aiken.toml`) or the deployed hash may change only with explicit operator approval, and never by an automated deploy of a not-yet-reviewed change.
7. **No secrets or keys in the repo.** Deploy tokens come from GitHub environment secrets; nothing here signs.

## Boundaries and known limits

- The validator does not check that the Handle token itself leaves the script to the buyer; it protects the seller's payment. Buyers rely on the builder (`src/buy.ts`) to put the Handle in the buyer's output.
- `payout_outputs_offset` is supplied by the buyer; a wrong value fails or costs more, it cannot redirect money.
- Aiken `test` blocks sit inside protected files, so test-only edits there still need approval (path-only gate).
- The TypeScript builders, compiled JSON in `src/contracts/plutus-v2/`, tests and workflows are ordinary agent review; they are not in the enclave. A builder bug can produce a transaction the chain rejects but cannot make the chain accept a bad buy.
- No test proves the deployed on-chain script hash equals what `aiken build` produces from this source.

## Refactors needed to enforce this

- Add validator-level Aiken tests for `can_buy` (datum tag, fee path, authorizer path) and `can_withdraw_or_update` (owner and non-owner).
- Add a test that rebuilds each network's script from source and compares it to the hash recorded for that network.
- Add a builder test that the buyer output actually receives the Handle.
