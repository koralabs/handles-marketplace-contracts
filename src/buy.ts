import { buildDatum, decodeDatum } from "./datum";
import { getNetwork, mayFailAsync } from "./helpers";
import { Parameters, Payout } from "./types";
import { getUplcProgram } from "./utils";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";
import { Err, Ok, Result } from "ts-res";

const buy = async (
  blockfrostApiKey: string,
  address: helios.Address,
  handlePolicyId: string,
  handleName: string,
  txHash: string,
  txIndex: number,
  parameters: Parameters
): Promise<Result<void, string>> => {
  const network = getNetwork(blockfrostApiKey);
  helios.config.set({
    IS_TESTNET: network != "mainnet",
    AUTO_SET_VALIDITY_RANGE: true,
  });

  const api = new helios.BlockfrostV0(network, blockfrostApiKey);
  const paramterResult = await mayFailAsync(() =>
    api.getParameters()
  ).complete();
  if (!paramterResult.ok)
    return Err(`Getting Network Parameter ${paramterResult.error}`);
  const paramter = paramterResult.data;

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

  //   const handleAsset = new helios.Assets([
  //     [
  //       handlePolicyId,
  //       [
  //         [
  //           `${AssetNameLabel.LBL_222}${Buffer.from(handleName).toString("hex")}`,
  //           1,
  //         ],
  //       ],
  //     ],
  //   ]);

  //   const minFee = 5_000_000n;
  //   const minValue = new helios.Value(minFee, handleAsset);
  //   const [selected] = helios.CoinSelection.selectLargestFirst(utxos, minValue);

  //   const tx = new helios.Tx();
  //   tx.addInputs(selected);

  //   const datum = await buildDatum(payouts, owner);
  //   const output = new helios.TxOutput(
  //     helios.Address.fromHash(uplcProgram.validatorHash, true),
  //     new helios.Value(0n, handleAsset),
  //     datum
  //   );
  //   output.correctLovelace(paramter);
  //   tx.addOutput(output);

  //   const txCompleteResult = await mayFailAsync(() =>
  //     tx.finalize(paramter, address)
  //   ).complete();
  //   if (!txCompleteResult.ok)
  //     return Err(`Finalizing Tx error: ${txCompleteResult.error}`);

  //   return Ok(txCompleteResult.data);
  return Ok();
};

export { buy };
