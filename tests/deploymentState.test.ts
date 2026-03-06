import path from "path";
import { fileURLToPath } from "url";

import { describe, expect, test } from "vitest";

import {
  loadDesiredDeploymentState,
  parseDesiredDeploymentState,
} from "../src/deploymentState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("deployment state loader", () => {
  test("loads a desired deployment YAML fixture into the normalized shape", async () => {
    // Feature: desired contract deployment state is loaded from repo YAML without live-only fields.
    // Failure mode: drift/planning code would consume malformed or incomplete desired-state config.
    const fixturePath = path.resolve(
      __dirname,
      "../deploy/preview/marketplace.yaml"
    );

    const state = await loadDesiredDeploymentState(fixturePath);

    expect(state.schemaVersion).toBe(1);
    expect(state.network).toBe("preview");
    expect(state.contractSlug).toBe("marketplace");
    expect(state.build).toEqual({
      target: "validators/marketplace.ak",
      kind: "validator",
      parameters: {
        marketplaceAddress:
          "addr_test1wzwd9vt3suazurpnl9dugs2de9y4ly6r6nqnpvsswhmnf6q9qlcy9",
        authorizers: [
          "11111111111111111111111111111111111111111111111111111111",
          "22222222222222222222222222222222222222222222222222222222",
        ],
      },
    });
    expect(state.subhandleStrategy).toEqual({
      namespace: "handlecontract",
      format: "contract_slug_ordinal",
    });
    expect(state.settings).toEqual({
      type: "marketplace_settings",
      values: {
        marketplaceAddress:
          "addr_test1wzwd9vt3suazurpnl9dugs2de9y4ly6r6nqnpvsswhmnf6q9qlcy9",
        authorizers: [
          "11111111111111111111111111111111111111111111111111111111",
          "22222222222222222222222222222222222222222222222222222222",
        ],
      },
    });
  });

  test("rejects observed-only live fields inside desired deployment YAML", () => {
    // Feature: desired-state YAML excludes volatile live chain fields so repo drift stays stable.
    // Failure mode: bootstrap/live snapshots could be committed directly and cause noisy false-positive diffs.
    expect(() =>
      parseDesiredDeploymentState(
        `
schema_version: 1
network: preview
contract_slug: marketplace
build:
  target: validators/marketplace.ak
  kind: validator
  parameters:
    marketplace_address: addr_test1foo
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
current_script_hash: deadbeef
settings:
  type: marketplace_settings
  values: {}
        `,
        "invalid fixture"
      )
    ).toThrow("must not include observed-only field `current_script_hash`");
  });

  test("rejects missing nested settings values", () => {
    // Feature: desired-state YAML must carry a concrete settings values object for planner input.
    // Failure mode: tx planning would proceed with ambiguous or missing settings payloads.
    expect(() =>
      parseDesiredDeploymentState(
        `
schema_version: 1
network: preview
contract_slug: marketplace
build:
  target: validators/marketplace.ak
  kind: validator
  parameters:
    marketplace_address: addr_test1foo
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
settings:
  type: marketplace_settings
        `,
        "missing settings values"
      )
    ).toThrow("missing settings values.settings must include object field `values`");
  });

  test("rejects missing build parameters required for hash derivation", () => {
    // Feature: desired-state YAML must carry the complete marketplace contract parameters needed to rebuild the validator hash.
    // Failure mode: workflow drift checks would have settings data but still be unable to derive the expected live script hash.
    expect(() =>
      parseDesiredDeploymentState(
        `
schema_version: 1
network: preview
contract_slug: marketplace
build:
  target: validators/marketplace.ak
  kind: validator
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
settings:
  type: marketplace_settings
  values:
    marketplace_address: addr_test1foo
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
        `,
        "missing build parameters"
      )
    ).toThrow(
      "missing build parameters.build must include object field `parameters`"
    );
  });

  test("rejects mismatched build parameters and settings values", () => {
    // Feature: desired-state build inputs and desired settings must describe the same marketplace deployment state.
    // Failure mode: tx planning could derive one script hash while drift comparisons expect a different datum payload.
    expect(() =>
      parseDesiredDeploymentState(
        `
schema_version: 1
network: preview
contract_slug: marketplace
build:
  target: validators/marketplace.ak
  kind: validator
  parameters:
    marketplace_address: addr_test1build
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
settings:
  type: marketplace_settings
  values:
    marketplace_address: addr_test1settings
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
        `,
        "mismatched values"
      )
    ).toThrow(
      "mismatched values build.parameters must match settings.values for marketplace deployments"
    );
  });
});
