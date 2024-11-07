import { HANDLE_POLICY_ID, MIN_FEE, MIN_LOVELACE } from "./constants";
import { buildDatumTag, decodeDatum, decodeParametersDatum } from "./datum";
import { deployedScripts } from "./deployed";
import { mayFail, mayFailAsync, mayFailTransaction } from "./helpers";
import { Buy } from "./redeemer";
import { BuildTxError, SuccessResult } from "./types";
import {
  bigIntMax,
  fetchLatestmarketplaceScriptDetail,
  fetchNetworkParameters,
  getUplcProgram,
} from "./utils";

import * as helios from "@koralabs/helios";
import { IUTxO, Network } from "@koralabs/kora-labs-common";
import { Err, Result } from "ts-res";

/**
 * Configuration of function to buy handle
 * @interface
 * @typedef {object} BuyConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string | undefined | null} collateralCborUtxo Collateral UTxO. Can be null, then we will select one in function
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {IUTxO} listingUtxo UTxO where this handle is listed
 */
interface BuyConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  collateralCborUtxo?: string | null;
  handleHex: string;
  listingUtxo: IUTxO;
}

/**
 * Configuration of function to buy handle with one of authorizers
 * @interface
 * @typedef {object} BuyWithAuthConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string | undefined | null} collateralCborUtxo Collateral UTxO. Can be null, then we will select one in function
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {IUTxO} listingUtxo UTxO where this handle is listed
 * @property {string} authorizerPubKeyHash Pub Key Hash of authorizer
 */
interface BuyWithAuthConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  collateralCborUtxo?: string | null;
  handleHex: string;
  listingUtxo: IUTxO;
  authorizerPubKeyHash: string;
}

/**
 * Buy Handle on marketplace
 * @param {BuyConfig} config
 * @param {Network} network
 * @returns {Promise<Result<SuccessResult,  Error | BuildTxError>>}
 */

const buy = async (
  config: BuyConfig,
  network: Network
): Promise<Result<SuccessResult, Error | BuildTxError>> => {
  const { changeBech32Address, cborUtxos, handleHex, listingUtxo } = config;

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
      new Error("Getting Uplc Program error: ${uplcProgramResult.error}")
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
  const handleUtxo = new helios.TxInput(
    new helios.TxOutputId(
      helios.TxId.fromHex(listingUtxo.tx_id),
      listingUtxo.index
    ),
    new helios.TxOutput(
      helios.Address.fromBech32(listingUtxo.address),
      new helios.Value(
        BigInt(listingUtxo.lovelace),
        new helios.Assets([[HANDLE_POLICY_ID, [[handleHex, 1]]]])
      ),
      listingUtxo.datum
        ? helios.Datum.inline(
            helios.UplcData.fromCbor(helios.hexToBytes(listingUtxo.datum))
          )
        : null
    )
  );

  const handleRawDatum = handleUtxo.output.datum;
  if (!handleRawDatum) return Err(new Error("Handle UTxO datum not found"));
  const datumResult = await mayFailAsync(() =>
    decodeDatum(handleRawDatum)
  ).complete();
  if (!datumResult.ok)
    return Err(new Error(`Decoding Datum Cbor error: ${datumResult.error}`));
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
  if (!redeemer.ok)
    return Err(new Error(`Making Redeemer error: ${redeemer.error}`));

  /// build datum tag
  const datumTag = mayFail(() => buildDatumTag(handleUtxo.outputId));
  if (!datumTag.ok)
    return Err(new Error(`Building Datum Tag error: ${datumTag.error}`));

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

  /// make ref script input
  const refInput = new helios.TxInput(
    new helios.TxOutputId(refScriptDetail.refScriptUtxo || ""),
    new helios.TxOutput(
      helios.Address.fromBech32(refScriptDetail.refScriptAddress || ""),
      new helios.Value(
        BigInt(1),
        new helios.Assets([
          [HANDLE_POLICY_ID, [[refScriptDetail.handleHex, 1]]],
        ])
      ),
      refScriptDetail.datumCbor
        ? helios.Datum.inline(
            helios.UplcData.fromCbor(
              helios.hexToBytes(refScriptDetail.datumCbor)
            )
          )
        : null,
      helios.UplcProgram.fromCbor(refScriptDetail.cbor || "")
    )
  );

  /// build tx
  const tx = new helios.Tx()
    .addInputs(selected)
    .addInput(handleUtxo, redeemer.data)
    .addRefInput(refInput, uplcProgram)
    .addOutput(marketplaceFeeOutput)
    .addOutputs(payoutOutputs)
    .addOutput(handleBuyOutput);

  /// finalize tx
  const txCompleteResult = await mayFailTransaction(
    tx,
    () => tx.finalize(networkParams, changeAddress, unSelected),
    refScriptDetail.unoptimizedCbor
  ).complete();
  return txCompleteResult;
};

/**
 * Buy Handle on marketplace with one of authorizers
 * @param {BuyWithAuthConfig} config
 * @param {Network} network
 * @returns {Promise<Result<SuccessResult, Error | BuildTxError>>}
 */
const buyWithAuth = async (
  config: BuyWithAuthConfig,
  network: Network
): Promise<Result<SuccessResult, Error | BuildTxError>> => {
  const {
    changeBech32Address,
    cborUtxos,
    handleHex,
    listingUtxo,
    authorizerPubKeyHash,
  } = config;

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

  /// check authorizer pub key hash
  if (
    !parameters.authorizers.some(
      (authorizer) => authorizer == authorizerPubKeyHash
    )
  )
    return Err(new Error("Authorizer Pub Key Hash is not valid"));

  const changeAddress = helios.Address.fromBech32(changeBech32Address);
  const utxos = cborUtxos.map((cborUtxo) =>
    helios.TxInput.fromFullCbor([...Buffer.from(cborUtxo, "hex")])
  );
  const handleUtxo = new helios.TxInput(
    new helios.TxOutputId(
      helios.TxId.fromHex(listingUtxo.tx_id),
      listingUtxo.index
    ),
    new helios.TxOutput(
      helios.Address.fromBech32(listingUtxo.address),
      new helios.Value(
        BigInt(listingUtxo.lovelace),
        new helios.Assets([[HANDLE_POLICY_ID, [[handleHex, 1]]]])
      ),
      listingUtxo.datum
        ? helios.Datum.inline(
            helios.UplcData.fromCbor(helios.hexToBytes(listingUtxo.datum))
          )
        : null
    )
  );

  const handleRawDatum = handleUtxo.output.datum;
  if (!handleRawDatum) return Err(new Error("Handle UTxO datum not found"));
  const datumResult = await mayFailAsync(() =>
    decodeDatum(handleRawDatum)
  ).complete();
  if (!datumResult.ok)
    return Err(new Error(`Decoding Datum Cbor error: ${datumResult.error}`));
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
  if (!redeemer.ok)
    return Err(new Error(`Making Redeemer error: ${redeemer.error}`));

  /// build datum tag
  const datumTag = mayFail(() => buildDatumTag(handleUtxo.outputId));
  if (!datumTag.ok)
    return Err(new Error(`Building Datum Tag error: ${datumTag.error}`));

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

  /// make ref script input
  const refInput = new helios.TxInput(
    new helios.TxOutputId(refScriptDetail.refScriptUtxo || ""),
    new helios.TxOutput(
      helios.Address.fromBech32(refScriptDetail.refScriptAddress || ""),
      new helios.Value(
        BigInt(1),
        new helios.Assets([
          [HANDLE_POLICY_ID, [[refScriptDetail.handleHex, 1]]],
        ])
      ),
      refScriptDetail.datumCbor
        ? helios.Datum.inline(
            helios.UplcData.fromCbor(
              helios.hexToBytes(refScriptDetail.datumCbor)
            )
          )
        : null,
      helios.UplcProgram.fromCbor(refScriptDetail.cbor || "")
    )
  );

  /// build tx
  const tx = new helios.Tx()
    .addInputs(selected)
    .addInput(handleUtxo, redeemer.data)
    .addRefInput(refInput, uplcProgram)
    .addOutputs(payoutOutputs)
    .addOutput(handleBuyOutput)
    .addSigner(helios.PubKeyHash.fromHex(authorizerPubKeyHash));

  /// finalize tx
  const txCompleteResult = await mayFailTransaction(
    tx,
    () => tx.finalize(networkParams, changeAddress, unSelected),
    refScriptDetail.unoptimizedCbor
  ).complete();
  return txCompleteResult;
};

export { buy, buyWithAuth };
export type { BuyConfig, BuyWithAuthConfig };
