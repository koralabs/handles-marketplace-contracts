import {
  decodeTxInput,
  decodeTxOutputDatum,
  makeAddress,
  makeAssets,
  makePubKeyHash,
  makeTxInput,
  makeTxOutput,
  makeTxOutputId,
  makeValue,
} from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";
import { IUTxO, ScriptDetails } from "@koralabs/kora-labs-common";
import { Err, Result } from "ts-res";

import { HANDLE_POLICY_ID, MIN_LOVELACE } from "./constants/index.js";
import {
  buildDatumTag,
  decodeDatum,
  decodeSCParametersDatum,
} from "./datum.js";
import { mayFail, mayFailAsync, mayFailTransaction } from "./helpers/index.js";
import { Buy } from "./redeemer.js";
import { BuildTxError, SuccessResult } from "./types.js";
import {
  bigIntMax,
  fetchDeployedScript,
  fetchNetworkParameters,
  makeListingTxInputFromListingIUTxO,
} from "./utils/index.js";

/**
 * Configuration of function to buy handle
 * @interface
 * @typedef {object} BuyConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `buy`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string | undefined | null} collateralCborUtxo Collateral UTxO. Can be null, then we will select one in function
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {IUTxO} listingIUtxo UTxO where this handle is listed
 * @property {ScriptDetails | undefined} customRefScriptDetail Custom Reference Script Detail
 */
interface BuyConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  collateralCborUtxo?: string | null;
  handleHex: string;
  listingIUtxo: IUTxO;
  customRefScriptDetail?: ScriptDetails;
}

/**
 * Configuration of function to buy handle with one of authorizers
 * @interface
 * @typedef {object} BuyWithAuthConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `buy with auth`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string | undefined | null} collateralCborUtxo Collateral CBOR UTxO. Can be null, then we will select one in function
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {IUTxO} listingIUtxo UTxO where this handle is listed
 * @property {string} authorizerPubKeyHash Pub Key Hash of authorizer
 * @property {ScriptDetails | undefined} customRefScriptDetail Custom Reference Script Detail
 */
interface BuyWithAuthConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  collateralCborUtxo?: string | null;
  handleHex: string;
  listingIUtxo: IUTxO;
  authorizerPubKeyHash: string;
  customRefScriptDetail?: ScriptDetails;
}

/**
 * Buy Handle on marketplace
 * @param {BuyConfig} config
 * @param {NetworkName} network
 * @returns {Promise<Result<SuccessResult,  Error | BuildTxError>>}
 */

const buy = async (
  config: BuyConfig,
  network: NetworkName
): Promise<Result<SuccessResult, Error | BuildTxError>> => {
  const isMainnet = network === "mainnet";
  const {
    changeBech32Address,
    cborUtxos,
    collateralCborUtxo,
    listingIUtxo,
    handleHex,
    customRefScriptDetail,
  } = config;
  const refScriptDetailResult = await mayFailAsync(async () =>
    customRefScriptDetail
      ? customRefScriptDetail
      : await fetchDeployedScript(network)
  ).complete();
  if (!refScriptDetailResult.ok)
    return Err(new Error("Failed to fetch ref script"));
  const refScriptDetail = refScriptDetailResult.data;

  const { cbor, unoptimizedCbor, datumCbor, refScriptUtxo, refScriptAddress } =
    refScriptDetail;
  if (!cbor) return Err(new Error("Deploy script cbor is empty"));
  if (!datumCbor) return Err(new Error("Deploy script's datum cbor is empty"));
  if (!refScriptUtxo || !refScriptAddress)
    return Err(new Error("Deployed script UTxO is not defined"));

  // fetch network parameter
  const networkParametersResult = await fetchNetworkParameters(network);
  if (!networkParametersResult.ok)
    return Err(new Error("Failed to fetch network parameter"));
  const networkParameters = networkParametersResult.data;

  // decode parameter
  const parametersResult = mayFail(() =>
    decodeSCParametersDatum(datumCbor, network)
  );
  if (!parametersResult.ok)
    return Err(
      new Error(
        `Deployed script's datum cbor is invalid: ${parametersResult.error}`
      )
    );
  const parameters = parametersResult.data;

  // get uplc program
  const uplcProgramResult = mayFail(() => decodeUplcProgramV2FromCbor(cbor));
  if (!uplcProgramResult.ok)
    return Err(
      new Error(`Decoding Uplc Program error: ${uplcProgramResult.error}`)
    );
  let uplcProgram = uplcProgramResult.data;

  if (unoptimizedCbor) {
    const unoptimizedUplcProgramResult = mayFail(() =>
      decodeUplcProgramV2FromCbor(unoptimizedCbor)
    );
    if (!unoptimizedUplcProgramResult.ok)
      return Err(
        new Error(
          `Decoding Unoptimized Uplc Program error: ${unoptimizedUplcProgramResult.error}`
        )
      );
    const unoptimizedUplcProgram = unoptimizedUplcProgramResult.data;
    uplcProgram = uplcProgram.withAlt(unoptimizedUplcProgram);
  }

  /// start building tx
  const txBuilder = makeTxBuilder({ isMainnet });
  const changeAddress = makeAddress(changeBech32Address);
  const spareUtxos = cborUtxos.map(decodeTxInput);
  const listingUtxo = makeListingTxInputFromListingIUTxO(
    listingIUtxo,
    handleHex
  );
  const handleValue = makeValue(
    0n,
    makeAssets([[HANDLE_POLICY_ID, [[handleHex, 1n]]]])
  );

  // check listing utxo has handle in it
  if (!listingUtxo.value.isGreaterOrEqual(handleValue))
    return Err(new Error("Listing UTxO doesn't have handle in it"));

  // <--- decode listing datum
  const listingDatum = listingUtxo.datum;
  if (!listingDatum) return Err(new Error("Listing UTxO datum not found"));
  const decodedResult = mayFail(() => decodeDatum(listingDatum, network));
  if (!decodedResult.ok)
    return Err(new Error(`Decoding Datum Cbor error: ${decodedResult.error}`));
  const decodedDatum = decodedResult.data;

  // take fund to pay payouts
  const totalPayoutsLovelace = decodedDatum.payouts.reduce(
    (acc, cur) => acc + bigIntMax(cur.amountLovelace, MIN_LOVELACE),
    0n
  );
  const marketplaceFee = (totalPayoutsLovelace * 50n) / 49n / 50n;

  // <--- make ref script input
  const refInput = makeTxInput(
    makeTxOutputId(refScriptUtxo),
    makeTxOutput(
      makeAddress(refScriptAddress),
      makeValue(
        1n,
        makeAssets([[HANDLE_POLICY_ID, [[refScriptDetail.handleHex, 1]]]])
      ),
      decodeTxOutputDatum(datumCbor),
      uplcProgram
    )
  );
  txBuilder.refer(refInput);

  // make redeemer
  const redeemerResult = mayFail(() => Buy(0));
  if (!redeemerResult.ok)
    return Err(new Error(`Making Redeemer error: ${redeemerResult.error}`));

  // <--- spend listing utxo
  txBuilder.spendUnsafe([listingUtxo], redeemerResult.data);

  // build datum tag
  const datumTagResult = mayFail(() => buildDatumTag(listingUtxo.id));
  if (!datumTagResult.ok)
    return Err(new Error(`Building Datum Tag error: ${datumTagResult.error}`));

  // <--- marketplace fee output
  const marketplaceFeeOutput = makeTxOutput(
    makeAddress(parameters.marketplaceAddress),
    makeValue(marketplaceFee),
    datumTagResult.data
  );
  marketplaceFeeOutput.correctLovelace(networkParameters);
  txBuilder.addOutput(marketplaceFeeOutput);

  // <--- payout outputs
  const payoutOutputs = decodedDatum.payouts.map((payout) =>
    makeTxOutput(makeAddress(payout.address), makeValue(payout.amountLovelace))
  );
  payoutOutputs.forEach((payoutOutput) =>
    payoutOutput.correctLovelace(networkParameters)
  );
  txBuilder.addOutput(...payoutOutputs);

  // <--- add handle buy output
  const handleBuyOutput = makeTxOutput(
    changeAddress,
    makeValue(0n, listingUtxo.value.assets)
  );
  handleBuyOutput.correctLovelace(networkParameters);
  txBuilder.addOutput(handleBuyOutput);

  // <--- add change address as signer
  if (changeAddress.spendingCredential.kind != "PubKeyHash")
    return Err(new Error("Must be Base Address to perform buy"));
  txBuilder.addSigners(changeAddress.spendingCredential);

  // <--- add collateral if passed
  if (collateralCborUtxo) {
    const collateralUtxo = decodeTxInput(collateralCborUtxo);
    txBuilder.addCollateral(collateralUtxo);
  }

  /// build tx
  const txResult = await mayFailTransaction(
    txBuilder,
    changeAddress,
    spareUtxos
  ).complete();

  return txResult;
};

/**
 * Buy Handle on marketplace with one of authorizers
 * @param {BuyWithAuthConfig} config
 * @param {NetworkName} network
 * @returns {Promise<Result<SuccessResult, Error | BuildTxError>>}
 */
const buyWithAuth = async (
  config: BuyWithAuthConfig,
  network: NetworkName
): Promise<Result<SuccessResult, Error | BuildTxError>> => {
  const isMainnet = network === "mainnet";
  const {
    changeBech32Address,
    cborUtxos,
    collateralCborUtxo,
    listingIUtxo,
    handleHex,
    authorizerPubKeyHash,
    customRefScriptDetail,
  } = config;
  const refScriptDetailResult = await mayFailAsync(async () =>
    customRefScriptDetail
      ? customRefScriptDetail
      : await fetchDeployedScript(network)
  ).complete();
  if (!refScriptDetailResult.ok)
    return Err(new Error("Failed to fetch ref script"));
  const refScriptDetail = refScriptDetailResult.data;

  const { cbor, unoptimizedCbor, datumCbor, refScriptUtxo, refScriptAddress } =
    refScriptDetail;
  if (!cbor) return Err(new Error("Deploy script cbor is empty"));
  if (!datumCbor) return Err(new Error("Deploy script's datum cbor is empty"));
  if (!refScriptUtxo || !refScriptAddress)
    return Err(new Error("Deployed script UTxO is not defined"));

  // fetch network parameter
  const networkParametersResult = await fetchNetworkParameters(network);
  if (!networkParametersResult.ok)
    return Err(new Error("Failed to fetch network parameter"));
  const networkParameters = networkParametersResult.data;

  // decode parameter
  const parametersResult = mayFail(() =>
    decodeSCParametersDatum(datumCbor, network)
  );
  if (!parametersResult.ok)
    return Err(
      new Error(
        `Deployed script's datum cbor is invalid: ${parametersResult.error}`
      )
    );
  const parameters = parametersResult.data;

  // check authorizer is correct
  if (
    !parameters.authorizers.some(
      (item) => item.toLowerCase() === authorizerPubKeyHash.toLowerCase()
    )
  )
    return Err(new Error("Authorizer's PubKey Hash is not correct"));

  // get uplc program
  const uplcProgramResult = mayFail(() => decodeUplcProgramV2FromCbor(cbor));
  if (!uplcProgramResult.ok)
    return Err(
      new Error(`Decoding Uplc Program error: ${uplcProgramResult.error}`)
    );
  let uplcProgram = uplcProgramResult.data;

  if (unoptimizedCbor) {
    const unoptimizedUplcProgramResult = mayFail(() =>
      decodeUplcProgramV2FromCbor(unoptimizedCbor)
    );
    if (!unoptimizedUplcProgramResult.ok)
      return Err(
        new Error(
          `Decoding Unoptimized Uplc Program error: ${unoptimizedUplcProgramResult.error}`
        )
      );
    const unoptimizedUplcProgram = unoptimizedUplcProgramResult.data;
    uplcProgram = uplcProgram.withAlt(unoptimizedUplcProgram);
  }

  /// start building tx
  const txBuilder = makeTxBuilder({ isMainnet });
  const changeAddress = makeAddress(changeBech32Address);
  const spareUtxos = cborUtxos.map(decodeTxInput);
  const listingUtxo = makeListingTxInputFromListingIUTxO(
    listingIUtxo,
    handleHex
  );
  const handleValue = makeValue(
    0n,
    makeAssets([[HANDLE_POLICY_ID, [[handleHex, 1n]]]])
  );

  // check listing utxo has handle in it
  if (!listingUtxo.value.isGreaterOrEqual(handleValue))
    return Err(new Error("Listing UTxO doesn't have handle in it"));

  // <--- decode listing datum
  const listingDatum = listingUtxo.datum;
  if (!listingDatum) return Err(new Error("Listing UTxO datum not found"));
  const decodedResult = mayFail(() => decodeDatum(listingDatum, network));
  if (!decodedResult.ok)
    return Err(new Error(`Decoding Datum Cbor error: ${decodedResult.error}`));
  const decodedDatum = decodedResult.data;

  // <--- make ref script input
  const refInput = makeTxInput(
    makeTxOutputId(refScriptUtxo),
    makeTxOutput(
      makeAddress(refScriptAddress),
      makeValue(
        1n,
        makeAssets([[HANDLE_POLICY_ID, [[refScriptDetail.handleHex, 1]]]])
      ),
      decodeTxOutputDatum(datumCbor),
      uplcProgram
    )
  );
  txBuilder.refer(refInput);

  // make redeemer
  const redeemerResult = mayFail(() => Buy(0));
  if (!redeemerResult.ok)
    return Err(new Error(`Making Redeemer error: ${redeemerResult.error}`));

  // <--- spend listing utxo
  txBuilder.spendUnsafe([listingUtxo], redeemerResult.data);

  // build datum tag
  const datumTagResult = mayFail(() => buildDatumTag(listingUtxo.id));
  if (!datumTagResult.ok)
    return Err(new Error(`Building Datum Tag error: ${datumTagResult.error}`));

  // <--- payout outputs
  const payoutOutputs = decodedDatum.payouts.map((payout, index) =>
    makeTxOutput(
      makeAddress(payout.address),
      makeValue(payout.amountLovelace),
      index == 0 ? datumTagResult.data : undefined
    )
  );
  payoutOutputs.forEach((payoutOutput) =>
    payoutOutput.correctLovelace(networkParameters)
  );
  txBuilder.addOutput(...payoutOutputs);

  // <--- add handle buy output
  const handleBuyOutput = makeTxOutput(
    changeAddress,
    makeValue(0n, listingUtxo.value.assets)
  );
  handleBuyOutput.correctLovelace(networkParameters);
  txBuilder.addOutput(handleBuyOutput);

  // <--- add change address as signer
  if (changeAddress.spendingCredential.kind != "PubKeyHash")
    return Err(new Error("Must be Base Address to perform buy"));
  txBuilder.addSigners(changeAddress.spendingCredential);

  // <--- add authorizer as signer
  txBuilder.addSigners(makePubKeyHash(authorizerPubKeyHash));

  // <--- add collateral if passed
  if (collateralCborUtxo) {
    const collateralUtxo = decodeTxInput(collateralCborUtxo);
    txBuilder.addCollateral(collateralUtxo);
  }

  /// build tx
  const txResult = await mayFailTransaction(
    txBuilder,
    changeAddress,
    spareUtxos
  ).complete();

  return txResult;
};

export { buy, buyWithAuth };
export type { BuyConfig, BuyWithAuthConfig };
