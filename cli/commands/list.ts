import program from "../../cli/cli";
import { loadConfig } from "../config";
import { list, ListConfig } from "../list";
import { adaToLovelace } from "../utils";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";

const buyCommand = program
  .command("list")
  .description("List Handle NFT on Marketplace")
  .argument("<address>", "Address to perform listing")
  .argument("<handle-name>", "Ada Handle Name to list on marketplace")
  .argument("<price>", "Price in ada")
  .argument("<creator-address>", "Address of artist who create this NFT")
  .action(
    async (
      bech32Address: string,
      handleName: string,
      priceString: string,
      creatorBech32Address: string
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
      const listConfig: ListConfig = {
        changeBech32Address: bech32Address,
        cborUtxos: utxos.map((utxo) =>
          Buffer.from(utxo.toFullCbor()).toString("hex")
        ),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(
          handleName,
          "utf8"
        ).toString("hex")}`,
        payouts: [
          {
            address: bech32Address,
            amountLovelace: adaToLovelace(Number(priceString) * 0.9),
          },
          {
            address: creatorBech32Address,
            amountLovelace: adaToLovelace(Number(priceString) * 0.1),
          },
        ],
      };

      const txResult = await list(listConfig, config.network);
      if (!txResult.ok) console.log(txResult.error);
      else console.log(txResult.data);
    }
  );

export default buyCommand;
