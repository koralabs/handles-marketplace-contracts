import { get, getNetwork, loadEnv } from "./helpers";

import { Err, Ok } from "ts-res";

loadEnv();

const loadConfig = () => {
  const blockfrostApiKey = get("BLOCKFROST_API_KEY", "string");
  if (!blockfrostApiKey.ok) return Err(blockfrostApiKey.error);

  const handlePolicyId = get("HANDLE_POLICY_ID", "string");
  if (!handlePolicyId.ok) return Err(handlePolicyId.error);

  const network = getNetwork(blockfrostApiKey.data);

  return Ok({
    blockfrostApiKey: blockfrostApiKey.data,
    handlePolicyId: handlePolicyId.data,
    network,
  });
};

export { loadConfig };
