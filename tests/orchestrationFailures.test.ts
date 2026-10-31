// Behavior of list/withdraw/update/deploy when the caller or the deployed-script metadata is wrong:
// each must refuse with a specific error instead of building a transaction that could mis-spend a handle.
import { bytesToHex } from "@helios-lang/codec-utils";
import { makeAddress, makeTxOutputId } from "@helios-lang/ledger";
import { AssetNameLabel } from "@koralabs/kora-labs-common";
import { describe, expect } from "vitest";

import { buy, buyWithAuth } from "../src/buy.js";
import { deploy } from "../src/deploy.js";
import { invariant } from "../src/helpers/index.js";
import { list } from "../src/list.js";
import { update } from "../src/update.js";
import { convertTxInputToIUTxO } from "../src/utils/index.js";
import { withdraw } from "../src/withdraw.js";
import { myTest } from "./setup.js";

const errorOf = (r: { ok: boolean; error?: unknown }) =>
  r.ok ? "OK" : (r.error as Error).message;

describe.sequential("marketplace orchestration refusals", () => {
  myTest(
    "refuses broken deployed-script metadata and non-owners for list, withdraw and update",
    async ({
      emulator,
      user1Wallet,
      user2Wallet,
      testHandleName,
      network,
      parameters,
      refScriptDetail,
      txOutputIds,
    }) => {
      const cbors = async (w: typeof user1Wallet) =>
        (await emulator.getUtxos(w.address)).map((u) => bytesToHex(u.toCbor(true)));
      const handleHex = `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`;
      const payouts = [
        { address: user1Wallet.address.toBech32(), amountLovelace: 100_000_000n },
      ];
      const user1Utxos = await cbors(user1Wallet);
      const user2Utxos = await cbors(user2Wallet);
      const listCfg = (over = {}, utxos = user1Utxos) => ({
        cborUtxos: utxos,
        changeBech32Address: user1Wallet.address.toBech32(),
        handleHex,
        payouts,
        customRefScriptDetail: refScriptDetail,
        ...over,
      });

      // --- list
      expect(errorOf(await list(listCfg({ customRefScriptDetail: { ...refScriptDetail, cbor: undefined } }), network))).toBe("Deploy script cbor is empty");
      expect(errorOf(await list(listCfg({ customRefScriptDetail: { ...refScriptDetail, datumCbor: undefined } }), network))).toBe("Deploy script's datum cbor is empty");
      expect(errorOf(await list(listCfg({ customRefScriptDetail: { ...refScriptDetail, refScriptUtxo: undefined } }), network))).toBe("Deployed script UTxO is not defined");
      expect(errorOf(await list(listCfg({}, user2Utxos), network))).toBe("You don't have listing handle");
      expect(errorOf(await list(listCfg({ customRefScriptDetail: { ...refScriptDetail, cbor: "zz" } }), network))).toMatch(/^Decoding Uplc Program error/);

      expect(errorOf(await list(listCfg({ customRefScriptDetail: { ...refScriptDetail, datumCbor: "zz" } }), network))).toMatch(/^Deployed script's datum cbor is invalid/);
      // a real listing to withdraw/update against
      const listed = await list(listCfg(), network);
      invariant(listed.ok, "List Tx Failed");
      listed.data.tx.addSignatures(await user1Wallet.signTx(listed.data.tx));
      const txId = await user1Wallet.submitTx(listed.data.tx);
      emulator.tick(200);
      txOutputIds.listingTxOutputId = makeTxOutputId(txId, 0);
      const listingIUtxo = convertTxInputToIUTxO(await emulator.getUtxo(txOutputIds.listingTxOutputId));

      const ownerUtxos = await cbors(user1Wallet);

      // --- buy and buyWithAuth (same refusals)
      const bCfg = (over = {}) => ({
        cborUtxos: user2Utxos,
        changeBech32Address: user2Wallet.address.toBech32(),
        handleHex,
        listingIUtxo,
        customRefScriptDetail: refScriptDetail,
        ...over,
      });
      const authCfg = (over = {}) => bCfg({ authorizerPubKeyHash: parameters.authorizers[0], ...over });
      expect(errorOf(await buyWithAuth(authCfg({ authorizerPubKeyHash: "00".repeat(28) }) as never, network))).toBe("Authorizer's PubKey Hash is not correct");
      for (const [name, fn, cfg] of [
        ["buy", (c: never) => buy(c, network), bCfg],
        ["buyWithAuth", (c: never) => buyWithAuth(c, network), authCfg],
      ] as const) {
        const run = async (over = {}) => errorOf(await fn(cfg(over) as never));
        expect(await run({ customRefScriptDetail: { ...refScriptDetail, cbor: undefined } }), name).toBe("Deploy script cbor is empty");
        expect(await run({ customRefScriptDetail: { ...refScriptDetail, datumCbor: undefined } }), name).toBe("Deploy script's datum cbor is empty");
        expect(await run({ customRefScriptDetail: { ...refScriptDetail, refScriptUtxo: undefined } }), name).toBe("Deployed script UTxO is not defined");
        expect(await run({ customRefScriptDetail: { ...refScriptDetail, datumCbor: "zz" } }), name).toMatch(/^Deployed script's datum cbor is invalid/);
        expect(await run({ customRefScriptDetail: { ...refScriptDetail, cbor: "zz" } }), name).toMatch(/^Decoding Uplc Program error/);
        expect(await run({ customRefScriptDetail: { ...refScriptDetail, unoptimizedCbor: "zz" } }), name).toMatch(/^Decoding Unoptimized Uplc Program error/);
        expect(await run({ listingIUtxo: { ...listingIUtxo, datum: undefined } }), name).toBe("Listing UTxO datum not found");
        expect(await run({ listingIUtxo: { ...listingIUtxo, datum: "00" } }), name).toMatch(/^Decoding Datum Cbor error/);
      }

      // --- withdraw
      const wCfg = (over = {}) => ({
        cborUtxos: user2Utxos,
        changeBech32Address: user2Wallet.address.toBech32(),
        handleHex,
        listingIUtxo,
        customRefScriptDetail: refScriptDetail,
        ...over,
      });
      expect(errorOf(await withdraw(wCfg(), network))).toBe("Must be owner to withdraw");
      expect(errorOf(await withdraw(wCfg({ listingIUtxo: { ...listingIUtxo, datum: undefined } }), network))).toBe("Listing UTxO datum not found");
      expect(errorOf(await withdraw(wCfg({ listingIUtxo: { ...listingIUtxo, datum: "00" } }), network))).toMatch(/^Decoding Datum Cbor error/);
      expect(errorOf(await withdraw(wCfg({ customRefScriptDetail: { ...refScriptDetail, cbor: undefined } }), network))).toBe("Deploy script cbor is empty");
      expect(errorOf(await withdraw(wCfg({ customRefScriptDetail: { ...refScriptDetail, datumCbor: undefined } }), network))).toBe("Deploy script's datum cbor is empty");
      expect(errorOf(await withdraw(wCfg({ customRefScriptDetail: { ...refScriptDetail, refScriptAddress: undefined } }), network))).toBe("Deployed script UTxO is not defined");
      expect(errorOf(await withdraw(wCfg({ customRefScriptDetail: { ...refScriptDetail, cbor: "zz" } }), network))).toMatch(/^Decoding Uplc Program error/);
      expect(errorOf(await withdraw(wCfg({ customRefScriptDetail: { ...refScriptDetail, unoptimizedCbor: "zz" } }), network))).toMatch(/^Decoding Unoptimized Uplc Program error/);
      expect(errorOf(await withdraw(wCfg({ changeBech32Address: user1Wallet.address.toBech32(), cborUtxos: ownerUtxos }), network))).toBe("OK");

      // --- update
      const uCfg = (over = {}) => ({
        cborUtxos: user2Utxos,
        changeBech32Address: user2Wallet.address.toBech32(),
        handleHex,
        listingIUtxo,
        newPayouts: payouts,
        customRefScriptDetail: refScriptDetail,
        ...over,
      });
      expect(errorOf(await update(uCfg(), network))).toBe("Must be owner to withdraw");
      expect(errorOf(await update(uCfg({ listingIUtxo: { ...listingIUtxo, datum: undefined } }), network))).toBe("Listing UTxO datum not found");
      expect(errorOf(await update(uCfg({ listingIUtxo: { ...listingIUtxo, datum: "00" } }), network))).toMatch(/^Decoding Datum Cbor error/);
      expect(errorOf(await update(uCfg({ customRefScriptDetail: { ...refScriptDetail, cbor: undefined } }), network))).toBe("Deploy script cbor is empty");
      expect(errorOf(await update(uCfg({ customRefScriptDetail: { ...refScriptDetail, datumCbor: undefined } }), network))).toBe("Deploy script's datum cbor is empty");
      expect(errorOf(await update(uCfg({ customRefScriptDetail: { ...refScriptDetail, refScriptUtxo: undefined } }), network))).toBe("Deployed script UTxO is not defined");
      expect(errorOf(await update(uCfg({ customRefScriptDetail: { ...refScriptDetail, cbor: "zz" } }), network))).toMatch(/^Decoding Uplc Program error/);
      expect(errorOf(await update(uCfg({ customRefScriptDetail: { ...refScriptDetail, refScriptAddress: undefined } }), network))).toBe("Deployed script UTxO is not defined");
      expect(errorOf(await update(uCfg({ customRefScriptDetail: { ...refScriptDetail, unoptimizedCbor: "zz" } }), network))).toMatch(/^Decoding Unoptimized Uplc Program error/);
      expect(errorOf(await update(uCfg({ changeBech32Address: user1Wallet.address.toBech32(), cborUtxos: ownerUtxos }), network))).toBe("OK");
    }
  );

  myTest(
    "deploy refuses a wallet without the handle and a script-credential change address",
    async ({ emulator, user2Wallet, fundWallet, parameters, network }) => {
      const cfg = (changeBech32Address: string, cborUtxos: string[]) => ({
        handleName: "mp_contract",
        changeBech32Address,
        cborUtxos,
        parameters,
      });
      const u2 = (await emulator.getUtxos(user2Wallet.address)).map((u) => bytesToHex(u.toCbor(true)));
      const fund = (await emulator.getUtxos(fundWallet.address)).map((u) => bytesToHex(u.toCbor(true)));
      expect(errorOf(await deploy(cfg(user2Wallet.address.toBech32(), u2), network) as never)).toBe("You don't have $mp_contract handle");
      const scriptAddr = makeAddress(
        "addr_test1wqrtsp2yrgyzphvvqhvemg6ntmlvu3jj5kwecxvn5dex53sjrmm36"
      ).toBech32();
      expect(errorOf(await deploy(cfg(scriptAddr, fund), network) as never)).toBe("Must be Base wallet to deploy");
    }
  );
});
