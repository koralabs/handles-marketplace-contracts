import { fetchApi } from "../helpers";
import { Parameters } from "../types";

import * as helios from "@koralabs/helios";
import { Network, ScriptDetails } from "@koralabs/kora-labs-common";
import { marketplaceContract } from "contract/marketplace.helios";

const getHeliosProgram = async (
  parameters: Parameters
): Promise<helios.Program> => {
  const program = helios.Program.new(marketplaceContract);
  program.parameters.AUTHORIZERS = parameters.authorizers.map((authorizer) =>
    helios.PubKeyHash.fromHex(authorizer)
  );
  program.parameters.MARKETPLACE_ADDRESS = helios.Address.fromBech32(
    parameters.marketplaceAddress
  );
  return program;
};

const getUplcProgram = async (
  parameters: Parameters,
  optimize: boolean = false
): Promise<helios.UplcProgram> => {
  const program = await getHeliosProgram(parameters);

  return program.compile(optimize);
};

const getUplcProgramDetail = async (
  network: Network,
  parameters: Parameters,
  optimize: boolean = false
): Promise<{ cbor: string; hash: string; address: string }> => {
  const uplcProgram = await getUplcProgram(parameters, optimize);
  const cbor = helios.bytesToHex(uplcProgram.toCbor());
  const hash = helios.bytesToHex(uplcProgram.hash());
  const address = helios.Address.fromHash(
    helios.PubKeyHash.fromHex(hash),
    network != "mainnet"
  ).toBech32();
  return {
    cbor,
    hash,
    address,
  };
};

const fetchLatestmarketplaceScriptDetail = async (): Promise<ScriptDetails> => {
  const result = await fetchApi(
    `scripts?latest=true&type=marketplace_contract`
  );

  if (!result.ok) {
    const error = await result.json();
    throw new Error(error?.message || String(error));
  }

  const data = (await result.json()) as unknown as ScriptDetails;
  return data;
};

export {
  fetchLatestmarketplaceScriptDetail,
  getHeliosProgram,
  getUplcProgram,
  getUplcProgramDetail,
};
