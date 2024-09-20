import program from "../cli";
import { loadConfig } from "../config";
import { withdraw, WithdrawConfig } from "../withdraw";

import * as helios from "@koralabs/helios";

const withdrawCommand = program
  .command("withdraw")
  .description("Withdraw Handle NFT from Marketplace")
  .argument("<address>", "Address to perform withdraw")
  .argument("<utxo-tx-hash>", "Transaction Hash of UTxO where handle is")
  .argument("<utxo-tx-index>", "Transaction Index of UTxO where handle is")
  .action(async (bech32Address: string, txHash: string, txIndex: string) => {
    const configResult = loadConfig();
    if (!configResult.ok) return program.error(configResult.error);
    const config = configResult.data;

    const api = new helios.BlockfrostV0(
      config.network,
      config.blockfrostApiKey
    );
    const utxos = await api.getUtxos(helios.Address.fromBech32(bech32Address));
    const handleUtxo = await api.getUtxo(
      new helios.TxOutputId(`${txHash}#${txIndex}`)
    );

    const withdrawConfig: WithdrawConfig = {
      changeBech32Address: bech32Address,
      cborUtxos: utxos.map((utxo) =>
        Buffer.from(utxo.toFullCbor()).toString("hex")
      ),
      handleCborUtxo: Buffer.from(handleUtxo.toFullCbor()).toString("hex"),
    };

    const txResult = await withdraw(withdrawConfig, config.paramters);
    if (!txResult.ok) return program.error(txResult.error);
    console.log("\nTransaction CBOR Hex, copy and paste to wallet\n");
    console.log(txResult.data.toCborHex());
  });

export default withdrawCommand;
