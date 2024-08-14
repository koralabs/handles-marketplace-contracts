import fs from 'fs/promises';
import * as helios from '@koralabs/helios';
import {
  ContractTester,
  getAddressAtDerivation,
} from '@koralabs/kora-labs-contract-testing';

const runTests = async (file: string) => {
  const walletAddress = await getAddressAtDerivation(0);
  const tester = new ContractTester(walletAddress, false);
  await tester.init();

  let contractFile = (await fs.readFile(file)).toString();
  const program = helios.Program.new(contractFile); //new instance
};

(async () => {
  await runTests('./contract.hl');
})();
