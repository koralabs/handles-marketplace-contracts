import * as helios from "@koralabs/helios";

interface Payout {
  address: helios.Address;
  amountLovelace: number;
}

interface Datum {
  payouts: Payout[];
  owner: helios.Address;
}

interface Parameters {
  authorizers: helios.PubKeyHash[];
  marketplaceAddress: helios.Address;
}

export { Datum, Parameters, Payout };
