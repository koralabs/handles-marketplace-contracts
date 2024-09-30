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
  preview: {
    txHash: "a5a02a241f7c07399ab0f9550e4c3d16ee9890cb509240141640a1815088e0ba",
    txIndex: "0",
  },
};

export { deployedUTxOs };
