import { Command } from "commander";
import Enquirer from "enquirer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { adaToLovelace, getSeed } from "../CLI/utils.js";

const makeProgram = (): Command =>
  new Command().exitOverride().configureOutput({ writeErr: () => {} });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CLI ADA amounts", () => {
  // Amounts preserve whole lovelace and discard fractional lovelace.
  // Using number multiplication loses large-amount precision; rounding increases fractional amounts.
  it.each([
    { ada: 0, lovelace: 0n },
    { ada: 1, lovelace: 1_000_000n },
    { ada: 0.123456, lovelace: 123_456n },
    { ada: 0.0000009, lovelace: 0n },
    { ada: 1.0000019, lovelace: 1_000_001n },
    { ada: 0.1 + 0.2, lovelace: 300_000n },
    { ada: 10_000_000_000.123457, lovelace: 10_000_000_000_123_457n },
  ])("converts $ada ADA to $lovelace lovelace", ({ ada, lovelace }) => {
    expect(adaToLovelace(ada)).toBe(lovelace);
  });

  // Non-finite amounts cannot become transaction quantities.
  // Returning a default quantity instead of rejecting would fail these assertions.
  it.each([NaN, Infinity, -Infinity])("rejects non-finite ADA %s", (ada) => {
    expect(() => adaToLovelace(ada)).toThrow();
  });
});

describe("CLI funding wallet seed", () => {
  // A supplied seed is returned unchanged without opening an interactive prompt.
  // Removing the supplied-seed fast path or trimming it would fail these cases.
  it.each(["test wallet seed phrase", "  supplied seed phrase  "])(
    "uses the supplied seed %j",
    async (seed) => {
      const prompt = vi
        .spyOn(Enquirer.prototype, "prompt")
        .mockRejectedValue(new Error("unexpected interactive prompt"));

      await expect(getSeed(makeProgram(), seed)).resolves.toBe(seed);
      expect(prompt).not.toHaveBeenCalled();
    }
  );

  // Missing or empty seed options request a password and return trimmed input.
  // Skipping the prompt, changing it to visible input, or removing trim breaks this test.
  it.each([undefined, ""])(
    "prompts when the seed option is %j",
    async (seed) => {
      const prompt = vi
        .spyOn(Enquirer.prototype, "prompt")
        .mockResolvedValue({ seed: " \n test wallet seed phrase \t " });

      await expect(getSeed(makeProgram(), seed)).resolves.toBe(
        "test wallet seed phrase"
      );
      expect(prompt).toHaveBeenCalledOnce();
      expect(prompt).toHaveBeenCalledWith({
        type: "password",
        name: "seed",
        message: "Enter seed phrase for funding wallet:\n",
      });
    }
  );

  // Malformed prompt answers stop the CLI with an actionable error.
  // Removing any seed field/type/blank check would return data or a different error.
  it.each([
    { label: "missing seed", response: {} },
    { label: "empty seed", response: { seed: "" } },
    { label: "blank seed", response: { seed: " \n\t " } },
    { label: "numeric seed", response: { seed: 42 } },
    { label: "null seed", response: { seed: null } },
  ])("rejects a $label answer", async ({ response }) => {
    vi.spyOn(Enquirer.prototype, "prompt").mockResolvedValue(response);

    await expect(getSeed(makeProgram())).rejects.toMatchObject({
      code: "commander.error",
      exitCode: 1,
      message: "Input seed correctly.",
    });
  });

  // Cancellation becomes a CLI input error rather than returning a missing seed.
  // Letting the prompt rejection escape or swallowing it would break this contract.
  it.each([new Error("prompt cancelled"), ""])(
    "reports cancelled or rejected prompts (%j)",
    async (reason) => {
      vi.spyOn(Enquirer.prototype, "prompt").mockRejectedValue(reason);

      await expect(getSeed(makeProgram())).rejects.toMatchObject({
        code: "commander.error",
        exitCode: 1,
        message: "Input seed correctly",
      });
    }
  );
});
