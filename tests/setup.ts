import { bytesToHex } from "@helios-lang/codec-utils";
import {
  makeAddress,
  makeAssets,
  makeTxOutputId,
  TxOutputId,
} from "@helios-lang/ledger";
import {
  Bip32PrivateKey,
  makeEmulator,
  makeRandomBip32PrivateKey,
  NetworkName,
} from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";
import {
  AssetNameLabel,
  ScriptDetails,
  ScriptType,
} from "@koralabs/kora-labs-common";
import { test } from "vitest";

import { HANDLE_POLICY_ID } from "../src/constants/index.js";
import { unoptimizedCompiledCode } from "../src/contracts/plutus-v2/contract.js";
import { makeSCParametersUplcValues } from "../src/datum.js";
import { deploy } from "../src/deploy.js";
import { invariant } from "../src/helpers/index.js";
import { Parameters } from "../src/types.js";

const network: NetworkName = "preview";
const ACCOUNT_LOVELACE = 500_000_000n;

const setup = async () => {
  const emulator = makeEmulator();

  const marketplaceAddress = makeAddress(
    false,
    makeRandomBip32PrivateKey().derivePubKey().hash()
  );
  const authorizersPrivateKeys: Bip32PrivateKey[] = Array.from(
    { length: 2 },
    () => makeRandomBip32PrivateKey()
  );
  const authorizersPubKeyHashes = authorizersPrivateKeys.map((privateKey) =>
    privateKey.derivePubKey().hash()
  );
  const parameters: Parameters = {
    marketplaceAddress: marketplaceAddress.toBech32(),
    authorizers: authorizersPubKeyHashes.map((hashes) => hashes.toHex()),
  };

  const deployedHandleName = "mp_contract";
  const testHandleName = "test";
  const fundWallet = emulator.createWallet(
    ACCOUNT_LOVELACE,
    makeAssets([
      [
        HANDLE_POLICY_ID,
        [
          [
            `${AssetNameLabel.LBL_222}${Buffer.from(deployedHandleName, "utf8").toString("hex")}`,
            1n,
          ],
        ],
      ],
    ])
  );
  emulator.tick(200);
  const user1Wallet = emulator.createWallet(
    ACCOUNT_LOVELACE,
    makeAssets([
      [
        HANDLE_POLICY_ID,
        [
          [
            `${AssetNameLabel.LBL_222}${Buffer.from(testHandleName, "utf8").toString("hex")}`,
            1n,
          ],
        ],
      ],
    ])
  );
  emulator.tick(200);
  const user2Wallet = emulator.createWallet(ACCOUNT_LOVELACE);
  emulator.tick(200);
  const user3Wallet = emulator.createWallet(ACCOUNT_LOVELACE);
  emulator.tick(200);
  const user4Wallet = emulator.createWallet(ACCOUNT_LOVELACE);
  emulator.tick(200);

  const fundWalletUtxos = await emulator.getUtxos(fundWallet.address);
  const deployTxResult = await deploy(
    {
      changeBech32Address: fundWallet.address.toBech32(),
      handleName: deployedHandleName,
      cborUtxos: fundWalletUtxos.map((utxo) => bytesToHex(utxo.toCbor(true))),
      parameters,
    },
    network
  );
  invariant(
    deployTxResult.ok && typeof deployTxResult.data == "object",
    "Failed to deploy"
  );

  // sign and submit deploy tx
  const tx = deployTxResult.data;
  tx.addSignatures(await fundWallet.signTx(tx));
  const txId = await fundWallet.submitTx(tx);
  emulator.tick(200);
  console.log("Deployed!!!");
  const referenceScriptUTxO = await emulator.getUtxo(makeTxOutputId(txId, 0));

  /// build smart contract parameters
  const parametersUplcValues = makeSCParametersUplcValues(parameters);

  /// make unoptimized uplc program
  const upoptimizedUplcProgram = decodeUplcProgramV2FromCbor(
    unoptimizedCompiledCode
  ).apply(parametersUplcValues);

  /// make ref script detail
  const refScriptDetail: ScriptDetails = {
    handle: deployedHandleName,
    handleHex: `${AssetNameLabel.LBL_222}${Buffer.from(deployedHandleName, "utf8").toString("hex")}`,
    type: ScriptType.MARKETPLACE_CONTRACT,
    validatorHash: bytesToHex(referenceScriptUTxO.output.refScript!.hash()),
    cbor: bytesToHex(referenceScriptUTxO.output.refScript!.toCbor()),
    unoptimizedCbor: bytesToHex(upoptimizedUplcProgram.toCbor()),
    datumCbor: bytesToHex(referenceScriptUTxO.datum!.toCbor()),
    latest: true,
    refScriptAddress: makeAddress(referenceScriptUTxO.address).toBech32(),
    refScriptUtxo: `${txId.toString()}#0`,
    txBuildVersion: 1,
  };

  return {
    emulator,
    parameters,
    authorizersPrivateKeys,
    deployedHandleName,
    testHandleName,
    referenceScriptUTxO,
    refScriptDetail,
    fundWallet,
    user1Wallet,
    user2Wallet,
    user3Wallet,
    user4Wallet,
    network,
    txOutputIds: {
      listingTxOutputId: undefined as TxOutputId | undefined,
    },
  };
};

const myTest = test.extend(await setup());

export { myTest };
