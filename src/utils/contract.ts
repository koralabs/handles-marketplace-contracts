import { NetworkParams } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";
import { ScriptDetails } from "@koralabs/kora-labs-common";
import { makeSCParametersUplcValues } from "datum.js";
import { Result } from "ts-res";

import { optimizedCompiledCode } from "../contracts/plutus-v2/contract.js";
import { deployedScripts } from "../deployed/index.js";
import { mayFail, mayFailAsync } from "../helpers/index.js";
import { Parameters } from "../types.js";

const NETWORK_PARAMETER_URL = (network: NetworkName) =>
  `https://network-status.helios-lang.io/${network}/config`;

const fetchNetworkParameters = async (
  network: NetworkName
): Promise<Result<NetworkParams, string>> => {
  return await mayFailAsync(
    async () =>
      (
        await fetch(NETWORK_PARAMETER_URL(network))
      ).json() as unknown as NetworkParams
  ).complete();
};

const getUplcProgram = async (
  parameters: Parameters
): Promise<Result<UplcProgramV2, string>> => {
  const parametersUplcValues = makeSCParametersUplcValues(parameters);
  return mayFail(() =>
    decodeUplcProgramV2FromCbor(optimizedCompiledCode).apply(
      parametersUplcValues
    )
  );
};

// TODO:
// make a PR of `deployedScript` to api.handle.me
const fetchDeployedScript = async (
  network: NetworkName
): Promise<ScriptDetails> => {
  return Object.values(deployedScripts[network])[0];
};

export { fetchDeployedScript, fetchNetworkParameters, getUplcProgram };
