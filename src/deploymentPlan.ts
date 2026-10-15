import { Buffer } from "node:buffer";

import crypto from "crypto";

import { buildContractArtifacts } from "./buildContract.js";
import { deploy } from "./deploy.js";
import { type DesiredDeploymentState, loadDesiredDeploymentState } from "./deploymentState.js";
import type { Parameters } from "./types.js";
import { fetchNetworkParameters } from "./utils/index.js";

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

type UnsignedMarketplaceDeploymentTxArtifact = {
  cborBytes: Buffer;
  cborHex: string;
  estimatedSignedTxSize: number;
  maxTxSize: number;
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
  scriptType,
  userAgent,
  fetchFn = fetch,
}: {
  network: string;
  scriptType: string;
  userAgent: string;
  fetchFn?: FetchLike;
}): Promise<LiveMarketplaceDeploymentState> => {
  const response = await fetchFn(
    `${handlesApiBaseUrlForNetwork(network)}/scripts?latest=true&type=${encodeURIComponent(scriptType)}`,
    {
      headers: {
        "User-Agent": userAgent,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`failed to load live ${scriptType} script: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const currentScriptHash = String(
    payload.validatorHash ?? payload.scriptHash ?? ""
  ).trim();
  if (!currentScriptHash) {
    throw new Error(`live ${scriptType} script response missing validatorHash/scriptHash`);
  }
  const currentSubhandle = String(payload.handle ?? "").trim() || null;
  return {
    currentScriptHash,
    currentSubhandle,
  };
};

const parseHandleOrdinal = ({
  candidate,
  deploymentHandleSlug,
  namespace,
}: {
  candidate: string;
  deploymentHandleSlug: string;
  namespace: string;
}): number | null => {
  const prefix = `${deploymentHandleSlug}`;
  const suffix = `@${namespace}`;
  if (!candidate.startsWith(prefix) || !candidate.endsWith(suffix)) {
    return null;
  }
  const ordinalText = candidate.slice(prefix.length, candidate.length - suffix.length);
  if (!/^[0-9]+$/.test(ordinalText)) {
    return null;
  }
  return Number.parseInt(ordinalText, 10);
};

const discoverNextContractSubhandle = async ({
  network,
  deploymentHandleSlug,
  namespace,
  currentSubhandle,
  userAgent,
  fetchFn = fetch,
}: {
  network: string;
  deploymentHandleSlug: string;
  namespace: string;
  currentSubhandle?: string | null;
  userAgent: string;
  fetchFn?: FetchLike;
}): Promise<string> => {
  const baseUrl = handlesApiBaseUrlForNetwork(network);
  const existingOrdinals: number[] = [];
  for (let ordinal = 1; ordinal < 10_000; ordinal += 1) {
    const candidate = `${deploymentHandleSlug}${ordinal}@${namespace}`;
    const response = await fetchFn(`${baseUrl}/handles/${candidate}`, {
      headers: {
        "User-Agent": userAgent,
      },
    });
    if (response.status === 404) {
      const currentOrdinal =
        currentSubhandle == null
          ? 0
          : parseHandleOrdinal({
              candidate: currentSubhandle,
              deploymentHandleSlug,
              namespace,
            }) ?? 0;
      const existingReplacement = existingOrdinals.find(
        (existingOrdinal) => existingOrdinal > currentOrdinal
      );
      return existingReplacement != null
        ? `${deploymentHandleSlug}${existingReplacement}@${namespace}`
        : candidate;
    }
    if (!response.ok) {
      throw new Error(
        `failed to probe SubHandle ${candidate}: HTTP ${response.status}`
      );
    }
    existingOrdinals.push(ordinal);
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

const buildMarketplaceDeploymentTxArtifact = async ({
  network,
  handleName,
  changeAddress,
  cborUtxos,
  parameters,
  deployFn = deploy,
  fetchNetworkParametersFn = fetchNetworkParameters,
}: {
  network: string;
  handleName: string;
  changeAddress: string;
  cborUtxos: string[];
  parameters: Parameters;
  deployFn?: typeof deploy;
  fetchNetworkParametersFn?: typeof fetchNetworkParameters;
}): Promise<UnsignedMarketplaceDeploymentTxArtifact> => {
  const result = await deployFn(
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
  const tx = result.data;
  tx.witnesses.addDummySignatures(1);
  const estimatedSignedTxSize = tx.calcSize();
  tx.witnesses.removeDummySignatures(1);

  const networkParametersResult = await fetchNetworkParametersFn(
    network as "preview" | "preprod" | "mainnet"
  );
  if (!networkParametersResult.ok) {
    throw new Error("Failed to fetch network parameter");
  }
  const maxTxSize = networkParametersResult.data.maxTxSize;
  if (estimatedSignedTxSize > maxTxSize) {
    throw new Error(
      `unsigned deployment tx for ${handleName} is too large after adding 1 required signature: ${estimatedSignedTxSize} > ${maxTxSize}`
    );
  }

  const cborBytes = Buffer.from(tx.toCbor());
  return {
    cborBytes,
    cborHex: cborBytes.toString("hex"),
    estimatedSignedTxSize,
    maxTxSize,
  };
};

export {
  buildExpectedMarketplaceScriptHash,
  buildMarketplaceDeploymentPlan,
  buildMarketplaceDeploymentTxArtifact,
  discoverNextContractSubhandle,
  fetchLiveMarketplaceDeploymentState,
  handlesApiBaseUrlForNetwork,
  loadDesiredDeploymentState,
};
export type {
  DeploymentDriftType,
  LiveMarketplaceDeploymentState,
  MarketplaceDeploymentPlan,
  UnsignedMarketplaceDeploymentTxArtifact,
};
