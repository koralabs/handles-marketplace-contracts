import { HANDLE_POLICY_ID, MIN_LOVELACE } from "./constants";
import { buildDatum, decodeParametersDatum } from "./datum";
import { deployedScripts } from "./deployed";
import { mayFail, mayFailAsync } from "./helpers";
import { Payout, SuccessResult } from "./types";
import {
  fetchLatestmarketplaceScriptDetail,
  fetchNetworkParameters,
  getUplcProgram,
} from "./utils";

import * as helios from "@koralabs/helios";
import { Network } from "@koralabs/kora-labs-common";
import { Err, Ok, Result } from "ts-res";

/**
 * Configuration of function to list handle
 * @interface
 * @typedef {object} ListConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {Payout[]} payouts Payouts which is requried to pay when buy this handle
 */
interface ListConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  handleHex: string;
  payouts: Payout[];
}

/**
 * List Handle to marketplace
 * @param {ListConfig} config
 * @param {Network} network
 * @returns {Promise<Result<SuccessResult, Error>>}
 */
const list = async (
  config: ListConfig,
  network: Network
): Promise<Result<SuccessResult, Error>> => {
  const { changeBech32Address, cborUtxos, handleHex, payouts } = config;

  /// fetch marketplace reference script detail
  const refScriptDetailResult = await mayFailAsync(() =>
    fetchLatestmarketplaceScriptDetail()
  ).complete();

  /// use deployed script if fetch is failed
  const refScriptDetail = refScriptDetailResult.ok
    ? refScriptDetailResult.data
    : Object.values(deployedScripts[network])[0];
  const { cbor, datumCbor, refScriptUtxo } = refScriptDetail;
  if (!cbor) return Err(new Error("Deploy script cbor is empty"));
  if (!datumCbor) return Err(new Error("Deploy script's datum cbor is empty"));
  if (!refScriptUtxo)
    return Err(new Error("Deployed script UTxO is not defined"));

  /// fetch network parameter
  const networkParams = fetchNetworkParameters(network);

  /// decode parameter
  const parametersResult = await mayFailAsync(() =>
    decodeParametersDatum(datumCbor)
  ).complete();
  if (!parametersResult.ok)
    return Err(new Error("Deployed script's datum cbor is invalid"));
  const parameters = parametersResult.data;

  /// get uplc program
  const uplcProgramResult = await mayFailAsync(() =>
    getUplcProgram(parameters, true)
  ).complete();
  if (!uplcProgramResult.ok)
    return Err(
      new Error(`Getting Uplc Program error: ${uplcProgramResult.error}`)
    );
  const uplcProgram = uplcProgramResult.data;

  /// check deployed script cbor hex
  if (cbor != helios.bytesToHex(uplcProgram.toCbor()))
    return Err(
      new Error("Deployed script's cbor doesn't match with its parameter")
    );

  const changeAddress = helios.Address.fromBech32(changeBech32Address);
  const utxos = cborUtxos.map((cborUtxo) =>
    helios.TxInput.fromFullCbor([...Buffer.from(cborUtxo, "hex")])
  );

  /// take fund and handle asset
  const handleAsset = new helios.Assets([
    [HANDLE_POLICY_ID, [[`${handleHex}`, 1]]],
  ]);
  const minValue = new helios.Value(MIN_LOVELACE, handleAsset);
  const selectResult = mayFail(() =>
    helios.CoinSelection.selectLargestFirst(utxos, minValue)
  );
  if (!selectResult.ok) return Err(new Error(selectResult.error));
  const [selected, unSelected] = selectResult.data;

  /// build datum
  const ownerPubKeyHash = changeAddress.pubKeyHash;
  if (!ownerPubKeyHash)
    return Err(new Error("Change Address doesn't have payment key"));
  const datum = mayFail(() =>
    buildDatum({ payouts, owner: ownerPubKeyHash.hex })
  );
  if (!datum.ok) return Err(new Error(`Building Datum error: ${datum.error}`));

  /// ada handle list update
  const handleListOutput = new helios.TxOutput(
    helios.Address.fromHashes(
      uplcProgram.validatorHash,
      changeAddress.stakingHash
    ),
    new helios.Value(0n, handleAsset),
    datum.data
  );
  handleListOutput.correctLovelace(networkParams);

  /// build tx
  const tx = new helios.Tx().addInputs(selected).addOutput(handleListOutput);

  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, changeAddress, unSelected)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(new Error(`Finalizing Tx error: ${txCompleteResult.error}`));

  return Ok({
    cbor: txCompleteResult.data.toCborHex(),
    dump: txCompleteResult.data.dump(),
  });
};

export { list };
export type { ListConfig };
