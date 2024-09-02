import * as helios from "@koralabs/helios";

interface Payout {
  address: helios.Address;
  amountLovelace: bigint;
}

interface Datum {
  payouts: Payout[];
  owner: helios.PubKeyHash;
}

interface Parameters {
  authorizers: helios.PubKeyHash[];
  marketplaceAddress: helios.Address;
}

export { Datum, Parameters, Payout };
