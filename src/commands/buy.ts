import { buy } from "../buy";
import program from "../cli";
import { loadConfig } from "../config";

import * as helios from "@koralabs/helios";

const buyCommand = program
  .command("buy")
  .description("Buy Handle NFT on Marketplace")
  .argument("<address>", "Address to perform buying")
  .argument("<utxo-tx-hash>", "Transaction Hash of UTxO where handle is")
  .argument("<utxo-tx-index>", "Transaction Index of UTxO where handle is")
  .action(async (bech32Address: string, txHash: string, txIndex: string) => {
    const configResult = loadConfig();
    if (!configResult.ok) return program.error(configResult.error);
    const config = configResult.data;

    const address = helios.Address.fromBech32(bech32Address);
    const txResult = await buy(
      config.blockfrostApiKey,
      address,
      txHash,
      parseInt(txIndex),
      config.paramters
    );

    if (!txResult.ok) return program.error(txResult.error);
    console.log("\nTransaction CBOR Hex, copy and paste to wallet\n");
    console.log(txResult.data.toCborHex());
  });

export default buyCommand;
