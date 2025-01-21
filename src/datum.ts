import { blake2b } from "@helios-lang/crypto";
import {
  Address,
  decodeTxOutputDatum,
  InlineTxOutputDatum,
  makeAddress,
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

const decodeCredentialFromData = (data: UplcData): SpendingCredential => {
  const credentialConstrData = expectConstrData(data, undefined, 1);
  if (credentialConstrData.tag === 0) {
    // verification key credential
    return makePubKeyHash(
      expectByteArrayData(credentialConstrData.fields[0]).toHex()
    );
  } else {
    // script credential
    return makeValidatorHash(
      expectByteArrayData(credentialConstrData.fields[0]).toHex()
    );
  }
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

const decodeStakingCredentialFromData = (
  data: UplcData
): StakingCredential | undefined => {
  const stakingCredentialOptConstrData = expectConstrData(data);
  if (stakingCredentialOptConstrData.tag == 0) {
    // staking credential opt is Some
    const stakeCredentialConstrData = expectConstrData(
      stakingCredentialOptConstrData.fields[0],
      0,
      1
    );
    const credentialConstrData = expectConstrData(
      stakeCredentialConstrData.fields[0],
      undefined,
      1
    );
    if (credentialConstrData.tag === 0) {
      // verification key credential
      return makePubKeyHash(
        expectByteArrayData(credentialConstrData.fields[0]).toHex()
      );
    } else {
      // staking script credential
      return makeStakingValidatorHash(
        expectByteArrayData(credentialConstrData.fields[0]).toHex()
      );
    }
  } else {
    return undefined;
  }
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
): Address => {
  const isMainnet = network == "mainnet";

  const addressConstrData = expectConstrData(data, 0, 2);
  const spendingCredential = decodeCredentialFromData(
    addressConstrData.fields[0]
  );
  const stakingCredential = decodeStakingCredentialFromData(
    addressConstrData.fields[1]
  );
  return makeAddress(isMainnet, spendingCredential, stakingCredential);
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
  const datumConstrData = expectConstrData(data, 0, 2);

  const payoutsListData = expectListData(
    datumConstrData.fields[0],
    "Payouts must be List"
  );
  const owner = expectByteArrayData(
    datumConstrData.fields[1],
    "Owner must be ByteArray"
  ).toHex();

  const payouts = payoutsListData.items.map((item) => {
    const payoutConstrData = expectConstrData(item, 0, 2);
    const address = decodeAddressFromData(payoutConstrData.fields[0], network);
    const amount = expectIntData(
      payoutConstrData.fields[1],
      "Amount must be Int"
    ).value;
    return {
      address: address.toString(),
      amountLovelace: amount,
    } as Payout;
  });

  return {
    payouts,
    owner,
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
    buildAddressData(marketplaceAddress.toString()),
    makeListData(
      authorizers.map((authorizer) => makeByteArrayData(authorizer.bytes))
    ),
  ]);
  return makeInlineTxOutputDatum(data);
};

const decodeSCParametersDatumCbor = (
  cbor: string,
  network: NetworkName
): Parameters => {
  const decoded = decodeTxOutputDatum(cbor);
  if (!decoded.data) throw new Error("Parameter Datum Cbor is not correct");

  const listData = expectListData(decoded.data, "Parameters must be List");

  const marketplaceAddress = decodeAddressFromData(listData.items[0], network);

  const authorizersListData = expectListData(
    listData.items[1],
    "Authorizers must be List"
  );
  const authorizers: string[] = authorizersListData.items.map((item) =>
    expectByteArrayData(item, "Authorizers item must be ByteArray").toHex()
  );

  return {
    marketplaceAddress: marketplaceAddress.toString(),
    authorizers,
  };
};

export {
  buildDatum,
  buildDatumTag,
  buildSCParametersDatum,
  decodeDatum,
  decodeSCParametersDatumCbor,
  makeSCParametersUplcValues,
};
