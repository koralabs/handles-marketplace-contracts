// Behavior of deploy() when given a seed and a chain client: it signs, submits, waits for the deployed
// reference-script output and records the ScriptDetails file that later list/buy/update/withdraw read.
import { bytesToHex } from "@helios-lang/codec-utils";
import { makeAssets } from "@helios-lang/ledger";
import { Emulator, makeSimpleWallet, restoreRootPrivateKey, SimpleWallet } from "@helios-lang/tx-utils";
import { AssetNameLabel, ScriptType } from "@koralabs/kora-labs-common";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, vi } from "vitest";

import { HANDLE_POLICY_ID } from "../src/constants/index.js";
import { deploy } from "../src/deploy.js";
import { myTest } from "./setup.js";

const SEED = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
const HANDLE = "mp_contract";

describe.sequential("deploy with a seed", () => {
  const cwd = process.cwd();
  afterEach(() => {
    vi.useRealTimers();
    process.chdir(cwd);
  });

  const seedWallet = (emulator: Parameters<typeof makeSimpleWallet>[1]) =>
    makeSimpleWallet(restoreRootPrivateKey(SEED.split(" ")), emulator);

  const fund = (emulator: Emulator, wallet: SimpleWallet, withHandle: boolean) => {
    if (withHandle) {
      emulator.createUtxo(wallet, 5_000_000n, makeAssets([[HANDLE_POLICY_ID, [[`${AssetNameLabel.LBL_222}${Buffer.from(HANDLE, "utf8").toString("hex")}`, 1n]]]]));
    }
    emulator.createUtxo(wallet, 500_000_000n);
    emulator.tick(200);
  };

  // Invariant: a seeded deploy lands the contract on chain at output #0 and writes a ScriptDetails file pointing at exactly that output.
  // Negative control: pointing refScriptUtxo at another output index (or skipping the write) fails the file assertions.
  myTest("submits, waits through a not-yet-visible output, and saves the deployed script details", async ({ emulator, parameters, network }) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mkt-deploy-"));
    process.chdir(dir);
    const wallet = seedWallet(emulator);
    fund(emulator, wallet, true);

    // The chain client first reports the new output as missing (indexer lag), then returns it.
    let lookups = 0;
    const client = new Proxy(emulator, {
      get: (target, prop, receiver) => {
        if (prop === "getUtxo") {
          return async (id: Parameters<Emulator["getUtxo"]>[0]) => {
            if (lookups++ === 0) throw new Error("not found yet");
            return target.getUtxo(id);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const utxos = (await emulator.getUtxos(wallet.address)).map((u) => bytesToHex(u.toCbor(true)));
    const pending = deploy(
      { handleName: HANDLE, changeBech32Address: wallet.address.toBech32(), cborUtxos: utxos, parameters, seed: SEED },
      network,
      client
    );
    await vi.advanceTimersByTimeAsync(10_000);
    // The emulator only confirms a submitted tx after a tick.
    emulator.tick(200);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(lookups).toBeGreaterThanOrEqual(2);

    const saved = JSON.parse(await fs.readFile(path.join(dir, `${network}-deployed.json`), "utf8"));
    expect(saved).toMatchObject({
      handle: HANDLE,
      handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(HANDLE, "utf8").toString("hex")}`,
      type: ScriptType.MARKETPLACE_CONTRACT,
      latest: true,
      txBuildVersion: 1,
    });
    expect(saved.refScriptUtxo).toMatch(/^[0-9a-f]{64}#0$/);
    expect(saved.refScriptAddress).toMatch(/^addr_test1/);
    expect(saved.cbor).toBeTruthy();
    expect(saved.datumCbor).toBeTruthy();
    expect(saved.validatorHash).toMatch(/^[0-9a-f]{56}$/);
    await fs.rm(dir, { recursive: true });
  });

  // Invariant: with no seed the deploy only builds the transaction and never submits or writes files.
  myTest("returns the unsigned transaction and writes nothing when no seed is given", async ({ emulator, parameters, network }) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mkt-deploy-"));
    process.chdir(dir);
    const wallet = seedWallet(emulator);
    fund(emulator, wallet, true);
    const utxos = (await emulator.getUtxos(wallet.address)).map((u) => bytesToHex(u.toCbor(true)));
    const result = await deploy({ handleName: HANDLE, changeBech32Address: wallet.address.toBech32(), cborUtxos: utxos, parameters }, network);
    expect(result.ok && typeof result.data === "object").toBe(true);
    expect(await fs.readdir(dir)).toEqual([]);
    await fs.rm(dir, { recursive: true });
  });
});
