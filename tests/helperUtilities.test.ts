import { bytesToHex } from "@helios-lang/codec-utils";
import { makeAddress } from "@helios-lang/ledger";
import { makeRandomBip32PrivateKey } from "@helios-lang/tx-utils";
import { makeConstrData } from "@helios-lang/uplc";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getBlockfrostApi } from "../src/helpers/blockfrost/api.js";
import { getNetwork } from "../src/helpers/blockfrost/network.js";
import { get, has, loadEnv } from "../src/helpers/config/index.js";
import {
  bigIntMax,
  bigIntMin,
  convertTxInputToIUTxO,
  makeListingTxInputFromListingIUTxO,
  sleep,
} from "../src/utils/common.js";
import { fetchNetworkParameters } from "../src/utils/contract.js";

const ORIGINAL_ENV = { ...process.env };

const makeTestAddress = (): string =>
  makeAddress(false, makeRandomBip32PrivateKey().derivePubKey().hash()).toBech32();

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("configuration helpers", () => {
  it("loads dotenv files and reads typed env values", () => {
    const dir = mkdtempSync(join(tmpdir(), "marketplace-config-"));
    const envPath = join(dir, ".env.test");
    writeFileSync(envPath, "MARKETPLACE_LABEL=preview\nMARKETPLACE_TIMEOUT=42\n");

    loadEnv({ path: envPath });

    expect(has("MARKETPLACE_LABEL")).toBe(true);
    const label = get("MARKETPLACE_LABEL", "string");
    expect(label.ok && label.data).toBe("preview");
    const timeout = get("MARKETPLACE_TIMEOUT", "number");
    expect(timeout.ok && timeout.data).toBe(42);

    rmSync(dir, { recursive: true, force: true });
  });

  it("returns explicit errors for missing or invalid env values", () => {
    delete process.env.MARKETPLACE_TIMEOUT;
    expect(get("MARKETPLACE_TIMEOUT", "string")).toMatchObject({
      ok: false,
      error: "MARKETPLACE_TIMEOUT is not set.",
    });

    process.env.MARKETPLACE_TIMEOUT = "not-a-number";
    expect(get("MARKETPLACE_TIMEOUT", "number")).toMatchObject({
      ok: false,
      error: "MARKETPLACE_TIMEOUT in env is not number type.",
    });
  });
});

describe("blockfrost network helpers", () => {
  it("detects supported Blockfrost networks from key prefixes", () => {
    expect(getNetwork("mainnetabcdef")).toBe("mainnet");
    expect(getNetwork("previewabcdef")).toBe("preview");
    expect(getNetwork("preprodabcdef")).toBe("preprod");
  });

  it("rejects unsupported prefixes before constructing a client", () => {
    expect(() => getNetwork("privateabcdef")).toThrow("Unknown network private");
    expect(() => getBlockfrostApi("privateabcdef")).toThrow(
      "Unknown network private"
    );
  });
});

describe("common utility helpers", () => {
  it("finds bigint bounds across positive and negative values", () => {
    expect(bigIntMin(7n, -2n, 5n, 0n)).toBe(-2n);
    expect(bigIntMax(7n, -2n, 5n, 0n)).toBe(7n);
  });

  it("resolves sleep after the requested timer delay", async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const promise = sleep(25).then(settled);

    await vi.advanceTimersByTimeAsync(24);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("round-trips listing IUTxOs through TxInput conversion", () => {
    const listing = {
      address: makeTestAddress(),
      tx_id: "ab".repeat(32),
      index: 3,
      lovelace: 3_500_000,
      datum: bytesToHex(makeConstrData(0, []).toCbor()),
    };
    const handleHex = Buffer.from("test", "utf8").toString("hex");

    const txInput = makeListingTxInputFromListingIUTxO(listing, handleHex);
    expect(convertTxInputToIUTxO(txInput)).toEqual(listing);

    const withoutDatum = { ...listing, datum: undefined };
    const txInputWithoutDatum = makeListingTxInputFromListingIUTxO(
      withoutDatum,
      handleHex
    );
    expect(convertTxInputToIUTxO(txInputWithoutDatum)).toEqual(withoutDatum);
  });
});

describe("contract utility helpers", () => {
  it("fetches network parameters from the Helios status endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ maxTxSize: 16_384 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNetworkParameters("preview");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://network-status.helios-lang.io/preview/config"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ maxTxSize: 16_384 });
  });

  it("wraps network parameter fetch failures as Result errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("status offline");
      })
    );

    const result = await fetchNetworkParameters("preprod");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("status offline");
  });
});
