import { get, getNetwork, loadEnv } from "./helpers";
import { Parameters } from "./types";

import * as helios from "@koralabs/helios";
import { Err, Ok } from "ts-res";

loadEnv();

const loadConfig = () => {
  const blockfrostApiKey = get("BLOCKFROST_API_KEY", "string");
  if (!blockfrostApiKey.ok) return Err(blockfrostApiKey.error);

  const network = getNetwork(blockfrostApiKey.data);

  const paramters: Parameters = {
    authorizers: [
      helios.PubKeyHash.fromHex(
        "633a0061fcdb8aca5b86ef3a177fdcb0c178ccca3066b0be7197f3a1"
      ),
    ],
    marketplaceAddress: helios.Address.fromBech32(
      "addr_test1qrzv95wsszgqedkjtkrmway4gsgdq87nu6ajrcjapyfslf2a6htngzcpqyjuzgq0wnvdtjdz28uwhv8d4pwds2gss5gslyymve"
    ),
  };

  return Ok({
    blockfrostApiKey: blockfrostApiKey.data,
    network,
    paramters,
  });
};

export { loadConfig };
