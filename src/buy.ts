import { MIN_FEE, MIN_LOVELACE, NETWORK } from "./constants";
import { buildDatumTag, decodeDatum } from "./datum";
import { mayFail, mayFailAsync } from "./helpers";
import { Parameters } from "./types";
import { bigIntMax, fetchNetworkParameters, getUplcProgram } from "./utils";

import * as helios from "@koralabs/helios";
import { Buy } from "redeemer";
import { Err, Ok, Result } from "ts-res";

interface BuyConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  handleCborUtxo: string; /// handle (to buy) is in this utxo
}

const buy = async (
  config: BuyConfig,
  parameters: Parameters
): Promise<Result<helios.Tx, string>> => {
  const { changeBech32Address, cborUtxos, handleCborUtxo } = config;

  /// fetch network parameter
  const networkParams = fetchNetworkParameters(NETWORK);

  /// get uplc program
  const uplcProgramResult = await mayFailAsync(() =>
    getUplcProgram(parameters)
  ).complete();
  if (!uplcProgramResult.ok)
    return Err(`Getting Uplc Program error: ${uplcProgramResult.error}`);
  const uplcProgram = uplcProgramResult.data;

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
    parameters.marketplaceAddress,
    new helios.Value(marketplaceFee),
    datumTag.data
  );
  marketplaceFeeOutput.correctLovelace(networkParams);

  /// payout outputs
  const payoutOutputs = datum.payouts.map(
    (payout) =>
      new helios.TxOutput(
        payout.address,
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

  /// build tx
  const tx = new helios.Tx()
    .addInputs(selected)
    .addInput(handleUtxo, redeemer.data)
    .attachScript(uplcProgram)
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

export { buy };
export type { BuyConfig };
