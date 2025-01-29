import { bytesToHex } from "@helios-lang/codec-utils";
import { makeAddress, makeTxOutputId } from "@helios-lang/ledger";
import { makeBlockfrostV0Client } from "@helios-lang/tx-utils";
import { AssetNameLabel } from "@koralabs/kora-labs-common";

import { loadConfig } from "../../src/config.js";
import { update, UpdateConfig } from "../../src/update.js";
import { convertTxInputToIUTxO } from "../../src/utils/index.js";
import program from "../cli.js";
import { adaToLovelace } from "../utils.js";

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

      const api = makeBlockfrostV0Client(
        config.network,
        config.blockfrostApiKey
      );
      const utxos = await api.getUtxos(makeAddress(bech32Address));
      const listingUtxo = await api.getUtxo(
        makeTxOutputId(`${txHash}#${txIndex}`)
      );

      const updateConfig: UpdateConfig = {
        changeBech32Address: bech32Address,
        cborUtxos: utxos.map((utxo) => bytesToHex(utxo.toCbor(true))),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(
          handleName,
          "utf8"
        ).toString("hex")}`,
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
        listingIUtxo: convertTxInputToIUTxO(listingUtxo),
      };

      const txResult = await update(updateConfig, config.network);
      if (!txResult.ok) console.log(txResult.error);
      else {
        console.log("Tx CBOR is: ");
        console.log(bytesToHex(txResult.data.tx.toCbor()));
        console.log("Tx Dump is: ");
        console.log(txResult.data.dump);
      }
    }
  );

export default updateCommand;
