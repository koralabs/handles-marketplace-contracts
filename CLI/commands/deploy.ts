import { bytesToHex } from "@helios-lang/codec-utils";
import { makeAddress } from "@helios-lang/ledger";

import { loadConfig } from "../../src/config.js";
import { deploy, DeployConfig } from "../../src/deploy.js";
import { getBlockfrostApi } from "../../src/helpers/index.js";
import program from "../cli.js";
import { configs as parametersConfig } from "../configs/index.js";
import { getSeed } from "../utils.js";

const deployCommand = program
  .command("deploy")
  .description("Deploy Ada Handle Marketplace SC")
  .argument("<address>", "Bech32 Address of wallet to perform deploy")
  .argument("<handle-name>", "Ada Handle Name to deploy with SC")
  .action(async (bech32Address: string, handleName: string) => {
    const seed = await getSeed(program);
    const configResult = loadConfig();
    if (!configResult.ok) return program.error(configResult.error);
    const config = configResult.data;

    const parameters = parametersConfig[config.network];
    if (!parameters)
      return program.error(`Parameters not set for ${config.network}`);

    const blockfrostApi = getBlockfrostApi(config.blockfrostApiKey);
    const utxos = await blockfrostApi.getUtxos(makeAddress(bech32Address));
    const cborUtxos = utxos.map((utxo) => bytesToHex(utxo.toCbor(true)));
    const deployConfig: DeployConfig = {
      handleName,
      changeBech32Address: bech32Address,
      cborUtxos,
      parameters,
      seed,
    };

    await deploy(deployConfig, config.network, blockfrostApi);
  });

export default deployCommand;
