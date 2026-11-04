# handles-marketplace-contracts canonical contract

I am the on-chain Handle marketplace: one Aiken spending validator (`validators/mkpl.ak`) that holds a listed Handle and lets it leave only by a buy that pays the seller, or by the seller, plus the TypeScript builders (`list`, `buy`, `update`, `withdraw`) and deploy plan.

1. **A buy pays every seller payout.** Each payout in the datum (address, amount > 0) appears as an output, in datum order, with at least the listed lovelace and only lovelace.
2. **Without an authorizer signature, the marketplace fee is paid.** The first payout output goes to the hardcoded `marketplace_address` for at least `payouts_sum * 50 / 49 / 50`.
3. **Payout outputs are tagged to the listing.** Each payout output's inline datum equals the tag built from the spent listing's output reference, so one payout cannot satisfy two listings.
4. **Only the datum owner can withdraw or update.** `WithdrawOrUpdate` requires the owner's key hash among the signatories.
5. **Only the listed authorizers skip the fee check,** and seller payouts are still enforced for them. The authorizer list is a deploy parameter in `deploy/<network>/marketplace.yaml`; it and `marketplace_address` determine the script hash.
6. **The validator protects the seller's payment, not the buyer's token.** It does not check the Handle goes to the buyer; the buyer builder (`src/buy.ts`) must put it in the buyer's output.
