import { describe, expect, test } from "vitest";

import { parseDesiredDeploymentState } from "../src/deploymentState.js";

const validDesiredState = () => ({
  schema_version: 2,
  network: "preview",
  contract_slug: "mkpl",
  script_type: "mkpl",
  old_script_type: "marketplace_contract",
  deployment_handle_slug: "mkpl",
  build: {
    target: "validators/mkpl.ak",
    kind: "validator",
    parameters: {
      marketplace_address: "addr_test1build",
      authorizers: [
        "11111111111111111111111111111111111111111111111111111111",
      ],
    },
  },
  subhandle_strategy: {
    namespace: "handlecontract",
    format: "contract_slug_ordinal",
  },
  assigned_handles: {
    settings: [],
    scripts: [],
  },
  ignored_settings: [],
  settings: {
    type: "marketplace_settings",
    values: {
      marketplace_address: "addr_test1build",
      authorizers: [
        "11111111111111111111111111111111111111111111111111111111",
      ],
    },
  },
});

const parseState = (state: unknown, label = "test deployment") =>
  parseDesiredDeploymentState(JSON.stringify(state), label);

describe("deployment state validation coverage", () => {
  test.each([
    ["malformed YAML", "schema_version: [2", "is not valid YAML"],
    ["a scalar document", "preview", "must be a YAML object"],
    ["an array document", "- preview", "must be a YAML object"],
  ])("rejects %s before reading deployment fields", (_case, raw, message) => {
    // Feature: deployment input must be a parseable YAML object before field validation begins.
    // Failure mode: malformed or scalar workflow input could reach deployment planning as partial state.
    // Negative control: replacing raw with JSON.stringify(validDesiredState()) makes parsing succeed.
    expect(() => parseDesiredDeploymentState(raw, "invalid document")).toThrow(
      message
    );
    expect(parseState(validDesiredState()).network).toBe("preview");
  });

  test.each([
    [
      "schema version",
      (state: ReturnType<typeof validDesiredState>) => {
        state.schema_version = 1;
      },
      "schema_version must equal 2",
    ],
    [
      "network",
      (state: ReturnType<typeof validDesiredState>) => {
        state.network = "devnet";
      },
      "network must be one of preview, preprod, mainnet",
    ],
    [
      "build kind",
      (state: ReturnType<typeof validDesiredState>) => {
        state.build.kind = "reference_script";
      },
      "build kind must be validator or minting_policy",
    ],
    [
      "subhandle format",
      (state: ReturnType<typeof validDesiredState>) => {
        state.subhandle_strategy.format = "ordinal";
      },
      "subhandle_strategy format must be contract_slug_ordinal",
    ],
  ])("rejects an unsupported %s", (_case, mutate, message) => {
    // Feature: deployment state accepts only protocol-supported discriminated values.
    // Failure mode: unsupported deployment choices could produce an unusable plan.
    // Negative control: the unmodified fixture parses to the supported preview network.
    const state = validDesiredState();
    mutate(state);

    expect(() => parseState(state, "unsupported value")).toThrow(message);
    expect(parseState(validDesiredState()).network).toBe("preview");
  });

  test.each([
    [
      "mismatched slugs",
      (state: ReturnType<typeof validDesiredState>) => {
        state.script_type = "other";
      },
      "contract_slug, script_type, and deployment_handle_slug must match",
    ],
    [
      "hyphenated slugs",
      (state: ReturnType<typeof validDesiredState>) => {
        state.contract_slug = "mk-pl";
      },
      "contract_slug must not contain '-' or '_'",
    ],
    [
      "underscored slugs",
      (state: ReturnType<typeof validDesiredState>) => {
        state.deployment_handle_slug = "mk_pl";
      },
      "deployment_handle_slug must not contain '-' or '_'",
    ],
  ])("rejects %s", (_case, mutate, message) => {
    // Feature: deployment handle slugs use one matching, handle-safe identifier.
    // Failure mode: drift checks could address different or invalid deployment handles.
    // Negative control: the unmodified fixture has matching handle-safe slugs.
    const state = validDesiredState();
    mutate(state);

    expect(() => parseState(state, "invalid slugs")).toThrow(message);
    expect(parseState(validDesiredState()).contractSlug).toBe("mkpl");
  });

  test.each([
    [
      "empty authorizers",
      (state: ReturnType<typeof validDesiredState>) => {
        state.build.parameters.authorizers = [];
      },
      "build.parameters must include non-empty string array field `authorizers`",
    ],
    [
      "blank assigned handle",
      (state: ReturnType<typeof validDesiredState>) => {
        state.assigned_handles.scripts = [" "];
      },
      "assigned_handles must include string array field `scripts`",
    ],
    [
      "non-array ignored settings",
      (state: ReturnType<typeof validDesiredState>) => {
        state.ignored_settings = "none" as unknown as string[];
      },
      "must include array field `ignored_settings`",
    ],
  ])("rejects %s", (_case, mutate, message) => {
    // Feature: authorizer and handle collections retain required array shapes and usable values.
    // Failure mode: malformed lists could omit authorization or create invalid assignments.
    // Negative control: the unmodified fixture has a valid authorizer and valid empty optional lists.
    const state = validDesiredState();
    mutate(state);

    expect(() => parseState(state, "invalid arrays")).toThrow(message);
    expect(parseState(validDesiredState()).build.parameters.authorizers).toHaveLength(
      1
    );
  });
});
