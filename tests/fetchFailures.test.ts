// When the deployed-script lookup or the network-parameter endpoint is unreachable, every builder must
// refuse with a specific error rather than building against missing data.
import { bytesToHex } from "@helios-lang/codec-utils";
import { AssetNameLabel } from "@koralabs/kora-labs-common";
import { afterEach, describe, expect, vi } from "vitest";

import { buy, buyWithAuth } from "../src/buy.js";
import { list } from "../src/list.js";
import { update } from "../src/update.js";
import { convertTxInputToIUTxO } from "../src/utils/index.js";
import { withdraw } from "../src/withdraw.js";
import { myTest } from "./setup.js";

const errorOf = (r: { ok: boolean; error?: unknown }) => (r.ok ? "OK" : (r.error as Error).message);

describe.sequential("unreachable upstreams", () => {
  afterEach(() => vi.unstubAllGlobals());

  myTest(
    "builders refuse when the script lookup or network parameters cannot be fetched",
    async ({ emulator, user1Wallet, testHandleName, network, refScriptDetail }) => {
      const utxos = await emulator.getUtxos(user1Wallet.address);
      const cborUtxos = utxos.map((u) => bytesToHex(u.toCbor(true)));
      const handleHex = `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`;
      const listingIUtxo = convertTxInputToIUTxO(utxos[0]);
      const base = { cborUtxos, changeBech32Address: user1Wallet.address.toBech32(), handleHex, listingIUtxo };
      const builders = {
        list: (c: object) => list({ ...base, payouts: [], ...c } as never, network),
        withdraw: (c: object) => withdraw({ ...base, ...c } as never, network),
        update: (c: object) => update({ ...base, newPayouts: [], ...c } as never, network),
        buy: (c: object) => buy({ ...base, ...c } as never, network),
        buyWithAuth: (c: object) => buyWithAuth({ ...base, authorizerPubKeyHash: "00".repeat(28), ...c } as never, network),
      };

      for (const [name, build] of Object.entries(builders)) {
        vi.stubGlobal("fetch", async () => {
          throw new Error("network down");
        });
        // no customRefScriptDetail: the script lookup itself fails
        expect(errorOf(await build({})), name).toBe("Failed to fetch ref script");
        // script supplied but the network-parameter endpoint is down (buyWithAuth checks the authorizer later)
        if (name !== "withdraw") {
          expect(errorOf(await build({ customRefScriptDetail: refScriptDetail })), name).toBe("Failed to fetch network parameter");
        }
        vi.unstubAllGlobals();
      }
    }
  );
});
