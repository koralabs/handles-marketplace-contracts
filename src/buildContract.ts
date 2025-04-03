import {
  makeAddress,
  makePubKeyHash,
  makeValidatorHash,
} from "@helios-lang/ledger";
import { decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";

import {
  optimizedCompiledCode,
  unoptimizedCompiledCode,
} from "./contracts/plutus-v2/contract.js";
import { buildSCParametersDatum, makeSCParametersUplcValues } from "./datum.js";
import { Parameters } from "./types.js";

export interface BuildContractConfig {
  parameters: Parameters;
}

export const buildContract = ({ parameters }: BuildContractConfig) => {
  const parametersUplcValues = makeSCParametersUplcValues(parameters);
  const parametersDatum = buildSCParametersDatum(
    makeAddress(parameters.marketplaceAddress),
    parameters.authorizers.map((authorizer) => makePubKeyHash(authorizer))
  );
  const uplcProgram = decodeUplcProgramV2FromCbor(optimizedCompiledCode).apply(
    parametersUplcValues
  );
  const unoptimizedUplcProgram = decodeUplcProgramV2FromCbor(
    unoptimizedCompiledCode
  ).apply(parametersUplcValues);

  const uplcProgramHash = uplcProgram.hash();
  const uplcProgramValidatorHash = makeValidatorHash(uplcProgramHash);
  const uplcProgramValidatorAddress = makeAddress(
    true,
    uplcProgramValidatorHash
  );

  console.log(
    "SCRIPT",
    JSON.stringify({
      [uplcProgramValidatorAddress.toBech32()]: {
        handle: "marketplace@handle_scripts",
        handleHex:
          "000de1406d61726b6574706c6163654068616e646c655f73637269707473",
        type: "ScriptType.MARKETPLACE_CONTRACT",
        validatorHash: Buffer.from(uplcProgramHash).toString("hex"),
        cbor: Buffer.from(uplcProgram.toCbor()).toString("hex"),
        unoptimizedCbor: Buffer.from(unoptimizedUplcProgram.toCbor()).toString(
          "hex"
        ),
        datumCbor: Buffer.from(parametersDatum.toCbor()).toString("hex"),
        latest: true,
        refScriptAddress: null,
        refScriptUtxo: null,
        txBuildVersion: 1,
      },
    })
  );
};
