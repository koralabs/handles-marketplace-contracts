import { buildDatumTag, decodeDatum } from "./datum";
import { getNetwork, mayFail, mayFailAsync } from "./helpers";
import { Parameters } from "./types";
import { fetchNetworkParameters, getUplcProgram } from "./utils";

import * as helios from "@koralabs/helios";
import { Buy } from "redeemer";
import { Err, Ok, Result } from "ts-res";

const buy = async (
  blockfrostApiKey: string,
  address: helios.Address,
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
  const totalPayoutsLovelace = datum.payouts.reduce(
    (acc, cur) => acc + cur.amountLovelace,
    0n
  );
  const marketplaceFee = (totalPayoutsLovelace * 50n) / 49n / 50n;
  const requiredValue = new helios.Value(
    minFee + totalPayoutsLovelace + marketplaceFee
  );
  const [selected] = helios.CoinSelection.selectLargestFirst(
    utxos,
    requiredValue
  );
  tx.addInputs(selected);

  /// redeemer
  const redeemer = mayFail(() => Buy(0));
  if (!redeemer.ok) return Err(`Making Redeemer error: ${redeemer.error}`);

  /// collect handle NFT to buy
  tx.addInput(handleUtxo, redeemer.data);
  tx.attachScript(uplcProgram);

  /// build datum tag
  const datumTag = mayFail(() => buildDatumTag(handleUtxo.outputId));
  if (!datumTag.ok) return Err(`Building Datum Tag error: ${datumTag.error}`);

  /// add marketplace fee
  const marketplaceFeeOutput = new helios.TxOutput(
    parameters.marketplaceAddress,
    new helios.Value(marketplaceFee),
    datumTag.data
  );
  marketplaceFeeOutput.correctLovelace(networkParams);
  tx.addOutput(marketplaceFeeOutput);

  /// add payout outputs
  const payoutOutputs = datum.payouts.map(
    (payout) =>
      new helios.TxOutput(
        payout.address,
        new helios.Value(payout.amountLovelace)
      )
  );
  payoutOutputs.forEach((output) => output.correctLovelace(networkParams));
  tx.addOutputs(payoutOutputs);

  /// add handle buy output
  const handleBuyOutput = new helios.TxOutput(address, handleUtxo.value);
  handleBuyOutput.correctLovelace(networkParams);
  tx.addOutput(handleBuyOutput);

  /// finalize tx
  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, address)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(`Finalizing Tx error: ${txCompleteResult.error}`);
  return Ok(txCompleteResult.data);
};

export { buy };
