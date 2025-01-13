import { config } from "dotenv";
config({ path: `.env.${process.env.NODE_ENV || "development"}.local` });

export const {
  NODE_ENV = "",
  NETWORK = "",
  BLOCKFROST_API_KEY = "",
  KORA_USER_AGENT = "",
  HANDLE_ME_API_KEY = "",
} = process.env;
export const NETWORK_HOST =
  process.env.NETWORK?.toLocaleLowerCase() == "mainnet"
    ? ""
    : `${process.env.NETWORK?.toLowerCase()}.`;
export const HANDLE_API_ENDPOINT =
  process.env.HANDLE_API_ENDPOINT || `https://${NETWORK_HOST}api.handle.me`;

/// tx
export const MIN_LOVELACE = 3_000_000n; /// at leat 3 ada for each utxo

/// ada handle
export const HANDLE_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";

/// marketplace contract constants
export const MARKETPLACE_ADDRESS =
  "addr_test1qpzxs06vn7qagrqsm7wtquul8s5drxzk82wwr9qx3886m8lv7yv3mukuwdkne3v3va8dgd3xjkzqv90pu9gsc8hrl2xs9yqkej";
export const AUTHORIZERS = [
  "0c0647ff15d2df88897eb2471d9aba909cdcc842ad7c387ec0712725",
];
