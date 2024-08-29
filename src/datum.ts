import { invariant } from "./helpers";
import { Datum, Payout } from "./types";

import * as helios from "@koralabs/helios";
import { decodeCborToJson } from "@koralabs/kora-labs-common";
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
    `0x${payout.address.hex}`,
    payout.amountLovelace,
  ];

  const datum = [payouts.map(constrPayout), `0x${owner.hex}`];
  const datumCbor = await convertJsontoCbor(datum);
  return helios.Datum.inline(helios.UplcData.fromCbor(datumCbor));
};

const decodeDatum = async (datum: helios.Datum): Promise<Datum> => {
  const decoded = await decodeCborToJson({
    cborString: datum.dump().inlineCbor,
    forJson: false,
  });
  console.log({ decoded });
  const owner = helios.Address.fromHex(decoded[1].slice(2));
  const payouts: Payout[] = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    decoded[0].map(async (rawPayout: any) => {
      const addressCbor = await convertJsontoCbor(rawPayout[0]);
      const address = helios.Address.fromUplcData(
        helios.UplcData.fromCbor(addressCbor)
      );
      return { address, amountLovelace: rawPayout[1] } as Payout;
    })
  );
  return {
    payouts,
    owner,
  };
};

export { buildDatum, buildDatumTag, decodeDatum };
