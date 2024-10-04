import program from "../cli";
import { loadConfig } from "../config";
import { deployedScripts } from "../deployed";
import { update, UpdateConfig } from "../update";
import { adaToLovelace } from "../utils";

import * as helios from "@koralabs/helios";

const updateCommand = program
  .command("update")
  .description("Update Handle NFT on Marketplace")
  .argument("<address>", "Address to perform update")
  .argument("<utxo-tx-hash>", "Transaction Hash of UTxO where handle is")
  .argument("<utxo-tx-index>", "Transaction Index of UTxO where handle is")
  .argument("<new-price>", "New Price in ada")
  .argument("<new-creator-address>", "Address who create this NFT")
  .action(
    async (
      bech32Address: string,
      txHash: string,
      txIndex: string,
      newPriceString: string,
      newCreatorBech32Address: string
    ) => {
      const configResult = loadConfig();
      if (!configResult.ok) return program.error(configResult.error);
      const config = configResult.data;

      const api = new helios.BlockfrostV0(
        config.network,
        config.blockfrostApiKey
      );
      const utxos = await api.getUtxos(
        helios.Address.fromBech32(bech32Address)
      );
      const handleUtxo = await api.getUtxo(
        new helios.TxOutputId(`${txHash}#${txIndex}`)
      );

      const refScriptDetail = Object.values(deployedScripts[config.network])[0];
      const refScriptUTxo = await api.getUtxo(
        new helios.TxOutputId(refScriptDetail.refScriptUtxo!)
      );
      const refScriptCborUtxo = Buffer.from(
        refScriptUTxo.toFullCbor()
      ).toString("hex");

      const updateConfig: UpdateConfig = {
        changeBech32Address: bech32Address,
        cborUtxos: utxos.map((utxo) =>
          Buffer.from(utxo.toFullCbor()).toString("hex")
        ),
        handleCborUtxo: Buffer.from(handleUtxo.toFullCbor()).toString("hex"),
        newPayouts: [
          {
            address: bech32Address,
            amountLovelace: adaToLovelace(Number(newPriceString) * 0.9),
          },
          {
            address: newCreatorBech32Address,
            amountLovelace: adaToLovelace(Number(newPriceString) * 0.1),
          },
        ],
        refScriptDetail,
        refScriptCborUtxo,
      };

      const txResult = await update(updateConfig, config.network);
      if (!txResult.ok) return program.error(txResult.error);
      console.log("\nTransaction CBOR Hex, copy and paste to wallet\n");
      console.log(txResult.data.toCborHex());
    }
  );

export default updateCommand;
