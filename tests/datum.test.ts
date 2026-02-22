import {
  makeAddress,
  makePubKeyHash,
  makeStakingValidatorHash,
  makeValidatorHash,
} from "@helios-lang/ledger";
import { describe, expect, it } from "vitest";

import {
  buildDatum,
  buildSCParametersDatum,
  decodeDatum,
  decodeSCParametersDatumCbor,
} from "../src/datum.js";

describe("datum helpers", () => {
  it("decodes script spending credentials in parameters datum cbor", () => {
    const scriptMarketplaceAddress = makeAddress(
      false,
      makeValidatorHash("11".repeat(28))
    );
    const authorizer = makePubKeyHash("22".repeat(28));
    const parametersDatum = buildSCParametersDatum(scriptMarketplaceAddress, [
      authorizer,
    ]);

    const decoded = decodeSCParametersDatumCbor(parametersDatum.toCbor(), "preview");

    expect(decoded.marketplaceAddress).toBe(scriptMarketplaceAddress.toString());
    expect(decoded.authorizers).toEqual([authorizer.toHex()]);
  });

  it("decodes staking script credentials in marketplace datum payouts", () => {
    const payoutAddress = makeAddress(
      false,
      makePubKeyHash("33".repeat(28)),
      makeStakingValidatorHash("44".repeat(28))
    );
    const datum = buildDatum({
      owner: "55".repeat(28),
      payouts: [{ address: payoutAddress.toString(), amountLovelace: 1_000_000n }],
    });

    const decoded = decodeDatum(datum, "preview");

    expect(decoded.owner).toBe("55".repeat(28));
    expect(decoded.payouts).toEqual([
      { address: payoutAddress.toString(), amountLovelace: 1_000_000n },
    ]);
  });
});
