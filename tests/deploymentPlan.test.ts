import { describe, expect, test } from "vitest";

import {
  buildExpectedMarketplaceScriptHash,
  buildMarketplaceDeploymentPlan,
  discoverNextContractSubhandle,
  fetchLiveMarketplaceDeploymentState,
} from "../src/deploymentPlan.js";
import type { DesiredDeploymentState } from "../src/deploymentState.js";

const desiredState: DesiredDeploymentState = {
  schemaVersion: 1,
  network: "preview",
  contractSlug: "marketplace",
  build: {
    target: "validators/marketplace.ak",
    kind: "validator",
    parameters: {
      marketplaceAddress:
        "addr_test1qpzxs06vn7qagrqsm7wtquul8s5drxzk82wwr9qx3886m8lv7yv3mukuwdkne3v3va8dgd3xjkzqv90pu9gsc8hrl2xs9yqkej",
      authorizers: ["0c0647ff15d2df88897eb2471d9aba909cdcc842ad7c387ec0712725"],
    },
  },
  subhandleStrategy: {
    namespace: "handlecontract",
    format: "contract_slug_ordinal",
  },
  settings: {
    type: "marketplace_settings",
    values: {
      marketplaceAddress:
        "addr_test1qpzxs06vn7qagrqsm7wtquul8s5drxzk82wwr9qx3886m8lv7yv3mukuwdkne3v3va8dgd3xjkzqv90pu9gsc8hrl2xs9yqkej",
      authorizers: ["0c0647ff15d2df88897eb2471d9aba909cdcc842ad7c387ec0712725"],
    },
  },
};

describe("deployment plan helpers", () => {
  test("expected script hash changes when committed marketplace build parameters change", () => {
    // Feature: deployment planning derives the validator hash from repo-owned build parameters.
    // Failure mode: drift detection would miss contract changes because it reuses a stale or hardcoded script hash.
    const originalHash = buildExpectedMarketplaceScriptHash(
      desiredState.build.parameters
    );
    const changedHash = buildExpectedMarketplaceScriptHash({
      ...desiredState.build.parameters,
      marketplaceAddress:
        "addr_test1wpe92ckswkvqdcl5tuamj7vztkusetnv9xh4663hzp5jlyqddsjc5",
    });

    expect(originalHash).not.toEqual(changedHash);
  });

  test("builds a no-change deployment plan when live and expected hashes match", () => {
    // Feature: push/PR planning should report no deployment transaction when the live script already matches desired repo state.
    // Failure mode: ops would get spurious approval requests for contracts that are already in sync.
    const expectedScriptHash = buildExpectedMarketplaceScriptHash(
      desiredState.build.parameters
    );

    const plan = buildMarketplaceDeploymentPlan({
      desired: desiredState,
      expectedScriptHash,
      live: {
        currentScriptHash: expectedScriptHash,
        currentSubhandle: "marketplace3@handlecontract",
      },
      nextSubhandle: null,
    });

    expect(plan.driftType).toBe("no_change");
    expect(plan.summaryJson.transaction_order).toEqual([]);
    expect(plan.summaryMarkdown).toContain("No transaction required.");
  });

  test("builds a deployment transaction plan when the live hash differs", () => {
    // Feature: deployment planning should allocate a new contract SubHandle when the validator hash changes.
    // Failure mode: a script update could be planned without the new SubHandle needed to publish the replacement contract.
    const expectedScriptHash = buildExpectedMarketplaceScriptHash(
      desiredState.build.parameters
    );

    const plan = buildMarketplaceDeploymentPlan({
      desired: desiredState,
      expectedScriptHash,
      live: {
        currentScriptHash: "ab".repeat(28),
        currentSubhandle: "marketplace3@handlecontract",
      },
      nextSubhandle: "marketplace4@handlecontract",
    });

    expect(plan.driftType).toBe("script_hash_only");
    expect(plan.summaryJson.transaction_order).toEqual(["tx-01.cbor"]);
    expect(plan.summaryMarkdown).toContain("`marketplace4@handlecontract`");
  });

  test.each([
    {
      network: "preview",
      expectedUrl:
        "https://preview.api.handle.me/scripts?latest=true&type=marketplace_contract",
    },
    {
      network: "preprod",
      expectedUrl:
        "https://preprod.api.handle.me/scripts?latest=true&type=marketplace_contract",
    },
    {
      network: "mainnet",
      expectedUrl:
        "https://api.handle.me/scripts?latest=true&type=marketplace_contract",
    },
  ])(
    "fetches live marketplace deployment state from the $network Handles API",
    async ({ network, expectedUrl }) => {
      // Feature: the workflow planner reads the currently deployed marketplace script hash from the network-specific Handles API.
      // Failure mode: workflow artifacts could diff against the wrong network or miss the current SubHandle binding.
      const requests: Array<{ url: string; headers: HeadersInit | undefined }> = [];
      const state = await fetchLiveMarketplaceDeploymentState({
        network,
        userAgent: "codex-test",
        fetchFn: async (url, init) => {
          requests.push({ url: String(url), headers: init?.headers });
          return new Response(
            JSON.stringify({
              validatorHash: "cd".repeat(28),
              handle: "marketplace9@handlecontract",
            }),
            { status: 200 }
          );
        },
      });

      expect(state).toEqual({
        currentScriptHash: "cd".repeat(28),
        currentSubhandle: "marketplace9@handlecontract",
      });
      expect(requests).toEqual([
        {
          url: expectedUrl,
          headers: { "User-Agent": "codex-test" },
        },
      ]);
    }
  );

  test("discovers the next available contract SubHandle ordinal", async () => {
    // Feature: script-hash deployments must allocate the next free <contract_slug><ordinal>@handlecontract name.
    // Failure mode: workflow-generated plans could collide with an already published contract SubHandle.
    const requested: string[] = [];
    const subhandle = await discoverNextContractSubhandle({
      network: "preview",
      contractSlug: "marketplace",
      namespace: "handlecontract",
      userAgent: "codex-test",
      fetchFn: async (url) => {
        requested.push(String(url));
        const urlText = String(url);
        return new Response(
          JSON.stringify({ ok: true }),
          { status: urlText.endsWith("marketplace3@handlecontract") ? 404 : 200 }
        );
      },
    });

    expect(subhandle).toBe("marketplace3@handlecontract");
    expect(requested).toEqual([
      "https://preview.api.handle.me/handles/marketplace1@handlecontract",
      "https://preview.api.handle.me/handles/marketplace2@handlecontract",
      "https://preview.api.handle.me/handles/marketplace3@handlecontract",
    ]);
  });
});
