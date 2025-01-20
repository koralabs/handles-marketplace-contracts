import { NetworkParams } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";
import { ScriptDetails } from "@koralabs/kora-labs-common";
import { Result } from "ts-res";

import { optimizedCompiledCode } from "../contracts/plutus-v2/contract.js";
import { makeSCParametersUplcValues } from "../datum.js";
import { mayFail, mayFailAsync } from "../helpers/index.js";
import { Parameters } from "../types.js";
import { fetchApi } from "./api.js";

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
  try {
    const result = await fetchApi(
      `scripts?latest=true&type=marketplace_contract`
    );
    if (!result.ok) {
      const error = await result.json();
      throw new Error(error);
    }

    const data = (await result.json()) as unknown as ScriptDetails;
    return data;
  } catch {
    throw new Error(`Not deployed on ${network}`);
  }
};

export { fetchDeployedScript, fetchNetworkParameters, getUplcProgram };
