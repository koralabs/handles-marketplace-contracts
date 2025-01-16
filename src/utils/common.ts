import { hexToBytes } from "@helios-lang/codec-utils";
import {
  makeAddress,
  makeAssets,
  makeInlineTxOutputDatum,
  makeTxInput,
  makeTxOutput,
  makeTxOutputId,
  makeValue,
  TxInput,
} from "@helios-lang/ledger";
import { decodeUplcData } from "@helios-lang/uplc";
import { IUTxO } from "@koralabs/kora-labs-common";

import { HANDLE_POLICY_ID } from "../constants/index.js";

const bigIntMin = (...args: bigint[]): bigint => {
  return args.reduce((min, e) => {
    return e < min ? e : min;
  }, args[0]);
};

const bigIntMax = (...args: bigint[]): bigint => {
  return args.reduce((max, e) => {
    return e > max ? e : max;
  }, args[0]);
};

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(() => resolve(true), milliseconds));
};

const makeListingTxInputFromListingIUTxO = (
  listingIUtxo: IUTxO,
  handleHex: string
): TxInput =>
  makeTxInput(
    makeTxOutputId(`${listingIUtxo.tx_id}#${listingIUtxo.index}`),
    makeTxOutput(
      makeAddress(listingIUtxo.address),
      makeValue(
        BigInt(listingIUtxo.lovelace),
        makeAssets([[HANDLE_POLICY_ID, [[handleHex, 1n]]]])
      ),
      listingIUtxo.datum
        ? makeInlineTxOutputDatum(
            decodeUplcData(hexToBytes(listingIUtxo.datum))
          )
        : undefined
    )
  );

export { bigIntMax, bigIntMin, makeListingTxInputFromListingIUTxO, sleep };
