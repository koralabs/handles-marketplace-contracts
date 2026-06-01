import { describe, expect, test, vi } from "vitest";

import { buildContract, buildContractArtifacts } from "../src/buildContract.js";
import { decodeSCParametersDatumCbor } from "../src/datum.js";
import type { Parameters } from "../src/types.js";

const parameters: Parameters = {
  marketplaceAddress:
    "addr1xysgj7dndz9ql57jsh5y0ss258d0yl8wqfj4hy00ulyw6ueq39umx6y2plfa9p0gglpq4gw67f7wuqn9twg7le7ga4es4uake8",
  authorizers: ["4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1"],
};

describe("contract build helpers", () => {
  test("builds deterministic artifacts for marketplace parameters", () => {
    // Feature: contract build output should be reproducible from committed deployment parameters.
    // Failure mode: deployment planning could publish artifacts whose datum no longer matches settings.
    const artifacts = buildContractArtifacts({ parameters });

    expect(artifacts.validatorAddress).toMatch(/^addr1/);
    expect(artifacts.validatorHash).toMatch(/^[0-9a-f]{56}$/);
    expect(artifacts.cbor).toMatch(/^[0-9a-f]+$/);
    expect(artifacts.unoptimizedCbor).toMatch(/^[0-9a-f]+$/);
    expect(decodeSCParametersDatumCbor(artifacts.datumCbor, "mainnet")).toEqual(
      parameters
    );
  });

  test("logs a deployable script detail keyed by validator address", () => {
    // Feature: the CLI build path should emit the same artifact fields as the pure builder.
    // Failure mode: operators could copy a script detail payload with stale hash, CBOR, or datum fields.
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      buildContract({ parameters });

      const artifacts = buildContractArtifacts({ parameters });
      expect(log).toHaveBeenCalledTimes(1);
      const [label, payloadText] = log.mock.calls[0] as [string, string];
      expect(label).toBe("SCRIPT");

      const payload = JSON.parse(payloadText) as Record<string, Record<string, unknown>>;
      expect(Object.keys(payload)).toEqual([artifacts.validatorAddress]);
      expect(payload[artifacts.validatorAddress]).toMatchObject({
        handle: "marketplace@handle_scripts",
        handleHex:
          "000de1406d61726b6574706c6163654068616e646c655f73637269707473",
        type: "ScriptType.MARKETPLACE_CONTRACT",
        validatorHash: artifacts.validatorHash,
        cbor: artifacts.cbor,
        unoptimizedCbor: artifacts.unoptimizedCbor,
        datumCbor: artifacts.datumCbor,
        latest: true,
        refScriptAddress: null,
        refScriptUtxo: null,
        txBuildVersion: 1,
      });
    } finally {
      log.mockRestore();
    }
  });
});
