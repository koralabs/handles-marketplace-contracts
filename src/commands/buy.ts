import { buy, BuyConfig, buyWithAuth, BuyWithAuthConfig } from "../buy";
import program from "../cli";
import { loadConfig } from "../config";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";

program
  .command("buy")
  .description("Buy Handle NFT on Marketplace")
  .argument("<address>", "Address to perform buying")
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

      const buyConfig: BuyConfig = {
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

      const txResult = await buy(buyConfig, config.network);
      if (!txResult.ok) return program.error(txResult.error.message);
      console.log("\nTransaction CBOR Hex, copy and paste to wallet\n");
      console.log(txResult.data);
    }
  );

program
  .command("buy-with-auth")
  .description("Buy Handle NFT on Marketplace with Authorizer")
  .argument("<address>", "Address to perform buying")
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

      const buyWithAuthConfig: BuyWithAuthConfig = {
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
          datum: handleUtxo.output.datum?.toCborHex() || "",
          index: handleUtxo.outputId.utxoIdx,
          tx_id: handleUtxo.outputId.txId.hex,
          lovelace: Number(handleUtxo.output.value.lovelace),
        },
        authorizerPubKeyHash: config.paramters.authorizers[0],
      };

      const txResult = await buyWithAuth(buyWithAuthConfig, config.network);
      if (!txResult.ok) console.log(txResult.error);
      else console.log(txResult.data);
    }
  );
