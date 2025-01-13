import { Ok } from "ts-res";

import { BLOCKFROST_API_KEY } from "./constants/index.js";
import { getNetwork } from "./helpers/index.js";

const loadConfig = () => {
  const network = getNetwork(BLOCKFROST_API_KEY);

  return Ok({
    blockfrostApiKey: BLOCKFROST_API_KEY,
    network,
  });
};

export { loadConfig };
