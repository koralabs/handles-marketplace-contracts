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
    });
    expect(state.subhandleStrategy).toEqual({
      namespace: "handlecontracts",
      format: "contract_slug_ordinal",
    });
    expect(state.settings).toEqual({
      type: "marketplace_settings",
      values: {
        authorizers: ["authorizer_key_hash_1", "authorizer_key_hash_2"],
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
subhandle_strategy:
  namespace: handlecontracts
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
subhandle_strategy:
  namespace: handlecontracts
  format: contract_slug_ordinal
settings:
  type: marketplace_settings
        `,
        "missing settings values"
      )
    ).toThrow("missing settings values.settings must include object field `values`");
  });
});
