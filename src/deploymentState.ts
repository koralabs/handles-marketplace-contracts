import fs from "fs/promises";

import YAML from "yaml";

type DeploymentNetwork = "preview" | "preprod" | "mainnet";
type BuildKind = "validator" | "minting_policy";
type SubhandleFormat = "contract_slug_ordinal";
type MarketplaceBuildParameters = {
  marketplaceAddress: string;
  authorizers: string[];
};

type DesiredDeploymentState = {
  schemaVersion: 2;
  network: DeploymentNetwork;
  contractSlug: string;
  deploymentHandleSlug: string;
  build: {
    target: string;
    kind: BuildKind;
    parameters: MarketplaceBuildParameters;
  };
  subhandleStrategy: {
    namespace: string;
      format: SubhandleFormat;
  };
  assignedHandles: {
    settings: string[];
    scripts: string[];
  };
  ignoredSettings: string[];
  settings: {
    type: string;
    values: MarketplaceBuildParameters;
  };
};

const ALLOWED_NETWORKS = new Set<DeploymentNetwork>([
  "preview",
  "preprod",
  "mainnet",
]);
const ALLOWED_BUILD_KINDS = new Set<BuildKind>(["validator", "minting_policy"]);
const ALLOWED_SUBHANDLE_FORMATS = new Set<SubhandleFormat>([
  "contract_slug_ordinal",
]);
const OBSERVED_ONLY_FIELDS = new Set([
  "current_script_hash",
  "current_settings_utxo_ref",
  "current_subhandle",
  "observed_at",
  "last_deployed_tx_hash",
]);

const loadDesiredDeploymentState = async (
  path: string
): Promise<DesiredDeploymentState> => {
  const raw = await fs.readFile(path, "utf8");
  return parseDesiredDeploymentState(raw, path);
};

const parseDesiredDeploymentState = (
  raw: string,
  sourceLabel = "desired deployment state"
): DesiredDeploymentState => {
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (error) {
    throw new Error(
      `${sourceLabel} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a YAML object`);
  }

  const value = parsed as Record<string, unknown>;
  const observedOnlyField = Object.keys(value).find((key) =>
    OBSERVED_ONLY_FIELDS.has(key)
  );
  if (observedOnlyField) {
    throw new Error(
      `${sourceLabel} must not include observed-only field \`${observedOnlyField}\``
    );
  }

  const schemaVersion = requireNumber(value, "schema_version", sourceLabel);
  if (schemaVersion !== 2) {
    throw new Error(`${sourceLabel} schema_version must equal 2`);
  }

  const network = requireString(value, "network", sourceLabel) as DeploymentNetwork;
  if (!ALLOWED_NETWORKS.has(network)) {
    throw new Error(`${sourceLabel} network must be one of preview, preprod, mainnet`);
  }

  const contractSlug = requireString(value, "contract_slug", sourceLabel);
  const deploymentHandleSlug = requireShortHandleSlug(value, "deployment_handle_slug", sourceLabel);
  const build = requireObject(value, "build", sourceLabel);
  const buildTarget = requireString(build, "target", `${sourceLabel}.build`);
  const buildKind = requireString(build, "kind", `${sourceLabel}.build`) as BuildKind;
  if (!ALLOWED_BUILD_KINDS.has(buildKind)) {
    throw new Error(`${sourceLabel}.build kind must be validator or minting_policy`);
  }
  const buildParameters = parseMarketplaceBuildParameters(
    requireObject(build, "parameters", `${sourceLabel}.build`),
    `${sourceLabel}.build.parameters`
  );

  const subhandleStrategy = requireObject(value, "subhandle_strategy", sourceLabel);
  const namespace = requireString(
    subhandleStrategy,
    "namespace",
    `${sourceLabel}.subhandle_strategy`
  );
  const format = requireString(
    subhandleStrategy,
    "format",
    `${sourceLabel}.subhandle_strategy`
  ) as SubhandleFormat;
  if (!ALLOWED_SUBHANDLE_FORMATS.has(format)) {
    throw new Error(
      `${sourceLabel}.subhandle_strategy format must be contract_slug_ordinal`
    );
  }

  const settings = requireObject(value, "settings", sourceLabel);
  const settingsType = requireString(settings, "type", `${sourceLabel}.settings`);
  const settingsValues = parseMarketplaceBuildParameters(
    requireObject(settings, "values", `${sourceLabel}.settings`),
    `${sourceLabel}.settings.values`
  );
  if (
    buildParameters.marketplaceAddress !== settingsValues.marketplaceAddress ||
    JSON.stringify(buildParameters.authorizers) !==
      JSON.stringify(settingsValues.authorizers)
  ) {
    throw new Error(
      `${sourceLabel} build.parameters must match settings.values for marketplace deployments`
    );
  }

  const assignedHandles = requireObject(value, "assigned_handles", sourceLabel);
  const ignoredSettings = requireStringArrayAllowEmpty(value, "ignored_settings", sourceLabel);

  return {
    schemaVersion: 2,
    network,
    contractSlug,
    deploymentHandleSlug,
    build: {
      target: buildTarget,
      kind: buildKind,
      parameters: buildParameters,
    },
    subhandleStrategy: {
      namespace,
      format,
    },
    assignedHandles: {
      settings: requireStringArrayAllowEmpty(assignedHandles, "settings", `${sourceLabel}.assigned_handles`),
      scripts: requireStringArrayAllowEmpty(assignedHandles, "scripts", `${sourceLabel}.assigned_handles`),
    },
    ignoredSettings,
    settings: {
      type: settingsType,
      values: settingsValues,
    },
  };
};

const requireObject = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): Record<string, unknown> => {
  const resolved = value[key];
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    throw new Error(`${sourceLabel} must include object field \`${key}\``);
  }
  return resolved as Record<string, unknown>;
};

const requireString = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): string => {
  const resolved = value[key];
  if (typeof resolved !== "string" || resolved.trim() === "") {
    throw new Error(`${sourceLabel} must include string field \`${key}\``);
  }
  return resolved.trim();
};

const requireNumber = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): number => {
  const resolved = value[key];
  if (typeof resolved !== "number" || Number.isNaN(resolved)) {
    throw new Error(`${sourceLabel} must include numeric field \`${key}\``);
  }
  return resolved;
};

const parseMarketplaceBuildParameters = (
  value: Record<string, unknown>,
  sourceLabel: string
): MarketplaceBuildParameters => ({
  marketplaceAddress: requireString(value, "marketplace_address", sourceLabel),
  authorizers: requireStringArray(value, "authorizers", sourceLabel),
});

const requireStringArray = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): string[] => {
  const resolved = value[key];
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new Error(`${sourceLabel} must include non-empty string array field \`${key}\``);
  }

  const normalized = resolved.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${sourceLabel} must include non-empty string array field \`${key}\``);
    }
    return item.trim();
  });

  return normalized;
};

const requireStringArrayAllowEmpty = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): string[] => {
  const resolved = value[key];
  if (!Array.isArray(resolved)) {
    throw new Error(`${sourceLabel} must include array field \`${key}\``);
  }
  return resolved.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${sourceLabel} must include string array field \`${key}\``);
    }
    return item.trim();
  });
};

const requireShortHandleSlug = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): string => {
  const resolved = requireString(value, key, sourceLabel);
  if (resolved.length > 10) {
    throw new Error(`${sourceLabel}.${key} must be 10 characters or fewer`);
  }
  if (resolved.includes("-") || resolved.includes("_")) {
    throw new Error(`${sourceLabel}.${key} must not contain '-' or '_'`);
  }
  return resolved;
};

export type {
  BuildKind,
  DeploymentNetwork,
  DesiredDeploymentState,
  MarketplaceBuildParameters,
  SubhandleFormat,
};
export { loadDesiredDeploymentState, parseDesiredDeploymentState };
