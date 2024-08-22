import * as helios from "@koralabs/helios";

const HANDLE_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
const SPAM_TOKEN_POLICY_ID =
  "01234567890123456789012345678901234567890123456789999999";
const AUTHORIZERS_PUB_KEY_HAHSES = [
  helios.PubKeyHash.fromHex(
    "01234567890123456789012345678901234567890123456789000001"
  ), /// valid
  helios.PubKeyHash.fromHex(
    "01234567890123456789012345678901234567890123456789000002"
  ),
  helios.PubKeyHash.fromHex(
    "01234567890123456789012345678901234567890123456789000003"
  ),
];
const OWNER_PUB_KEY_HASH = helios.PubKeyHash.fromHex(
  "01234567890123456789012345678901234567890123456789111111"
);

const MARKETPLACE_ADDRESS = helios.Address.fromHash(
  helios.PubKeyHash.fromHex(
    "01234567890123456789012345678901234567890123456789222222"
  )
);

const PAYOUT_ADDRESSES = [
  helios.Address.fromHash(
    helios.PubKeyHash.fromHex(
      "01234567890123456789012345678901234567890123456789555551"
    )
  ),
  helios.Address.fromHash(
    helios.PubKeyHash.fromHex(
      "01234567890123456789012345678901234567890123456789555552"
    )
  ),
  helios.Address.fromHash(
    helios.PubKeyHash.fromHex(
      "01234567890123456789012345678901234567890123456789555553"
    )
  ),
  helios.Address.fromHash(
    helios.PubKeyHash.fromHex(
      "01234567890123456789012345678901234567890123456789555554"
    )
  ),
  helios.Address.fromHash(
    helios.PubKeyHash.fromHex(
      "01234567890123456789012345678901234567890123456789555555"
    )
  ),
];

const minLovelace = 10_000_000n;

export {
  HANDLE_POLICY_ID,
  SPAM_TOKEN_POLICY_ID,
  AUTHORIZERS_PUB_KEY_HAHSES,
  OWNER_PUB_KEY_HASH,
  MARKETPLACE_ADDRESS,
  PAYOUT_ADDRESSES,
  minLovelace,
};
