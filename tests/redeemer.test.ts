import { bytesToHex } from "@helios-lang/codec-utils";
import { describe, expect, it } from "vitest";

import { Buy, WithdrawOrUpdate } from "../src/redeemer.js";

describe("redeemer helpers", () => {
  it.each([
    {
      name: "buy with zero payout offset",
      redeemer: Buy(0),
      expectedHex: "d8799f00ff",
    },
    {
      name: "buy with a later payout output offset",
      redeemer: Buy(3),
      expectedHex: "d8799f03ff",
    },
    {
      name: "withdraw or update",
      redeemer: WithdrawOrUpdate(),
      expectedHex: "d87a80",
    },
  ])("encodes $name as the expected constructor data", ({ redeemer, expectedHex }) => {
    expect(bytesToHex(redeemer.toCbor())).toBe(expectedHex);
  });
});
