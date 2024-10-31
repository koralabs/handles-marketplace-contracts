import program from "../cli";
import { loadConfig } from "../config";
import { update, UpdateConfig } from "../update";
import { adaToLovelace } from "../utils";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";

const updateCommand = program
  .command("update")
  .description("Update Handle NFT on Marketplace")
  .argument("<address>", "Address to perform update")
  .argument("<handle-name>", "Ada Handle Name to buy on marketplace")
  .argument("<utxo-tx-hash>", "Transaction Hash of UTxO where handle is")
  .argument("<utxo-tx-index>", "Transaction Index of UTxO where handle is")
  .argument("<new-price>", "New Price in ada")
  .argument("<new-creator-address>", "Address who create this NFT")
  .action(
    async (
      bech32Address: string,
      handleName: string,
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

      const updateConfig: UpdateConfig = {
        changeBech32Address: bech32Address,
        cborUtxos: utxos.map((utxo) =>
          Buffer.from(utxo.toFullCbor()).toString("hex")
        ),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(
          handleName,
          "utf8"
        ).toString("hex")}`,
        listingUtxo: {
          address: handleUtxo.address.toBech32(),
          datum: handleUtxo.output.datum?.data?.toCborHex() || "",
          index: handleUtxo.outputId.utxoIdx,
          tx_id: handleUtxo.outputId.txId.hex,
          lovelace: Number(handleUtxo.value.lovelace),
        },
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
      };

      const txResult = await update(updateConfig, config.network);
      if (!txResult.ok) return program.error(txResult.error);
      console.log("\nTransaction CBOR Hex, copy and paste to wallet\n");
      console.log(txResult.data);
    }
  );

export default updateCommand;
