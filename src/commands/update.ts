import program from "../cli";
import { loadConfig } from "../config";
import { invariant } from "../helpers";
import { update } from "../update";
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

      const address = helios.Address.fromBech32(bech32Address);
      const newCreatorAddress = helios.Address.fromBech32(
        newCreatorBech32Address
      );
      invariant(address.pubKeyHash, "Address is invalid");

      const txResult = await update(
        config.blockfrostApiKey,
        address,
        txHash,
        parseInt(txIndex),
        [
          {
            address,
            amountLovelace: adaToLovelace(Number(newPriceString) * 0.9),
          },
          {
            address: newCreatorAddress,
            amountLovelace: adaToLovelace(Number(newPriceString) * 0.1),
          },
        ],
        address.pubKeyHash,
        config.paramters
      );

      if (!txResult.ok) return program.error(txResult.error);
      console.log("\nTransaction CBOR Hex, copy and paste to wallet\n");
      console.log(txResult.data.toCborHex());
    }
  );

export default updateCommand;
