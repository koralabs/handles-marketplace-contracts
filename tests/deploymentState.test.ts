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
  test.each([
    {
      network: "preview",
      relativePath: "../deploy/preview/marketplace.yaml",
      marketplaceAddress:
        "addr_test1qpzxs06vn7qagrqsm7wtquul8s5drxzk82wwr9qx3886m8lv7yv3mukuwdkne3v3va8dgd3xjkzqv90pu9gsc8hrl2xs9yqkej",
      authorizers: ["0c0647ff15d2df88897eb2471d9aba909cdcc842ad7c387ec0712725"],
      assignedScriptHandles: ["dev@golddy"],
    },
    {
      network: "preprod",
      relativePath: "../deploy/preprod/marketplace.yaml",
      marketplaceAddress:
        "addr_test1qrysw490dkldwfqwpkwmnq39mcvt9xzy8kxxqnafh37lcvv764lmjcyrjyh8c8fjkkt22r47mheznsg47t7ly9yv8fysevzwtf",
      authorizers: ["c4c2d1d080900cb6d25d87b774954410d01fd3e6bb21e25d09130fa5"],
      assignedScriptHandles: ["test_market_5"],
    },
    {
      network: "mainnet",
      relativePath: "../deploy/mainnet/marketplace.yaml",
      marketplaceAddress:
        "addr1xysgj7dndz9ql57jsh5y0ss258d0yl8wqfj4hy00ulyw6ueq39umx6y2plfa9p0gglpq4gw67f7wuqn9twg7le7ga4es4uake8",
      authorizers: ["4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1"],
      assignedScriptHandles: ["marketplace@handle_scripts"],
    },
  ])(
    "loads the $network desired deployment YAML fixture into the normalized shape",
    async ({ relativePath, network, marketplaceAddress, authorizers, assignedScriptHandles }) => {
      // Feature: desired contract deployment state is loaded from repo YAML without live-only fields.
      // Failure mode: drift/planning code would consume malformed or incomplete desired-state config.
      const fixturePath = path.resolve(__dirname, relativePath);

      const state = await loadDesiredDeploymentState(fixturePath);

      expect(state.schemaVersion).toBe(2);
      expect(state.network).toBe(network);
      expect(state.contractSlug).toBe("mkpl");
      expect(state.scriptType).toBe("mkpl");
      expect(state.oldScriptType).toBe("marketplace_contract");
      expect(state.deploymentHandleSlug).toBe("mkpl");
      expect(state.build).toEqual({
        target: "validators/mkpl.ak",
        kind: "validator",
        parameters: {
          marketplaceAddress,
          authorizers,
        },
      });
      expect(state.subhandleStrategy).toEqual({
        namespace: "handlecontract",
        format: "contract_slug_ordinal",
      });
      expect(state.assignedHandles).toEqual({
        settings: [],
        scripts: assignedScriptHandles,
      });
      expect(state.ignoredSettings).toEqual([]);
      expect(state.settings).toEqual({
        type: "marketplace_settings",
        values: {
          marketplaceAddress,
          authorizers,
        },
      });
    }
  );

  test("rejects observed-only live fields inside desired deployment YAML", () => {
    // Feature: desired-state YAML excludes volatile live chain fields so repo drift stays stable.
    // Failure mode: bootstrap/live snapshots could be committed directly and cause noisy false-positive diffs.
    expect(() =>
      parseDesiredDeploymentState(
        `
schema_version: 2
network: preview
contract_slug: mkpl
script_type: mkpl
old_script_type: marketplace_contract
deployment_handle_slug: mkpl
build:
  target: validators/mkpl.ak
  kind: validator
  parameters:
    marketplace_address: addr_test1foo
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
assigned_handles:
  settings: []
  scripts: []
ignored_settings: []
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
schema_version: 2
network: preview
contract_slug: mkpl
script_type: mkpl
old_script_type: marketplace_contract
deployment_handle_slug: mkpl
build:
  target: validators/mkpl.ak
  kind: validator
  parameters:
    marketplace_address: addr_test1foo
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
assigned_handles:
  settings: []
  scripts: []
ignored_settings: []
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
schema_version: 2
network: preview
contract_slug: mkpl
script_type: mkpl
old_script_type: marketplace_contract
deployment_handle_slug: mkpl
build:
  target: validators/mkpl.ak
  kind: validator
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
assigned_handles:
  settings: []
  scripts: []
ignored_settings: []
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
schema_version: 2
network: preview
contract_slug: mkpl
script_type: mkpl
old_script_type: marketplace_contract
deployment_handle_slug: mkpl
build:
  target: validators/mkpl.ak
  kind: validator
  parameters:
    marketplace_address: addr_test1build
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
assigned_handles:
  settings: []
  scripts: []
ignored_settings: []
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

  test("rejects long deployment handle slugs", () => {
    expect(() =>
      parseDesiredDeploymentState(
        `
schema_version: 2
network: preview
contract_slug: mkpl
script_type: mkpl
old_script_type: marketplace_contract
deployment_handle_slug: marketplace
build:
  target: validators/mkpl.ak
  kind: validator
  parameters:
    marketplace_address: addr_test1build
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
subhandle_strategy:
  namespace: handlecontract
  format: contract_slug_ordinal
assigned_handles:
  settings: []
  scripts: []
ignored_settings: []
settings:
  type: marketplace_settings
  values:
    marketplace_address: addr_test1build
    authorizers:
      - "11111111111111111111111111111111111111111111111111111111"
        `,
        "invalid slug"
      )
    ).toThrow("invalid slug.deployment_handle_slug must be 10 characters or fewer");
  });
});
