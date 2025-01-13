import { blake2b } from "@helios-lang/crypto";
import {
  Address,
  decodeTxOutputDatum,
  InlineTxOutputDatum,
  makeAddress,
  makeDummyPubKeyHash,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeStakingValidatorHash,
  makeValidatorHash,
  PubKeyHash,
  SpendingCredential,
  StakingCredential,
  TxOutputDatum,
  TxOutputId,
} from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import {
  expectByteArrayData,
  expectConstrData,
  expectIntData,
  expectListData,
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  makeListData,
  makeUplcDataValue,
  UplcData,
  UplcValue,
} from "@helios-lang/uplc";

import { MarketplaceDatum, Parameters, Payout } from "./types.js";

const buildDatumTag = (outputRef: TxOutputId): InlineTxOutputDatum => {
  const cbor = outputRef.toUplcData().toCbor();
  const hashed = blake2b(cbor);
  return makeInlineTxOutputDatum(makeByteArrayData(hashed));
};

const buildCredentialData = (credential: SpendingCredential): UplcData => {
  return makeConstrData(credential.kind == "PubKeyHash" ? 0 : 1, [
    makeByteArrayData(credential.toHex()),
  ]);
};

const buildingStakingCredentialData = (
  stakingCredential: StakingCredential | undefined
): UplcData => {
  if (!stakingCredential) return makeConstrData(1, []);
  return makeConstrData(0, [
    makeConstrData(0, [
      makeConstrData(stakingCredential.kind == "PubKeyHash" ? 0 : 1, [
        makeByteArrayData(stakingCredential.toHex()),
      ]),
    ]),
  ]);
};

const buildAddressData = (bech32Address: string): UplcData => {
  const address = makeAddress(bech32Address);
  const { spendingCredential, stakingCredential } = address;
  return makeConstrData(0, [
    buildCredentialData(spendingCredential),
    buildingStakingCredentialData(stakingCredential),
  ]);
};

const decodeAddressFromData = (
  data: UplcData,
  network: NetworkName
): string => {
  const addressData = expectConstrData(data, 0, 2);
  const paymentCredentialData = expectConstrData(addressData.fields[0]);
  const stakingCredentialData = expectConstrData(addressData.fields[1]);

  let spendingCredential: SpendingCredential = makeDummyPubKeyHash();
  let stakingCredential: StakingCredential | undefined = undefined;

  if (paymentCredentialData.tag === 0) {
    spendingCredential = makePubKeyHash(
      expectByteArrayData(paymentCredentialData.fields[0]).toHex()
    );
  } else {
    spendingCredential = makeValidatorHash(
      expectByteArrayData(paymentCredentialData.fields[0]).toHex()
    );
  }

  if (stakingCredentialData.tag == 0) {
    const inlineCredentialData = expectConstrData(
      stakingCredentialData.fields[0],
      0,
      1
    );
    const credentialData = expectConstrData(inlineCredentialData.fields[0]);
    if (credentialData.tag === 0) {
      stakingCredential = makePubKeyHash(
        expectByteArrayData(credentialData.fields[0]).toHex()
      );
    } else {
      stakingCredential = makeStakingValidatorHash(
        expectByteArrayData(credentialData.fields[0]).toHex()
      );
    }
  }
  return makeAddress(
    network == "mainnet",
    spendingCredential,
    stakingCredential
  ).toBech32();
};

const buildDatum = (datum: MarketplaceDatum): InlineTxOutputDatum => {
  const data = makeConstrData(0, [
    makeListData(
      datum.payouts.map((payout) =>
        makeConstrData(0, [
          buildAddressData(payout.address),
          makeIntData(payout.amountLovelace),
        ])
      )
    ),
    makeByteArrayData(datum.owner),
  ]);
  return makeInlineTxOutputDatum(data);
};

const decodeDatum = (
  datum: TxOutputDatum,
  network: NetworkName
): MarketplaceDatum => {
  if (datum.kind != "InlineTxOutputDatum")
    throw new Error("Must be inline datum");
  const data = datum.data;
  const datumData = expectConstrData(data, 0, 2);
  const payoutsData = expectListData(
    datumData.fields[0],
    "Payouts Data must be List"
  );
  const ownerData = expectByteArrayData(
    datumData.fields[1],
    "Owner Data must be ByteArray"
  );

  const payouts = payoutsData.items.map((itemData) => {
    const payoutData = expectConstrData(itemData, 0, 2);
    const address = decodeAddressFromData(payoutData.fields[0], network);
    const amountData = expectIntData(
      payoutData.fields[1],
      "Amount Data must be Int"
    );
    return {
      address,
      amountLovelace: amountData.value,
    } as Payout;
  });

  return {
    payouts,
    owner: ownerData.toHex(),
  };
};

const makeSCParametersUplcValues = (parameters: Parameters): UplcValue[] => {
  const { marketplaceAddress, authorizers } = parameters;
  return [
    makeUplcDataValue(buildAddressData(marketplaceAddress)),
    makeUplcDataValue(
      makeListData(
        authorizers.map((authorizer) => makeByteArrayData(authorizer))
      )
    ),
  ];
};

const buildSCParametersDatum = (
  marketplaceAddress: Address,
  authorizers: PubKeyHash[]
) => {
  const data = makeListData([
    makeByteArrayData(marketplaceAddress.bytes),
    makeListData(
      authorizers.map((authorizer) => makeByteArrayData(authorizer.bytes))
    ),
  ]);
  return makeInlineTxOutputDatum(data);
};

const decodeSCParametersDatum = (cbor: string): Parameters => {
  const decoded = decodeTxOutputDatum(cbor);
  if (!decoded.data) throw new Error("Parameter Datum Cbor is not correct");
  const listData = expectListData(decoded.data, "Parameter Datum must be List");
  const marketplaceAddressData = expectByteArrayData(
    listData.items[0],
    "Marketplace Address Data must be ByteArray"
  );
  const authorizersData = expectListData(
    listData.items[1],
    "Authorizers Data must be List"
  );

  const marketplaceAddress = makeAddress(marketplaceAddressData).toBech32();
  const authorizers: string[] = authorizersData.items.map((item) =>
    expectByteArrayData(item, "Authorizer Data must be ByteArray").toHex()
  );

  return {
    marketplaceAddress,
    authorizers,
  };
};

export {
  buildDatum,
  buildDatumTag,
  buildSCParametersDatum,
  decodeDatum,
  decodeSCParametersDatum,
  makeSCParametersUplcValues,
};
