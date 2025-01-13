import { bytesToHex } from "@helios-lang/codec-utils";
import { makeTxOutputId } from "@helios-lang/ledger";
import { Bip32PrivateKey } from "@helios-lang/tx-utils";
import { AssetNameLabel } from "@koralabs/kora-labs-common";
import { assert, describe } from "vitest";

import { buy, BuyConfig, buyWithAuth, BuyWithAuthConfig } from "../src/buy.js";
import { invariant } from "../src/helpers/index.js";
import { list, ListConfig } from "../src/list.js";
import { update, UpdateConfig } from "../src/update.js";
import { withdraw, WithdrawConfig } from "../src/withdraw.js";
import { myTest } from "./setup.js";

describe.sequential("Koralab Marketplace smart contract test", () => {
  myTest(
    "user_1 list <test> handle for 100 ada, 10% of it should go to user_3 as royalty",
    async ({
      emulator,
      user1Wallet,
      user3Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const userUtxos = await emulator.getUtxos(user1Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const listConfig: ListConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user1Wallet.address.toBech32(),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        payouts: [
          {
            address: user1Wallet.address.toBech32(),
            amountLovelace: 90_000_000n,
          },
          {
            address: user3Wallet.address.toBech32(),
            amountLovelace: 10_000_000n,
          },
        ],
        customRefScriptDetail: refScriptDetail,
      };
      const listTxResult = await list(listConfig, network);
      invariant(listTxResult.ok, "List Tx Failed");

      const { tx: listTx } = listTxResult.data;
      listTx.addSignatures(await user1Wallet.signTx(listTx));
      const txId = await user1Wallet.submitTx(listTx);
      emulator.tick(200);
      txOutputIds.listingTxOutputId = makeTxOutputId(txId, 0);
    }
  );

  myTest(
    "user_2 buy <test> handle",
    async ({
      emulator,
      parameters,
      user1Wallet,
      user2Wallet,
      user3Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const { listingTxOutputId } = txOutputIds;
      invariant(listingTxOutputId, "Listing is not happened");

      const listingUtxo = await emulator.getUtxo(listingTxOutputId);
      const userUtxos = await emulator.getUtxos(user2Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const buyConfig: BuyConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user2Wallet.address.toBech32(),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        listingCborUtxo: bytesToHex(listingUtxo.toCbor(true)),
        customRefScriptDetail: refScriptDetail,
      };
      const buyTxResult = await buy(buyConfig, network);
      invariant(buyTxResult.ok, "Buy Tx Failed");

      const { tx: buyTx } = buyTxResult.data;
      buyTx.addSignatures(await user2Wallet.signTx(buyTx));
      const txId = await user2Wallet.submitTx(buyTx);
      emulator.tick(200);

      const [marketplaceOutput, user1Output, user3Output] = await Promise.all([
        emulator.getUtxo(makeTxOutputId(txId, 0)),
        emulator.getUtxo(makeTxOutputId(txId, 1)),
        emulator.getUtxo(makeTxOutputId(txId, 2)),
      ]);

      assert(
        marketplaceOutput.address.toString() ===
          parameters.marketplaceAddress &&
          marketplaceOutput.value.lovelace >= (100_000_000n * 50n) / 49n / 50n,
        "Marketplace Fee Output is not valid"
      );
      assert(
        user1Output.address.toString() === user1Wallet.address.toString() &&
          user1Output.value.lovelace == 90_000_000n,
        "User_1 Output is not valid"
      );
      assert(
        user3Output.address.toString() === user3Wallet.address.toString() &&
          user3Output.value.lovelace == 10_000_000n,
        "User_3 Output is not valid"
      );

      txOutputIds.listingTxOutputId = undefined;
    }
  );

  myTest(
    "user_2 list <test> handle for 1000 ada, 10% of it should go to user_3 as royalty - (too expensive to buy)",
    async ({
      emulator,
      user2Wallet,
      user3Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const userUtxos = await emulator.getUtxos(user2Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const listConfig: ListConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user2Wallet.address.toBech32(),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        payouts: [
          {
            address: user2Wallet.address.toBech32(),
            amountLovelace: 900_000_000n,
          },
          {
            address: user3Wallet.address.toBech32(),
            amountLovelace: 100_000_000n,
          },
        ],
        customRefScriptDetail: refScriptDetail,
      };
      const listTxResult = await list(listConfig, network);
      invariant(listTxResult.ok, "List Tx Failed");

      const { tx: listTx } = listTxResult.data;
      listTx.addSignatures(await user2Wallet.signTx(listTx));
      const txId = await user2Wallet.submitTx(listTx);
      emulator.tick(200);
      txOutputIds.listingTxOutputId = makeTxOutputId(txId, 0);
    }
  );

  myTest(
    "user_4 fails to buy <test> handle, because that is too expensive",
    async ({
      emulator,
      user4Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const { listingTxOutputId } = txOutputIds;
      invariant(listingTxOutputId, "Listing is not happened");

      const listingUtxo = await emulator.getUtxo(listingTxOutputId);
      const userUtxos = await emulator.getUtxos(user4Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const buyConfig: BuyConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user4Wallet.address.toBech32(),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        listingCborUtxo: bytesToHex(listingUtxo.toCbor(true)),
        customRefScriptDetail: refScriptDetail,
      };
      const buyTxResult = await buy(buyConfig, network);
      invariant(!buyTxResult.ok);
      console.info("Error:", buyTxResult.error.message);
    }
  );

  myTest(
    "user_2 withdraw <test> handle - (because that is too expensive to buy)",
    async ({
      emulator,
      user2Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const { listingTxOutputId } = txOutputIds;
      invariant(listingTxOutputId, "Listing is not happened");

      const listingUtxo = await emulator.getUtxo(listingTxOutputId);
      const userUtxos = await emulator.getUtxos(user2Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const withdrawConfig: WithdrawConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user2Wallet.address.toBech32(),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        listingCborUtxo: bytesToHex(listingUtxo.toCbor(true)),
        customRefScriptDetail: refScriptDetail,
      };
      const withdrawTxResult = await withdraw(withdrawConfig, network);
      invariant(withdrawTxResult.ok, "Withdraw Tx Failed");

      const { tx: withdrawTx } = withdrawTxResult.data;
      withdrawTx.addSignatures(await user2Wallet.signTx(withdrawTx));
      await user2Wallet.submitTx(withdrawTx);
      emulator.tick(200);
      txOutputIds.listingTxOutputId = undefined;
    }
  );

  myTest(
    "user_2 list <test> handle for 200 ada, so others can buy it. 10% of which should go to user_3 as royalty",
    async ({
      emulator,
      user2Wallet,
      user3Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const userUtxos = await emulator.getUtxos(user2Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const listConfig: ListConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user2Wallet.address.toBech32(),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        payouts: [
          {
            address: user2Wallet.address.toBech32(),
            amountLovelace: 180_000_000n,
          },
          {
            address: user3Wallet.address.toBech32(),
            amountLovelace: 20_000_000n,
          },
        ],
        customRefScriptDetail: refScriptDetail,
      };
      const listTxResult = await list(listConfig, network);
      invariant(listTxResult.ok, "List Tx Failed");

      const { tx: listTx } = listTxResult.data;
      listTx.addSignatures(await user2Wallet.signTx(listTx));
      const txId = await user2Wallet.submitTx(listTx);
      emulator.tick(200);
      txOutputIds.listingTxOutputId = makeTxOutputId(txId, 0);
    }
  );

  myTest(
    "user_1 buy <test> handle using authorizer, so it doesn't pay marketplace fee",
    async ({
      emulator,
      parameters,
      user1Wallet,
      user2Wallet,
      user3Wallet,
      authorizersPrivateKeys,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const { listingTxOutputId } = txOutputIds;
      invariant(listingTxOutputId, "Listing is not happened");

      const listingUtxo = await emulator.getUtxo(listingTxOutputId);
      const userUtxos = await emulator.getUtxos(user1Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const buyWithAuthConfig: BuyWithAuthConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user1Wallet.address.toBech32(),
        authorizerPubKeyHash: parameters.authorizers[0],
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        listingCborUtxo: bytesToHex(listingUtxo.toCbor(true)),
        customRefScriptDetail: refScriptDetail,
      };
      const buyTxResult = await buyWithAuth(buyWithAuthConfig, network);
      invariant(buyTxResult.ok, "Buy Tx Failed");

      const { tx: buyTx } = buyTxResult.data;

      // sign with authorizer private key
      const authorizerPrivateKey = authorizersPrivateKeys[0] as Bip32PrivateKey;
      buyTx.addSignatures([
        ...(await user1Wallet.signTx(buyTx)),
        authorizerPrivateKey.sign(buyTx.body.hash()),
      ]);
      const txId = await user1Wallet.submitTx(buyTx);
      emulator.tick(200);

      const [user2Output, user3Output] = await Promise.all([
        emulator.getUtxo(makeTxOutputId(txId, 0)),
        emulator.getUtxo(makeTxOutputId(txId, 1)),
      ]);

      assert(
        user2Output.address.toString() === user2Wallet.address.toString() &&
          user2Output.value.lovelace == 180_000_000n,
        "User_2 Output is not valid"
      );
      assert(
        user3Output.address.toString() === user3Wallet.address.toString() &&
          user3Output.value.lovelace == 20_000_000n,
        "User_3 Output is not valid"
      );

      txOutputIds.listingTxOutputId = undefined;
    }
  );

  myTest(
    "user_1 list <test> handle for 200 ada, 10% of it should go to user_3 as royalty",
    async ({
      emulator,
      user1Wallet,
      user3Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const userUtxos = await emulator.getUtxos(user1Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const listConfig: ListConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user1Wallet.address.toBech32(),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        payouts: [
          {
            address: user1Wallet.address.toBech32(),
            amountLovelace: 180_000_000n,
          },
          {
            address: user3Wallet.address.toBech32(),
            amountLovelace: 20_000_000n,
          },
        ],
        customRefScriptDetail: refScriptDetail,
      };
      const listTxResult = await list(listConfig, network);
      invariant(listTxResult.ok, "List Tx Failed");

      const { tx: listTx } = listTxResult.data;
      listTx.addSignatures(await user1Wallet.signTx(listTx));
      const txId = await user1Wallet.submitTx(listTx);
      emulator.tick(200);
      txOutputIds.listingTxOutputId = makeTxOutputId(txId, 0);
    }
  );

  myTest(
    "user_1 update <test> handle price to 50 ada, 10% of it should go to user_3 as royalty",
    async ({
      emulator,
      user1Wallet,
      user3Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const { listingTxOutputId } = txOutputIds;
      invariant(listingTxOutputId, "Listing is not happened");

      const listingUtxo = await emulator.getUtxo(listingTxOutputId);
      const userUtxos = await emulator.getUtxos(user1Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const updateConfig: UpdateConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user1Wallet.address.toBech32(),
        listingCborUtxo: bytesToHex(listingUtxo.toCbor(true)),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        newPayouts: [
          {
            address: user1Wallet.address.toBech32(),
            amountLovelace: 45_000_000n,
          },
          {
            address: user3Wallet.address.toBech32(),
            amountLovelace: 5_000_000n,
          },
        ],
        customRefScriptDetail: refScriptDetail,
      };
      const updateTxResult = await update(updateConfig, network);
      invariant(updateTxResult.ok, "Update Tx Failed");

      const { tx: updateTx } = updateTxResult.data;
      updateTx.addSignatures(await user1Wallet.signTx(updateTx));
      const txId = await user1Wallet.submitTx(updateTx);
      emulator.tick(200);
      txOutputIds.listingTxOutputId = makeTxOutputId(txId, 0);
    }
  );

  myTest(
    "user_4 buy <test> handle",
    async ({
      emulator,
      parameters,
      user1Wallet,
      user4Wallet,
      user3Wallet,
      testHandleName,
      network,
      refScriptDetail,
      txOutputIds,
    }) => {
      const { listingTxOutputId } = txOutputIds;
      invariant(listingTxOutputId, "Listing is not happened");

      const listingUtxo = await emulator.getUtxo(listingTxOutputId);
      const userUtxos = await emulator.getUtxos(user4Wallet.address);
      const userCborUtxos = userUtxos.map((utxo) =>
        bytesToHex(utxo.toCbor(true))
      );
      const buyConfig: BuyConfig = {
        cborUtxos: userCborUtxos,
        changeBech32Address: user4Wallet.address.toBech32(),
        handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
        listingCborUtxo: bytesToHex(listingUtxo.toCbor(true)),
        customRefScriptDetail: refScriptDetail,
      };
      const buyTxResult = await buy(buyConfig, network);
      invariant(buyTxResult.ok, "Buy Tx Failed");

      const { tx: buyTx } = buyTxResult.data;
      buyTx.addSignatures(await user4Wallet.signTx(buyTx));
      const txId = await user4Wallet.submitTx(buyTx);
      emulator.tick(200);

      const [marketplaceOutput, user1Output, user3Output] = await Promise.all([
        emulator.getUtxo(makeTxOutputId(txId, 0)),
        emulator.getUtxo(makeTxOutputId(txId, 1)),
        emulator.getUtxo(makeTxOutputId(txId, 2)),
      ]);

      assert(
        marketplaceOutput.address.toString() ===
          parameters.marketplaceAddress &&
          marketplaceOutput.value.lovelace >= (50_000_000n * 50n) / 49n / 50n,
        "Marketplace Fee Output is not valid"
      );
      assert(
        user1Output.address.toString() === user1Wallet.address.toString() &&
          user1Output.value.lovelace == 45_000_000n,
        "User_1 Output is not valid"
      );
      assert(
        user3Output.address.toString() === user3Wallet.address.toString() &&
          user3Output.value.lovelace == 5_000_000n,
        "User_3 Output is not valid"
      );

      txOutputIds.listingTxOutputId = undefined;
    }
  );
});
