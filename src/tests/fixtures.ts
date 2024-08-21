import { HANDLE_POLICY_ID, minLovelace, OWNER_PUB_KEY_HASH } from "./constants";
import { Payout } from "./types";
import { buildDatum } from "./utils";

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

  buyRedeemer = {
    constructor_0: [0],
  };
  buyRedeemerCbor: string = "";

  spendingUtxoId: string = "";
  payouts: Payout[] = [];
  owner: helios.PubKeyHash = OWNER_PUB_KEY_HASH;
  authorizers: helios.PubKeyHash[] = [];
  datumTag: helios.Datum | null = null;
  payoutOutputs: Payout[] = [];

  constructor(validatorHash: helios.ValidatorHash) {
    super(validatorHash);
  }

  async initialize() {
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
          index == 0 ? this.datumTag : undefined
        )
    );

    /// authorizers
    this.signatories = [...this.authorizers];
    return this;
  }
}

export { BuyFixture };
