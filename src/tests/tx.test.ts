import { MARKETPLACE_ADDRESS, PAYOUT_ADDRESSES } from "./constants";
import { BuyFixture } from "./fixtures";
import { adaToLovelace, buildDatumTag } from "./utils";

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
      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );
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

  /// ---------- Should Deny - Marketplace Output Datum Tag is not correct ----------
  /// Buy without Authorizer, paying Marketplace Fee
  await tester.test(
    "Buy",
    "can not buy nft without authorizer, if marketplace output datum tag is not correct",
    new Test(program, async (hash) => {
      const fixture = new BuyFixture(hash);
      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.spendingUtxoId = getNewFakeUtxoId();
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
      fixture.payouts = [
        { address: PAYOUT_ADDRESSES[0], amountLovelace: adaToLovelace(100) },
        { address: PAYOUT_ADDRESSES[1], amountLovelace: adaToLovelace(150) },
        { address: PAYOUT_ADDRESSES[2], amountLovelace: adaToLovelace(80) },
      ];
      fixture.spendingUtxoId = getNewFakeUtxoId();
      fixture.datumTag = buildDatumTag(
        new helios.TxOutputId(fixture.spendingUtxoId)
      );
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
};

(async () => {
  await runTests("src/contract/marketplace.helios");
})();
