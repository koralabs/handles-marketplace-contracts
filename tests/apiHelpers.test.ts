import { makeAddress } from "@helios-lang/ledger";
import { makeRandomBip32PrivateKey } from "@helios-lang/tx-utils";
import { IS_PRODUCTION } from "@koralabs/kora-labs-common";
import { fetch } from "cross-fetch";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HANDLE_API_ENDPOINT,
  HANDLE_ME_API_KEY,
  KORA_USER_AGENT,
} from "../src/constants/index.js";
import {
  fetchApi as fetchHelperApi,
  fetchApiJson as fetchHelperApiJson,
} from "../src/helpers/api.js";
import type { Parameters } from "../src/types.js";
import { fetchDeployedScript, getUplcProgram } from "../src/utils/contract.js";

vi.mock("cross-fetch", () => ({
  fetch: vi.fn(),
}));

const fetchMock = vi.mocked(fetch);

const makeJsonResponse = (data: unknown, ok = true): Response =>
  ({ ok, json: vi.fn(async () => data) }) as unknown as Response;

const expectedApiHeaders = (headers: Record<string, string> = {}) => ({
  ...headers,
  "User-Agent": KORA_USER_AGENT,
  "api-key": IS_PRODUCTION ? "" : HANDLE_ME_API_KEY,
});

const makeParameters = (): Parameters => ({
  marketplaceAddress: makeAddress(
    false,
    makeRandomBip32PrivateKey().derivePubKey().hash()
  ).toBech32(),
  authorizers: [makeRandomBip32PrivateKey().derivePubKey().hash().toHex()],
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("API request helpers", () => {
  it("sends helper API requests through cross-fetch with expected headers", async () => {
    const response = makeJsonResponse({ ok: true });
    fetchMock.mockResolvedValue(response);

    await expect(
      fetchHelperApi("handles/test", {
        method: "POST",
        headers: { "x-request-id": "helper-request" },
        body: "payload",
      })
    ).resolves.toBe(response);

    expect(fetchMock).toHaveBeenCalledWith(
      `${HANDLE_API_ENDPOINT}/handles/test`,
      {
        headers: expectedApiHeaders({ "x-request-id": "helper-request" }),
        method: "POST",
        body: "payload",
      }
    );
  });

  it("adds JSON headers before reading helper API response bodies", async () => {
    const payload = { handle: "test" };
    fetchMock.mockResolvedValue(makeJsonResponse(payload));

    await expect(
      fetchHelperApiJson("handles/test", {
        headers: { "x-request-id": "helper-json" },
      })
    ).resolves.toEqual(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      `${HANDLE_API_ENDPOINT}/handles/test`,
      {
        headers: expectedApiHeaders({
          "x-request-id": "helper-json",
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
      }
    );
  });
});

describe("contract API helpers", () => {
  it("applies marketplace parameters to the optimized UPLC program", async () => {
    const result = await getUplcProgram(makeParameters());

    expect(result.ok).toBe(true);
    if (result.ok)
      expect(Array.from(result.data.toCbor()).length).toBeGreaterThan(0);
  });

  it("fetches the latest deployed marketplace script details", async () => {
    const scriptDetails = {
      handle: "mp_contract",
      latest: true,
      type: "marketplace_contract",
    };
    fetchMock.mockResolvedValue(makeJsonResponse(scriptDetails));

    await expect(fetchDeployedScript("preview")).resolves.toEqual(
      scriptDetails
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${HANDLE_API_ENDPOINT}/scripts?latest=true&type=marketplace_contract`,
      { headers: expectedApiHeaders() }
    );
  });

  it("wraps deployed script lookup failures with the target network", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ error: "missing" }, false));

    await expect(fetchDeployedScript("preprod")).rejects.toThrow(
      "Not deployed on preprod"
    );
  });
});
