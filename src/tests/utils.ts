import { Payout } from "./types";

import * as helios from "@koralabs/helios";
import { convertJsontoCbor } from "@koralabs/kora-labs-contract-testing";
import Decimal from "decimal.js";

const adaToLovelace = (ada: number): bigint =>
  BigInt(new Decimal(ada).mul(Math.pow(10, 6)).floor().toString());

const buildDatumTag = (outputRef: helios.TxOutputId): helios.Datum => {
  return helios.Datum.inline(
    helios.UplcData.fromCbor(
      helios.Crypto.blake2b(helios.textToBytes(outputRef.toCborHex()))
    )
  );
};

const buildDatum = async (
  payouts: Payout[],
  owner: helios.PubKeyHash
): Promise<helios.Datum> => {
  const constrPayout = (payout: Payout) => ({
    constructor_0: [
      `0x${helios.bytesToHex(payout.address.bytes)}`,
      payout.amountLovelace,
    ],
  });

  const datum = {
    constructor_0: [
      payouts.map(constrPayout),
      `0x${helios.bytesToHex(owner.bytes)}`,
    ],
  };
  const datumCbor = await convertJsontoCbor(datum);
  return helios.Datum.inline(helios.UplcData.fromCbor(datumCbor));
};

export { adaToLovelace, buildDatumTag, buildDatum };
