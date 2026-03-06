import fs from "fs/promises";

import YAML from "yaml";

type DeploymentNetwork = "preview" | "preprod" | "mainnet";
type BuildKind = "validator" | "minting_policy";
type SubhandleFormat = "contract_slug_ordinal";

type DesiredDeploymentState = {
  schemaVersion: 1;
  network: DeploymentNetwork;
  contractSlug: string;
  build: {
    target: string;
    kind: BuildKind;
  };
  subhandleStrategy: {
    namespace: string;
    format: SubhandleFormat;
  };
  settings: {
    type: string;
    values: Record<string, unknown>;
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
  if (schemaVersion !== 1) {
    throw new Error(`${sourceLabel} schema_version must equal 1`);
  }

  const network = requireString(value, "network", sourceLabel) as DeploymentNetwork;
  if (!ALLOWED_NETWORKS.has(network)) {
    throw new Error(`${sourceLabel} network must be one of preview, preprod, mainnet`);
  }

  const contractSlug = requireString(value, "contract_slug", sourceLabel);
  const build = requireObject(value, "build", sourceLabel);
  const buildTarget = requireString(build, "target", `${sourceLabel}.build`);
  const buildKind = requireString(build, "kind", `${sourceLabel}.build`) as BuildKind;
  if (!ALLOWED_BUILD_KINDS.has(buildKind)) {
    throw new Error(`${sourceLabel}.build kind must be validator or minting_policy`);
  }

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
  const settingsValues = requireObject(settings, "values", `${sourceLabel}.settings`);

  return {
    schemaVersion: 1,
    network,
    contractSlug,
    build: {
      target: buildTarget,
      kind: buildKind,
    },
    subhandleStrategy: {
      namespace,
      format,
    },
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

export type {
  BuildKind,
  DeploymentNetwork,
  DesiredDeploymentState,
  SubhandleFormat,
};
export { loadDesiredDeploymentState, parseDesiredDeploymentState };
