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

const buildDatum = (datum: Datum): helios.Datum => {
  const data = new helios.ListData([
    new helios.ListData(
      datum.payouts.map(
        (payout) =>
          new helios.ListData([
            new helios.ByteArrayData(
              helios.Address.fromBech32(payout.address).bytes
            ),
            new helios.IntData(payout.amountLovelace),
          ])
      )
    ),
    new helios.ByteArrayData(helios.hexToBytes(datum.owner)),
  ]);
  return helios.Datum.inline(data);
};

const decodeDatum = async (datum: helios.Datum): Promise<Datum> => {
  const datumDataCborHex = datum.data?.toCborHex();
  invariant(datumDataCborHex, "Datum is invalid");

  const decoded = await decodeCborToJson({
    cborString: datumDataCborHex,
  });

  const owner = helios.PubKeyHash.fromHex(decoded[1].slice(2)).hex;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payouts: Payout[] = decoded[0].map((rawPayout: any) => {
    const address = helios.Address.fromHex(rawPayout[0].slice(2)).toBech32();
    const amountLovelace = BigInt(rawPayout[1]) as bigint;
    return { address, amountLovelace } as Payout;
  });

  return {
    payouts,
    owner,
  };
};

export { buildDatum, buildDatumTag, decodeDatum };
