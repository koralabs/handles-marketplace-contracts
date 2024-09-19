const getNetwork = (apiKey: string): "mainnet" | "preview" | "preprod" => {
  const network = apiKey.substring(0, 7);

  if (network !== "mainnet" && network !== "preview" && network !== "preprod") {
    throw new Error(`Unknown network ${network}`);
  }

  return network;
};

export { getNetwork };
