import { describe, expect, it, vi } from "vitest";

import { invariant } from "../src/helpers/common/invariant.js";
import convertError from "../src/helpers/error/convert.js";
import { mayFail } from "../src/helpers/error/handleable.js";
import { mayFailAsync } from "../src/helpers/error/handleableAsync.js";

describe("error and invariant helpers", () => {
  it("invariant does not throw when condition is truthy", () => {
    expect(() => invariant(true, "should pass")).not.toThrow();
  });

  it("invariant throws with base prefix when message is missing", () => {
    expect(() => invariant(false)).toThrow("Invariant failed");
  });

  it("invariant supports string and function messages", () => {
    expect(() => invariant(false, "custom")).toThrow("Invariant failed: custom");
    expect(() => invariant(false, () => "from-fn")).toThrow(
      "Invariant failed: from-fn"
    );
  });

  it("convertError handles undefined, strings, and message objects", () => {
    expect(convertError(undefined)).toBe("undefined");
    expect(convertError("plain")).toBe("plain");
    expect(convertError({ message: "boom" })).toBe("boom");
  });

  it("convertError stringifies complex values and falls back when stringify fails", () => {
    expect(convertError({ value: 42 })).toContain('"value":42');
    expect(convertError(1n)).toBe("1");
  });

  it("mayFail returns Ok on success and Err on failure", () => {
    const success = mayFail(() => 7);
    expect(success.ok).toBe(true);
    if (success.ok) expect(success.data).toBe(7);

    const handler = vi.fn();
    const failure = mayFail(() => {
      throw new Error("failed-sync");
    }).handle(handler);

    expect(failure.ok).toBe(false);
    if (!failure.ok) expect(failure.error).toBe("failed-sync");
    expect(handler).toHaveBeenCalledWith("failed-sync");
  });

  it("mayFailAsync resolves Ok on success", async () => {
    const result = await mayFailAsync(async () => "done").complete();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe("done");
  });

  it("mayFailAsync handles errors with latest registered handler", async () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const result = await mayFailAsync(async () => {
      throw new Error("failed-async");
    })
      .handle(firstHandler)
      .handle(secondHandler)
      .complete();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("failed-async");
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith("failed-async");
  });
});

