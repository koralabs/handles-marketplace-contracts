import * as helios from "@koralabs/helios";

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
 * @property {string} address
 * @property {bigint} amountLovelace
 */
interface Payout {
  address: string;
  amountLovelace: bigint;
}

/**
 * Datum - attached to handles listed on marketplace
 * @interface
 * @typedef {object} Datum
 * @property {Payout[]} payouts
 * @property {string} owner Owner's Pub Key Hash
 */
interface Datum {
  payouts: Payout[];
  owner: string;
}

class BuildTxError extends Error {
  code: number;
  failedTxCbor: string;
  failedTxJson: object;

  static fromError(error: Error, failedTx: helios.Tx) {
    const err = new BuildTxError(
      error.message,
      failedTx.toCborHex(),
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
  cbor: string;
  dump: any;
}

export type { Datum, Parameters, Payout, SuccessResult };
export { BuildTxError };
