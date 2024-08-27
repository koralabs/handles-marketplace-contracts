import program from "../cli";
import { loadConfig } from "../config";
import { list } from "../list";
import { adaToLovelace } from "../utils";

import * as helios from "@koralabs/helios";

const buyCommand = program
  .command("list")
  .description("List Handle NFT on Marketplace")
  .argument("<handle-name>", "Ada Handle Name to list on marketplace")
  .argument("<price>", "Price in ada")
  .argument("<address>", "Address to perform listing")
  .argument("<creator-address>", "Address who create this NFT")
  .action(
    async (
      handleName: string,
      priceString: string,
      bech32Address: string,
      creatorBech32Address: string
    ) => {
      const configResult = loadConfig();
      if (!configResult.ok) return program.error(configResult.error);
      const config = configResult.data;

      const address = helios.Address.fromBech32(bech32Address);
      const creatorAddress = helios.Address.fromBech32(creatorBech32Address);
      const txResult = await list(
        config.blockfrostApiKey,
        address,
        config.handlePolicyId,
        handleName,
        [
          { address, amountLovelace: adaToLovelace(Number(priceString) * 0.9) },
          {
            address: creatorAddress,
            amountLovelace: adaToLovelace(Number(priceString) * 0.1),
          },
        ],
        address
      );

      if (!txResult.ok) return program.error(txResult.error);
      console.log("Transaction CBOR Hex, copy and paste to wallet\n");
      console.log(txResult.data.toCborHex());
    }
  );

export default buyCommand;
