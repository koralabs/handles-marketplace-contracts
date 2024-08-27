import { invariant } from "./helpers";
import { Payout } from "./types";

import * as helios from "@koralabs/helios";
import { convertJsontoCbor } from "@koralabs/kora-labs-contract-testing";

const buildDatumTag = (outputRef: helios.TxOutputId): helios.Datum => {
  const cbor = outputRef._toUplcData().toCborHex();
  const hashed = helios.Crypto.blake2b(helios.hexToBytes(cbor));
  return helios.Datum.inline(
    helios.UplcData.fromCbor(helios.Cbor.encodeBytes(hashed))
  );
};

const buildDatum = async (
  payouts: Payout[],
  owner: helios.Address
): Promise<helios.Datum> => {
  invariant(!!owner.pubKeyHash, "Not valid owner");
  const constrPayout = (payout: Payout) => [
    {
      constructor_0: [
        { constructor_0: [`0x${payout.address.pubKeyHash?.hex || ""}`] },
        {
          constructor_1: payout.address.stakingHash
            ? [`0x${payout.address.pubKeyHash?.hex || ""}`]
            : [],
        },
      ],
    },
    payout.amountLovelace,
  ];

  const datum = [payouts.map(constrPayout), `0x${owner.hex}`];
  const datumCbor = await convertJsontoCbor(datum);
  return helios.Datum.inline(helios.UplcData.fromCbor(datumCbor));
};

export { buildDatum, buildDatumTag };