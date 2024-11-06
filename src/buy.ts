import { MIN_FEE, MIN_LOVELACE } from "./constants";
import { buildDatumTag, decodeDatum, decodeParametersDatum } from "./datum";
import { mayFail, mayFailAsync } from "./helpers";
import { bigIntMax, fetchNetworkParameters, getUplcProgram } from "./utils";

import * as helios from "@koralabs/helios";
import { Network, ScriptDetails } from "@koralabs/kora-labs-common";
import { Buy } from "redeemer";
import { Err, Ok, Result } from "ts-res";

/**
 * Configuration of function to buy handle
 * @interface
 * @typedef {object} BuyConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string} handleCborUtxo UTxO (cbor format) of handle to buy
 * @property {ScriptDetails} refScriptDetail Deployed marketplace contract detail
 * @property {string} refScriptCborUtxo UTxO (cbor format) where marketplace contract is deployed
 */
interface BuyConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  handleCborUtxo: string; /// handle (to buy) is in this utxo
  refScriptDetail: ScriptDetails;
  refScriptCborUtxo: string;
}

/**
 * Configuration of function to buy handle with one of authorizers
 * @interface
 * @typedef {object} BuyWithAuthConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string} handleCborUtxo UTxO (cbor format) of handle to buy
 * @property {string} authorizerPubKeyHash Pub Key Hash of authorizer
 * @property {ScriptDetails} refScriptDetail Deployed marketplace contract detail
 * @property {string} refScriptCborUtxo UTxO (cbor format) where marketplace contract is deployed
 */
interface BuyWithAuthConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  handleCborUtxo: string; /// handle (to buy) is in this utxo
  authorizerPubKeyHash: string;
  refScriptDetail: ScriptDetails;
  refScriptCborUtxo: string;
}

/**
 * Buy Handle on marketplace
 * @param {BuyConfig} config
 * @param {Network} network
 * @returns {Promise<Result<helios.Tx, string>>}
 */
const buy = async (
  config: BuyConfig,
  network: Network
): Promise<Result<helios.Tx, string>> => {
  const {
    changeBech32Address,
    cborUtxos,
    handleCborUtxo,
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

  /// take fund to pay payouts
  const totalPayoutsLovelace = datum.payouts.reduce(
    (acc, cur) => acc + bigIntMax(cur.amountLovelace, MIN_LOVELACE),
    0n
  );
  const marketplaceFee = (totalPayoutsLovelace * 50n) / 49n / 50n;
  const requiredValue = new helios.Value(
    MIN_FEE + totalPayoutsLovelace + bigIntMax(marketplaceFee, MIN_LOVELACE)
  );
  const [selected, unSelected] = helios.CoinSelection.selectLargestFirst(
    utxos,
    requiredValue
  );

  /// make redeemer
  const redeemer = mayFail(() => Buy(0));
  if (!redeemer.ok) return Err(`Making Redeemer error: ${redeemer.error}`);

  /// build datum tag
  const datumTag = mayFail(() => buildDatumTag(handleUtxo.outputId));
  if (!datumTag.ok) return Err(`Building Datum Tag error: ${datumTag.error}`);

  /// marketplace fee output
  const marketplaceFeeOutput = new helios.TxOutput(
    helios.Address.fromBech32(parameters.marketplaceAddress),
    new helios.Value(marketplaceFee),
    datumTag.data
  );
  marketplaceFeeOutput.correctLovelace(networkParams);

  /// payout outputs
  const payoutOutputs = datum.payouts.map(
    (payout) =>
      new helios.TxOutput(
        helios.Address.fromBech32(payout.address),
        new helios.Value(payout.amountLovelace)
      )
  );
  payoutOutputs.forEach((payoutOutput) =>
    payoutOutput.correctLovelace(networkParams)
  );

  /// add handle buy output
  const handleBuyOutput = new helios.TxOutput(
    changeAddress,
    new helios.Value(0n, handleUtxo.value.assets)
  );
  handleBuyOutput.correctLovelace(networkParams);

  /// make ref input
  const refInput = helios.TxInput.fromFullCbor([
    ...Buffer.from(refScriptCborUtxo, "hex"),
  ]);

  /// build tx
  const tx = new helios.Tx()
    .addInputs(selected)
    .addInput(handleUtxo, redeemer.data)
    .addRefInput(refInput, uplcProgram)
    .addOutput(marketplaceFeeOutput)
    .addOutputs(payoutOutputs)
    .addOutput(handleBuyOutput);

  /// finalize tx
  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, changeAddress, unSelected)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(`Finalizing Tx error: ${txCompleteResult.error}`);
  return Ok(txCompleteResult.data);
};

/**
 * Buy Handle on marketplace with one of authorizers
 * @param {BuyWithAuthConfig} config
 * @param {Network} network
 * @returns {Promise<Result<helios.Tx, string>>}
 */
const buyWithAuth = async (
  config: BuyWithAuthConfig,
  network: Network
): Promise<Result<helios.Tx, string>> => {
  const {
    changeBech32Address,
    cborUtxos,
    handleCborUtxo,
    authorizerPubKeyHash,
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

  /// check authorizer pub key hash
  if (
    !parameters.authorizers.some(
      (authorizer) => authorizer == authorizerPubKeyHash
    )
  )
    return Err(`Authorizer Pub Key Hash is not valid`);

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

  /// take fund to pay payouts
  const totalPayoutsLovelace = datum.payouts.reduce(
    (acc, cur) => acc + bigIntMax(cur.amountLovelace, MIN_LOVELACE),
    0n
  );
  const requiredValue = new helios.Value(MIN_FEE + totalPayoutsLovelace);
  const [selected, unSelected] = helios.CoinSelection.selectLargestFirst(
    utxos,
    requiredValue
  );

  /// make redeemer
  const redeemer = mayFail(() => Buy(0));
  if (!redeemer.ok) return Err(`Making Redeemer error: ${redeemer.error}`);

  /// build datum tag
  const datumTag = mayFail(() => buildDatumTag(handleUtxo.outputId));
  if (!datumTag.ok) return Err(`Building Datum Tag error: ${datumTag.error}`);

  /// payout outputs
  const payoutOutputs = datum.payouts.map(
    (payout, index) =>
      new helios.TxOutput(
        helios.Address.fromBech32(payout.address),
        new helios.Value(payout.amountLovelace),
        index == 0 ? datumTag.data : undefined
      )
  );
  payoutOutputs.forEach((payoutOutput) =>
    payoutOutput.correctLovelace(networkParams)
  );

  /// add handle buy output
  const handleBuyOutput = new helios.TxOutput(
    changeAddress,
    new helios.Value(0n, handleUtxo.value.assets)
  );
  handleBuyOutput.correctLovelace(networkParams);

  /// make ref input
  const refInput = helios.TxInput.fromFullCbor([
    ...Buffer.from(refScriptCborUtxo, "hex"),
  ]);

  /// build tx
  const tx = new helios.Tx()
    .addInputs(selected)
    .addInput(handleUtxo, redeemer.data)
    .addRefInput(refInput, uplcProgram)
    .addOutputs(payoutOutputs)
    .addOutput(handleBuyOutput)
    .addSigner(helios.PubKeyHash.fromHex(authorizerPubKeyHash));

  /// finalize tx
  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, changeAddress, unSelected)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(`Finalizing Tx error: ${txCompleteResult.error}`);
  return Ok(txCompleteResult.data);
};

export { buy, buyWithAuth };
export type { BuyConfig, BuyWithAuthConfig };
