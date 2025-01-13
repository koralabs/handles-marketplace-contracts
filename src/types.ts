import { bytesToHex } from "@helios-lang/codec-utils";
import { Tx } from "@helios-lang/ledger";

/**
 * Parameters for marketplace contract
 * @interface
 * @typedef {object} Parameters
 * @property {string[]} authorizers Marketplace's Authorizers Pub Key Hashes
 * @property {string} marketplaceAddress Address to collect marketplace fee
 */
interface Parameters {
  authorizers: string[];
  marketplaceAddress: string;
}

/**
 * Payout - you have to pay `amountLovelace` to `address` when buy handle
 * @interface
 * @typedef {object} Payout
 * @property {string} address bech32 format
 * @property {bigint} amountLovelace
 */
interface Payout {
  address: string;
  amountLovelace: bigint;
}

/**
 * MarketplaceDatum - attached to handles listed on marketplace
 * @interface
 * @typedef {object} MarketplaceDatum
 * @property {Payout[]} payouts
 * @property {string} owner Owner's Pub Key Hash
 */
interface MarketplaceDatum {
  payouts: Payout[];
  owner: string;
}

class BuildTxError extends Error {
  code: number;
  failedTxCbor: string;
  failedTxJson: object;

  static fromError(error: Error, failedTx: Tx) {
    const err = new BuildTxError(
      error.message,
      bytesToHex(failedTx.toCbor()),
      failedTx.dump()
    );
    err.stack = error.stack;
    err.cause = error.cause;
    return err;
  }

  constructor(message: string, failedTxCbor: string, failedTxJson: object) {
    super(message);
    this.name = "BuildTxError";
    this.code = 500;
    this.failedTxCbor = failedTxCbor;
    this.failedTxJson = failedTxJson;
  }
}

/**
 * SuccessResult - attached to handles listed on marketplace
 * @interface
 * @typedef {object} SuccessResult
 * @property {string} cbor CBOR Hex of transaction, you can sign and submit
 * @property {any} dump Transaction's Dump
 */
interface SuccessResult {
  tx: Tx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dump: any;
}

export type { MarketplaceDatum, Parameters, Payout, SuccessResult };
export { BuildTxError };
