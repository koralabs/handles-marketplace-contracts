import fs from "fs/promises";
import path from "path";

import {
  buildExpectedMarketplaceScriptHash,
  buildMarketplaceDeploymentPlan,
  buildMarketplaceDeploymentTxCbor,
  discoverNextContractSubhandle,
  fetchLiveMarketplaceDeploymentState,
  loadDesiredDeploymentState,
} from "../src/deploymentPlan.js";

const parseArgs = (argv: string[]) => {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`missing value for ${token}`);
    }
    args[token.slice(2)] = next;
    index += 1;
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const desiredPath = args["desired"];
  const artifactsDir = args["artifacts-dir"];
  if (!desiredPath || !artifactsDir) {
    throw new Error("usage: --desired <path> --artifacts-dir <dir> [--change-address <addr> --cbor-utxos-json <json>]");
  }

  const changeAddress = args["change-address"] ?? "";
  const cborUtxosJson = args["cbor-utxos-json"] ?? "";
  if (Boolean(changeAddress) !== Boolean(cborUtxosJson)) {
    throw new Error("--change-address and --cbor-utxos-json must be provided together");
  }

  const desired = await loadDesiredDeploymentState(desiredPath);
  const userAgent = (process.env.KORA_USER_AGENT || "kora-contract-deployments/1.0").trim();
  const expectedScriptHash = buildExpectedMarketplaceScriptHash(
    desired.build.parameters
  );
  const live = await fetchLiveMarketplaceDeploymentState({
    network: desired.network,
    userAgent,
  });
  const nextSubhandle =
    live.currentScriptHash === expectedScriptHash
      ? live.currentSubhandle
      : await discoverNextContractSubhandle({
          network: desired.network,
          deploymentHandleSlug: desired.deploymentHandleSlug,
          namespace: desired.subhandleStrategy.namespace,
          userAgent,
        });
  const plan = buildMarketplaceDeploymentPlan({
    desired,
    expectedScriptHash,
    live,
    nextSubhandle,
  });
  const generatedArtifacts = ["summary.json", "summary.md", "deployment-plan.json"];
  let txArtifactGenerated = false;

  await fs.mkdir(artifactsDir, { recursive: true });
  const summaryJson = {
    ...plan.summaryJson,
    tx_artifact_generated: false,
    artifact_files: generatedArtifacts,
  };
  const deploymentPlanJson = {
    ...plan.deploymentPlanJson,
    tx_artifact_generated: false,
    artifact_files: generatedArtifacts,
  };
  await fs.writeFile(
    path.join(artifactsDir, "summary.json"),
    `${JSON.stringify(summaryJson, null, 2)}\n`
  );
  await fs.writeFile(path.join(artifactsDir, "summary.md"), `${plan.summaryMarkdown}\n`);
  await fs.writeFile(
    path.join(artifactsDir, "deployment-plan.json"),
    `${JSON.stringify(deploymentPlanJson, null, 2)}\n`
  );

  if (plan.driftType !== "no_change" && changeAddress && cborUtxosJson) {
    const txCbor = await buildMarketplaceDeploymentTxCbor({
      network: desired.network,
      handleName: nextSubhandle ?? live.currentSubhandle ?? "",
      changeAddress,
      cborUtxos: JSON.parse(cborUtxosJson),
      parameters: desired.build.parameters,
    });
    await fs.writeFile(path.join(artifactsDir, "tx-01.cbor"), `${txCbor}\n`);
    txArtifactGenerated = true;
  }
  if (txArtifactGenerated) {
    generatedArtifacts.push("tx-01.cbor");
    await fs.writeFile(
      path.join(artifactsDir, "summary.json"),
      `${JSON.stringify(
        {
          ...summaryJson,
          tx_artifact_generated: true,
          artifact_files: generatedArtifacts,
        },
        null,
        2
      )}\n`
    );
    await fs.writeFile(
      path.join(artifactsDir, "deployment-plan.json"),
      `${JSON.stringify(
        {
          ...deploymentPlanJson,
          tx_artifact_generated: true,
          artifact_files: generatedArtifacts,
        },
        null,
        2
      )}\n`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
