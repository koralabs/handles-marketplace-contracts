import { buildDatumTag } from "../datum";
import { adaToLovelace } from "../utils";

import {
  AUTHORIZERS_PUB_KEY_HAHSES,
  MARKETPLACE_ADDRESS,
  PAYOUT_ADDRESSES,
  SPAM_TOKEN_POLICY_ID,
} from "./constants";
import { BuyFixture, WithdrawOrUpdateFixture } from "./fixtures";

import * as helios from "@koralabs/helios";
import {
  ContractTester,
  getAddressAtDerivation,
  getNewFakeUtxoId,
  Test,
} from "@koralabs/kora-labs-contract-testing";
import fs from "fs/promises";

const runTests = async (file: string) => {
  const walletAddress = await getAddressAtDerivation(0);
  const tester = new ContractTester(walletAddress, false);
  await tester.init();

  const contractFile = (await fs.readFile(file)).toString();
  const program = helios.Program.new(contractFile); //new instance

  /// --------------- BUY ---------------

  /// ---------- Should Approve ----------
  /// Buy without Authorizer, paying Marketplace Fee
  await tester.test(
    "Buy",
    "can buy nft without authorizer",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.payoutOutputs = [
        {
          address: MARKETPLACE_ADDRESS,
          amountLovelace: adaToLovelace(Math.ceil((100 + 150 + 80) / 49)),
        },
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      return await fixture.initialize();
    })
  );

  /// ---------- Should Approve ----------
  /// Buy without Authorizer, paying Marketplace Fee, with payout_outputs_offset = 4
  await tester.test(
    "Buy",
    "can buy nft without authorizer with offset",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.payoutOutputsOffset = 4;
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.payoutOutputs = [
        { address: PAYOUT_ADDRESSES[4], amountLovelace: adaToLovelace(10) },
        { address: PAYOUT_ADDRESSES[4], amountLovelace: adaToLovelace(10) },
        { address: PAYOUT_ADDRESSES[4], amountLovelace: adaToLovelace(5) },
        { address: PAYOUT_ADDRESSES[4], amountLovelace: adaToLovelace(2) },
        {
          address: MARKETPLACE_ADDRESS,
          amountLovelace: adaToLovelace(Math.ceil((100 + 150 + 80) / 49)),
        },
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      return await fixture.initialize();
    })
  );

  /// ---------- Should Approve ----------
  /// Buy with Authorizer, not paying Marketplace Fee
  await tester.test(
    "Buy",
    "can buy nft with authorizer",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.authorizers = [AUTHORIZERS_PUB_KEY_HAHSES[0]];
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.payoutOutputs = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      return await fixture.initialize();
    })
  );

  /// ---------- Should Deny - Marketplace Output Datum Tag is not correct ----------
  /// Buy without Authorizer, paying Marketplace Fee
  await tester.test(
    "Buy",
    "can not buy nft without authorizer, if marketplace output datum tag is not correct",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.spendingUtxoId = getNewFakeUtxoId();

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.payoutOutputs = [
        {
          address: MARKETPLACE_ADDRESS,
          amountLovelace: adaToLovelace(2),
        },
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      return await fixture.initialize();
    }),
    false,
    "Marketplace fee output's datum must be match datum tag"
  );

  /// ---------- Should Deny - Marketplace Fee is not correct ----------
  /// Buy without Authorizer, paying Marketplace Fee
  await tester.test(
    "Buy",
    "can not buy nft without authorizer, if marketplace fee is not correct",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.payoutOutputs = [
        {
          address: MARKETPLACE_ADDRESS,
          amountLovelace: adaToLovelace(2),
        },
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      return await fixture.initialize();
    }),
    false,
    "Marketplace fee must be paid"
  );

  /// ---------- Should Deny - Marketplace Address is not correct ----------
  /// Buy without Authorizer, paying Marketplace Fee
  await tester.test(
    "Buy",
    "can not buy nft without authorizer, if marketplace address is not correct",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.payoutOutputs = [
        {
          address: PAYOUT_ADDRESSES[4], /// wrong marketplace address
          amountLovelace: adaToLovelace(Math.ceil((100 + 150 + 80) / 49)),
        },
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      return await fixture.initialize();
    }),
    false,
    "Marketplace address must be correct"
  );

  /// ---------- Should Deny - Token Spamming ----------
  /// Buy without Authorizer, paying Marketplace Fee
  await tester.test(
    "Buy",
    "can not buy nft without authorizer, if token spam to marketplace address",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.payoutOutputs = [
        {
          address: MARKETPLACE_ADDRESS, /// wrong marketplace address
          amountLovelace: adaToLovelace(Math.ceil((100 + 150 + 80) / 49)),
        },
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      const initialized = await fixture.initialize();
      initialized.outputs?.[0].setValue(
        new helios.Value(adaToLovelace(Math.ceil((100 + 150 + 80) / 49)), [
          [
            SPAM_TOKEN_POLICY_ID,
            [[Buffer.from("Spam").toString("hex"), 100_000_000]],
          ],
        ])
      );
      return initialized;
    }),
    false,
    "Must pay with only lovelace"
  );

  /// ---------- Should Deny - Authorizer is not correct ----------
  /// Buy with Authorizer, not paying Marketplace Fee
  await tester.test(
    "Buy",
    "can not buy nft with authorizer, if authorizer is not correct",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.authorizers = [AUTHORIZERS_PUB_KEY_HAHSES[2]];
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.payoutOutputs = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      return await fixture.initialize();
    }),
    false,
    "First output address must be matched with payout"
  );

  /// --------------- WITHDRAW or UPDATE ---------------

  /// ---------- Should Approve ----------
  /// Withdraw
  await tester.test(
    "Withdraw",
    "can withdraw nft",
    new Test(program, async (hash) => {
      const fixture = new WithdrawOrUpdateFixture(hash);

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.signatories = [fixture.owner];
      return await fixture.initialize();
    })
  );

  /// ---------- Should Deny - Owner not signed ----------
  /// Withdraw without owner signature
  await tester.test(
    "Withdraw",
    "can not withdraw nft, if owner not signed",
    new Test(program, async (hash) => {
      const fixture = new WithdrawOrUpdateFixture(hash);

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      return await fixture.initialize();
    }),
    false
  );

  /// ---------- Should Approve ----------
  /// Update
  await tester.test(
    "Update",
    "can update nft",
    new Test(program, async (hash) => {
      const fixture = new WithdrawOrUpdateFixture(hash);

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.newPayouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
      ];
      fixture.signatories = [fixture.owner];
      return await fixture.initialize();
    })
  );

  /// ---------- Should Deny - Owner not signed ----------
  /// Update without owner signature
  await tester.test(
    "Update",
    "can not update nft, if owner not signed",
    new Test(program, async (hash) => {
      const fixture = new WithdrawOrUpdateFixture(hash);

      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.newPayouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
      ];
      return await fixture.initialize();
    }),
    false
  );
};

(async () => {
  await runTests("src/contract/marketplace.helios");
})();
