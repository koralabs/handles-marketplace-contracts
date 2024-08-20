import * as helios from "@koralabs/helios";

interface Payout {
  address: helios.Address;
  amountLovelace: bigint;
}

export { Payout };
