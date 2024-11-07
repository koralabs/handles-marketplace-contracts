import { loadConfig } from "../../src/config";
import { withdraw, WithdrawConfig } from "../../src/withdraw";

import program from "./cli";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";

const withdrawCommand = program
  .command("withdraw")
  .description("Withdraw Handle NFT from Marketplace")
  .argument("<address>", "Address to perform withdraw")
  .argument("<handle-name>", "Ada Handle Name to buy on marketplace")
  .argument("<utxo-tx-hash>", "Transaction Hash of UTxO where handle is")
  .argument("<utxo-tx-index>", "Transaction Index of UTxO where handle is")
  .action(
    async (
      bech32Address: string,
      handleName: string,
      txHash: string,
      txIndex: string
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

      const withdrawConfig: WithdrawConfig = {
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
      };

      const txResult = await withdraw(withdrawConfig, config.network);
      if (!txResult.ok) console.log(txResult.error);
      else console.log(txResult.data);
    }
  );

export default withdrawCommand;
