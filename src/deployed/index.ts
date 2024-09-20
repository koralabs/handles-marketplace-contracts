import { Network } from "@koralabs/kora-labs-common";

const deployedUTxOs: Record<
  Network,
  { txHash: string; txIndex: string } | undefined
> = {
  mainnet: undefined,
  preprod: {
    txHash: "ae153a7c091577b3b368afbd98b9ff7fccca537ca0621ffd24f9d6428152a23f",
    txIndex: "0",
  },
  preview: undefined,
};

export { deployedUTxOs };
