import { get, getNetwork, loadEnv } from "./helpers";
import { Parameters } from "./types";

import * as helios from "@koralabs/helios";
import { Err, Ok } from "ts-res";

loadEnv();

const loadConfig = () => {
  const blockfrostApiKey = get("BLOCKFROST_API_KEY", "string");
  if (!blockfrostApiKey.ok) return Err(blockfrostApiKey.error);

  const handlePolicyId = get("HANDLE_POLICY_ID", "string");
  if (!handlePolicyId.ok) return Err(handlePolicyId.error);

  const network = getNetwork(blockfrostApiKey.data);

  const paramters: Parameters = {
    authorizers: [
      helios.PubKeyHash.fromHex(
        "633a0061fcdb8aca5b86ef3a177fdcb0c178ccca3066b0be7197f3a1"
      ),
    ],
    marketplaceAddress: helios.Address.fromBech32(
      "addr_test1qp3n5qrplndc4jjmsmhn59mlmjcvz7xvegcxdv97wxtl8gthwj7fp7cy0tpvdzmd46u3c9tvjfxrpjc2faaqzm43wrpshmp3xw"
    ),
    // authorizers: [
    //   helios.PubKeyHash.fromHex(
    //     "ea018bbdec1b9963f3cf37a7d7d80c0fd16d29722d0453fcfa9549ae"
    //   ),
    // ],
    // marketplaceAddress: helios.Address.fromBech32(
    //   "addr_test1qr4qrzaaasdejclneum6047cps8azmffwgksg5lul225nth58fldnc83x5jnfxg37rmvmdv2rn3emrmh9ptry9vzvjxqn5c55p"
    // ),
  };

  return Ok({
    blockfrostApiKey: blockfrostApiKey.data,
    handlePolicyId: handlePolicyId.data,
    network,
    paramters,
  });
};

export { loadConfig };
