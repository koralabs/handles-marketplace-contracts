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

export { Datum, Parameters, Payout };
