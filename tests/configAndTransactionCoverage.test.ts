import { ScriptType } from "@koralabs/kora-labs-common";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const importLoadConfig = async () => {
  vi.resetModules();
  return import("../src/config.js");
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.doUnmock("@helios-lang/uplc");
  vi.resetModules();
});

describe("top-level configuration loader", () => {
  it("returns the configured Blockfrost key with its derived network", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      BLOCKFROST_API_KEY: "previewabcdef",
      NODE_ENV: "test",
    };

    const { loadConfig } = await importLoadConfig();
    const result = loadConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        blockfrostApiKey: "previewabcdef",
        network: "preview",
      });
    }
  });

  it("rejects unsupported Blockfrost key network prefixes", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      BLOCKFROST_API_KEY: "privateabcdef",
      NODE_ENV: "test",
    };

    const { loadConfig } = await importLoadConfig();

    expect(() => loadConfig()).toThrow("Unknown network private");
  });
});

describe("deployed marketplace script metadata", () => {
  it("exposes the latest preview marketplace deployment by script address", async () => {
    const { deployedScripts } = await import("../src/deployed/index.js");
    const previewEntries = Object.entries(deployedScripts.preview ?? {});

    expect(previewEntries).toHaveLength(1);
    const [scriptAddress, details] = previewEntries[0];
    const handleNameHex = Buffer.from(details.handle, "utf8").toString("hex");

    expect(scriptAddress).toMatch(/^addr_test1/);
    expect(details.latest).toBe(true);
    expect(details.type).toBe(ScriptType.MARKETPLACE_CONTRACT);
    expect(details.handleHex).toBe(`000de140${handleNameHex}`);
    expect(details.refScriptAddress).toMatch(/^addr_test1/);
    expect(details.refScriptUtxo).toMatch(/#[0-9]+$/);
    expect(details.cbor.length).toBeGreaterThan(details.validatorHash.length);
    expect(details.unoptimizedCbor.length).toBeGreaterThan(details.cbor.length);
    expect(details.datumCbor.length).toBeGreaterThan(0);
  });
});

describe("transaction logger coverage", () => {
  it("builds transactions when the base UPLC logger has no reset hook", async () => {
    vi.resetModules();
    vi.doMock("@helios-lang/uplc", () => ({
      makeBasicUplcLogger: () => ({}),
    }));
    const { mayFailTransaction } = await import("../src/helpers/error/tx.js");
    const changeAddress = { label: "change-address" };
    const spareUtxos = [{ id: "spare-utxo" }];
    const dump = { body: "built-without-reset" };
    const tx = {
      hasValidationError: undefined,
      dump: () => dump,
    };
    const txBuilder = {
      buildUnsafe: vi.fn(async ({ logOptions }) => {
        expect("reset" in logOptions).toBe(false);
        logOptions.logPrint("captured without reset");
        return tx;
      }),
    };

    const result = await mayFailTransaction(
      txBuilder as any,
      changeAddress as any,
      spareUtxos as any
    ).complete();

    expect(txBuilder.buildUnsafe).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ tx, dump });
  });
});
