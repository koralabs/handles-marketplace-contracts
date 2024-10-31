import { HANDLE_POLICY_ID, MIN_FEE } from "./constants";
import { decodeDatum, decodeParametersDatum } from "./datum";
import { deployedScripts } from "./deployed";
import { mayFail, mayFailAsync } from "./helpers";
import {
  fetchLatestmarketplaceScriptDetail,
  fetchNetworkParameters,
  getUplcProgram,
} from "./utils";

import * as helios from "@koralabs/helios";
import { IUTxO, Network } from "@koralabs/kora-labs-common";
import { WithdrawOrUpdate } from "redeemer";
import { Err, Ok, Result } from "ts-res";

/**
 * Configuration of function to withdraw handle
 * @interface
 * @typedef {object} WithdrawConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string | undefined | null} collateralCborUtxo Collateral UTxO. Can be null, then we will select one in function
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {IUTxO} listingUtxo UTxO where this handle is listed
 */
interface WithdrawConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  collateralCborUtxo?: string | null;
  handleHex: string;
  listingUtxo: IUTxO;
}

/**
 * Withdraw Handle from marketplace
 * @param {WithdrawConfig} config
 * @param {Network} network
 * @returns {Promise<Result<helios.Tx, string>>}
 */
const withdraw = async (
  config: WithdrawConfig,
  network: Network
): Promise<Result<string, string>> => {
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
    return Err(`You must be owner to withdraw`);

  /// take fund
  const [selected, unSelected] = helios.CoinSelection.selectLargestFirst(
    utxos,
    new helios.Value(MIN_FEE)
  );

  /// redeemer
  const redeemer = mayFail(() => WithdrawOrUpdate());
  if (!redeemer.ok) return Err(`Making Redeemer error: ${redeemer.error}`);

  /// add handle withdraw output
  const handleWithdrawOutput = new helios.TxOutput(
    changeAddress,
    new helios.Value(0n, handleUtxo.value.assets)
  );
  handleWithdrawOutput.correctLovelace(networkParams);

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
    .addOutput(handleWithdrawOutput);

  /// finalize tx
  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, changeAddress, unSelected)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(`Finalizing Tx error: ${txCompleteResult.error}`);
  return Ok(txCompleteResult.data.toCborHex());
};

export { withdraw };
export type { WithdrawConfig };
