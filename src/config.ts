import { get, getNetwork, loadEnv } from "./helpers";
import { Parameters } from "./types";

import * as helios from "@koralabs/helios";
import { Err, Ok } from "ts-res";

loadEnv({ path: ".env.preprod.local" });

const loadConfig = () => {
  const blockfrostApiKey = get("BLOCKFROST_API_KEY", "string");
  if (!blockfrostApiKey.ok) return Err(blockfrostApiKey.error);

  const network = getNetwork(blockfrostApiKey.data);

  /// set config
  helios.config.set({
    IS_TESTNET: network != "mainnet",
    AUTO_SET_VALIDITY_RANGE: true,
  });

  /// preprod
  const paramters: Parameters = {
    authorizers: [
      "9a9f87c5704f0402747965445059a97d6c7979fb807a336326081bf0",
      "370158dea7dd19863a5fb4a636f6c4c42332f1c71a83dcaee7597add",
      "a68625024851691fe9043efb9679d108df9e880304c76dbc81cadda7",
    ],
    marketplaceAddress:
      "addr_test1qrllqcqvj9gq6seh0s2zwq57wj4jvxlpcqjy4fgq53jy3vd5auja33ph6uqkmgncsmtxmqle0xmghue26zewqpkp5x2qvmjak4",
  };

  return Ok({
    blockfrostApiKey: blockfrostApiKey.data,
    network,
    paramters,
  });
};

export { loadConfig };
