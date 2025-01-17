import {
  decodeTxInput,
  makeAddress,
  makeAssets,
  makeTxOutput,
  makeValidatorHash,
  makeValue,
} from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";
import { ScriptDetails } from "@koralabs/kora-labs-common";
import { Err, Ok, Result } from "ts-res";

import { HANDLE_POLICY_ID } from "./constants/index.js";
import { buildDatum, decodeSCParametersDatum } from "./datum.js";
import { mayFail, mayFailAsync } from "./helpers/index.js";
import { Payout, SuccessResult } from "./types.js";
import { fetchDeployedScript, fetchNetworkParameters } from "./utils/index.js";

/**
 * Configuration of function to list handle
 * @interface
 * @typedef {object} ListConfig
 * @property {string} changeBech32Address Change address of wallet who is performing `list`
 * @property {string[]} cborUtxos UTxOs (cbor format) of wallet
 * @property {string} handleHex Handle name's hex format (asset name label is also included)
 * @property {Payout[]} payouts Payouts which is requried to pay when buy this handle
 * @property {ScriptDetails | undefined} customRefScriptDetail Custom Reference Script Detail
 */
interface ListConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  handleHex: string;
  payouts: Payout[];
  customRefScriptDetail?: ScriptDetails;
}

/**
 * List Handle to marketplace
 * @param {ListConfig} config
 * @param {NetworkName} network
 * @returns {Promise<Result<SuccessResult, Error>>}
 */
const list = async (
  config: ListConfig,
  network: NetworkName
): Promise<Result<SuccessResult, Error>> => {
  const isMainnet = network === "mainnet";
  const {
    changeBech32Address,
    cborUtxos,
    handleHex,
    payouts,
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

  const { cbor, datumCbor, refScriptUtxo } = refScriptDetail;
  if (!cbor) return Err(new Error("Deploy script cbor is empty"));
  if (!datumCbor) return Err(new Error("Deploy script's datum cbor is empty"));
  if (!refScriptUtxo)
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
  // const parameters = parametersResult.data;

  // get uplc program
  const uplcProgramResult = mayFail(() => decodeUplcProgramV2FromCbor(cbor));
  if (!uplcProgramResult.ok)
    return Err(
      new Error(`Decoding Uplc Program error: ${uplcProgramResult.error}`)
    );
  const uplcProgram = uplcProgramResult.data;

  /// start building tx
  const txBuilder = makeTxBuilder({ isMainnet });
  const changeAddress = makeAddress(changeBech32Address);
  const spareUtxos = cborUtxos.map(decodeTxInput);
  const handleValue = makeValue(
    0n,
    makeAssets([[HANDLE_POLICY_ID, [[handleHex, 1n]]]])
  );

  // take listing handle asset from spareUtxos
  const handleInputIndex = spareUtxos.findIndex((utxo) =>
    utxo.value.isGreaterOrEqual(handleValue)
  );
  if (handleInputIndex < 0)
    return Err(new Error(`You don't have listing handle`));
  const handleInput = spareUtxos.splice(handleInputIndex, 1)[0];

  // <--- spend listing handle input
  txBuilder.spendUnsafe(handleInput);

  // build datum
  if (changeAddress.spendingCredential.kind != "PubKeyHash")
    return Err(new Error("Must be Base Address to perform list"));
  const ownerPubKeyHash = changeAddress.spendingCredential;
  const listingDatumResult = mayFail(() =>
    buildDatum({ payouts, owner: ownerPubKeyHash.toHex() })
  );
  if (!listingDatumResult.ok)
    return Err(new Error(`Building Datum error: ${listingDatumResult.error}`));

  // <--- listing handle output
  const listingHandleOutput = makeTxOutput(
    makeAddress(
      isMainnet,
      makeValidatorHash(uplcProgram.hash())
      // changeAddress.stakingCredential, // when listed NFT needs to be under user's staking credential
    ),
    handleValue,
    listingDatumResult.data
  );
  listingHandleOutput.correctLovelace(networkParameters);
  txBuilder.addOutput(listingHandleOutput);

  // <--- add owner as signer
  txBuilder.addSigners(ownerPubKeyHash);

  /// build tx
  const txResult = await mayFailAsync(() =>
    txBuilder.build({
      spareUtxos,
      changeAddress,
    })
  ).complete();

  if (!txResult.ok)
    return Err(new Error(`Building Tx error: ${txResult.error}`));

  return Ok({
    tx: txResult.data,
    dump: txResult.data.dump(),
  });
};

export { list };
export type { ListConfig };
