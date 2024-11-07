import { HANDLE_POLICY_ID, MIN_FEE } from "./constants";
import { buildDatum, decodeDatum, decodeParametersDatum } from "./datum";
import { deployedScripts } from "./deployed";
import { mayFail, mayFailAsync, mayFailTransaction } from "./helpers";
import { BuildTxError, Payout, SuccessResult } from "./types";
import {
  fetchLatestmarketplaceScriptDetail,
  fetchNetworkParameters,
  getUplcProgram,
} from "./utils";

import * as helios from "@koralabs/helios";
import { IUTxO, Network } from "@koralabs/kora-labs-common";
import { WithdrawOrUpdate } from "redeemer";
import { Err, Result } from "ts-res";

/**
 * Configuration of function to update handle
 * @interface
 * @typedef {object} UpdateConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string | undefined | null} collateralCborUtxo Collateral UTxO. Can be null, then we will select one in function
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {IUTxO} listingUtxo UTxO where this handle is listed
 * @property {Payout[]} newPayouts New payouts which is requried to pay when buy this handle
 */
interface UpdateConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  collateralCborUtxo?: string | null;
  handleHex: string;
  listingUtxo: IUTxO;
  newPayouts: Payout[];
}

/**
 * Update Handle on marketplace
 * @param {UpdateConfig} config
 * @param {Network} network
 * @returns {Promise<Result<SuccessResult, Error | BuildTxError>>}
 */
const update = async (
  config: UpdateConfig,
  network: Network
): Promise<Result<SuccessResult, Error | BuildTxError>> => {
  const { changeBech32Address, cborUtxos, handleHex, listingUtxo, newPayouts } =
    config;

  /// fetch marketplace reference script detail
  const refScriptDetailResult = await mayFailAsync(() =>
    fetchLatestmarketplaceScriptDetail()
  ).complete();

  /// use deployed script if fetch is failed
  const refScriptDetail = refScriptDetailResult.ok
    ? refScriptDetailResult.data
    : Object.values(deployedScripts[network])[0];

  const { cbor, datumCbor, refScriptUtxo } = refScriptDetail;
  if (!cbor) return Err(new Error("Deploy script cbor is empt"));
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

  const ownerPubKeyHash = changeAddress.pubKeyHash;
  if (!ownerPubKeyHash)
    return Err(new Error("Change Address doesn't have payment key"));
  if (datum.owner != ownerPubKeyHash.hex)
    return Err(new Error("You must be owner to update"));

  /// take fund
  const [selected, unSelected] = helios.CoinSelection.selectLargestFirst(
    utxos,
    new helios.Value(MIN_FEE)
  );

  /// redeemer
  const redeemer = mayFail(() => WithdrawOrUpdate());
  if (!redeemer.ok)
    return Err(new Error(`Making Redeemer error: ${redeemer.error}`));

  /// build new datum
  const newDatum = mayFail(() =>
    buildDatum({ payouts: newPayouts, owner: datum.owner })
  );
  if (!newDatum.ok)
    return Err(new Error(`Building New Datum error: ${newDatum.error}`));

  /// add handle update output
  const handleUpdateOutput = new helios.TxOutput(
    helios.Address.fromHash(uplcProgram.validatorHash),
    new helios.Value(0n, handleUtxo.value.assets),
    newDatum.data
  );
  handleUpdateOutput.correctLovelace(networkParams);

  /// make ref input
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
    .addInput(handleUtxo, redeemer.data) /// collect handle nft
    .addRefInput(refInput, uplcProgram)
    .addSigner(ownerPubKeyHash) /// sign with owner
    .addOutput(handleUpdateOutput); /// updated handle output

  /// finalize tx
  const txCompleteResult = await mayFailTransaction(
    tx,
    () => tx.finalize(networkParams, changeAddress, unSelected),
    refScriptDetail.unoptimizedCbor
  ).complete();
  return txCompleteResult;
};

export { update };
export type { UpdateConfig };
