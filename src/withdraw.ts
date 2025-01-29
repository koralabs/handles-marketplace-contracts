import {
  decodeTxInput,
  decodeTxOutputDatum,
  makeAddress,
  makeAssets,
  makeTxInput,
  makeTxOutput,
  makeTxOutputId,
  makeValue,
} from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";
import { IUTxO, ScriptDetails } from "@koralabs/kora-labs-common";
import { Err, Result } from "ts-res";

import { HANDLE_POLICY_ID } from "./constants/index.js";
import { decodeDatum } from "./datum.js";
import { mayFail, mayFailAsync, mayFailTransaction } from "./helpers/index.js";
import { WithdrawOrUpdate } from "./redeemer.js";
import { BuildTxError, SuccessResult } from "./types.js";
import {
  fetchDeployedScript,
  makeListingTxInputFromListingIUTxO,
} from "./utils/index.js";

/**
 * Configuration of function to withdraw handle
 * @interface
 * @typedef {object} WithdrawConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `withdraw`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string | undefined | null} collateralCborUtxo Collateral UTxO. Can be null, then we will select one in function
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {IUTxO} listingIUtxo UTxO where this handle is listed
 * @property {ScriptDetails | undefined} customRefScriptDetail Custom Reference Script Detail
 */
interface WithdrawConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  collateralCborUtxo?: string | null;
  handleHex: string;
  listingIUtxo: IUTxO;
  customRefScriptDetail?: ScriptDetails;
}

/**
 * Withdraw listed Handle on marketplace
 * @param {WithdrawConfig} config
 * @param {NetworkName} network
 * @returns {Promise<Result<SuccessResult,  Error | BuildTxError>>}
 */

const withdraw = async (
  config: WithdrawConfig,
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

  // check listingUtxo has handle in it
  if (!listingUtxo.value.isGreaterOrEqual(handleValue))
    return Err(new Error("Listing UTxO doesn't have handle in it"));

  // <--- decode listing datum
  const listingDatum = listingUtxo.datum;
  if (!listingDatum) return Err(new Error("Listing UTxO datum not found"));
  const decodedResult = mayFail(() => decodeDatum(listingDatum, network));
  if (!decodedResult.ok)
    return Err(new Error(`Decoding Datum Cbor error: ${decodedResult.error}`));
  const decodedDatum = decodedResult.data;

  // check changeAddress's pubkey hash is same as decoded datum's owner
  if (changeAddress.spendingCredential.kind != "PubKeyHash")
    return Err(new Error("Must be Base Address to perform update"));
  if (changeAddress.spendingCredential.toHex() != decodedDatum.owner)
    return Err(new Error("Must be owner to withdraw"));

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
  const redeemerResult = mayFail(() => WithdrawOrUpdate());
  if (!redeemerResult.ok)
    return Err(new Error(`Making Redeemer error: ${redeemerResult.error}`));

  // <--- spend listing utxo
  txBuilder.spendUnsafe([listingUtxo], redeemerResult.data);

  // <--- add owner as signer
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

export { withdraw };
export type { WithdrawConfig };
