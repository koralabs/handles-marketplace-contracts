import { HANDLE_POLICY_ID, MIN_LOVELACE, NETWORK } from "./constants";
import { buildDatum } from "./datum";
import { mayFail, mayFailAsync } from "./helpers";
import { Parameters, Payout } from "./types";
import { fetchNetworkParameters, getUplcProgram } from "./utils";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";
import { Err, Ok, Result } from "ts-res";

interface ListConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  handleHex: string;
  payouts: Payout[];
}

const list = async (
  config: ListConfig,
  parameters: Parameters
): Promise<Result<helios.Tx, string>> => {
  const { changeBech32Address, cborUtxos, handleHex, payouts } = config;

  /// fetch network parameter
  const networkParams = fetchNetworkParameters(NETWORK);

  /// get uplc program
  const uplcProgramResult = await mayFailAsync(() =>
    getUplcProgram(parameters, true)
  ).complete();
  if (!uplcProgramResult.ok)
    return Err(`Getting Uplc Program error: ${uplcProgramResult.error}`);
  const uplcProgram = uplcProgramResult.data;

  const changeAddress = helios.Address.fromBech32(changeBech32Address);
  const utxos = cborUtxos.map((cborUtxo) =>
    helios.TxInput.fromFullCbor([...Buffer.from(cborUtxo, "hex")])
  );

  /// take fund and handle asset
  const handleAsset = new helios.Assets([
    [HANDLE_POLICY_ID, [[`${AssetNameLabel.LBL_222}${handleHex}`, 1]]],
  ]);
  const minValue = new helios.Value(MIN_LOVELACE, handleAsset);
  const selectResult = mayFail(() =>
    helios.CoinSelection.selectLargestFirst(utxos, minValue)
  );
  if (!selectResult.ok) return Err(selectResult.error);
  const [selected, unSelected] = selectResult.data;

  /// build datum
  const ownerPubKeyHash = changeAddress.pubKeyHash;
  if (!ownerPubKeyHash) return Err(`Change Address doesn't have payment key`);
  const datum = mayFail(() => buildDatum(payouts, ownerPubKeyHash));
  if (!datum.ok) return Err(`Building Datum error: ${datum.error}`);

  /// ada handle list update
  const handleListOutput = new helios.TxOutput(
    helios.Address.fromHash(uplcProgram.validatorHash),
    new helios.Value(0n, handleAsset),
    datum.data
  );
  handleListOutput.correctLovelace(networkParams);

  /// build tx
  const tx = new helios.Tx().addInputs(selected).addOutput(handleListOutput);

  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, changeAddress, unSelected)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(`Finalizing Tx error: ${txCompleteResult.error}`);

  return Ok(txCompleteResult.data);
};

export { list };
export type { ListConfig };
