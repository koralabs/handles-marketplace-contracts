# Data and Validation

## Primary Data Types

### `ScriptDetails`
Contains deployed marketplace script metadata used by transaction builders:
- `validatorHash`
- `cbor` / `unoptimizedCbor`
- `datumCbor`
- `refScriptAddress`
- `refScriptUtxo`
- `handleHex`

### Listing Datum
Encoded payload built/decoded via `src/datum.ts`:
- `owner` pubkey hash
- ordered `payouts` list

### Runtime Inputs
- `cborUtxos`: wallet UTxO CBOR strings.
- `listingIUtxo`: listing input structure for buy/update/withdraw.
- `handleHex`: policy-label-prefixed handle asset name.
- `network`: preview/preprod/mainnet profile.

## Validation Gates
- Deployed script metadata presence checks (`cbor`, `datumCbor`, `refScriptUtxo`, `refScriptAddress`).
- Handle asset presence checks in listing inputs and wallet UTxOs.
- Datum decode checks before payout/owner usage.
- Owner pubkey hash equality checks for update/withdraw.
- Network parameter fetch success before output lovelace corrections.

## Error Normalization
- `convertError` converts mixed unknown values into stable string messages.
- `mayFail` and `mayFailAsync` wrap sync/async operations into `Result`.
- `mayFailTransaction` wraps tx build failures and includes validation log fragments for diagnostics.
