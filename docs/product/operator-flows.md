# Operator Flows

## Deploy Flow
1. Build script parameters from marketplace config.
2. Generate optimized/unoptimized UPLC variants.
3. Build deploy tx with script ref output and settings datum.
4. Submit tx and wait for confirmation.
5. Save deployed script detail JSON for downstream list/buy/update/withdraw usage.

## Listing Flow
1. Fetch deployed script details and network parameters.
2. Select wallet UTxO containing the target handle asset.
3. Build listing datum from owner + payout array.
4. Build tx to move handle into marketplace script output.

## Purchase Flow
1. Decode listing datum and validate handle asset in listing input.
2. Build buy redeemer and consume listing UTxO via reference script.
3. Produce payout outputs plus marketplace fee output.
4. Emit handle transfer output to buyer change address.

## Update/Withdraw Flow
- Update:
  - owner consumes listing output and recreates listing with new payouts.
- Withdraw:
  - owner consumes listing output and exits listing state.

Both flows enforce owner pubkey hash checks derived from listing datum.
