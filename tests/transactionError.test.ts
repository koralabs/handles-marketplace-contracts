import { describe, expect, it, vi } from "vitest";

import { mayFailTransaction } from "../src/helpers/index.js";
import { BuildTxError } from "../src/types.js";
import { bigIntMin } from "../src/utils/index.js";

describe("transaction error helpers", () => {
  const changeAddress = { label: "change-address" };
  const spareUtxos = [{ id: "spare-utxo" }];

  it("returns the built transaction and dump on success", async () => {
    const dump = { body: "built" };
    const tx = {
      hasValidationError: undefined,
      dump: () => dump,
    };
    const txBuilder = {
      buildUnsafe: vi.fn(async (options) => {
        expect(options.changeAddress).toBe(changeAddress);
        expect(options.spareUtxos).toBe(spareUtxos);
        expect(options.throwBuildPhaseScriptErrors).toBe(false);
        options.logOptions.logPrint("ignored success log");
        return tx;
      }),
    };

    const result = await mayFailTransaction(
      txBuilder as any,
      changeAddress as any,
      spareUtxos as any
    ).complete();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ tx, dump });
  });

  it("wraps validation failures with the failed transaction details", async () => {
    const handler = vi.fn();
    const tx = {
      hasValidationError: new Error("script failed"),
      dump: () => ({ failed: true }),
      toCbor: () => new Uint8Array([0xde, 0xad]),
    };
    const txBuilder = {
      buildUnsafe: vi.fn(async ({ logOptions }) => {
        logOptions.logPrint("first");
        logOptions.logPrint("second");
        logOptions.logPrint("third");
        return tx;
      }),
    };

    const result = await mayFailTransaction(
      txBuilder as any,
      changeAddress as any,
      spareUtxos as any
    )
      .handle(handler)
      .complete();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(BuildTxError);
      expect(result.error.message).toContain("script failed");
      expect(result.error.message).toContain("Log: first");
      expect(result.error.message).not.toContain("Log: third");
      expect(result.error.failedTxCbor).toBe("dead");
      expect(result.error.failedTxJson).toEqual({ failed: true });
    }
    expect(handler).toHaveBeenCalledWith(result.ok ? undefined : result.error);
  });

  it("uses the latest handler when transaction building throws", async () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const txBuilder = {
      buildUnsafe: vi.fn(async () => {
        throw new Error("missing inputs");
      }),
    };

    const result = await mayFailTransaction(
      txBuilder as any,
      changeAddress as any,
      spareUtxos as any
    )
      .handle(firstHandler)
      .handle(secondHandler)
      .complete();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("Tx Build Error: missing inputs");
    }
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it("exposes utility barrel exports used by consumers", () => {
    expect(bigIntMin(5n, 2n, 9n)).toBe(2n);
  });
});
