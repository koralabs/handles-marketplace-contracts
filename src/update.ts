import { MIN_FEE, NETWORK } from "./constants";
import { buildDatum, decodeDatum } from "./datum";
import { mayFail, mayFailAsync } from "./helpers";
import { Parameters, Payout } from "./types";
import { fetchNetworkParameters, getUplcProgram } from "./utils";

import * as helios from "@koralabs/helios";
import { WithdrawOrUpdate } from "redeemer";
import { Err, Ok, Result } from "ts-res";

interface UpdateConfig {
  changeBech32Address: string;
  cborUtxos: string[];
  handleCborUtxo: string; /// handle (to update) is in this utxo
  newPayouts: Payout[];
  refScriptCborUtxo?: string;
}

const update = async (
  config: UpdateConfig,
  parameters: Parameters
): Promise<Result<helios.Tx, string>> => {
  const {
    changeBech32Address,
    cborUtxos,
    handleCborUtxo,
    newPayouts,
    refScriptCborUtxo,
  } = config;

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

  const ownerPubKeyHash = changeAddress.pubKeyHash;
  if (!ownerPubKeyHash) return Err(`Change Address doesn't have payment key`);
  if (datum.owner.toString() != ownerPubKeyHash.toString())
    return Err(`You must be owner to update`);

  /// take fund
  const [selected, unSelected] = helios.CoinSelection.selectLargestFirst(
    utxos,
    new helios.Value(MIN_FEE)
  );

  /// redeemer
  const redeemer = mayFail(() => WithdrawOrUpdate());
  if (!redeemer.ok) return Err(`Making Redeemer error: ${redeemer.error}`);

  /// build new datum
  const newDatum = mayFail(() => buildDatum(newPayouts, ownerPubKeyHash));
  if (!newDatum.ok) return Err(`Building New Datum error: ${newDatum.error}`);

  /// add handle update output
  const handleUpdateOutput = new helios.TxOutput(
    helios.Address.fromHash(uplcProgram.validatorHash),
    new helios.Value(0n, handleUtxo.value.assets),
    newDatum.data
  );
  handleUpdateOutput.correctLovelace(networkParams);

  /// build tx
  let tx = new helios.Tx()
    .addInputs(selected)
    .addInput(handleUtxo, redeemer.data); /// collect handle nft

  if (refScriptCborUtxo) {
    const refScriptUtxo = helios.TxInput.fromFullCbor([
      ...Buffer.from(refScriptCborUtxo, "hex"),
    ]);
    tx = tx.addRefInput(refScriptUtxo, uplcProgram);
  } else {
    tx = tx.attachScript(uplcProgram);
  }

  tx = tx
    .addSigner(datum.owner) /// sign with owner
    .addOutput(handleUpdateOutput); /// updated handle output

  /// finalize tx
  const txCompleteResult = await mayFailAsync(() =>
    tx.finalize(networkParams, changeAddress, unSelected)
  ).complete();
  if (!txCompleteResult.ok)
    return Err(`Finalizing Tx error: ${txCompleteResult.error}`);
  return Ok(txCompleteResult.data);
};

export { update };
export type { UpdateConfig };
