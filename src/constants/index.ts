import { Network } from "@koralabs/kora-labs-common";

/// cardano & tx
const NETWORK: Network = "preprod";
const MIN_FEE = 5_000_000n; /// 5 ada
const MIN_LOVELACE = 3_000_000n; /// at leat 3 ada for each utxo

/// ada handle
const HANDLE_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";

export { HANDLE_POLICY_ID, MIN_FEE, MIN_LOVELACE, NETWORK };
