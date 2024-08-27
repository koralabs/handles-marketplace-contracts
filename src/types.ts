import * as helios from "@koralabs/helios";

interface Payout {
  address: helios.Address;
  amountLovelace: number;
}

interface Parameters {
  authorizers: helios.PubKeyHash[];
  marketplaceAddress: helios.Address;
}

export { Parameters, Payout };
