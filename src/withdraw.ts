import { decodeDatum } from "./datum";
import { getNetwork, mayFail, mayFailAsync } from "./helpers";
import { Parameters } from "./types";
import { fetchNetworkParameters, getUplcProgram } from "./utils";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";
import { WithdrawOrUpdate } from "redeemer";
import { Err, Ok, Result } from "ts-res";

const withdraw = async (
  blockfrostApiKey: string,
  address: helios.Address,
  handlePolicyId: string,
  handleName: string,
  txHash: string,
  txIndex: number,
  parameters: Parameters
): Promise<Result<helios.Tx, string>> => {
  const network = getNetwork(blockfrostApiKey);
  const isTestnet = network != "mainnet";
  helios.config.set({
    IS_TESTNET: isTestnet,
    AUTO_SET_VALIDITY_RANGE: true,
  });

  const api = new helios.BlockfrostV0(network, blockfrostApiKey);

  const handleUtxoResult = await mayFailAsync(() =>
    api.getUtxo(new helios.TxOutputId(`${txHash}#${txIndex}`))
  ).complete();
  if (!handleUtxoResult.ok)
    return Err(`Getting Handle UTxO error: ${handleUtxoResult.error}`);
  const handleUtxo = handleUtxoResult.data;

  const utxosResult = await mayFailAsync(() =>
    api.getUtxos(address)
  ).complete();
  if (!utxosResult.ok) return Err(`Getting UTxOs error: ${utxosResult.error}`);
  const utxos = utxosResult.data;

  const uplcProgramResult = await mayFailAsync(() =>
    getUplcProgram(parameters)
  ).complete();
  if (!uplcProgramResult.ok)
    return Err(`Getting Uplc Program error: ${uplcProgramResult.error}`);
  const uplcProgram = uplcProgramResult.data;

  const handleRawDatum = handleUtxo.output.datum;
  if (!handleRawDatum) return Err("Handle UTxO datum not found");
  const datumResult = await mayFailAsync(() =>
    decodeDatum(handleRawDatum)
  ).complete();
  if (!datumResult.ok)
    return Err(`Decoding Datum Cbor error: ${datumResult.error}`);
  const datum = datumResult.data;

  /// fetch protocol parameter
  const networkParamsResult = await mayFailAsync(() =>
    fetchNetworkParameters(network)
  ).complete();
  if (!networkParamsResult.ok)
    return Err(
      `Fetching Network Parameter error: ${networkParamsResult.error}`
    );
  const networkParams = networkParamsResult.data;

  /// build tx
  const tx = new helios.Tx();

  /// take fund to pay payouts
  const minFee = 5_000_000n;
  const [selected] = helios.CoinSelection.selectLargestFirst(
    utxos,
    new helios.Value(minFee)
  );
  tx.addInputs(selected);

  /// redeemer
  const redeemer = mayFail(() => WithdrawOrUpdate());
  if (!redeemer.ok) return Err(`Making Redeemer error: ${redeemer.error}`);

  /// collect handle NFT to buy
  tx.addInput(handleUtxo, redeemer.data);
  tx.attachScript(uplcProgram);

  /// add owner signature
  if (!datum.owner.pubKeyHash) return Err("Owner in Datum is not correct");
  tx.addSigner(datum.owner.pubKeyHash);

  /// add handle withdraw output
  const handleAsset = new helios.Assets([
    [
      handlePolicyId,
      [
        [
          `${AssetNameLabel.LBL_222}${Buffer.from(handleName).toString("hex")}`,
          1,
        ],
      ],
    ],
  ]);
  const handleWithdrawOutput = new helios.TxOutput(
    address,
    new helios.Value(0, handleAsset)
  );
  handleWithdrawOutput.correctLovelace(networkParams);
  tx.addOutput(handleWithdrawOutput);

  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, address)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(`Finalizing Tx error: ${txCompleteResult.error}`);
  return Ok(txCompleteResult.data);
};

export { withdraw };
