import { invariant } from "./helpers";
import { Datum, Payout } from "./types";

import * as helios from "@koralabs/helios";
import { decodeCborToJson } from "@koralabs/kora-labs-common";

const buildDatumTag = (outputRef: helios.TxOutputId): helios.Datum => {
  const cbor = outputRef._toUplcData().toCborHex();
  const hashed = helios.Crypto.blake2b(helios.hexToBytes(cbor));
  return helios.Datum.inline(
    helios.UplcData.fromCbor(helios.Cbor.encodeBytes(hashed))
  );
};

const buildDatum = (payouts: Payout[], owner: helios.Address): helios.Datum => {
  invariant(!!owner.pubKeyHash, "Not valid owner");
  const data = new helios.ListData([
    new helios.ListData(
      payouts.map(
        (payout) =>
          new helios.ListData([
            new helios.ByteArrayData(payout.address.bytes),
            new helios.IntData(payout.amountLovelace),
          ])
      )
    ),
    new helios.ByteArrayData(owner.pubKeyHash.bytes),
  ]);
  return helios.Datum.inline(data);
};

const decodeDatum = async (datum: helios.Datum): Promise<Datum> => {
  const datumDataCborHex = datum.data?.toCborHex();
  invariant(datumDataCborHex, "Datum is invalid");

  const decoded = await decodeCborToJson({
    cborString: datumDataCborHex,
  });

  const owner = helios.Address.fromHash(decoded[1].slice(2));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payouts: Payout[] = decoded[0].map((rawPayout: any) => {
    const address = helios.Address.fromHex(rawPayout[0].slice(2));
    const amountLovelace = BigInt(rawPayout[1]) as bigint;
    return { address, amountLovelace } as Payout;
  });

  return {
    owner,
    payouts,
  };
};

export { buildDatum, buildDatumTag, decodeDatum };
