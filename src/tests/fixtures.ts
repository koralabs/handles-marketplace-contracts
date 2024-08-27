import { buildDatum } from "../datum";
import { Payout } from "../types";

import {
  HANDLE_POLICY_ID,
  minLovelace,
  ONWER_ADDRESS,
  SPAM_TOKEN_POLICY_ID,
} from "./constants";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";
import {
  convertJsontoCbor,
  Fixture,
  getAddressAtDerivation,
  getNewFakeUtxoId,
} from "@koralabs/kora-labs-contract-testing";

/// setup
helios.config.set({ IS_TESTNET: false, AUTO_SET_VALIDITY_RANGE: true });

class BuyFixture extends Fixture {
  handleName = "golddydev";

  payoutOutputsOffset = 0;
  buyRedeemer = { constructor_0: [0] };
  buyRedeemerCbor: string = "";

  spendingUtxoId: string = "";
  payouts: Payout[] = [];
  owner: helios.Address = ONWER_ADDRESS;
  authorizers: helios.PubKeyHash[] = [];
  datumTag: helios.Datum | null = null;
  payoutOutputs: Payout[] = [];

  constructor(validatorHash: helios.ValidatorHash) {
    super(validatorHash);
  }

  async initialize() {
    this.buyRedeemer = {
      constructor_0: [this.payoutOutputsOffset],
    };
    this.buyRedeemerCbor = await convertJsontoCbor(this.buyRedeemer);
    this.redeemer = helios.UplcData.fromCbor(this.buyRedeemerCbor);
    const datum = await buildDatum(this.payouts, this.owner);
    this.inputs = [
      new helios.TxInput( // money & collateral
        new helios.TxOutputId(getNewFakeUtxoId()),
        new helios.TxOutput(
          await getAddressAtDerivation(0),
          new helios.Value(BigInt(500_000_000))
        )
      ),
      new helios.TxInput( // spam money
        new helios.TxOutputId(getNewFakeUtxoId()),
        new helios.TxOutput(
          await getAddressAtDerivation(0),
          new helios.Value(BigInt(100_000_000), [
            [
              SPAM_TOKEN_POLICY_ID,
              [[Buffer.from("Spam").toString("hex"), 100_000_000]],
            ],
          ])
        )
      ),
      new helios.TxInput( /// Handle NFT to Buy
        new helios.TxOutputId(this.spendingUtxoId),
        new helios.TxOutput(
          this.scriptAddress,
          new helios.Value(minLovelace, [
            [
              HANDLE_POLICY_ID,
              [
                [
                  `${AssetNameLabel.LBL_222}${Buffer.from(
                    this.handleName
                  ).toString("hex")}`,
                  1,
                ],
              ],
            ],
          ]),
          datum
        )
      ),
    ];

    this.outputs = this.payoutOutputs.map(
      (payout, index) =>
        new helios.TxOutput( /// marketplace address
          payout.address,
          new helios.Value(payout.amountLovelace),
          index == this.payoutOutputsOffset ? this.datumTag : undefined
        )
    );

    /// authorizers
    this.signatories = [...this.authorizers];
    return this;
  }
}

class WithdrawOrUpdateFixture extends Fixture {
  handleName = "golddydev";

  withdrawOrUpdateRedeemer = { constructor_1: [] };
  withdrawOrUpdateRedeemerCbor: string = "";

  payouts: Payout[] = [];
  newPayouts: Payout[] | undefined = undefined;
  owner: helios.Address = ONWER_ADDRESS;

  nftOutputAddress: helios.Address = helios.Address.fromHash(this.owner);

  constructor(validatorHash: helios.ValidatorHash) {
    super(validatorHash);
  }

  async initialize() {
    this.withdrawOrUpdateRedeemerCbor = await convertJsontoCbor(
      this.withdrawOrUpdateRedeemer
    );
    this.redeemer = helios.UplcData.fromCbor(this.withdrawOrUpdateRedeemerCbor);
    const datum = await buildDatum(this.payouts, this.owner);

    const nftValue = new helios.Value(minLovelace, [
      [
        HANDLE_POLICY_ID,
        [
          [
            `${AssetNameLabel.LBL_222}${Buffer.from(this.handleName).toString(
              "hex"
            )}`,
            1,
          ],
        ],
      ],
    ]);
    this.inputs = [
      new helios.TxInput( // money & collateral
        new helios.TxOutputId(getNewFakeUtxoId()),
        new helios.TxOutput(
          await getAddressAtDerivation(0),
          new helios.Value(BigInt(500_000_000))
        )
      ),
      new helios.TxInput( /// Handle NFT to withdraw or update
        new helios.TxOutputId(getNewFakeUtxoId()),
        new helios.TxOutput(this.scriptAddress, nftValue, datum)
      ),
    ];

    const newDatum = this.newPayouts
      ? await buildDatum(this.newPayouts, this.owner)
      : null;
    this.outputs = [
      new helios.TxOutput(this.nftOutputAddress, nftValue, newDatum),
    ];
    return this;
  }
}

export { BuyFixture, WithdrawOrUpdateFixture };
