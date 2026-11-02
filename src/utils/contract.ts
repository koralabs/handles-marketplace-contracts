import { NetworkParams } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";
import { ScriptDetails, ScriptType } from "@koralabs/kora-labs-common";
import { Result } from "ts-res";

import { optimizedCompiledCode } from "../contracts/plutus-v2/contract.js";
import { makeSCParametersUplcValues } from "../datum.js";
import { fetchApi, mayFail, mayFailAsync } from "../helpers/index.js";
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

// `/scripts` is keyed by script address and `type` is a prefix match, so pick this
// script's own latest entry. The entry carries no datum: the parameters datum is the
// inline datum of the contract handle's reference-script UTxO (raw CBOR needs Accept: text/plain).
const fetchDeployedScript = async (
  network: NetworkName
): Promise<ScriptDetails> => {
  try {
    const result = await fetchApi(
      `scripts?latest=true&type=${ScriptType.MARKETPLACE_CONTRACT}`
    );
    if (!result.ok) {
      throw new Error(await result.text());
    }

    const scripts = (await result.json()) as Record<string, ScriptDetails>;
    const script = Object.values(scripts).find(
      (entry) => entry.type === ScriptType.MARKETPLACE_CONTRACT && entry.latest
    );
    if (!script) throw new Error("no latest marketplace script");

    const datum = await fetchApi(`handles/${script.handle}/datum`, {
      headers: { Accept: "text/plain" },
    });
    if (!datum.ok) {
      throw new Error(await datum.text());
    }
    return { ...script, datumCbor: await datum.text() };
  } catch {
    throw new Error(`Not deployed on ${network}`);
  }
};

export { fetchDeployedScript, fetchNetworkParameters, getUplcProgram };
