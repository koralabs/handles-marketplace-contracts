import { HANDLE_POLICY_ID, minLovelace, OWNER_PUB_KEY_HASH } from "./constants";
import { Payout } from "./types";
import { buildDatum } from "./utils";

import * as helios from "@koralabs/helios";
import { AssetNameLabel } from "@koralabs/kora-labs-common";
import {
  Fixture,
  getAddressAtDerivation,
  getNewFakeUtxoId,
} from "@koralabs/kora-labs-contract-testing";

/// setup
helios.config.set({ IS_TESTNET: false, AUTO_SET_VALIDITY_RANGE: true });

class BuyFixture extends Fixture {
  handleName = "golddydev";
  payouts: Payout[] = [];
  owner: helios.PubKeyHash = OWNER_PUB_KEY_HASH;
  authorizers: helios.PubKeyHash[] = [];
  datumTag: helios.Datum = new helios.Datum();
  payoutOutputs: Payout[] = [];

  async initialize() {
    const datum = await buildDatum(this.payouts, this.owner);
    this.inputs = [
      new helios.TxInput( /// Handle NFT to Buy
        new helios.TxOutputId(getNewFakeUtxoId()),
        new helios.TxOutput(
          await getAddressAtDerivation(0),
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
