import { MIN_FEE } from "./constants";
import { buildDatum, decodeDatum, decodeParametersDatum } from "./datum";
import { mayFail, mayFailAsync } from "./helpers";
import { Payout } from "./types";
import { fetchNetworkParameters, getUplcProgram } from "./utils";

import * as helios from "@koralabs/helios";
import { Network, ScriptDetails } from "@koralabs/kora-labs-common";
import { WithdrawOrUpdate } from "redeemer";
import { Err, Ok, Result } from "ts-res";

/**
 * Configuration of function to update handle
 * @interface
 * @typedef {object} UpdateConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string} handleCborUtxo UTxO (cbor format) of handle to buy
 * @property {Payout[]} newPayouts New payouts which is requried to pay when buy this handle
 * @property {ScriptDetails} refScriptDetail Deployed marketplace contract detail
 * @property {string} refScriptCborUtxo UTxO (cbor format) where marketplace contract is deployed
 */
interface UpdateConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  handleCborUtxo: string; /// handle (to update) is in this utxo
  newPayouts: Payout[];
  refScriptDetail: ScriptDetails;
  refScriptCborUtxo: string;
}

/**
 * Update Handle on marketplace
 * @param {UpdateConfig} config
 * @param {Network} network
 * @returns {Promise<Result<helios.Tx, string>>}
 */
const update = async (
  config: UpdateConfig,
  network: Network
): Promise<Result<helios.Tx, string>> => {
  const {
    changeBech32Address,
    cborUtxos,
    handleCborUtxo,
    newPayouts,
    refScriptDetail,
    refScriptCborUtxo,
  } = config;
  const { cbor, datumCbor, refScriptUtxo } = refScriptDetail;
  if (!cbor) return Err(`Deploy script cbor is empty`);
  if (!datumCbor) return Err(`Deploy script's datum cbor is empty`);
  if (!refScriptUtxo) return Err(`Deployed script UTxO is not defined`);

  /// fetch network parameter
  const networkParams = fetchNetworkParameters(network);

  /// decode parameter
  const parametersResult = await mayFailAsync(() =>
    decodeParametersDatum(datumCbor)
  ).complete();
  if (!parametersResult.ok)
    return Err(`Deployed script's datum cbor is invalid`);
  const parameters = parametersResult.data;

  /// get uplc program
  const uplcProgramResult = await mayFailAsync(() =>
    getUplcProgram(parameters, true)
  ).complete();
  if (!uplcProgramResult.ok)
    return Err(`Getting Uplc Program error: ${uplcProgramResult.error}`);
  const uplcProgram = uplcProgramResult.data;

  /// check deployed script cbor hex
  if (cbor != helios.bytesToHex(uplcProgram.toCbor()))
    return Err(`Deployed script's cbor doesn't match with its parameter`);

  const changeAddress = helios.Address.fromBech32(changeBech32Address);
  const utxos = cborUtxos.map((cborUtxo) =>
    helios.TxInput.fromFullCbor([...Buffer.from(cborUtxo, "hex")])
  );
  const handleUtxo = helios.TxInput.fromFullCbor([
    ...Buffer.from(handleCborUtxo, "hex"),
  ]);

  const handleRawDatum = handleUtxo.output.datum;
  if (!handleRawDatum) return Err("Handle UTxO datum not found");
  const datumResult = await mayFailAsync(() =>
    decodeDatum(handleRawDatum)
  ).complete();
  if (!datumResult.ok)
    return Err(`Decoding Datum Cbor error: ${datumResult.error}`);
  const datum = datumResult.data;

  const ownerPubKeyHash = changeAddress.pubKeyHash;
  if (!ownerPubKeyHash) return Err(`Change Address doesn't have payment key`);
  if (datum.owner != ownerPubKeyHash.hex)
    return Err(`You must be owner to update`);

  /// take fund
  const [selected, unSelected] = helios.CoinSelection.selectLargestFirst(
    utxos,
    new helios.Value(MIN_FEE)
  );

  /// redeemer
  const redeemer = mayFail(() => WithdrawOrUpdate());
  if (!redeemer.ok) return Err(`Making Redeemer error: ${redeemer.error}`);

  /// build new datum
  const newDatum = mayFail(() =>
    buildDatum({ payouts: newPayouts, owner: datum.owner })
  );
  if (!newDatum.ok) return Err(`Building New Datum error: ${newDatum.error}`);

  /// add handle update output
  const handleUpdateOutput = new helios.TxOutput(
    helios.Address.fromHash(uplcProgram.validatorHash),
    new helios.Value(0n, handleUtxo.value.assets),
    newDatum.data
  );
  handleUpdateOutput.correctLovelace(networkParams);

  /// make ref input
  const refInput = helios.TxInput.fromFullCbor([
    ...Buffer.from(refScriptCborUtxo, "hex"),
  ]);

  /// build tx
  const tx = new helios.Tx()
    .addInputs(selected)
    .addInput(handleUtxo, redeemer.data) /// collect handle nft
    .addRefInput(refInput, uplcProgram)
    .addSigner(ownerPubKeyHash) /// sign with owner
    .addOutput(handleUpdateOutput); /// updated handle output

  /// finalize tx
  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, changeAddress, unSelected)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(`Finalizing Tx error: ${txCompleteResult.error}`);
  return Ok(txCompleteResult.data);
};

export { update };
export type { UpdateConfig };
