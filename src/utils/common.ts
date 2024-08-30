import preprodParams from "./params/preprod.json";
import previewParams from "./params/preview.json";

import * as helios from "@koralabs/helios";
import { Network } from "@koralabs/kora-labs-common";
import Decimal from "decimal.js";

const adaToLovelace = (ada: number): bigint =>
  BigInt(new Decimal(ada).mul(Math.pow(10, 6)).floor().toString());

const fetchNetworkParameters = async (
  network: Network
): Promise<helios.NetworkParams> => {
  if (network == "preview") return new helios.NetworkParams(previewParams);
  if (network == "preprod") return new helios.NetworkParams(preprodParams);
  const networkParams = new helios.NetworkParams(
    await fetch(
      `https://d1t0d7c2nekuk0.cloudfront.net/${network.toLowerCase()}.json`
    ).then((response) => response.json())
  );
  return networkParams;
};

export { adaToLovelace, fetchNetworkParameters };
