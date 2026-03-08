import crypto from "crypto";

import { buildContractArtifacts } from "./buildContract.js";
import { loadDesiredDeploymentState, type DesiredDeploymentState } from "./deploymentState.js";
import { deploy } from "./deploy.js";
import type { Parameters } from "./types.js";

const REPO_NAME = "handles-marketplace-contracts";

type DeploymentDriftType = "no_change" | "script_hash_only";

type LiveMarketplaceDeploymentState = {
  currentScriptHash: string;
  currentSubhandle: string | null;
};

type MarketplaceDeploymentPlan = {
  planId: string;
  repo: string;
  network: string;
  contractSlug: string;
  driftType: DeploymentDriftType;
  summaryJson: Record<string, unknown>;
  summaryMarkdown: string;
  deploymentPlanJson: Record<string, unknown>;
};

type FetchLike = typeof fetch;

const handlesApiBaseUrlForNetwork = (network: string): string => {
  if (network === "preview") return "https://preview.api.handle.me";
  if (network === "preprod") return "https://preprod.api.handle.me";
  return "https://api.handle.me";
};

const buildExpectedMarketplaceScriptHash = (
  parameters: Parameters
): string => buildContractArtifacts({ parameters }).validatorHash;

const fetchLiveMarketplaceDeploymentState = async ({
  network,
  userAgent,
  fetchFn = fetch,
}: {
  network: string;
  userAgent: string;
  fetchFn?: FetchLike;
}): Promise<LiveMarketplaceDeploymentState> => {
  const response = await fetchFn(
    `${handlesApiBaseUrlForNetwork(network)}/scripts?latest=true&type=marketplace_contract`,
    {
      headers: {
        "User-Agent": userAgent,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`failed to load live marketplace script: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const currentScriptHash = String(
    payload.validatorHash ?? payload.scriptHash ?? ""
  ).trim();
  if (!currentScriptHash) {
    throw new Error("live marketplace script response missing validatorHash/scriptHash");
  }
  const currentSubhandle = String(payload.handle ?? "").trim() || null;
  return {
    currentScriptHash,
    currentSubhandle,
  };
};

const discoverNextContractSubhandle = async ({
  network,
  deploymentHandleSlug,
  namespace,
  userAgent,
  fetchFn = fetch,
}: {
  network: string;
  deploymentHandleSlug: string;
  namespace: string;
  userAgent: string;
  fetchFn?: FetchLike;
}): Promise<string> => {
  const baseUrl = handlesApiBaseUrlForNetwork(network);
  for (let ordinal = 1; ordinal < 10_000; ordinal += 1) {
    const candidate = `${deploymentHandleSlug}${ordinal}@${namespace}`;
    const response = await fetchFn(`${baseUrl}/handles/${candidate}`, {
      headers: {
        "User-Agent": userAgent,
      },
    });
    if (response.status === 404) {
      return candidate;
    }
    if (!response.ok) {
      throw new Error(
        `failed to probe SubHandle ${candidate}: HTTP ${response.status}`
      );
    }
  }
  throw new Error(`no available SubHandle found for ${deploymentHandleSlug}@${namespace}`);
};

const buildMarketplaceDeploymentPlan = ({
  desired,
  expectedScriptHash,
  live,
  nextSubhandle,
}: {
  desired: DesiredDeploymentState;
  expectedScriptHash: string;
  live: LiveMarketplaceDeploymentState;
  nextSubhandle: string | null;
}): MarketplaceDeploymentPlan => {
  const driftType: DeploymentDriftType =
    live.currentScriptHash === expectedScriptHash ? "no_change" : "script_hash_only";
  const plannedSubhandle =
    driftType === "no_change" ? live.currentSubhandle : nextSubhandle;
  if (!plannedSubhandle) {
    throw new Error("deployment plan requires a resolved SubHandle");
  }

  const planId = crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        {
          network: desired.network,
          contract_slug: desired.contractSlug,
          current_script_hash: live.currentScriptHash,
          expected_script_hash: expectedScriptHash,
          planned_subhandle: plannedSubhandle,
          assigned_handles: desired.assignedHandles,
          ignored_settings: desired.ignoredSettings,
          desired_settings: desired.settings,
        },
        Object.keys({
          network: "",
          contract_slug: "",
          current_script_hash: "",
          expected_script_hash: "",
          planned_subhandle: "",
          assigned_handles: "",
          ignored_settings: "",
          desired_settings: "",
        }).sort()
      )
    )
    .digest("hex");
  const expectedPostDeployState = {
    repo: REPO_NAME,
    network: desired.network,
    contract_slug: desired.contractSlug,
    expected_script_hash: expectedScriptHash,
    expected_subhandle: plannedSubhandle,
    assigned_handles: {
      settings: desired.assignedHandles.settings,
      scripts: [plannedSubhandle],
    },
    settings: {
      type: desired.settings.type,
      values: desired.settings.values,
      ignored_paths: desired.ignoredSettings,
    },
  };
  const transactionOrder = driftType === "no_change" ? [] : ["tx-01.cbor"];
  const summaryJson = {
    plan_id: planId,
    repo: REPO_NAME,
    network: desired.network,
    contracts: [
      {
        contract_slug: desired.contractSlug,
        drift_type: driftType,
        script_hashes: {
          current: live.currentScriptHash,
          expected: expectedScriptHash,
        },
        settings: {
          type: desired.settings.type,
          diff_rows: [],
          desired_values: desired.settings.values,
          ignored_paths: desired.ignoredSettings,
        },
        subhandle: {
          action: driftType === "no_change" ? "reuse" : "allocate",
          value: plannedSubhandle,
          is_new: driftType !== "no_change",
        },
        expected_post_deploy_state: expectedPostDeployState,
      },
    ],
    transaction_order: transactionOrder,
  };
  const summaryMarkdown = [
    "# Contract Deployment Plan",
    "",
    `- Plan ID: \`${planId}\``,
    `- Repo: \`${REPO_NAME}\``,
    `- Network: \`${desired.network}\``,
    `- Contract: \`${desired.contractSlug}\``,
    `- Drift Type: \`${driftType}\``,
    `- Script Hash: \`${live.currentScriptHash}\` -> \`${expectedScriptHash}\``,
    `- SubHandle: \`${plannedSubhandle}\``,
    "",
    "## Settings",
    `- \`${desired.settings.type}\` matches committed build parameters.`,
    "",
    "## Transaction Order",
    ...(transactionOrder.length > 0
      ? transactionOrder.map((name) => `- \`${name}\``)
      : ["- No transaction required."]),
  ].join("\n");

  return {
    planId,
    repo: REPO_NAME,
    network: desired.network,
    contractSlug: desired.contractSlug,
    driftType,
    summaryJson,
    summaryMarkdown,
    deploymentPlanJson: {
      plan_id: planId,
      repo: REPO_NAME,
      network: desired.network,
      contracts: [expectedPostDeployState],
      transaction_order: transactionOrder,
    },
  };
};

const buildMarketplaceDeploymentTxCbor = async ({
  network,
  handleName,
  changeAddress,
  cborUtxos,
  parameters,
}: {
  network: string;
  handleName: string;
  changeAddress: string;
  cborUtxos: string[];
  parameters: Parameters;
}): Promise<string> => {
  const result = await deploy(
    {
      handleName,
      changeBech32Address: changeAddress,
      cborUtxos,
      parameters,
    },
    network as "preview" | "preprod" | "mainnet"
  );
  if (!result.ok || typeof result.data !== "object") {
    throw new Error(
      result.ok ? "deploy did not return unsigned tx" : String(result.error)
    );
  }
  return Buffer.from(result.data.toCbor()).toString("hex");
};

export {
  buildExpectedMarketplaceScriptHash,
  buildMarketplaceDeploymentPlan,
  buildMarketplaceDeploymentTxCbor,
  discoverNextContractSubhandle,
  fetchLiveMarketplaceDeploymentState,
  handlesApiBaseUrlForNetwork,
  loadDesiredDeploymentState,
};
export type {
  DeploymentDriftType,
  LiveMarketplaceDeploymentState,
  MarketplaceDeploymentPlan,
};
