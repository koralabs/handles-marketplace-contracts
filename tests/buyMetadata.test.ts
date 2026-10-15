import { ScriptDetails } from "@koralabs/kora-labs-common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buy, buyWithAuth, BuyWithAuthConfig } from "../src/buy.js";
import { deployedScripts } from "../src/deployed/index.js";

const [scriptAddress, deployment] = Object.entries(deployedScripts.preview)[0];
const invalidMetadata: {
  field: string;
  patch: Partial<ScriptDetails>;
  message: string;
}[] = [
  {
    field: "compiled script CBOR",
    patch: { cbor: "" },
    message: "Deploy script cbor is empty",
  },
  {
    field: "parameters datum CBOR",
    patch: { datumCbor: "" },
    message: "Deploy script's datum cbor is empty",
  },
  {
    field: "reference script UTxO",
    patch: { refScriptUtxo: undefined },
    message: "Deployed script UTxO is not defined",
  },
  {
    field: "reference script address",
    patch: { refScriptAddress: undefined },
    message: "Deployed script UTxO is not defined",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  { label: "buy", buyHandle: buy },
  { label: "buyWithAuth", buyHandle: buyWithAuth },
])("$label deployment metadata", ({ buyHandle }) => {
  // Buyers receive a specific metadata error before network access or transaction building.
  // Removing any guard, or changing the reference-field OR to AND, breaks its case.
  it.each(invalidMetadata)(
    "rejects missing $field",
    async ({ patch, message }) => {
      const fetch = vi
        .fn()
        .mockRejectedValue(new Error("unexpected network access"));
      vi.stubGlobal("fetch", fetch);
      const config: BuyWithAuthConfig = {
        changeBech32Address: scriptAddress,
        cborUtxos: [],
        handleHex: deployment.handleHex,
        listingIUtxo: {
          address: scriptAddress,
          tx_id: "ab".repeat(32),
          index: 0,
          lovelace: 2_000_000,
        },
        authorizerPubKeyHash: "cd".repeat(28),
        customRefScriptDetail: { ...deployment, ...patch },
      };

      const result = await buyHandle(config, "preview");

      expect(result.ok).toBe(false);
      if (result.ok)
        throw new Error("Incomplete metadata unexpectedly built a transaction");
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe(message);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
